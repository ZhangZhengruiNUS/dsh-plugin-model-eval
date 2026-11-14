import {randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
import {readdir,lstat,realpath} from 'node:fs/promises';
import type {EvaluationRequest,TargetSnapshot,ResolvedProtocolSet,UpgradeCommit} from '../contracts.ts';
import type {EditionReuseCheck,EditionImportOperation} from '../evaluation/tier-contracts.ts';
import {assertEditionMapIntegrity,type EditionMap} from '../evaluation/edition-map.ts';
import {checkEditionReuse} from '../evaluation/edition-reuse.ts';
import {upgradeDestinationIdentity} from '../evaluation/reuse-eligibility.ts';
import {identityHash,protocolKey} from '../evaluation/protocol-identity.ts';
import {validateGeneralDefinition} from '../evaluation/definitions.ts';
import {reuseTargetBinding} from '../model/reuse-identity.ts';
import {buildExecutionOrder,assertExecutionOrderStructure} from '../jobs/execution-order.ts';
import {toolTaskDuration} from '../jobs/task-duration.ts';
import {refreshRunSummary} from '../evaluation/aggregate-run.ts';
import {readRecord,writeRecord} from './atomic.ts';
import {readCommonEvidence} from './common-evidence.ts';
import {readUpgradeItems,assertNoPendingReuse} from './reuse.ts';
import type {HistoryStore,HistoryTransaction,RunManifestInput,ItemInput,ItemRecord} from './store.ts';

const fail=(code:string):never=>{throw Object.assign(new Error(code),{code});};
const validId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const hash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
interface CopyPin {id:string;sourceRecordHash:string;copyHash:string}
interface Journal extends EditionImportOperation {schemaVersion:1;rootId:string;createdAt:string;importedAt:string;map:EditionMap;manifest:RunManifestInput;sourceManifestHash:string;sourceGeneralHash:string;sourceEvidenceHash:string;destinationEvidenceHash:string;targetBindingHash:string;items:CopyPin[]}
const payload=(item:ItemRecord):ItemInput=>{const {schemaVersion,revision,sequence,updatedAt,answerCommittedAt,gradeCommittedAt,...value}=item;return value;};
const view=(j:Journal):EditionImportOperation=>({kind:'edition',operationId:j.operationId,token:j.token,sourceRunId:j.sourceRunId,destinationRunId:j.destinationRunId,destinationBatchId:j.destinationBatchId,destinationRefs:structuredClone(j.destinationRefs),mapHash:j.mapHash,state:j.state,copiedItemIds:[...j.copiedItemIds],...(j.errorCode?{errorCode:j.errorCode}:{})});
const committed=(j:Journal):UpgradeCommit=>({batchId:j.destinationBatchId,runId:j.destinationRunId,operationId:j.operationId});
async function readJournal(tx:HistoryTransaction,rootId:string,id:string):Promise<Journal|undefined>{
 if(!validId(id))return fail('EDITION_TOKEN_INVALID');const path=join(tx.maintenanceDirectory,`edition-reuse-${id}.json`);
 try{
  if((await lstat(path)).isSymbolicLink()||await realpath(path)!==resolve(path))return fail('REUSE_JOURNAL_CORRUPT');
  const j=await readRecord<Journal>(path),m=j.manifest;
  if(j.schemaVersion!==1||j.kind!=='edition'||j.rootId!==rootId||j.operationId!==id||j.token!==id||!validId(j.sourceRunId)||!validId(j.destinationRunId)||!validId(j.destinationBatchId)||!['copying','ready','failed'].includes(j.state))return fail('REUSE_JOURNAL_CORRUPT');
  assertEditionMapIntegrity(j.map);validateGeneralDefinition(m.generalDefinition!,m.requiredItems);
  const ids=m.requiredItems.map(q=>q.id);
  if(j.mapHash!==j.map.mapHash||protocolKey(j.destinationRefs)!==protocolKey(j.map.toRefs)||protocolKey(m.protocols)!==protocolKey(j.destinationRefs)||m.generalDefinition?.definitionHash!==j.map.toDefinitionHash||m.batchId!==j.destinationBatchId||m.reuseOrigin?.operationId!==id||m.reuseOrigin.sourceRunId!==j.sourceRunId||m.reuseOrigin.mixedPeriod!==true||!Number.isFinite(Date.parse(m.reuseOrigin.deploymentConfirmedAt??''))||m.reuseOrigin.sourceActivity.scope!=='source-items'||m.reuseOrigin.sourceActivity.activeIntervals.length!==0||identityHash(m.reuseOrigin.edition)!==identityHash({mapHash:j.mapHash,fromRefs:j.map.fromRefs,toRefs:j.map.toRefs})||m.requiredItems.some(q=>q.track!=='general')||ids.length!==64||j.map.common.length+j.map.toOnly.length!==64||identityHash([...ids].sort())!==identityHash([...j.map.common,...j.map.toOnly].sort())||!Array.isArray(j.items)||identityHash(j.items.map(p=>p.id))!==identityHash(j.map.common)||!j.items.every(p=>hash(p.copyHash)&&hash(p.sourceRecordHash))||!Array.isArray(j.copiedItemIds)||new Set(j.copiedItemIds).size!==j.copiedItemIds.length||j.copiedItemIds.some(id=>!j.map.common.includes(id))||reuseTargetBinding(m.target)?.hash!==j.targetBindingHash)return fail('REUSE_JOURNAL_CORRUPT');
  if(!m.executionOrder)return fail('REUSE_JOURNAL_CORRUPT');assertExecutionOrderStructure(m.executionOrder,m.requiredItems);
  return j;
 }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
}
function copiedInput(j:Journal,pin:CopyPin,source:ItemRecord):ItemInput{
 // A normal max-token finish may be complete and scored; preserve its original result.
 if(source.reuse||!source.answer?.complete||source.answer.error||source.grade?.kind!=='scored'||source.grade.track!=='general'||!source.question||!source.answerCommittedAt||!source.gradeCommittedAt)return fail('REUSE_SOURCE_CHANGED');
 const taskMs=toolTaskDuration(source);
 return {itemId:pin.id,attempts:[],answer:structuredClone(source.answer),grade:structuredClone(source.grade),question:structuredClone(source.question),...(source.toolCheckpoint?{toolCheckpoint:structuredClone(source.toolCheckpoint)}:{}),reuse:{sourceRunId:j.sourceRunId,sourceItemId:pin.id,sourceRevision:source.revision,sourceRecordHash:pin.sourceRecordHash,compatibility:structuredClone(j.map.compatibility[pin.id]!),sourceAnswerCommittedAt:source.answerCommittedAt,sourceGradeCommittedAt:source.gradeCommittedAt,importedAt:j.importedAt,...(taskMs!==undefined?{sourceToolTaskMs:taskMs}:{}),sourceAttempts:structuredClone(source.attempts)}};
}
async function verifyCopies(tx:HistoryTransaction,j:Journal):Promise<void>{
 const {manifest,summary}=await tx.getRun(j.destinationRunId),{schemaVersion,runId,createdAt,...input}=manifest;
 if(identityHash(input)!==identityHash(j.manifest)||createdAt!==j.createdAt)return fail('REUSE_DESTINATION_CHANGED');
 if(summary.details!=='available')return;
 const items=await readCommonEvidence(tx,j.destinationRunId,j.map.common);
 for(const pin of j.items){const item=items.find(i=>i.itemId===pin.id);if(!item||identityHash(payload(item))!==pin.copyHash)return fail('REUSE_COPY_CORRUPT');}
}
export async function verifyReadyEditionReuse(tx:HistoryTransaction,rootId:string,operationId:string,runId:string,protocol:ResolvedProtocolSet):Promise<EditionImportOperation>{
 const j=await readJournal(tx,rootId,operationId);if(!j||j.state!=='ready'||j.destinationRunId!==runId)return fail('REUSE_IMPORT_NOT_READY');
 if(upgradeDestinationIdentity(protocol)!==j.destinationEvidenceHash)return fail('EDITION_PROTOCOL_CHANGED');
 const {summary}=await tx.getRun(runId);if(summary.details!=='available'||!summary.resumeAllowed)return fail('REUSE_DETAILS_UNAVAILABLE');
 await verifyCopies(tx,j);return view(j);
}
export function createEditionReuseHistory(store:HistoryStore,options:{checkpoint?:(stage:'journal'|'created'|'copied'|'before-ready',index?:number)=>Promise<void>}={}){
 const persist=(tx:HistoryTransaction,j:Journal)=>writeRecord(join(tx.maintenanceDirectory,`edition-reuse-${j.operationId}.json`),j);
 async function apply(tx:HistoryTransaction,j:Journal):Promise<UpgradeCommit>{
  if(j.state==='failed')return fail(j.errorCode??'REUSE_IMPORT_FAILED');if(j.state==='ready'){await verifyCopies(tx,j);return committed(j);}
  const source=await tx.getRun(j.sourceRunId);
  if(source.summary.details!=='available'||identityHash(source.manifest)!==j.sourceManifestHash||identityHash(source.summary.tracks.general)!==j.sourceGeneralHash)return fail('REUSE_SOURCE_CHANGED');
  const items=await readCommonEvidence(tx,j.sourceRunId,j.map.common);
  for(const pin of j.items)if(identityHash(items.find(i=>i.itemId===pin.id)??null)!==pin.sourceRecordHash)return fail('REUSE_SOURCE_CHANGED');
  await tx.createRun(j.manifest,{runId:j.destinationRunId,createdAt:j.createdAt});await options.checkpoint?.('created');
  const existing=new Map((await readCommonEvidence(tx,j.destinationRunId,j.map.common)).map(i=>[i.itemId,i]));
  for(const [index,pin] of j.items.entries()){
   const input=copiedInput(j,pin,items.find(i=>i.itemId===pin.id)!);if(identityHash(input)!==pin.copyHash)return fail('REUSE_JOURNAL_CORRUPT');
   const old=existing.get(pin.id);if(old){if(identityHash(payload(old))!==pin.copyHash)return fail('REUSE_COPY_CORRUPT');}
   else{if(j.copiedItemIds.includes(pin.id))return fail('REUSE_COPY_CORRUPT');await tx.saveItem(j.destinationRunId,0,input);}
   if(!j.copiedItemIds.includes(pin.id)){j.copiedItemIds.push(pin.id);await persist(tx,j);}await options.checkpoint?.('copied',index+1);
  }
  await verifyCopies(tx,j);await refreshRunSummary(store,tx,j.destinationRunId);await options.checkpoint?.('before-ready');j.state='ready';delete j.errorCode;await persist(tx,j);return committed(j);
 }
 return {
  async import(check:EditionReuseCheck,input:{token:string;target:TargetSnapshot;protocol:ResolvedProtocolSet;sourceProtocol:ResolvedProtocolSet;map:EditionMap;confirmedAt:string;execution:EvaluationRequest['execution']}):Promise<UpgradeCommit>{return store.exclusive(async tx=>{
   if(!Number.isFinite(Date.parse(input.confirmedAt)))return fail('EDITION_CONFIRMATION_REQUIRED');
   const existing=await readJournal(tx,store.rootId,input.token);
   if(existing){if(existing.sourceRunId!==check.sourceRunId||existing.sourceEvidenceHash!==check.sourceEvidenceHash||existing.mapHash!==input.map.mapHash||existing.targetBindingHash!==reuseTargetBinding(input.target)?.hash||existing.destinationEvidenceHash!==upgradeDestinationIdentity(input.protocol)||identityHash(existing.manifest.execution)!==identityHash(input.execution)||existing.manifest.reuseOrigin?.deploymentConfirmedAt!==input.confirmedAt)return fail('EDITION_PREVIEW_STALE');return apply(tx,existing);}
   await assertNoPendingReuse(tx);
   const source=await tx.getRun(check.sourceRunId),items=await readUpgradeItems(tx,check.sourceRunId),fresh=checkEditionReuse({...source,items,protocol:input.sourceProtocol},input.protocol,input.target,input.map);
   if(!check.eligible||!fresh.eligible||identityHash(check)!==identityHash(fresh))return fail('EDITION_PREVIEW_STALE');
   const e=input.execution;if(![1,2,3,4].includes(e.concurrency)||!Number.isInteger(e.callTimeoutMs)||e.callTimeoutMs<1000||e.callTimeoutMs>1800000||e.failurePolicy!==undefined&&e.failurePolicy!=='output-idle-v1')return fail('INVALID_EXECUTION');
   const now=new Date().toISOString(),batchId=randomUUID(),protocol=input.protocol,order=buildExecutionOrder(protocol,['general']);if(!order)return fail('EDITION_PROTOCOL_CHANGED');
   const m:RunManifestInput={batchId,target:structuredClone(input.target),protocols:structuredClone(protocol.descriptor.refs),generalDefinition:structuredClone(protocol.descriptor.general),requiredItems:protocol.items.filter(q=>q.track==='general').map(({id,track,datasetId})=>({id,track,datasetId})),execution:structuredClone(e),executionOrder:order,reuseOrigin:{deploymentConfirmedAt:input.confirmedAt,mixedPeriod:true,edition:{mapHash:input.map.mapHash,fromRefs:structuredClone(input.map.fromRefs),toRefs:structuredClone(input.map.toRefs)},...(source.summary.executionChanges?.length||identityHash(source.manifest.execution??null)!==identityHash(e)?{mixedExecution:true as const}:{}),...(source.manifest.execution?{sourceExecution:structuredClone(source.manifest.execution)}:{}),...(source.summary.executionChanges?{sourceExecutionChanges:structuredClone(source.summary.executionChanges)}:{}),operationId:input.token,sourceRunId:check.sourceRunId,sourceActivity:{scope:'source-items',tracks:['general'],activeIntervals:[],incompleteTiming:source.summary.metrics.incompleteTiming},sourceCreatedAt:source.manifest.createdAt,sourceCompletedAt:source.summary.tracks.general!.completedAt!}};
   const j:Journal={schemaVersion:1,kind:'edition',rootId:store.rootId,operationId:input.token,token:input.token,sourceRunId:check.sourceRunId,destinationRunId:randomUUID(),destinationBatchId:batchId,destinationRefs:structuredClone(protocol.descriptor.refs),mapHash:input.map.mapHash,state:'copying',copiedItemIds:[],createdAt:now,importedAt:now,map:structuredClone(input.map),manifest:m,sourceManifestHash:identityHash(source.manifest),sourceGeneralHash:identityHash(source.summary.tracks.general),sourceEvidenceHash:check.sourceEvidenceHash,destinationEvidenceHash:check.destinationEvidenceHash,targetBindingHash:check.targetBindingHash,items:[]};
   j.items=input.map.common.map(id=>{const source=items.find(i=>i.itemId===id)!,pin={id,sourceRecordHash:identityHash(source),copyHash:''};pin.copyHash=identityHash(copiedInput(j,pin,source));return pin;});
   await persist(tx,j);await options.checkpoint?.('journal');return apply(tx,j);
  });},
  async recover():Promise<void>{await store.exclusive(async tx=>{for(const file of await readdir(tx.maintenanceDirectory))if(/^edition-reuse-[a-f0-9-]{36}\.json$/.test(file)){
   const j=await readJournal(tx,store.rootId,file.slice(14,-5));if(!j||j.state==='failed')continue;
   try{await apply(tx,j);}catch(error){j.state='failed';const code=(error as Error).message;j.errorCode=['REUSE_SOURCE_CHANGED','REUSE_DESTINATION_CHANGED','REUSE_COPY_CORRUPT'].includes(code)?code:'REUSE_IMPORT_FAILED';await persist(tx,j);}
  }});},
  async operation(id:string):Promise<EditionImportOperation|undefined>{return store.exclusive(async tx=>{const j=await readJournal(tx,store.rootId,id);return j?view(j):undefined;});},
 };
}

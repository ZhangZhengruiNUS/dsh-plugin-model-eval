import {randomUUID,createHash} from 'node:crypto';
import {readdir,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {EvaluationRequest,TargetSnapshot,ResolvedProtocolSet,UpgradeCheck,UpgradeCommit,ReuseImportOperation,QuestionCompatibility} from '../contracts.ts';
import type {HistoryStore,HistoryTransaction,RunManifestInput,ItemInput,ItemRecord} from './store.ts';
import {readRecord,writeRecord} from './atomic.ts';
import {identityHash} from '../evaluation/protocol-identity.ts';
import {upgradeSourceEvidence,upgradeDestinationIdentity} from '../evaluation/reuse-eligibility.ts';
import {reuseTargetBinding} from '../model/reuse-identity.ts';
import {validateGeneralDefinition} from '../evaluation/definitions.ts';
import {refreshRunSummary} from '../evaluation/aggregate-run.ts';
const fail=(code:string):never=>{throw Object.assign(new Error(code),{code});};
const validId=(id:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
const missing=(error:unknown)=>(error as NodeJS.ErrnoException).code==='ENOENT';
interface CopyPin {id:string;sourceRecordHash:string;compatibility:QuestionCompatibility;copyHash:string}
interface Journal extends ReuseImportOperation {schemaVersion:1;rootId:string;createdAt:string;importedAt:string;manifest:RunManifestInput;sourceManifestHash:string;sourceGeneralHash:string;destinationEvidenceHash:string;items:CopyPin[]}
const view=(journal:Journal):ReuseImportOperation=>{const {operationId,token,sourceRunId,destinationRunId,destinationBatchId,sourceRevision,sourceEvidenceHash,deepRefs,targetBindingHash,state,copiedItemIds,errorCode}=journal;return {operationId,token,sourceRunId,destinationRunId,destinationBatchId,sourceRevision,sourceEvidenceHash,deepRefs,targetBindingHash,state,copiedItemIds,...(errorCode?{errorCode}:{})};};
const committed=(op:ReuseImportOperation):UpgradeCommit=>({batchId:op.destinationBatchId,runId:op.destinationRunId,operationId:op.operationId});
const payload=(item:ItemRecord):ItemInput=>{const {schemaVersion,revision,sequence,updatedAt,answerCommittedAt,gradeCommittedAt,...input}=item;return input;};
/** Admission verifies durable bytes, including when the normal history read cache is warm. */
async function durableItem(tx:HistoryTransaction,runId:string,itemId:string):Promise<ItemRecord|undefined>{
  const directory=join(await tx.detailsDirectory(runId),'items');
  if((await lstat(directory)).isSymbolicLink()||await realpath(directory)!==resolve(directory))return fail('HISTORY_PATH_REJECTED');
  const path=join(directory,createHash('sha256').update(itemId).digest('hex')+'.json');
  try{if((await lstat(path)).isSymbolicLink())return fail('HISTORY_PATH_REJECTED');const item=await readRecord<ItemRecord>(path);if(item.schemaVersion!==1||item.itemId!==itemId)return fail('ITEM_CORRUPT');return item;}catch(error){if(missing(error))return undefined;throw error;}
}
function copiedInput(journal:Journal,pin:CopyPin,source:ItemRecord):ItemInput{
  if(!source.answer?.complete||source.grade?.kind!=='scored'||source.grade.track!=='general'||!source.question||!source.answerCommittedAt||!source.gradeCommittedAt)fail('REUSE_SOURCE_CHANGED');
  return {itemId:pin.id,attempts:[],answer:structuredClone(source.answer!),grade:structuredClone(source.grade!),question:structuredClone(source.question!),reuse:{sourceRunId:journal.sourceRunId,sourceItemId:pin.id,sourceRevision:source.revision,sourceRecordHash:pin.sourceRecordHash,compatibility:structuredClone(pin.compatibility),sourceAnswerCommittedAt:source.answerCommittedAt!,sourceGradeCommittedAt:source.gradeCommittedAt!,importedAt:journal.importedAt,sourceAttempts:structuredClone(source.attempts)}};
}
async function readJournal(tx:HistoryTransaction,rootId:string,id:string):Promise<Journal|undefined>{
  if(!validId(id))return fail('REUSE_TOKEN_INVALID');const path=join(tx.maintenanceDirectory,`reuse-${id}.json`);
  try{
    if((await lstat(path)).isSymbolicLink()||await realpath(path)!==resolve(path))return fail('REUSE_JOURNAL_CORRUPT');
    const value=await readRecord<Journal>(path);
    if(value.schemaVersion!==1||value.rootId!==rootId||value.operationId!==id||value.token!==id||!validId(value.destinationRunId)||!validId(value.destinationBatchId)||!['copying','ready','failed'].includes(value.state)||!Array.isArray(value.items)||value.items.length!==120||new Set(value.items.map(x=>x.id)).size!==120||value.manifest.reuseOrigin?.operationId!==id||value.manifest.batchId!==value.destinationBatchId)return fail('REUSE_JOURNAL_CORRUPT');
    return value;
  }catch(error){if(missing(error))return undefined;throw error;}
}
export async function assertNoPendingReuse(tx:HistoryTransaction):Promise<void>{
  for(const name of await readdir(tx.maintenanceDirectory))if(/^reuse-[a-f0-9-]{36}\.json$/.test(name)){
    const path=join(tx.maintenanceDirectory,name);if((await lstat(path)).isSymbolicLink())return fail('REUSE_JOURNAL_CORRUPT');
    const journal=await readRecord<Journal>(path);if(!['copying','ready','failed'].includes(journal.state))return fail('REUSE_JOURNAL_CORRUPT');if(journal.state==='copying')return fail('REUSE_RECOVERY_REQUIRED');
  }
}
async function verifyCopies(tx:HistoryTransaction,journal:Journal):Promise<void>{
  const {manifest,summary}=await tx.getRun(journal.destinationRunId);
  const {schemaVersion,runId,createdAt,...input}=manifest;
  if(identityHash(input)!==identityHash(journal.manifest)||createdAt!==journal.createdAt)return fail('REUSE_DESTINATION_CHANGED');
  if(summary.details!=='available')return;
  for(const pin of journal.items){const item=await durableItem(tx,journal.destinationRunId,pin.id);if(!item||identityHash(payload(item))!==pin.copyHash)return fail('REUSE_COPY_CORRUPT');}
}
/** Queue admission must check the durable commit, matching run identity, and every imported copy. */
export async function verifyReadyReuse(tx:HistoryTransaction,rootId:string,operationId:string,runId:string):Promise<ReuseImportOperation>{
  const journal=await readJournal(tx,rootId,operationId);
  if(!journal||journal.state!=='ready'||journal.destinationRunId!==runId)return fail('REUSE_IMPORT_NOT_READY');
  const {manifest,summary}=await tx.getRun(runId);
  if(summary.details!=='available'||!summary.resumeAllowed)return fail('REUSE_DETAILS_UNAVAILABLE');
  if(manifest.reuseOrigin?.sourceRunId!==journal.sourceRunId||identityHash(manifest.protocols)!==identityHash(journal.deepRefs)||reuseTargetBinding(manifest.target)?.hash!==journal.targetBindingHash)return fail('REUSE_IMPORT_MISMATCH');
  try{await verifyCopies(tx,journal);}catch{return fail('REUSE_COPY_CORRUPT');}return view(journal);
}
export function createReuseHistory(store:HistoryStore,options:{checkpoint?:(stage:'journal'|'created'|'copied'|'before-ready',index?:number)=>Promise<void>}={}){
  const persist=(tx:HistoryTransaction,journal:Journal)=>writeRecord(join(tx.maintenanceDirectory,`reuse-${journal.operationId}.json`),journal);
  async function apply(tx:HistoryTransaction,journal:Journal):Promise<UpgradeCommit>{
    if(journal.state==='failed')return fail(journal.errorCode??'REUSE_IMPORT_FAILED');
    if(journal.state==='ready'){await verifyCopies(tx,journal);return committed(journal);}
    const source=await tx.getRun(journal.sourceRunId);
    if(source.summary.details!=='available'||identityHash(source.manifest)!==journal.sourceManifestHash||identityHash(source.summary.tracks.general)!==journal.sourceGeneralHash)return fail('REUSE_SOURCE_CHANGED');
    const sourceItems:ItemRecord[]=[];
    for(const pin of journal.items){const item=await durableItem(tx,journal.sourceRunId,pin.id);if(!item||identityHash(item)!==pin.sourceRecordHash)return fail('REUSE_SOURCE_CHANGED');sourceItems.push(item);}
    await tx.createRun(journal.manifest,{runId:journal.destinationRunId,createdAt:journal.createdAt});await options.checkpoint?.('created');
    for(const [index,pin] of journal.items.entries()){
      const old=await durableItem(tx,journal.destinationRunId,pin.id),input=copiedInput(journal,pin,sourceItems.find(x=>x.itemId===pin.id)!);
      if(identityHash(input)!==pin.copyHash)return fail('REUSE_JOURNAL_CORRUPT');
      if(old){if(identityHash(payload(old))!==pin.copyHash)return fail('REUSE_COPY_CORRUPT');}
      else{if(journal.copiedItemIds.includes(pin.id))return fail('REUSE_COPY_CORRUPT');await tx.saveItem(journal.destinationRunId,0,input);}
      if(!journal.copiedItemIds.includes(pin.id)){journal.copiedItemIds.push(pin.id);await persist(tx,journal);}
      await options.checkpoint?.('copied',index+1);
    }
    await verifyCopies(tx,journal);await refreshRunSummary(store,tx,journal.destinationRunId);await options.checkpoint?.('before-ready');journal.state='ready';delete journal.errorCode;await persist(tx,journal);return committed(journal);
  }
  return {
    async import(check:UpgradeCheck,input:{token:string;target:TargetSnapshot;protocol:ResolvedProtocolSet;execution:EvaluationRequest['execution']}):Promise<UpgradeCommit>{return store.exclusive(async tx=>{
      const existing=await readJournal(tx,store.rootId,input.token);
      if(existing){if(existing.sourceRunId!==check.sourceRunId||existing.sourceEvidenceHash!==check.sourceEvidenceHash||existing.targetBindingHash!==reuseTargetBinding(input.target)?.hash||existing.destinationEvidenceHash!==upgradeDestinationIdentity(input.protocol))return fail('UPGRADE_PREVIEW_STALE');return apply(tx,existing);}
      await assertNoPendingReuse(tx);
      const source=await tx.getRun(check.sourceRunId);
      if(source.summary.details!=='available')return fail('UPGRADE_DETAILS_UNAVAILABLE');
      const items:ItemRecord[]=[];for(const required of source.manifest.requiredItems.filter(q=>q.track==='general')){const item=await durableItem(tx,check.sourceRunId,required.id);if(!item)return fail('UPGRADE_DETAILS_INCOMPLETE');items.push(item);}
      const protocol=input.protocol,binding=reuseTargetBinding(input.target);
      if(!check.eligible||!binding||binding.hash!==check.targetBindingHash||source.summary.details!=='available'||source.summary.revision!==check.sourceRevision||upgradeSourceEvidence({...source,items})!==check.sourceEvidenceHash||upgradeDestinationIdentity(protocol)!==check.destinationEvidenceHash||check.deepGeneralId!==protocol.generalId||protocol.descriptor.general.tier!=='deep'||protocol.descriptor.general.parentGeneralId!==source.manifest.protocols.generalId)return fail('UPGRADE_PREVIEW_STALE');
      validateGeneralDefinition(protocol.descriptor.general,protocol.items);
      const required=protocol.items.filter(q=>q.track==='general').map(({id,track,datasetId})=>({id,track,datasetId})),ids=source.manifest.generalDefinition!.domains.flatMap(d=>d.itemIds),now=new Date().toISOString(),batchId=randomUUID();
      if(ids.length!==120||required.length!==400||ids.some(id=>!required.some(q=>q.id===id)))return fail('UPGRADE_PROTOCOL_CHANGED');
      const manifest:RunManifestInput={batchId,target:structuredClone(input.target),protocols:structuredClone(protocol.descriptor.refs),generalDefinition:structuredClone(protocol.descriptor.general),requiredItems:required,execution:structuredClone(input.execution),reuseOrigin:{operationId:input.token,sourceRunId:check.sourceRunId,sourceActivity:{scope:'source-run',tracks:Object.keys(source.summary.tracks) as ('general'|'writing')[],activeIntervals:structuredClone(source.summary.metrics.activeIntervals),incompleteTiming:source.summary.metrics.incompleteTiming},sourceCreatedAt:source.manifest.createdAt,...(source.summary.completedAt?{sourceCompletedAt:source.summary.completedAt}:{})}};
      const journal:Journal={schemaVersion:1,rootId:store.rootId,operationId:input.token,token:input.token,sourceRunId:check.sourceRunId,destinationRunId:randomUUID(),destinationBatchId:batchId,sourceRevision:check.sourceRevision,sourceEvidenceHash:check.sourceEvidenceHash,deepRefs:protocol.descriptor.refs,targetBindingHash:check.targetBindingHash,state:'copying',copiedItemIds:[],createdAt:now,importedAt:now,manifest,sourceManifestHash:identityHash(source.manifest),sourceGeneralHash:identityHash(source.summary.tracks.general),destinationEvidenceHash:check.destinationEvidenceHash,items:[]};
      journal.items=ids.map(id=>{const item=items.find(x=>x.itemId===id)!;const pin:CopyPin={id,sourceRecordHash:identityHash(item),compatibility:protocol.compatibility[id]!,copyHash:''};pin.copyHash=identityHash(copiedInput(journal,pin,item));return pin;});
      await persist(tx,journal);await options.checkpoint?.('journal');return apply(tx,journal);
    });},
    async recover():Promise<void>{await store.exclusive(async tx=>{
      for(const file of await readdir(tx.maintenanceDirectory))if(/^reuse-[a-f0-9-]{36}\.json$/.test(file)){
        const journal=await readJournal(tx,store.rootId,file.slice(6,-5));if(!journal||journal.state==='failed')continue;
        try{await apply(tx,journal);}catch(error){journal.state='failed';journal.errorCode=['REUSE_SOURCE_CHANGED','REUSE_DESTINATION_CHANGED','REUSE_COPY_CORRUPT','ITEM_CORRUPT','DETAILS_UNAVAILABLE'].includes((error as Error).message)?(error as Error).message:'REUSE_IMPORT_FAILED';await persist(tx,journal);}
      }
    });},
    async operation(id:string):Promise<ReuseImportOperation|undefined>{return store.exclusive(async tx=>{const journal=await readJournal(tx,store.rootId,id);return journal?structuredClone(view(journal)):undefined;});},
  };
}

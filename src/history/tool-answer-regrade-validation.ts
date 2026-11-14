/** Fixed R1 -> R2 publication boundary. No model, queue or grading execution. */
import {createHash} from 'node:crypto';
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import type {RegradeOrigin,TargetSnapshot} from '../contracts.ts';
import type {ItemRecord,RunManifest} from './store.ts';
import type {ResolvedProtocolSet} from '../evaluation/tier-contracts.ts';
import type {FrozenNativeSource,OfflineSource,regradeSavedAnswers} from '../evaluation/offline-regrade.ts';
import {readFrozenFile,decodeFrozenJson} from '../evaluation/offline-regrade.ts';
import {validateToolAnswerTransition,assertToolAnswerArtifact,TOOL_ANSWER_ITEM} from '../evaluation/offline-tool-answer-revision.ts';
import {identityHash,protocolKey} from '../evaluation/protocol-identity.ts';
import {summarizeGeneral} from '../evaluation/aggregate.ts';
import {readRecord} from './atomic.ts';

type Result=Awaited<ReturnType<typeof regradeSavedAnswers>>;
export interface RegradeProtocolPair {old:ResolvedProtocolSet;next:ResolvedProtocolSet}
const hash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fail=(reason='INVALID_REGRADE_ARTIFACT'):never=>{throw Error(reason);};
const itemName=(id:string)=>createHash('sha256').update(id).digest('hex')+'.json';

export function toolAnswerRegradeCount(protocol:ResolvedProtocolSet,origin:RegradeOrigin):number{
  const tier=protocol.descriptor.general.tier,count=tier==='light'?62:tier==='deep'?348:0,correction=origin.scoringCorrection;
  if(protocol.resourceVersion!=='task-five-v3-r2'||protocol.generalId!=='general-task-five-v3-r2-'+tier||protocol.descriptor.general.schema!=='task-five-v3-r2'||
    protocolKey(protocol.descriptor.refs)!==protocolKey({generalId:protocol.generalId,writingId:protocol.writingId,resourceVersion:protocol.resourceVersion})||
    !count||protocol.descriptor.questionCount!==count||origin.schema!=='offline-regrade-v1'||origin.modelCalls!==0||origin.gradedItems!==count||
    origin.sourceProtocols.resourceVersion!=='task-five-v3-r1'||origin.sourceProtocols.generalId!=='general-task-five-v3-r1-'+tier||origin.sourceProtocols.writingId!==protocol.writingId||
    identityHash(origin.excludedItems)!==identityHash([])||!correction||correction.schema!=='tool-answer-correction-v1'||
    identityHash(correction.changedItems)!==identityHash([TOOL_ANSWER_ITEM])||correction.carriedItems!==count-1||
    !hash(origin.sourceEvidenceHash)||origin.rulesHash!==identityHash({definition:protocol.descriptor.general,compatibility:protocol.compatibility}))return 0;
  return count;
}

export function assertToolAnswerCreate(protocol:ResolvedProtocolSet,result:Result){
  const count=toolAnswerRegradeCount(protocol,result.origin),questions=protocol.items.filter(q=>q.track==='general');
  if(!count||result.items.length!==count||new Set(result.items.map(i=>i.itemId)).size!==count||result.items.some(item=>{
    const q=questions.find(q=>q.id===item.itemId),provenance=item.regradedFrom;
    if(!q||!provenance||!hash(provenance.sourceItemHash)||item.grade?.kind!=='scored'||item.grade.track!=='general'||item.grade.itemId!==q.id||
      typeof item.grade.passed!=='boolean'||item.attempts.length||!item.answer?.complete||item.answer.error||q.id===TOOL_ANSWER_ITEM&&item.answer.truncated)return true;
    const{grading,...question}=q;
    if(identityHash(item.question)!==identityHash(question))return true;
    return q.id===TOOL_ANSWER_ITEM?(item.grade.evidence as any)?.metric!=='filesystem-answer-list-v3':identityHash(item.grade)!==identityHash(provenance.sourceGrade);
  }))return fail('INCOMPLETE_REGRADE_ARTIFACT');
  return count;
}

export async function validatePublishedToolAnswerRun(source:string,protocol?:ResolvedProtocolSet){
  if(!protocol)return fail('REGRADE_PROTOCOL_REQUIRED');
  const manifest=await readRecord<RunManifest>(join(source,'run.json')),summary=await readRecord<any>(join(source,'summary.json')),backup=await readRecord<any>(join(source,'summary.backup.json'));
  const origin=manifest.regradeOrigin;if(!origin)return fail();
  const count=toolAnswerRegradeCount(protocol,origin),ids=protocol.items.filter(q=>q.track==='general').map(q=>q.id);
  if(!count||manifest.schemaVersion!==1||protocolKey(manifest.protocols)!==protocolKey(protocol.descriptor.refs)||
    identityHash(manifest.generalDefinition)!==identityHash(protocol.descriptor.general)||summary.runId!==manifest.runId||summary.batchId!==manifest.batchId||
    identityHash(summary.protocols)!==identityHash(manifest.protocols)||identityHash(summary.target)!==identityHash(manifest.target)||
    identityHash(summary.regradeOrigin)!==identityHash(origin)||identityHash(summary)!==identityHash(backup)||summary.resumeAllowed||
    summary.tracks.general?.status!=='completed'||summary.metrics.activeIntervals.length||summary.metrics.tracks.general.answer.calls!==0||
    summary.metrics.tracks.general.answer.totalTokens!==0||summary.metrics.tracks.general.judge.calls!==0||summary.metrics.tracks.general.judge.totalTokens!==0||
    manifest.requiredItems.length!==count||new Set(manifest.requiredItems.map(i=>i.id)).size!==count||manifest.requiredItems.some(i=>i.track!=='general'||!ids.includes(i.id)))return fail();
  const names=await readdir(join(source,'details','items'));
  if(names.length!==count||(await readdir(join(source,'details','attempts'))).length)return fail();
  const items:ItemRecord[]=[];
  for(const id of ids){if(!names.includes(itemName(id)))return fail();const item=await readRecord<ItemRecord>(join(source,'details','items',itemName(id)));
    if(item.schemaVersion!==1||item.itemId!==id||item.toolActiveStage||item.gradingActive)return fail();items.push(item);
  }
  const track=summarizeGeneral(items.map(i=>i.grade!),protocol.descriptor.general),actual=summary.tracks.general;
  try{assertToolAnswerCreate(protocol,{origin,items,track,changes:[]});}catch{return fail();}
  if(track.status!=='completed'||actual.score!==track.score||actual.graded!==count||actual.required!==count||identityHash(actual.measures)!==identityHash(track.measures))return fail();
  return{manifest,summary};
}

export async function validateToolAnswerFrozenSource(source:string,spec:FrozenNativeSource,derivedManifest:RunManifest,protocols:RegradeProtocolPair){
  const m=decodeFrozenJson(await readFrozenFile(spec.manifest)),s=decodeFrozenJson(await readFrozenFile(spec.summary)),origin=derivedManifest.regradeOrigin!;
  if(m.runId!==spec.runId||s.runId!==spec.runId||protocolKey(m.protocols)!==protocolKey(protocols.old.descriptor.refs)||
    protocolKey(s.protocols)!==protocolKey(m.protocols)||identityHash(m.target)!==identityHash(derivedManifest.target)||identityHash(s.target)!==identityHash(m.target)||
    identityHash(m.regradeOrigin??null)!==identityHash(s.regradeOrigin??null)||s.tracks?.general?.status!=='completed'||s.tracks.general.score!==origin.sourceScore||
    s.tracks.general.required!==spec.items.length||s.tracks.general.graded!==spec.items.length||!s.tracks.general.completedAt||s.tracks.general.completedAt!==origin.sourceCompletedAt)return fail('REGRADE_SOURCE_BINDING');
  const items:OfflineSource['items']=[],derivedItems:ItemRecord[]=[];
  for(const pin of spec.items){const original=decodeFrozenJson(await readFrozenFile(pin));if(original.itemId!==pin.id)return fail('REGRADE_SOURCE_BINDING');
    items.push({record:original,sha256:pin.sha256});derivedItems.push(await readRecord<ItemRecord>(join(source,'details','items',itemName(pin.id))));
  }
  const frozen:OfflineSource={manifest:m,items,sourceEvidenceHash:identityHash(spec),sourceScore:s.tracks.general.score,sourceCompletedAt:s.tracks.general.completedAt,...(s.metrics?{sourceMetrics:s.metrics}:{})};
  validateToolAnswerTransition(frozen,protocols.old,protocols.next);
  const track=summarizeGeneral(derivedItems.map(i=>i.grade!),protocols.next.descriptor.general);
  assertToolAnswerArtifact({schema:'offline-regrade-artifact-v1',frozenSha:identityHash(spec),target:derivedManifest.target,result:{origin,items:derivedItems,track}},protocols.next,frozen,identityHash(spec));
}

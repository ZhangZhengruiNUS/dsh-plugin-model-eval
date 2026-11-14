/** R1 -> R2 only. Unchanged graders and model adapters are deliberately not imported. */
import type {GradeResult,Question,RegradeOrigin,ToolSessionCheckpoint} from '../contracts.ts';
import type {ItemRecord} from '../history/store.ts';
import type {OfflineSource} from './offline-regrade.ts';
import type {PreparedEnvironment} from './grade-general.ts';
import type {ResolvedProtocolSet} from './tier-contracts.ts';
import {identityHash,protocolKey} from './protocol-identity.ts';
import {fingerprintTarget} from '../model/identity.ts';
import {validToolCheckpoint} from '../host/tool-checkpoint.ts';
import {createToolDispatcher} from '../runtime/tool-dispatcher.ts';
import {summarizeGeneral} from './aggregate.ts';
import {sourceTaskTiming} from './regrade-task-timing.ts';

export const TOOL_ANSWER_ITEM='tools/multi_turn_base_39';
const invalid=(reason:string):never=>{throw Error('OFFLINE_'+reason);};
const digest=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const publicQuestion=(q:Question)=>{const{grading,...value}=q;return value;};
const scored=(item:ItemRecord,id:string)=>item.grade?.kind==='scored'&&item.grade.track==='general'&&item.grade.itemId===id&&typeof item.grade.passed==='boolean';
const rulesHash=(next:ResolvedProtocolSet)=>identityHash({definition:next.descriptor.general,compatibility:next.compatibility});

/** Check the complete fixed transition before invoking even the single changed grader. */
export function validateToolAnswerTransition(source:OfflineSource,old:ResolvedProtocolSet,next:ResolvedProtocolSet){
  const count=old.descriptor.general.tier==='light'?62:old.descriptor.general.tier==='deep'?348:0;
  const questions=next.items.filter(q=>q.track==='general'),previous=old.items.filter(q=>q.track==='general');
  if(!count||old.resourceVersion!=='task-five-v3-r1'||next.resourceVersion!=='task-five-v3-r2'||
    old.generalId!=='general-task-five-v3-r1-'+old.descriptor.general.tier||next.generalId!=='general-task-five-v3-r2-'+old.descriptor.general.tier||
    protocolKey(source.manifest.protocols)!==protocolKey(old.descriptor.refs)||protocolKey(old.descriptor.refs)!==protocolKey({generalId:old.generalId,writingId:old.writingId,resourceVersion:old.resourceVersion})||
    protocolKey(next.descriptor.refs)!==protocolKey({generalId:next.generalId,writingId:next.writingId,resourceVersion:next.resourceVersion})||
    old.writingId!==next.writingId||old.descriptor.general.tier!==next.descriptor.general.tier||questions.length!==count||previous.length!==count||
    old.descriptor.questionCount!==count||next.descriptor.questionCount!==count||source.items.length!==count||
    identityHash(old.descriptor.general.domains)!==identityHash(next.descriptor.general.domains)||
    old.descriptor.general.executionPolicy!==next.descriptor.general.executionPolicy||
    identityHash(source.manifest.generalDefinition)!==identityHash(old.descriptor.general)||
    !source.manifest.target.modelId||!digest(source.sourceEvidenceHash)||!Number.isFinite(Date.parse(source.sourceCompletedAt)))invalid('SOURCE_SCOPE');
  const ids=questions.map(q=>q.id);
  if(new Set(ids).size!==count||new Set(previous.map(q=>q.id)).size!==count||new Set(source.items.map(i=>i.record.itemId)).size!==count||
    identityHash(ids)!==identityHash(previous.map(q=>q.id))||source.items.some(i=>!ids.includes(i.record.itemId))||
    identityHash(source.manifest.requiredItems.filter(q=>q.track==='general').map(q=>q.id).sort())!==identityHash([...ids].sort()))invalid('SOURCE_SCOPE');
  const old39=previous.find(q=>q.id===TOOL_ANSWER_ITEM),next39=questions.find(q=>q.id===TOOL_ANSWER_ITEM);
  if(!old39||!next39||(old39.grading as any).toolProfile!=='filesystem-evidence-v2'||(next39.grading as any).toolProfile!=='filesystem-answer-list-v3')invalid('REVISION_PROFILE');
  for(const q of questions){
    const before=previous.find(p=>p.id===q.id)!,expected=structuredClone(before);
    if(q.id===TOOL_ANSWER_ITEM)(expected.grading as any).toolProfile='filesystem-answer-list-v3';
    if(identityHash(q)!==identityHash(expected)||!old.compatibility[q.id]||!next.compatibility[q.id]||old.compatibility[q.id]!.runtimeHash!==next.compatibility[q.id]!.runtimeHash)invalid('PROTOCOL_CHANGED');
    const input=source.items.find(i=>i.record.itemId===q.id)!,record=input.record;
    if(!digest(input.sha256)||record.schemaVersion!==1||!record.question||identityHash(record.question)!==identityHash(publicQuestion(before))||
      !record.answer?.complete||q.id===TOOL_ANSWER_ITEM&&record.answer.truncated||record.answer.error||record.answer.observations.itemId!==q.id||
      record.answer.observations.track!=='general'||record.answer.observations.phase!=='answer'||!scored(record,q.id))invalid('SOURCE_INCOMPLETE');
    if(q.datasetId==='bfcl-v4-multi-turn-selected')toolEvidence(source,record,before);
  }
  const track=summarizeGeneral(source.items.map(i=>i.record.grade!),old.descriptor.general);
  if(track.status!=='completed'||track.score!==source.sourceScore)invalid('SOURCE_SCORE_CHANGED');
  return questions;
}

function toolEvidence(source:OfflineSource,item:ItemRecord,question:Question):ToolSessionCheckpoint{
  const direct=item.toolCheckpoint,derived=item.regradedFrom?.toolEvidence,cp=direct??derived;
  if(direct&&derived&&identityHash(direct)!==identityHash(derived))invalid('TOOL_EVIDENCE_CONFLICT');
  const turns=(question.grading as any).scenario?.question;
  if(!Array.isArray(turns)||!validToolCheckpoint(cp,question.sourceId,turns.length)||cp.stage!=='done'||cp.pendingCalls.length||
    cp.targetHash!==fingerprintTarget(source.manifest.target))return invalid('TOOL_EVIDENCE_INCOMPLETE');
  let expected=identityHash(question);
  if(!direct){
    const origin=source.manifest.regradeOrigin;
    if(!origin||origin.schema!=='offline-regrade-v1'||origin.modelCalls!==0||origin.sourceProtocols.resourceVersion!=='task-five-v3'||origin.gradedItems!==62||
      !item.regradedFrom||!digest(item.regradedFrom.sourceItemHash))invalid('TOOL_SOURCE_CHAIN');
    const original=structuredClone(question);
    if(['multi_turn_base_39','multi_turn_base_5'].includes(question.sourceId))delete (original.grading as any).toolProfile;
    expected=identityHash(original);
  }
  if(cp.scenarioHash!==expected)invalid('TOOL_SCENARIO_CHANGED');
  // A derived R1 grade can differ from the older checkpoint verdict, so only native verdicts bind here.
  if(direct&&(item.grade?.kind!=='scored'||item.grade.track!=='general'||cp.passed!==item.grade.passed))invalid('TOOL_VERDICT_CHANGED');
  return cp;
}

export async function regradeToolAnswerRevision(source:OfflineSource,old:ResolvedProtocolSet,next:ResolvedProtocolSet,resourcesRoot:string,env:PreparedEnvironment,options:{gradingHashes?:Record<string,string>;cache?:{items:ItemRecord[]}}={}){
  const questions=validateToolAnswerTransition(source,old,next),started=performance.now(),items:ItemRecord[]=[],changes:{id:string;before:boolean;after:boolean;reason:unknown}[]=[];
  for(const q of questions){
    if(env.signal.aborted)invalid('ABORTED');
    const input=source.items.find(i=>i.record.itemId===q.id)!,saved=input.record;
    const previous=saved.grade as Extract<GradeResult,{kind:'scored';track:'general'}>;
    let grade=structuredClone(previous);
    const localHash=options.gradingHashes?.[q.id];
    if(q.id===TOOL_ANSWER_ITEM){
      // Only one local scenario changes. Replaying it is safer than trusting raw-item caches.
      const d=await createToolDispatcher(resourcesRoot,q),cp=toolEvidence(source,saved,old.items.find(p=>p.id===q.id)!);
      const result=await d.grade(cp.callsByTurn,env.signal,{messages:cp.messages});
      grade={kind:'scored',track:'general',itemId:q.id,passed:result.passed,evidence:{metric:'filesystem-answer-list-v3',reason:result.reason}};
    }
    if(previous.passed!==grade.passed)changes.push({id:q.id,before:previous.passed,after:grade.passed,reason:grade.evidence});
    const evidence=saved.toolCheckpoint??saved.regradedFrom?.toolEvidence;
    items.push({schemaVersion:1,revision:1,sequence:1,updatedAt:new Date().toISOString(),itemId:q.id,attempts:[],question:structuredClone(saved.question!),answer:structuredClone(saved.answer!),grade,
      regradedFrom:{sourceItemHash:input.sha256,sourceGrade:structuredClone(previous),...(localHash?{localGradingHash:localHash}:{}),...(evidence?{toolEvidence:structuredClone(evidence)}:{})}});
  }
  const track=summarizeGeneral(items.map(i=>i.grade!),next.descriptor.general);
  if(track.status!=='completed')invalid('TOTAL_INCOMPLETE');
  const linkedTiming=sourceTaskTiming(source,next.descriptor.general);
  const origin:RegradeOrigin={schema:'offline-regrade-v1',sourceRunId:source.manifest.runId,sourceProtocols:structuredClone(source.manifest.protocols),sourceScore:source.sourceScore,
    sourceEvidenceHash:source.sourceEvidenceHash,sourceCompletedAt:source.sourceCompletedAt,rulesHash:rulesHash(next),createdAt:new Date().toISOString(),excludedItems:[],gradedItems:questions.length,
    gradingMs:Math.round(performance.now()-started),modelCalls:0,...(linkedTiming?{sourceTaskTiming:linkedTiming}:{}),scoringCorrection:{schema:'tool-answer-correction-v1',changedItems:[TOOL_ANSWER_ITEM],carriedItems:questions.length-1,
      ...(source.manifest.regradeOrigin?{sourceOrigin:structuredClone(source.manifest.regradeOrigin)}:{})}};
  return{origin,items,track,changes};
}

export function assertToolAnswerArtifact(artifact:any,next:ResolvedProtocolSet,source:OfflineSource,frozenSha:string){
  const result=artifact?.result,origin:RegradeOrigin|undefined=result?.origin,ids=next.items.filter(q=>q.track==='general').map(q=>q.id);
  const correction={schema:'tool-answer-correction-v1',changedItems:[TOOL_ANSWER_ITEM],carriedItems:ids.length-1,...(source.manifest.regradeOrigin?{sourceOrigin:source.manifest.regradeOrigin}:{})};
  const fail=()=>{throw Error('INVALID_OFFLINE_CACHE');};
  if(next.resourceVersion!=='task-five-v3-r2'||![62,348].includes(ids.length)||source.manifest.protocols.resourceVersion!=='task-five-v3-r1'||
    artifact?.schema!=='offline-regrade-artifact-v1'||artifact.frozenSha!==frozenSha||identityHash(artifact.target)!==identityHash(source.manifest.target)||
    !origin||origin.schema!=='offline-regrade-v1'||origin.sourceRunId!==source.manifest.runId||origin.sourceEvidenceHash!==source.sourceEvidenceHash||
    protocolKey(origin.sourceProtocols)!==protocolKey(source.manifest.protocols)||origin.sourceScore!==source.sourceScore||origin.sourceCompletedAt!==source.sourceCompletedAt||
    origin.rulesHash!==rulesHash(next)||origin.modelCalls!==0||origin.gradedItems!==ids.length||identityHash(origin.excludedItems)!==identityHash([])||
    identityHash(origin.scoringCorrection)!==identityHash(correction)||identityHash(origin.sourceTaskTiming??null)!==identityHash(sourceTaskTiming(source,next.descriptor.general)??null)||!Array.isArray(result.items)||result.items.length!==ids.length||
    new Set(result.items.map((i:ItemRecord)=>i.itemId)).size!==ids.length||result.items.some((i:ItemRecord)=>!ids.includes(i.itemId)||i.attempts.length||!scored(i,i.itemId)))return fail();
  for(const item of result.items as ItemRecord[]){
    const original=source.items.find(i=>i.record.itemId===item.itemId),provenance=item.regradedFrom;
    if(!original||!provenance||provenance.sourceItemHash!==original.sha256||identityHash(item.answer)!==identityHash(original.record.answer)||
      identityHash(item.question)!==identityHash(original.record.question)||identityHash(provenance.sourceGrade)!==identityHash(original.record.grade)||
      identityHash(provenance.toolEvidence??null)!==identityHash(original.record.toolCheckpoint??original.record.regradedFrom?.toolEvidence??null)||
      item.itemId!==TOOL_ANSWER_ITEM&&identityHash(item.grade)!==identityHash(original.record.grade)||
      item.itemId===TOOL_ANSWER_ITEM&&(item.grade!.evidence as any)?.metric!=='filesystem-answer-list-v3')return fail();
  }
  if(identityHash(summarizeGeneral(result.items.map((i:ItemRecord)=>i.grade!),next.descriptor.general))!==identityHash(result.track))return fail();
}

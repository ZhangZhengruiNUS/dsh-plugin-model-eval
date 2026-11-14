import {randomUUID} from 'node:crypto';
import type {RunSummary} from '../contracts.ts';import type {RunManifest,ItemRecord} from '../history/store.ts';import type {BatchView,RunSettlement} from '../jobs/queue.ts';
import {identityHash} from '../evaluation/protocol-identity.ts';
import {validateTimingTrace,type TimingTraceV1,type WorkloadPlanV1} from './calibration-contracts.ts';import {assertWorkloadPlan,assertCompleteFormalTrace} from './baseline-validation.ts';
import type {PerformanceSample} from './contracts.ts';
export interface FirstPassInput {rootId:string;manifest:Pick<RunManifest,'runId'|'batchId'|'requiredItems'|'reuseOrigin'|'executionOrder'>;summary:RunSummary;batch:BatchView;items:readonly ItemRecord[]}
export type SettledFirstPassInput=Omit<FirstPassInput,'batch'>&{settlement:RunSettlement};
const incomplete=():never=>{throw Error('FIRST_PASS_NOT_COMPLETE');};
/** New metadata snapshot only. Never changes an answer, grade, original trace or run status. */
export function captureFirstPassTrace(plan:WorkloadPlanV1,source:TimingTraceV1,input:FirstPassInput,capturedAt=new Date().toISOString()):TimingTraceV1 {
 const {batch,manifest}=input;
 if(batch.batchId!==manifest.batchId||batch.runIds.length!==1||batch.runIds[0]!==manifest.runId||!['completed','pending'].includes(batch.status)||batch.lastError&&batch.lastError.code!=='OBSERVED_OUTPUT_TIMEOUT'||batch.status==='completed'&&batch.pendingItems?.length)incomplete();
 return captureRunProof(plan,source,input,batch.pendingItems??[],capturedAt);
}
/** Ordinary queue supplies its actual drained target context, even while later
 * targets in the same batch are still queued. Paused/reused/makeup sources do
 * not gain training eligibility by projecting them into a synthetic batch.
 */
export function captureSettledRunFirstPassTrace(plan:WorkloadPlanV1,source:TimingTraceV1,input:SettledFirstPassInput,capturedAt=new Date().toISOString()):TimingTraceV1 {
 const {manifest,settlement:s}=input;
 if(s.reason!=='drained'||s.runId!==manifest.runId||s.batchId!==manifest.batchId||!s.memberRunIds.includes(manifest.runId)||new Set(s.memberRunIds).size!==s.memberRunIds.length||s.pendingItems.some(p=>p.runId!==manifest.runId||p.error.code!=='OBSERVED_OUTPUT_TIMEOUT'))incomplete();
 return captureRunProof(plan,source,input,s.pendingItems,capturedAt);
}
function captureRunProof(plan:WorkloadPlanV1,source:TimingTraceV1,input:Omit<FirstPassInput,'batch'>,pendingItems:NonNullable<BatchView['pendingItems']>,capturedAt:string):TimingTraceV1 {
 const fail=incomplete;
 assertWorkloadPlan(plan);validateTimingTrace(source);const {manifest,summary,items}=input;if(summary.executionChanges?.length||summary.reuse?.mixedExecution)fail();
 if(manifest.executionOrder?.hash!==plan.executionOrderHash||source.rootId!==input.rootId||source.programId!=='formal-trace-v1'||source.status==='running'||source.runId!==manifest.runId||summary.runId!==manifest.runId||summary.batchId!==manifest.batchId||manifest.reuseOrigin||source.protocolHash!==plan.protocolHash||source.workloadHash!==plan.workloadHash||summary.metrics.incompleteTiming)fail();
 if(identityHash(manifest.requiredItems.map(q=>[q.id,q.datasetId,q.track]).sort())!==identityHash(plan.jobs.map(j=>[j.itemId,j.datasetId,j.track]).sort())||items.length!==plan.jobs.length||new Set(items.map(i=>i.itemId)).size!==plan.jobs.length)fail();
 const intervals=summary.metrics.activeIntervals;if(intervals.length!==1||intervals.some(x=>!x.endedAt||!Number.isFinite(Date.parse(x.startedAt))||!Number.isFinite(Date.parse(x.endedAt!))||Date.parse(x.endedAt!)<Date.parse(x.startedAt)||Date.parse(x.startedAt)<Date.parse(source.startedAt)||Date.parse(x.endedAt!)>Date.parse(source.updatedAt)))fail();
 const sorted=[...intervals].sort((a,b)=>a.startedAt.localeCompare(b.startedAt));if(sorted.some((x,i)=>i>0&&Date.parse(x.startedAt)<Date.parse(sorted[i-1]!.endedAt!)))fail();
 const start=Date.parse(intervals[0]!.startedAt),end=Date.parse(intervals[0]!.endedAt!),inside=(from:string,to:string|undefined)=>Number.isFinite(Date.parse(from))&&Number.isFinite(Date.parse(to??''))&&Date.parse(from)>=start&&Date.parse(to!)<=end&&Date.parse(to!)>=Date.parse(from);
 if(source.events.some(e=>!inside(e.startedAt,e.endedAt)))fail();
 function matched(p:PerformanceSample|undefined,itemId:string,datasetId:string,phase:string){if(!p||p.itemId!==itemId||p.datasetId!==datasetId||p.phase!==phase||!inside(p.startedAt,p.endedAt)||!source.events.some(e=>e.eventId===p.sampleId&&e.itemId===itemId&&e.datasetId===datasetId&&e.phase===phase&&e.outcome===p.outcome&&e.startedAt===p.startedAt&&e.endedAt===p.endedAt&&e.durationMs===p.durationMs))fail();}
 const scoredItemIds:string[]=[],deferredItemIds:string[]=[];
 for(const job of plan.jobs){const item=items.find(i=>i.itemId===job.itemId)??fail();if(item.reuse||item.gradingActive||item.toolActiveStage||item.toolTimingIncomplete||item.attempts.some(a=>a.status==='started'||!a.endedAt))fail();
  for(const a of item.attempts){if(!inside(a.startedAt,a.endedAt)||a.attemptId!==a.performance?.sampleId)fail();matched(a.performance,job.itemId,job.datasetId+(job.stages.includes('tool-scenario')?':turn':''),a.phase);}
  if(item.gradingObservation)matched(item.gradingObservation,job.itemId,job.datasetId,'local-grade');if(item.toolObservation)matched(item.toolObservation,job.itemId,job.datasetId,'tool-scenario');
  if(item.grade?.kind==='scored'){const answer=item.attempts.find(a=>a.attemptId===item.answer?.observations.attemptId);if(item.grade.itemId!==job.itemId||item.grade.track!==job.track||!item.answer?.complete||answer?.status!=='completed'||answer.phase!=='answer'||answer.performance?.outcome!=='completed'||job.stages.includes('local-grade')&&item.gradingObservation?.outcome!=='completed'||job.stages.includes('tool-scenario')&&(item.toolCheckpoint?.stage!=='done'||item.toolObservation?.outcome!=='completed'))fail();scoredItemIds.push(job.itemId);}
  else {const attempt=item.attempts.at(-1),pending=pendingItems.filter(p=>p.runId===manifest.runId&&p.itemId===job.itemId);if(attempt?.status!=='failed'||attempt.error?.code!=='OBSERVED_OUTPUT_TIMEOUT'||attempt.performance?.outcome!=='timeout'||attempt.error.retryable!==false||attempt.phase!==attempt.error.phase||!['answer','judge'].includes(attempt.error.phase)||pending.length!==1||pending[0]!.error.code!=='OBSERVED_OUTPUT_TIMEOUT')fail();deferredItemIds.push(job.itemId);}
 }
 if(pendingItems.length!==deferredItemIds.length||Object.values(summary.tracks).reduce((n,t)=>n+t.graded,0)!==scoredItemIds.length)fail();
 const truthMs=intervals.reduce((n,x)=>n+Date.parse(x.endedAt!)-Date.parse(x.startedAt),0);if(!Number.isFinite(truthMs)||truthMs<=0)fail();
 const result:TimingTraceV1={...structuredClone(source),traceId:randomUUID(),revision:0,programId:'formal-first-pass-v1',durationScope:'first-pass',status:'completed',truthMs,firstPass:{version:1,sourceTraceId:source.traceId,sourceTraceHash:identityHash(source),sourceUpdatedAt:source.updatedAt,capturedAt,scoredItemIds:scoredItemIds.sort(),deferredItemIds:deferredItemIds.sort()}};
 try{validateTimingTrace(result);assertCompleteFormalTrace(plan,result);}catch{fail();}return result;
}

import {createHash} from 'node:crypto';
import type {EvaluationRequest,JudgeSnapshot,ProtocolRefs,TargetSnapshot} from '../contracts.ts';
import type {ItemRecord} from '../history/store.ts';
import {fingerprintTarget} from '../model/identity.ts';
import type {PerformanceSample,PerformanceState,StageKey} from './contracts.ts';
export const stageId=(s:StageKey)=>JSON.stringify([s.conditionKey,s.datasetId,s.phase]);
export const emptyPerformance=():PerformanceState=>({version:1,samples:[],censoredBounds:[],activeStages:[]});
export function performanceConditionKey(target:TargetSnapshot,protocols:ProtocolRefs,execution:EvaluationRequest['execution'],judge?:JudgeSnapshot):string {
  return createHash('sha256').update(JSON.stringify([fingerprintTarget(target),protocols.generalId,protocols.writingId,protocols.resourceVersion,execution.concurrency,execution.callTimeoutMs,judge?[fingerprintTarget(judge.target),judge.rubricId,judge.promptId]:null])).digest('hex');
}
export function normalizeObservation(input:PerformanceSample):PerformanceSample {
  const s=structuredClone(input);delete s.tpotMs;
  if(!Number.isFinite(s.durationMs)||s.durationMs<0)throw new Error('INVALID_PERFORMANCE_TIME');
  const t=s.timing,n=s.usage?.outputTokens;
  if(t&&Number.isFinite(t.totalMs)&&t.totalMs>=0)s.durationMs=t.totalMs;
  if(s.outcome==='completed'&&t?.outputTokenScope==='observable-generated'&&n!==undefined&&n>1&&t.firstOutputMs!==undefined&&t.lastOutputMs!==undefined&&t.lastOutputMs>=t.firstOutputMs)s.tpotMs=(t.lastOutputMs-t.firstOutputMs)/(n-1);
  return s;
}
export function rebuildPerformance(items:readonly ItemRecord[],previous?:PerformanceState):PerformanceState {
  const result=emptyPerformance(),all=new Map<string,PerformanceSample>();
  for(const s of [...(previous?.samples??[]),...(previous?.recentFailures??[])])all.set(s.sampleId,s);
  for(const item of items){for(const attempt of item.attempts){if(attempt.performance)all.set(attempt.performance.sampleId,normalizeObservation(attempt.performance));if(attempt.status==='started'&&attempt.performanceKey)result.activeStages.push({...attempt.performanceKey,sampleId:attempt.attemptId,itemId:item.itemId,startedAt:attempt.startedAt});}if(item.gradingObservation)all.set(item.gradingObservation.sampleId,normalizeObservation(item.gradingObservation));}
  const ordered=[...all.values()].sort((a,b)=>a.endedAt.localeCompare(b.endedAt)||a.sampleId.localeCompare(b.sampleId));
  const bounds=new Map((previous?.censoredBounds??[]).map(x=>[stageId(x),structuredClone(x)]));
  for(const s of ordered)if(s.outcome==='timeout'||s.outcome==='cancelled'){const key=stageId(s),old=bounds.get(key);if(!old||s.durationMs>old.durationMs)bounds.set(key,{conditionKey:s.conditionKey,datasetId:s.datasetId,phase:s.phase,durationMs:s.durationMs,observedAt:s.endedAt,explained:false});}
  for(const b of bounds.values())if(ordered.some(s=>s.outcome==='completed'&&stageId(s)===stageId(b)&&s.endedAt>b.observedAt&&s.durationMs>=b.durationMs))b.explained=true;
  const buckets=new Map<string,PerformanceSample[]>();for(const s of ordered){const key=stageId(s)+(s.outcome==='completed'?'complete':'other'),bucket=buckets.get(key)??[];bucket.push(s);buckets.set(key,bucket.slice(-20));}
  result.samples=[...buckets.values()].flat().filter(s=>s.outcome==='completed');result.recentFailures=[...buckets.values()].flat().filter(s=>s.outcome!=='completed');result.censoredBounds=[...bounds.values()];return result;
}

export function appendPerformanceSample(previous:PerformanceState,sample:PerformanceSample):PerformanceState {const next=rebuildPerformance([],{...previous,samples:[...previous.samples,normalizeObservation(sample)]});next.activeStages=previous.activeStages.filter(x=>x.sampleId!==sample.sampleId);return next;}

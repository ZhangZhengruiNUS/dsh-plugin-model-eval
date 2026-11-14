import {isDeepStrictEqual} from 'node:util';
import {identityHash} from '../evaluation/protocol-identity.ts';
import {validateTimingTrace,isProbeProgramId,isProbePrefixId,type TimingTraceV1,type WorkloadPlanV1,type BaselineProfileV1} from './calibration-contracts.ts';
import {assertBaselineProfile,assertWorkloadPlan,assertCompleteFormalTrace} from './baseline-validation.ts';
import {predictFullRun} from './profile-predictor.ts';

export function buildBaselineProfile(workload:WorkloadPlanV1,traces:readonly TimingTraceV1[],asOf:string):BaselineProfileV1 {
 assertWorkloadPlan(workload);if(!Number.isFinite(Date.parse(asOf)))throw Error('CALIBRATION_TIME_INVALID');
 for(const t of traces){validateTimingTrace(t);if(Date.parse(t.updatedAt)>Date.parse(asOf))throw Error('CALIBRATION_FUTURE_SOURCE');}
 const formal=traces.filter(t=>t.programId==='formal-trace-v1'||t.programId==='formal-first-pass-v1');if(!formal.length)throw Error('CALIBRATION_TRUTH_MISSING');
 const firstPass=formal[0]!.programId==='formal-first-pass-v1';if(formal.some(t=>(t.programId==='formal-first-pass-v1')!==firstPass))throw Error('DURATION_SCOPE_CHANGED');
 if(new Set(formal.map(t=>t.runId??t.traceId)).size!==formal.length)throw Error('DUPLICATE_TRAINING_RUN');
 for(const t of formal)assertCompleteFormalTrace(workload,t);
 const probes=[...new Set(formal.map(t=>t.previewId??t.pairedTraceId))].map(id=>{const p=traces.find(t=>t.traceId===id&&isProbeProgramId(t.programId));if(!p)throw Error('BASELINE_PAIR_MISSING');return p;});
 const first=formal[0]!;if(first.protocolHash!==workload.protocolHash||first.workloadHash!==workload.workloadHash)throw Error('WORKLOAD_CHANGED');
 const body:Omit<BaselineProfileV1,'id'>={version:1,createdAt:asOf,algorithmId:'estimate-v3',programHash:first.programHash,protocolHash:first.protocolHash,workloadHash:first.workloadHash,conditionKey:first.conditionKey,machineKey:first.machineKey,concurrency:first.concurrency!,scope:'same-configuration',trainingTraceIds:[...formal,...probes].map(t=>t.traceId).sort(),formal:structuredClone(formal),probes:structuredClone(probes),residualRatios:[],validated:false,rangeValidated:false};
 if(firstPass)body.durationScope='first-pass';const result={...body,id:identityHash(body)};assertBaselineProfile(result);return result;
}
export function evaluateProfile(profile:BaselineProfileV1,workload:WorkloadPlanV1,traces:readonly TimingTraceV1[]){
 assertBaselineProfile(profile);assertWorkloadPlan(workload);for(const t of traces)validateTimingTrace(t);
 const isFormal=(t:TimingTraceV1)=>t.programId==='formal-trace-v1'||t.programId==='formal-first-pass-v1';
 const runIds=traces.filter(isFormal).map(t=>t.runId??t.traceId);
 if(new Set(traces.map(t=>t.traceId)).size!==traces.length||new Set(runIds).size!==runIds.length)throw Error('DUPLICATE_VALIDATION');
 const trainingRuns=new Set(profile.formal.map(t=>t.runId??t.traceId));
 if(traces.some(t=>profile.trainingTraceIds.includes(t.traceId)||trainingRuns.has(t.runId??t.traceId)))throw Error('TRAINING_VALIDATION_OVERLAP');
 const rows=traces.filter(isFormal).map(t=>{
  if((t.programId==='formal-first-pass-v1')!==(profile.durationScope==='first-pass'))throw Error('DURATION_SCOPE_CHANGED');
  if(t.status!=='completed'||t.truthMs===undefined)return {traceId:t.traceId,pointPassed:false,rangeEvaluable:false,reason:'TRUTH_MISSING'};
  assertCompleteFormalTrace(workload,t);
  const p=t.prediction,source=traces.find(x=>x.traceId===(t.predictionProbeId??t.previewId));
  if(!p||!source)return {traceId:t.traceId,pointPassed:false,rangeEvaluable:false,reason:'PREDICTION_MISSING'};
  if(!(isProbeProgramId(source.programId)||isProbePrefixId(source.programId))||source.conditionKnown!==true||
   source.conditionKey!==t.conditionKey||source.protocolHash!==t.protocolHash||source.workloadHash!==t.workloadHash||source.machineKey!==t.machineKey||source.programHash!==t.programHash||source.concurrency!==t.concurrency||
   Date.parse(source.startedAt)<Date.parse(profile.createdAt)||Date.parse(source.observationCutoff??source.updatedAt)>Date.parse(p.asOf)||
   isProbePrefixId(source.programId)&&source.pairedTraceId!==t.previewId||isProbeProgramId(source.programId)&&source.traceId!==t.previewId)throw Error('VALIDATION_SOURCE_INVALID');
  if(Date.parse(p.asOf)>Date.parse(t.startedAt)||Date.parse(p.asOf)<Date.parse(profile.createdAt)||t.protocolHash!==profile.protocolHash||t.workloadHash!==profile.workloadHash||t.conditionKey!==profile.conditionKey||t.machineKey!==profile.machineKey||t.programHash!==profile.programHash||t.concurrency!==profile.concurrency)throw Error('VALIDATION_CONDITION_CHANGED');
  const expected=predictFullRun({workload,conditionKey:t.conditionKey,machineKey:t.machineKey,programHash:t.programHash,concurrency:t.concurrency!,asOf:p.asOf,profiles:[profile],probeEvents:source.events,...(profile.durationScope?{durationScope:profile.durationScope}:{})});
  if(!isDeepStrictEqual(expected,p))throw Error('PREDICTION_MISMATCH');
  if(p.state!=='available'||p.centerMs===undefined)return {traceId:t.traceId,pointPassed:false,rangeEvaluable:false,reason:'PREDICTION_UNAVAILABLE'};
  const truth=t.truthMs,absoluteErrorMs=Math.abs(truth-p.centerMs),ratio=p.centerMs/truth;
  const pointPassed=truth<300000?absoluteErrorMs<=120000:ratio>=.67&&ratio<=1.5;
  const rangeEvaluable=!!p.rangeMs,rangePassed=p.rangeMs?truth>=p.rangeMs.low&&truth<=p.rangeMs.high&&p.rangeMs.low>0&&p.rangeMs.high/p.rangeMs.low<=2.5:undefined;
  return {traceId:t.traceId,pointPassed,rangeEvaluable,...(rangePassed!==undefined?{rangePassed}:{}),centerMs:p.centerMs,truthMs:truth,absoluteErrorMs,ratio,reason:'POINT_ONLY_EXPERIMENT'};
 });
 return {algorithm:'estimate-v3',profileId:profile.id,scope:'independent-full-runs',durationScope:profile.durationScope??'all-scored',rows,passed:rows.length>=2&&rows.every(r=>r.pointPassed)};
}

import {simulateSchedule} from './engine.ts';
import {validateTimingEvent,type PredictionInputV3,type PredictionV3,type WorkloadJobV1,type TimingEventV1} from './calibration-contracts.ts';
import {assertBaselineProfile,assertCompleteFormalTrace,assertWorkloadPlan} from './baseline-validation.ts';
function bucket(dataset:string,phase:string,group='ordinary'){
 if(phase==='local-grade')return 'local-grade';if(phase==='judge')return 'writing-judge';if(dataset==='writing')return 'writing';
 if(dataset==='longbench-v2-selected')return group;
 if(dataset==='bfcl-v4-multi-turn-selected')return 'native-tools';
 if(dataset==='code-contests-selected'||dataset==='olympiad-text-selected')return 'reasoning-code';return 'ordinary';
}
const probeBucket=(e:TimingEventV1)=>bucket(e.datasetId,e.phase,e.inputGroup??(e.probeId?.includes('reading-long')?'reading-long':e.probeId?.includes('reading-short')?'reading-short':'ordinary'));
// A timed-out first-pass attempt supplies an observed occupancy cost, not an
// answer completion time. Short probe speed cannot identify its completion time.
export function projectReferenceStage(events:readonly TimingEventV1[],factor:number,firstPass:boolean){
 return events.reduce((n,e)=>n+e.durationMs*(firstPass&&e.outcome==='timeout'?1:factor),0);
}
export function predictFullRun(input:PredictionInputV3):PredictionV3 {
 return calculateFullRun(input,()=>{});
}
// Dynamic forecasts must retain the exact eligible formal/probe pairs. A profile
// can contain both compatible and censored-incompatible reference runs.
export function predictFullRunWithCandidates(input:PredictionInputV3){
 const candidates:{profileId:string;traceId:string}[]=[];
 const prediction=calculateFullRun(input,(profileId,traceId)=>candidates.push({profileId,traceId}));
 return {prediction,candidates};
}
function calculateFullRun(input:PredictionInputV3,onCandidate:(profileId:string,traceId:string)=>void):PredictionV3 {
 const empty=(...reasons:string[]):PredictionV3=>({algorithm:'estimate-v3',asOf:input.asOf,state:'unavailable',reasons,baselineIds:[],measuredBuckets:[],inferredBuckets:[]});
 try{assertWorkloadPlan(input.workload);for(const p of input.profiles)assertBaselineProfile(p);for(const e of input.probeEvents)validateTimingEvent(e);}catch{return empty('INVALID_PREDICTION_INPUT');}
 const cutoff=Date.parse(input.asOf);if(!Number.isFinite(cutoff))return empty('INVALID_CUTOFF');
 if(input.probeEvents.some(e=>Date.parse(e.endedAt)>cutoff))return empty('FUTURE_OBSERVATION');
 const profiles=input.profiles.filter(p=>(p.durationScope??'all-scored')===(input.durationScope??'all-scored')&&p.protocolHash===input.workload.protocolHash&&p.workloadHash===input.workload.workloadHash&&p.conditionKey===input.conditionKey&&p.machineKey===input.machineKey&&p.programHash===input.programHash&&p.concurrency===input.concurrency&&Date.parse(p.createdAt)<=cutoff);
 if(!profiles.length)return empty('NO_APPLICABLE_BASELINE');
 if(input.probeEvents.some(e=>e.outcome==='failed'))return empty('PROBE_FAILED');
 const candidates:{value:number;profileId:string}[]=[],measured=new Set<string>(),inferred=new Set<string>(),reasons=new Set<string>();
 for(const profile of profiles)for(const formal of profile.formal){
  try{assertCompleteFormalTrace(input.workload,formal);}catch{continue;}
  const reference=profile.probes.find(p=>p.traceId===(formal.previewId??formal.pairedTraceId))!;
  const ratios=new Map<string,number[]>();let compatible=true;
  for(const current of input.probeEvents){
   const ref=reference.events.find(e=>(e.probeId??e.itemId)===(current.probeId??current.itemId)&&e.phase===current.phase&&e.datasetId===current.datasetId);
   const group=probeBucket(current);if(!ref||ref.outcome!=='completed'||ref.durationMs<=0){
    if(current.outcome!=='completed'){compatible=false;reasons.add('CENSORED_RELATION_UNCALIBRATED');}continue;
   }
   if(current.outcome==='completed'){const values=ratios.get(group)??[];values.push(current.durationMs/ref.durationMs);ratios.set(group,values);}
  }
  const factors=new Map([...ratios].map(([key,values])=>[key,values.reduce((n,v)=>n+v,0)/values.length]));
  for(const current of input.probeEvents)if(current.outcome!=='completed'){
   const ref=reference.events.find(e=>(e.probeId??e.itemId)===(current.probeId??current.itemId)&&e.phase===current.phase&&e.datasetId===current.datasetId);
   if(ref?.outcome==='completed'&&ref.durationMs*(factors.get(probeBucket(current))??1)<=current.durationMs){compatible=false;reasons.add('CENSORED_OUTSIDE_BASELINE');}
  }
  if(!compatible)continue;
  const stages=(j:WorkloadJobV1,scaled:boolean)=>j.stages.map(phase=>{
   const samples=formal.events.filter(e=>e.itemId===j.itemId&&e.datasetId===j.datasetId&&e.phase===phase);
   const group=bucket(j.datasetId,phase,j.inputGroup),factor=phase==='local-grade'?1:factors.get(group)??1;
   if(input.durationScope==='first-pass'&&samples.some(e=>e.outcome==='timeout'))reasons.add('TIMEOUT_COST_PRIOR');
   if(phase!=='local-grade')if(factors.has(group))measured.add(group);else inferred.add(group);
   return {phase,durationMs:projectReferenceStage(samples,scaled?factor:1,input.durationScope==='first-pass')};
  });
  const original=simulateSchedule(input.workload.jobs.map(j=>({track:j.track,stages:stages(j,false)})),input.concurrency);
  if(original<=0)continue;
  const projected=simulateSchedule(input.workload.jobs.map(j=>({track:j.track,stages:stages(j,true)})),input.concurrency);
  candidates.push({value:projected*(formal.truthMs!/original),profileId:profile.id});
  onCandidate(profile.id,formal.traceId);
 }
 if(!candidates.length)return empty(...(reasons.size?[...reasons]:['BASELINE_INCOMPLETE']));
 const centerMs=Math.round(candidates.reduce((n,c)=>n+c.value,0)/candidates.length),used=new Set(candidates.map(c=>c.profileId));
 const applicable=profiles.filter(p=>used.has(p.id));
 const result:PredictionV3={algorithm:'estimate-v3',asOf:input.asOf,state:'available',...(input.durationScope?{durationScope:input.durationScope}:{}),centerMs,baselineIds:[...used].sort(),measuredBuckets:[...measured].sort(),inferredBuckets:[...inferred].sort(),reasons:[]};
 if(applicable.some(p=>!p.validated))result.reasons.push('EXPERIMENTAL_BASELINE');
 result.reasons.push('RANGE_NOT_CALIBRATED');
 if(inferred.size)result.reasons.push('PARTLY_PRIOR_INFERRED');
 if(reasons.has('TIMEOUT_COST_PRIOR'))result.reasons.push('TIMEOUT_COST_PRIOR');
 return result;
}

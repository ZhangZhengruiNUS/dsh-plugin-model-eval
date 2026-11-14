import type {StagePhase} from './contracts.ts';
import {simulateSchedule} from './engine.ts';
import {predictFullRunWithCandidates,projectReferenceStage} from './profile-predictor.ts';
import {assertWorkloadPlan} from './baseline-validation.ts';
import {validateTimingEvent,type PredictionInputV3,type TimingEventV1,type WorkloadJobV1} from './calibration-contracts.ts';

export interface DynamicPredictionInput extends PredictionInputV3 {
 durationScope:'first-pass';
 currentEvents:readonly TimingEventV1[];
 remainingJobs:readonly WorkloadJobV1[];
 terminalItems:readonly {itemId:string;state:'scored'|'deferred-timeout'}[];
 activeStages:readonly {itemId:string;phase:StagePhase;ageMs:number}[];
 activeElapsedMs:number;
 status:'running'|'queued'|'paused'|'pending'|'first-pass-completed';
}
export interface DynamicPrediction {
 algorithm:'estimate-v3';durationScope:'first-pass';asOf:string;
 state:'available'|'unavailable'|'paused'|'pending'|'completed';
 remainingMs?:number;totalMs?:number;baselineIds:string[];reasons:string[];
}
const mean=(values:readonly number[])=>values.reduce((n,v)=>n+v,0)/values.length;
function median(values:readonly number[]){const sorted=[...values].sort((a,b)=>a-b),i=Math.floor(sorted.length/2);return sorted.length%2?sorted[i]!:(sorted[i-1]!+sorted[i]!)/2;}
// Initial probe buckets match the frozen full-run predictor. Live updates use the
// narrower dataset/phase/input group, so a fast short task cannot shrink coding.
function probeBucket(dataset:string,phase:string,group='ordinary'){
 if(phase==='local-grade')return 'local-grade';if(phase==='judge')return 'writing-judge';if(dataset==='writing')return 'writing';
 if(dataset==='longbench-v2-selected')return group;if(dataset==='bfcl-v4-multi-turn-selected')return 'native-tools';
 return dataset==='code-contests-selected'||dataset==='olympiad-text-selected'?'reasoning-code':'ordinary';
}
const liveKey=(job:WorkloadJobV1,phase:StagePhase)=>JSON.stringify([job.datasetId,phase,job.inputGroup]);
const samples=(events:readonly TimingEventV1[],job:WorkloadJobV1,phase:StagePhase)=>events.filter(e=>e.itemId===job.itemId&&e.datasetId===job.datasetId&&e.phase===phase);

/** Pure opt-in calculation. No history writes, dispatch, timers, or release-gate bypass. */
export function predictRemainingRun(input:DynamicPredictionInput):DynamicPrediction {
 const unavailable=(...reasons:string[]):DynamicPrediction=>({algorithm:'estimate-v3',durationScope:'first-pass',asOf:input.asOf,state:'unavailable',baselineIds:[],reasons});
 try {
  assertWorkloadPlan(input.workload);const cutoff=Date.parse(input.asOf);
  if(input.durationScope!=='first-pass'||!Number.isFinite(cutoff)||!Number.isFinite(input.activeElapsedMs)||input.activeElapsedMs<0||![1,2,3,4].includes(input.concurrency)||!['running','queued','paused','pending','first-pass-completed'].includes(input.status))return unavailable('INVALID_DYNAMIC_INPUT');
  const jobs=new Map(input.workload.jobs.map(j=>[j.itemId,j])),eventIds=new Set<string>();let sequence=0;
  for(const event of input.currentEvents){validateTimingEvent(event);const job=jobs.get(event.itemId);
   if(!job||eventIds.has(event.eventId)||event.sequence<=sequence||Date.parse(event.endedAt)>cutoff)return unavailable('INVALID_CURRENT_OBSERVATION');
   const sceneTurn=job.stages.includes('tool-scenario')&&event.datasetId===job.datasetId+':turn'&&event.phase==='answer';
   if(!sceneTurn&&(event.datasetId!==job.datasetId||!job.stages.includes(event.phase)))return unavailable('INVALID_CURRENT_OBSERVATION');
   eventIds.add(event.eventId);sequence=event.sequence;
  }
  const terminal=new Map(input.terminalItems.map(t=>[t.itemId,t])),remaining=new Map(input.remainingJobs.map(j=>[j.itemId,j]));
  if(terminal.size!==input.terminalItems.length||remaining.size!==input.remainingJobs.length||terminal.size+remaining.size!==jobs.size)return unavailable('INVALID_WORK_PARTITION');
  for(const [id,t]of terminal){const job=jobs.get(id);if(!job||remaining.has(id))return unavailable('INVALID_WORK_PARTITION');
   if(t.state==='scored'){if(job.stages.some(phase=>samples(input.currentEvents,job,phase).at(-1)?.outcome!=='completed'))return unavailable('TERMINAL_EVIDENCE_MISSING');}
   else if(t.state==='deferred-timeout'){
    const phase=job.stages.includes('tool-scenario')?'tool-scenario':job.stages.includes('judge')&&samples(input.currentEvents,job,'answer').at(-1)?.outcome==='completed'?'judge':'answer';
    if(samples(input.currentEvents,job,phase).at(-1)?.outcome!=='timeout')return unavailable('TERMINAL_EVIDENCE_MISSING');
   }else return unavailable('INVALID_WORK_PARTITION');
  }
  for(const [id,left]of remaining){const job=jobs.get(id);if(!job||terminal.has(id)||left.datasetId!==job.datasetId||left.track!==job.track||left.inputGroup!==job.inputGroup||!left.stages.length)return unavailable('INVALID_WORK_PARTITION');
   const omitted=job.stages.length-left.stages.length;
   if(omitted<0||left.stages.some((phase,i)=>phase!==job.stages[omitted+i])||job.stages.slice(0,omitted).some(phase=>samples(input.currentEvents,job,phase).at(-1)?.outcome!=='completed')||samples(input.currentEvents,job,left.stages[0]!).at(-1)?.outcome==='completed')return unavailable('INVALID_WORK_PARTITION');
  }
  const active=new Map(input.activeStages.map(a=>[a.itemId,a]));
  const occupied=new Set([...active.keys(),...input.remainingJobs.filter(j=>j.stages[0]==='local-grade').map(j=>j.itemId)]);
  if(active.size!==input.activeStages.length||occupied.size>input.concurrency||input.activeStages.some(a=>remaining.get(a.itemId)?.stages[0]!==a.phase||!Number.isFinite(a.ageMs)||a.ageMs<0))return unavailable('INVALID_ACTIVE_STAGE');
  if(input.status==='pending')return {...unavailable('TECHNICAL_PENDING'),state:'pending'};
  if(input.status==='first-pass-completed'){
   if(remaining.size||active.size)return unavailable('FIRST_PASS_NOT_COMPLETE');
   return {algorithm:'estimate-v3',durationScope:'first-pass',asOf:input.asOf,state:'completed',remainingMs:0,totalMs:input.activeElapsedMs,baselineIds:[],reasons:['MAKEUP_EXCLUDED']};
  }
  if(!remaining.size)return unavailable('WAITING_FOR_PASS_RECEIPT');
  const selection=predictFullRunWithCandidates(input),initial=selection.prediction;if(initial.state!=='available')return unavailable(...initial.reasons);
  const reasons=new Set(initial.reasons),candidates:{remainingMs:number;profileId:string}[]=[];
  for(const profile of input.profiles.filter(p=>initial.baselineIds.includes(p.id)))for(const formal of profile.formal){
   if(!selection.candidates.some(c=>c.profileId===profile.id&&c.traceId===formal.traceId))continue;
   const reference=profile.probes.find(p=>p.traceId===(formal.previewId??formal.pairedTraceId))!;
   const probeRatios=new Map<string,number[]>();
   for(const current of input.probeEvents){const old=reference.events.find(e=>(e.probeId??e.itemId)===(current.probeId??current.itemId)&&e.datasetId===current.datasetId&&e.phase===current.phase);
    if(current.outcome!=='completed'||old?.outcome!=='completed'||old.durationMs<=0)continue;
    const group=probeBucket(current.datasetId,current.phase,current.inputGroup??(current.probeId?.includes('reading-long')?'reading-long':current.probeId?.includes('reading-short')?'reading-short':'ordinary')),values=probeRatios.get(group)??[];values.push(current.durationMs/old.durationMs);probeRatios.set(group,values);
   }
   const currentRatios=new Map<string,number[]>(),raw=(job:WorkloadJobV1,phase:StagePhase)=>samples(formal.events,job,phase).reduce((n,e)=>n+e.durationMs,0);
   for(const job of input.workload.jobs)for(const phase of job.stages){const observed=samples(input.currentEvents,job,phase),old=samples(formal.events,job,phase).filter(e=>e.outcome==='completed').reduce((n,e)=>n+e.durationMs,0);if(observed.at(-1)?.outcome!=='completed'||old<=0)continue;
    const key=liveKey(job,phase),values=currentRatios.get(key)??[];values.push(observed.filter(e=>e.outcome==='completed').reduce((n,e)=>n+e.durationMs,0)/old);currentRatios.set(key,values);
   }
   const original=simulateSchedule(input.workload.jobs.map(job=>({track:job.track,stages:job.stages.map(phase=>({phase,durationMs:raw(job,phase)}))})),input.concurrency);if(original<=0)continue;
   const correction=formal.truthMs!/original;
   const factor=(job:WorkloadJobV1,phase:StagePhase)=>{const prior=phase==='local-grade'?1:probeRatios.has(probeBucket(job.datasetId,phase,job.inputGroup))?mean(probeRatios.get(probeBucket(job.datasetId,phase,job.inputGroup))!):1,actual=currentRatios.get(liveKey(job,phase));if(!actual?.length)return prior;reasons.add('CURRENT_CATEGORY_UPDATE');const weight=actual.length/(actual.length+3);return prior*(1-weight)+median(actual)*weight;};
   const predicted=(job:WorkloadJobV1,phase:StagePhase)=>projectReferenceStage(samples(formal.events,job,phase),factor(job,phase),true)*correction;
   const ordered=[...input.remainingJobs].sort((a,b)=>{const rank=(j:WorkloadJobV1)=>active.get(j.itemId)?.phase==='local-grade'?0:j.stages[0]==='local-grade'?1:active.has(j.itemId)?2:3;return rank(a)-rank(b);});
   let supported=true;
   const scheduled=ordered.map(job=>({track:job.track,stages:job.stages.map(phase=>{
    let durationMs=predicted(job,phase);
    // A reference timeout has no local-grade duration; a now-completed answer
    // can still need grading. Use observed same-dataset grading, never zero.
    if(durationMs===0&&phase==='local-grade'&&samples(input.currentEvents,job,'answer').at(-1)?.outcome==='completed'){
     const pool=input.workload.jobs.filter(j=>liveKey(j,phase)===liveKey(job,phase)).map(j=>predicted(j,phase)).filter(n=>n>0);if(!pool.length){supported=false;reasons.add('MISSING_STAGE_REFERENCE');}else durationMs=median(pool);
    }
    const age=active.get(job.itemId)?.phase===phase?active.get(job.itemId)!.ageMs:0;
    if(age>0&&durationMs<=age){const tail=input.workload.jobs.filter(j=>j.stages.includes(phase)&&liveKey(j,phase)===liveKey(job,phase)).map(j=>predicted(j,phase)).filter(n=>n>age);
     if(!tail.length){supported=false;reasons.add('ACTIVE_TAIL_UNSUPPORTED');}else {durationMs=mean(tail.map(n=>n-age));reasons.add('ACTIVE_BUCKET_TAIL');}
    }else durationMs=Math.max(0,durationMs-age);
    return {phase,durationMs};
   })}));
   if(supported)candidates.push({remainingMs:simulateSchedule(scheduled,input.concurrency),profileId:profile.id});
  }
  if(!candidates.length)return unavailable(...reasons);
  const remainingMs=Math.round(mean(candidates.map(c=>c.remainingMs)));
  return {algorithm:'estimate-v3',durationScope:'first-pass',asOf:input.asOf,state:input.status==='paused'?'paused':'available',remainingMs,totalMs:input.activeElapsedMs+remainingMs,baselineIds:[...new Set(candidates.map(c=>c.profileId))].sort(),reasons:[...reasons]};
 }catch{return unavailable('INVALID_DYNAMIC_INPUT');}
}

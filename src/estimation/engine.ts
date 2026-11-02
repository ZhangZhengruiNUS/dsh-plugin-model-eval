import type {Track} from '../contracts.ts';import type {EstimateSnapshot,EstimationRunInput,PerformanceSample,StagePhase,StageKey} from './contracts.ts';import {performanceConditionKey,stageId} from './observations.ts';import {approximateStage} from './approximate.ts';
interface SimulationJob {track:Track;stages:{phase:StagePhase;durationMs:number}[]}
export function simulateSchedule(jobs:readonly SimulationJob[],concurrency:1|2|3|4):number {
 if(![1,2,3,4].includes(concurrency))throw Error('INVALID_CONCURRENCY');let total=0;
 for(const track of ['general','writing'] as const){const work=jobs.filter(j=>j.track===track&&j.stages.length);let cursor=0,now=0,graderBusy=false;const workers:Array<{job:SimulationJob;index:number}|undefined>=Array(concurrency),events:{at:number;worker:number;grading:boolean;sequence:number}[]=[],waiting:number[]=[];let sequence=0;
  function stage(w:number){const state=workers[w];if(!state)return;const part=state.job.stages[state.index]!;if(!Number.isFinite(part.durationMs)||part.durationMs<0)throw Error('INVALID_SERVICE_TIME');const grading=part.phase==='local-grade';if(grading&&graderBusy){waiting.push(w);return;}if(grading)graderBusy=true;events.push({at:now+part.durationMs,worker:w,grading,sequence:sequence++});}
  function assign(w:number){const job=work[cursor++];workers[w]=job?{job,index:0}:undefined;if(job)stage(w);}
  for(let w=0;w<concurrency;w++)assign(w);
  while(events.length){events.sort((a,b)=>a.at-b.at||a.sequence-b.sequence);const event=events.shift()!;now=event.at;const state=workers[event.worker]!;if(event.grading){graderBusy=false;const next=waiting.shift();if(next!==undefined)stage(next);}state.index++;if(state.index<state.job.stages.length)stage(event.worker);else assign(event.worker);}
  total+=now;
 }return total;
}
function quantile(points:{value:number;weight:number}[],p:number){const sorted=points.filter(x=>x.weight>0).sort((a,b)=>a.value-b.value),sum=sorted.reduce((n,x)=>n+x.weight,0);let c=0;for(const x of sorted){c+=x.weight;if(c+Number.EPSILON>=p*sum)return x.value;}return sorted.at(-1)!.value;}
function usable(s:PerformanceSample,key:StageKey){return s.outcome==='completed'&&stageId(s)===stageId(key)&&Number.isFinite(s.durationMs)&&s.durationMs>=0;}
export function estimateBatch({runs,now,allowApproximate=false}:{runs:readonly EstimationRunInput[];now:string;allowApproximate?:boolean}):EstimateSnapshot {
 const result:EstimateSnapshot={algorithm:'estimate-v1',asOf:now,state:'calibrating',coverage:{known:0,required:0},sources:[],reasons:[]};if(!runs.length)return result;
 const completeTiming=runs.every(r=>!r.incompleteElapsed&&Number.isFinite(r.activeElapsedMs)&&r.activeElapsedMs>=0),elapsed=runs.reduce((n,r)=>n+(Number.isFinite(r.activeElapsedMs)?Math.max(0,r.activeElapsedMs):0),0);if(runs.some(r=>r.status==='pending')){result.state='pending';return result;}
 if(runs.every(r=>r.status==='completed'||!r.jobs.length)){result.state='completed';result.remainingMs={low:0,high:0};if(completeTiming)result.totalMs={low:elapsed,high:elapsed};return result;}
 let low=0,high=0,stalled=false,missing=false;const sources=new Set<string>();
 for(const run of runs){if(!run.jobs.length||run.status==='completed')continue;const ranges=new Map<string,{low:number;high:number}>(),required=new Map<string,StageKey>();
  for(const job of run.jobs)for(const phase of job.stages){const key={conditionKey:performanceConditionKey(run.target,run.protocols,run.execution,phase==='judge'?run.judge:undefined),datasetId:job.datasetId,phase};required.set(stageId(key),key);}
  for(const [id,key] of required){result.coverage.required++;const current=run.performance.samples.filter(s=>usable(s,key)).slice(-20),unknown=run.target.routeTarget.state==='unknown'||Object.values(run.target.controls).some(x=>x.state==='unknown')||key.phase==='judge'&&run.judge&&(run.judge.target.routeTarget.state==='unknown'||Object.values(run.judge.target.controls).some(x=>x.state==='unknown'));
   const priorSource=run.priorSources?.[id]??run.priorSource;const prior=priorSource?.startsWith('history')&&unknown?[]:run.priorSamples.filter(s=>usable(s,key)).slice(-20),weight=current.length?(prior.length?Math.min(1,current.length/5):1):0;
   const failures=(run.performance.recentFailures??[]).filter(s=>(s.outcome==='failed'||s.outcome==='timeout')&&key.phase!=='local-grade'&&s.automaticRetry!==false&&(stageId(s)===id||key.phase==='tool-scenario'&&s.conditionKey===key.conditionKey&&s.datasetId===key.datasetId+':turn'&&s.phase==='answer'));
   if(failures.some(s=>s.retryWaitMs===undefined)){missing=true;result.reasons.push('RETRY_OVERHEAD_UNKNOWN:'+key.datasetId+':'+key.phase);continue;}
   const rough=()=>{const range=allowApproximate?approximateStage(run,key,!!unknown):undefined;if(!range)return false;ranges.set(id,range);result.approximate=true;result.reasons.push('APPROXIMATE_STAGE:'+key.datasetId+':'+key.phase);sources.add('approximation');return true;};
   if(!current.length&&!prior.length){result.reasons.push('MISSING_STAGE:'+key.datasetId+':'+key.phase);if(!rough())missing=true;continue;}
   const unresolved=[...run.performance.censoredBounds,...(run.priorBounds??[])].find(b=>stageId(b)===id&&!b.explained&&![...current,...prior].some(s=>s.durationMs>=b.durationMs&&s.endedAt>b.observedAt));
   if(unresolved){result.reasons.push('CENSORED_STAGE:'+key.datasetId+':'+key.phase);if(!rough())missing=true;continue;}
   const points=[...current.map(s=>({value:s.durationMs,weight:weight/current.length})),...prior.map(s=>({value:s.durationMs,weight:(1-weight)/prior.length}))];
   if(weight>0)sources.add('current');if(weight<1&&prior.length)sources.add(priorSource??'preview');
   const overhead=failures.length?Math.min(2,failures.length/Math.max(1,current.length))*failures.reduce((n,s)=>n+s.durationMs+(s.retryWaitMs??0),0)/failures.length:0;
   const p50=quantile(points,.5),p90=quantile(points,.9);ranges.set(id,{low:.5*p50+overhead,high:2*Math.max(p90,p50)+overhead});result.coverage.known++;
  }
  const active=new Map<string,typeof run.performance.activeStages[number]>();for(const stage of run.performance.activeStages)if(stage.phase==='tool-scenario'||active.get(stage.itemId)?.phase!=='tool-scenario')active.set(stage.itemId,stage);const ordered=[...run.jobs].sort((a,b)=>{const x=active.get(a.itemId),y=active.get(b.itemId);const priority=(v:typeof x)=>v?(v.phase==='local-grade'?0:1):2;return priority(x)-priority(y);});
  const simulations:{low:SimulationJob[];high:SimulationJob[]}={low:[],high:[]};
  for(const job of ordered){const lo:SimulationJob={track:job.track,stages:[]},hi:SimulationJob={track:job.track,stages:[]};for(const phase of job.stages){const key={conditionKey:performanceConditionKey(run.target,run.protocols,run.execution,phase==='judge'?run.judge:undefined),datasetId:job.datasetId,phase},r=ranges.get(stageId(key));if(!r)continue;const a=active.get(job.itemId),age=a?.phase===phase?Math.max(0,run.activeWaitMs?.[a.sampleId]??(Date.parse(now)-Date.parse(a.startedAt))):0;
    if(!Number.isFinite(age)||age>r.high){stalled=true;result.reasons.push('SLOW_ACTIVE_STAGE:'+job.datasetId+':'+phase);}lo.stages.push({phase,durationMs:Math.max(0,r.low-age)});hi.stages.push({phase,durationMs:Math.max(0,r.high-age)});
   }simulations.low.push(lo);simulations.high.push(hi);}
  if(!missing&&!stalled){low+=simulateSchedule(simulations.low,run.execution.concurrency);high+=simulateSchedule(simulations.high,run.execution.concurrency);}
 }
 result.sources=[...sources];if(stalled){result.state='stalled';return result;}if(missing){result.state=result.coverage.known?'partial':'calibrating';return result;}
 result.state=runs.some(r=>r.status==='paused')?'paused':'available';result.remainingMs={low,high};if(completeTiming)result.totalMs={low:elapsed+low,high:elapsed+high};return result;
}

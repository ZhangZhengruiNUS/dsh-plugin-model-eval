import type {EstimateSnapshot,EstimationRunInput} from './contracts.ts';import {estimateBatch} from './engine.ts';import type {SpeedClock} from '../speed/clock.ts';
import type {RoughRemaining} from './rough-remaining.ts';
export function createLiveEstimator(deps:{getRuns:(batchId:string)=>Promise<{runs:readonly EstimationRunInput[];rough?:RoughRemaining|undefined}>;getActiveBatchIds:()=>readonly string[];clock:SpeedClock;publish:(batchId:string,value:EstimateSnapshot)=>void}){
 const snapshots=new Map<string,EstimateSnapshot>(),runSnapshots=new Map<string,EstimateSnapshot>(),runOwners=new Map<string,string>(),epochs=new Map<string,number>(),last=new Map<string,number>(),ages=new Map<string,{age:number;mono:number}>(),paused=new Set<string>(),resuming=new Map<string,Set<string>|undefined>();let disposed=false,cancelTimer:(()=>void)|undefined;
 const roughSnapshots=new Map<string,RoughRemaining>();
 const flights=new Map<string,{promise:Promise<void>;dirty:boolean}>();
 const calibration=(old:EstimateSnapshot):EstimateSnapshot=>({algorithm:old.algorithm,asOf:deps.clock.now(),state:'calibrating',coverage:old.coverage,sources:[],reasons:['RESUMED'],...(old.basis?{basis:structuredClone(old.basis)}:{})});
 function freezeRuns(id:string,state:'paused'|'calibrating'){for(const [runId,owner] of runOwners)if(owner===id){const old=runSnapshots.get(runId)!;if(old.state!=='completed')runSnapshots.set(runId,state==='paused'?{...old,state,asOf:deps.clock.now()}:calibration(old));}}
 function updateRuns(id:string,values:readonly EstimationRunInput[],state?:'paused'|'calibrating'){for(const value of values)if(value.runId){runOwners.set(value.runId,id);const computed=estimateBatch({runs:[value],now:deps.clock.now()}),old=runSnapshots.get(value.runId);runSnapshots.set(value.runId,computed.state==='completed'?computed:state==='paused'?{...(old??computed),state:'paused',asOf:deps.clock.now()}:state==='calibrating'?calibration(computed):computed);}}
 const emit=(id:string,value:EstimateSnapshot)=>{snapshots.set(id,structuredClone(value));last.set(id,deps.clock.monotonicMs());deps.publish(id,structuredClone(value));};
 function arm(){if(disposed||cancelTimer||!deps.getActiveBatchIds().length)return;cancelTimer=deps.clock.schedule(5000,()=>{cancelTimer=undefined;for(const id of deps.getActiveBatchIds())void invalidate(id,'tick');arm();});}
 async function invalidate(id:string,reason:string){if(disposed)return;arm();if(reason==='performance'&&snapshots.has(id)&&deps.clock.monotonicMs()-(last.get(id)??-Infinity)<5000)return;
  // Only lifecycle controls invalidate an in-flight result. Ordinary progress
  // and ticks coalesce, so slow reads can still finish and publish.
  if(['pause','resume','finish','scope'].includes(reason)){epochs.set(id,(epochs.get(id)??0)+1);roughSnapshots.delete(id);}
  if(reason==='pause'){paused.add(id);resuming.delete(id);freezeRuns(id,'paused');const old=snapshots.get(id);if(old){emit(id,{...old,state:'paused',asOf:deps.clock.now()});return;}}
  if(reason==='resume'){paused.delete(id);resuming.set(id,undefined);freezeRuns(id,'calibrating');const old=snapshots.get(id);emit(id,calibration(old??{algorithm:'estimate-v2',asOf:deps.clock.now(),state:'calibrating',coverage:{known:0,required:0},sources:[],reasons:[]}));}
  const current=flights.get(id);if(current){current.dirty=true;if(reason==='performance'||reason==='tick')return;return current.promise;}
  const flight={promise:undefined as unknown as Promise<void>,dirty:false};flights.set(id,flight);
  flight.promise=(async()=>{do{flight.dirty=false;await calculate(id,epochs.get(id)??0);}while(flight.dirty&&!disposed);})().finally(()=>{if(flights.get(id)===flight)flights.delete(id);});
  return flight.promise;
 }
 async function calculate(id:string,epoch:number){
  try{const {runs,rough}=await deps.getRuns(id);if(disposed||(epochs.get(id)??0)!==epoch)return;const values=structuredClone(runs);
   if(rough&&deps.getActiveBatchIds().includes(id))roughSnapshots.set(id,rough);else roughSnapshots.delete(id);
   const included=new Set(values.map(run=>run.runId));
   for(const [runId,owner] of runOwners)if(owner===id&&!included.has(runId)){
     runOwners.delete(runId);
     runSnapshots.delete(runId);
   }
   const seen=new Set<string>();for(const r of values){const carried=r.activeWaitMs??{};r.activeWaitMs={};for(const a of r.performance.activeStages){seen.add(a.sampleId);let time=ages.get(a.sampleId);if(!time){time={age:carried[a.sampleId]??Math.max(0,Date.parse(deps.clock.now())-Date.parse(a.startedAt)),mono:deps.clock.monotonicMs()};ages.set(a.sampleId,time);}r.activeWaitMs[a.sampleId]=time.age+Math.max(0,deps.clock.monotonicMs()-time.mono);}}for(const key of ages.keys())if(!seen.has(key))ages.delete(key);
   const computed=estimateBatch({runs:values,now:deps.clock.now()});if(computed.state==='completed'||computed.state==='pending'){paused.delete(id);resuming.delete(id);}
   else if(paused.has(id)){const old=snapshots.get(id);updateRuns(id,values,'paused');emit(id,{...(old??computed),state:'paused'});return;}
   else if(resuming.has(id)){const current=new Set(values.flatMap(r=>r.performance.samples.map(s=>s.sampleId))),previous=resuming.get(id);if(!previous){resuming.set(id,current);updateRuns(id,values,'calibrating');return;}if(![...current].some(s=>!previous.has(s))){updateRuns(id,values,'calibrating');return;}resuming.delete(id);}
   updateRuns(id,values);emit(id,computed);
  }catch{if(!disposed&&(epochs.get(id)??0)===epoch){roughSnapshots.delete(id);freezeRuns(id,'calibrating');const old=snapshots.get(id);emit(id,{algorithm:old?.algorithm??'estimate-v2',asOf:deps.clock.now(),state:'calibrating',coverage:old?.coverage??{known:0,required:0},sources:[],reasons:['ESTIMATE_UNAVAILABLE'],...(old?.basis?{basis:old.basis}:{})});}}
 }
 return {invalidate,restore(id:string,value:EstimateSnapshot){if(disposed)return;snapshots.set(id,structuredClone(value));if(value.state==='paused')paused.add(id);},restoreRun(id:string,batchId:string,value:EstimateSnapshot){if(disposed)return;runOwners.set(id,batchId);runSnapshots.set(id,structuredClone(value));},snapshotRun(id:string){const value=runSnapshots.get(id);return value?structuredClone(value):undefined;},snapshot:(id:string)=>{const value=snapshots.get(id);return value?structuredClone(value):undefined;},roughSnapshot:(id:string)=>roughSnapshots.get(id),dispose(){disposed=true;cancelTimer?.();cancelTimer=undefined;epochs.clear();roughSnapshots.clear();}};
}

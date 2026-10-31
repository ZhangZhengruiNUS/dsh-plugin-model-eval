import type {EstimateSnapshot,EstimationRunInput} from './contracts.ts';import {estimateBatch} from './engine.ts';import type {SpeedClock} from '../speed/clock.ts';
export function createLiveEstimator(deps:{getRuns:(batchId:string)=>Promise<readonly EstimationRunInput[]>;getActiveBatchIds:()=>readonly string[];clock:SpeedClock;publish:(batchId:string,value:EstimateSnapshot)=>void}){
 const snapshots=new Map<string,EstimateSnapshot>(),epochs=new Map<string,number>(),last=new Map<string,number>(),ages=new Map<string,{age:number;mono:number}>(),paused=new Set<string>(),resuming=new Map<string,Set<string>|undefined>();let disposed=false,cancelTimer:(()=>void)|undefined;
 const emit=(id:string,value:EstimateSnapshot)=>{snapshots.set(id,structuredClone(value));last.set(id,deps.clock.monotonicMs());deps.publish(id,structuredClone(value));};
 function arm(){if(disposed||cancelTimer||!deps.getActiveBatchIds().length)return;cancelTimer=deps.clock.schedule(5000,()=>{cancelTimer=undefined;for(const id of deps.getActiveBatchIds())void invalidate(id,'tick');arm();});}
 async function invalidate(id:string,reason:string){if(disposed)return;arm();if(reason==='performance'&&snapshots.has(id)&&deps.clock.monotonicMs()-(last.get(id)??-Infinity)<5000)return;
  const epoch=(epochs.get(id)??0)+1;epochs.set(id,epoch);
  if(reason==='pause'){paused.add(id);resuming.delete(id);const old=snapshots.get(id);if(old){emit(id,{...old,state:'paused',asOf:deps.clock.now()});return;}}
  if(reason==='resume'){paused.delete(id);resuming.set(id,undefined);const old=snapshots.get(id);emit(id,{algorithm:'estimate-v1',asOf:deps.clock.now(),state:'calibrating',coverage:old?.coverage??{known:0,required:0},sources:[],reasons:['RESUMED']});}
  try{const values=structuredClone(await deps.getRuns(id));if(disposed||epochs.get(id)!==epoch)return;
   const seen=new Set<string>();for(const r of values){r.activeWaitMs={};for(const a of r.performance.activeStages){seen.add(a.sampleId);let time=ages.get(a.sampleId);if(!time){time={age:Math.max(0,Date.parse(deps.clock.now())-Date.parse(a.startedAt)),mono:deps.clock.monotonicMs()};ages.set(a.sampleId,time);}r.activeWaitMs[a.sampleId]=time.age+Math.max(0,deps.clock.monotonicMs()-time.mono);}}for(const key of ages.keys())if(!seen.has(key))ages.delete(key);
   const computed=estimateBatch({runs:values,now:deps.clock.now()});if(computed.state==='completed'||computed.state==='pending'){paused.delete(id);resuming.delete(id);}
   else if(paused.has(id)){const old=snapshots.get(id);if(old){emit(id,{...old,state:'paused'});return;}}
   else if(resuming.has(id)){const current=new Set(values.flatMap(r=>r.performance.samples.map(s=>s.sampleId))),previous=resuming.get(id);if(!previous){resuming.set(id,current);return;}if(![...current].some(s=>!previous.has(s)))return;resuming.delete(id);}
   emit(id,computed);
  }catch{if(!disposed&&epochs.get(id)===epoch)emit(id,{algorithm:'estimate-v1',asOf:deps.clock.now(),state:'calibrating',coverage:{known:0,required:0},sources:[],reasons:['ESTIMATE_UNAVAILABLE']});}
 }
 return {invalidate,restore(id:string,value:EstimateSnapshot){if(disposed)return;snapshots.set(id,structuredClone(value));if(value.state==='paused')paused.add(id);},snapshot:(id:string)=>{const value=snapshots.get(id);return value?structuredClone(value):undefined;},dispose(){disposed=true;cancelTimer?.();cancelTimer=undefined;epochs.clear();}};
}

import type {QueueTimingObserver} from '../jobs/queue.ts';

/** Ordinary evaluations must not lose a score because optional timing failed.
 * Experimental calibration deliberately retains its strict, fail-closed hooks.
 * Once broken, a run can never supply a complete baseline in this coordinator.
 */
export function createSafeTimingObserver(observer:QueueTimingObserver,onFailure?:(runId:string,error:unknown)=>void|Promise<void>){
 const broken=new Set<string>();
 async function invoke(runId:string,action:()=>Promise<void>|undefined){
  if(broken.has(runId))return;
  try{await action();}
  catch(error){if(broken.has(runId))return;broken.add(runId);try{await onFailure?.(runId,error);}catch{/* A diagnostic timing write must not enter the scoring failure path. */}}
 }
 const hooks:QueueTimingObserver={onTimingStart:(id,sample)=>invoke(id,()=>observer.onTimingStart?.(id,sample)),onTimingSample:(id,sample)=>invoke(id,()=>observer.onTimingSample?.(id,sample)),onTimingRunEnd:id=>invoke(id,()=>observer.onTimingRunEnd?.(id)),onTimingRunSettled:context=>invoke(context.runId,()=>observer.onTimingRunSettled?.(context))};
 return {hooks,eligible:(runId:string)=>!broken.has(runId)};
}

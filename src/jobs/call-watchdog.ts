import type {EvaluationRequest} from '../contracts.ts';
/** Activity extends only the idle policy. The callback never survives disposal. */
export function createCallWatchdog(ms:number,policy:EvaluationRequest['execution']['failurePolicy'],expire:()=>void){
 let closed=false;const timer=setTimeout(()=>{if(closed)return;closed=true;expire();},ms);
 return {activity(){if(!closed&&policy==='output-idle-v1')timer.refresh();},dispose(){closed=true;clearTimeout(timer);}};
}

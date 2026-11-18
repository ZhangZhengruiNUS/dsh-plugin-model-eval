import type {TechnicalError} from '../contracts.ts';
export type AttemptOutcome<T>={ok:true;value:T}|{ok:false;error:TechnicalError};
export interface RetryClock {wait(ms:number,signal:AbortSignal):Promise<void>}
export const retryClock:RetryClock={wait(ms,signal){return new Promise((resolve,reject)=>{if(signal.aborted){reject(new Error('ABORTED'));return;}const cancel=()=>{clearTimeout(timer);reject(new Error('ABORTED'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);signal.addEventListener('abort',cancel,{once:true});});}};
/** The sole plugin retry loop. Each invocation persists its own real attempt. */
export async function runAttempt<T>(invoke:(index:number)=>Promise<AttemptOutcome<T>>,signal:AbortSignal,clock:RetryClock=retryClock,maxAttempts:1|3=3):Promise<AttemptOutcome<T>> {
  let result:AttemptOutcome<T>={ok:false,error:{code:'ABORTED',phase:'answer',retryable:false,message:'本轮已暂停。'}};
  for(let i=0;i<maxAttempts&&!signal.aborted;i++){
    result=await invoke(i);if(result.ok||!result.error.retryable||['config','storage','resource'].includes(result.error.phase)||i+1===maxAttempts||signal.aborted)break;
    try{await clock.wait(Math.max(i===0?2000:5000,Math.min(result.error.retryAfterMs??0,60000)),signal);}catch{break;}
  }
  return result;
}

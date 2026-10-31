import type {TechnicalError} from '../contracts.ts';
export type AttemptOutcome<T>={ok:true;value:T}|{ok:false;error:TechnicalError};
export interface RetryClock {wait(ms:number,signal:AbortSignal):Promise<void>}
export const retryClock:RetryClock={wait(ms,signal){return new Promise((resolve,reject)=>{if(signal.aborted){reject(new Error('ABORTED'));return;}const cancel=()=>{clearTimeout(timer);reject(new Error('ABORTED'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);signal.addEventListener('abort',cancel,{once:true});});}};
/** The sole plugin retry loop. Each invocation persists its own real attempt. */
export async function runAttempt<T>(invoke:(index:number)=>Promise<AttemptOutcome<T>>,signal:AbortSignal,clock:RetryClock=retryClock):Promise<AttemptOutcome<T>> {
  let result:AttemptOutcome<T>={ok:false,error:{code:'ABORTED',phase:'answer',retryable:false,message:'本轮已暂停。'}};
  for(let i=0;i<3&&!signal.aborted;i++){
    result=await invoke(i);if(result.ok||!result.error.retryable||['config','storage','resource'].includes(result.error.phase)||i===2||signal.aborted)break;
    try{await clock.wait(i===0?2000:5000,signal);}catch{break;}
  }
  return result;
}

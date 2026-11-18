import type {TechnicalError,EvaluationRequest,UpstreamDiagnostic} from '../contracts.ts';
export const OBSERVED_TIMEOUT_POLICY='skip-observed-timeout-v1' as const;
export const OUTPUT_IDLE_POLICY='output-idle-v1' as const;
/** A host configuration/resource/storage failure must not be downgraded by a simultaneous timer. */
export const isFatalCallError=(error:TechnicalError|undefined):boolean=>!!error&&!['answer','judge'].includes(error.phase);
type Policy=EvaluationRequest['execution']['failurePolicy'];
export function assertFailurePolicy(policy:unknown):asserts policy is Policy {
 if(policy!==undefined&&policy!==OBSERVED_TIMEOUT_POLICY&&policy!==OUTPUT_IDLE_POLICY)throw Object.assign(Error('INVALID_EXECUTION_POLICY'),{code:'INVALID_EXECUTION_POLICY'});
}
export interface OutputEvidence {firstContentAt?:string;timing?:{firstOutputMs?:number;firstTextMs?:number}}
export function hasObservedOutput(observation:OutputEvidence,text?:string):boolean {
 const observed=(n:number|undefined)=>n!==undefined&&Number.isFinite(n)&&n>=0;
 return observed(observation.timing?.firstOutputMs)||observed(observation.timing?.firstTextMs)||
  observation.firstContentAt!==undefined&&Number.isFinite(Date.parse(observation.firstContentAt))||typeof text==='string'&&text.trim().length>0;
}
export function timeoutFailure(input:{policy?:Policy;phase:'answer'|'judge';observation:OutputEvidence;text?:string;parentAborted?:boolean;upstream?:UpstreamDiagnostic|undefined}):TechnicalError {
 assertFailurePolicy(input.policy);
 const source=input.upstream?{upstream:input.upstream}:{};
 if(input.parentAborted)return {...source,code:'ABORTED',phase:input.phase,retryable:false,message:'本轮已暂停，进度已保存。'};
 if(input.policy&&hasObservedOutput(input.observation,input.text))return {...source,code:'OBSERVED_OUTPUT_TIMEOUT',phase:input.phase,retryable:false,message:input.policy===OUTPUT_IDLE_POLICY?'模型输出中断后长时间没有新内容。本题留待补测，其余题继续。':'模型已输出内容但未在时限内完成。本题留待补测，其余题继续。'};
 return {...source,code:'CALL_TIMEOUT',phase:input.phase,retryable:true,message:input.policy===OUTPUT_IDLE_POLICY?'模型长时间没有返回新内容。':'模型调用未在时限内完成。'};
}
export const isDeferredTimeout=(policy:Policy,error:TechnicalError)=>!!policy&&error.code==='OBSERVED_OUTPUT_TIMEOUT'&&['answer','judge'].includes(error.phase);

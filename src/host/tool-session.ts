import {randomUUID} from 'node:crypto';
import type {AttemptObservation,GradeResult,HostToolAdapter,Question,TargetSnapshot,ToolMessage,ToolSessionCheckpoint} from '../contracts.ts';
import type {ToolDispatcher} from '../runtime/tool-dispatcher.ts';
import {identityHash} from '../evaluation/protocol-identity.ts';import {fingerprintTarget} from '../model/identity.ts';
import {runAttempt,type RetryClock} from '../jobs/attempts.ts';
export interface ToolSessionInput {target:TargetSnapshot;scenarioId:string;checkpoint?:ToolSessionCheckpoint;signal:AbortSignal;commit:(checkpoint:ToolSessionCheckpoint)=>Promise<void>;onAttempt:(observation:AttemptObservation,error?:import('../contracts.ts').TechnicalError)=>Promise<void>}
/** An assistant turn and its pending calls commit before any pure simulator action. */
export function createToolSessionRunner(adapter:HostToolAdapter,question:Question,dispatcher:ToolDispatcher,options:{clock?:RetryClock;callTimeoutMs?:number}={}){
 return async function runToolSession(input:ToolSessionInput):Promise<GradeResult>{
  const missing=(code:string,retryable=false):GradeResult=>({kind:'technical-missing',track:'general',itemId:question.id,error:{code,phase:code==='CHECKPOINT_SAVE_FAILED'?'storage':'answer',retryable,message:code==='ABORTED'?'本轮已暂停，进度已保存。':'工具任务未完成，保留进度待继续。'},evidence:null});
  const scored=(passed:boolean,reason:string):GradeResult=>({kind:'scored',track:'general',itemId:question.id,passed,evidence:{metric:'bfcl-state-and-response-v1',reason,logicalRounds:state.logicalRounds,actions:state.actions}});
  const scenarioHash=identityHash(question),targetHash=fingerprintTarget(input.target);let state:ToolSessionCheckpoint;
  try{
   if(input.scenarioId!==question.sourceId)return missing('INVALID_TOOL_SCENARIO');
   if(input.checkpoint){state=structuredClone(input.checkpoint);if(state.version!==1||state.scenarioId!==input.scenarioId||state.scenarioHash!==scenarioHash||state.targetHash!==targetHash||!Number.isSafeInteger(state.logicalRounds)||state.logicalRounds<0||state.logicalRounds>24||!Number.isSafeInteger(state.actions)||state.actions<0||state.actions>32||state.actions!==state.committedCallIds.length||new Set(state.committedCallIds).size!==state.actions||!Number.isSafeInteger(state.userTurn)||state.userTurn<0||state.userTurn>dispatcher.userTurns.length||state.callsByTurn.length!==dispatcher.userTurns.length)return missing('INVALID_TOOL_CHECKPOINT');}
   else{
    const snapshot=await dispatcher.initialize(input.signal);state={version:1,scenarioId:input.scenarioId,scenarioHash,targetHash,userTurn:0,messages:[],logicalRounds:0,roundReserved:false,actions:0,committedCallIds:[],stateSnapshot:snapshot,callsByTurn:dispatcher.userTurns.map(()=>[]),pendingCalls:[],stage:'model'};
    addUserTurn();await save();
   }
  }catch(error){return missing(input.signal.aborted?'ABORTED':error instanceof Error&&error.message==='CHECKPOINT_SAVE_FAILED'?'CHECKPOINT_SAVE_FAILED':'TOOL_ENVIRONMENT_UNAVAILABLE');}
  async function save(){try{await input.commit(structuredClone(state));}catch{throw Error('CHECKPOINT_SAVE_FAILED');}}
  function addUserTurn(){for(const message of dispatcher.userTurns[state.userTurn]??[]){if(message.role!=='user'||typeof message.content!=='string')throw Error('INVALID_TOOL_SCENARIO');state.messages.push({id:randomUUID(),role:'user',source:{kind:'user'},content:[{type:'text',text:message.content}]});}}
  async function finish(passed:boolean,reason:string){state.stage='done';state.passed=passed;state.finalReason=reason;await save();return scored(passed,reason);}
  try{
   while(!input.signal.aborted){
    if(state.stage==='done')return scored(state.passed===true,state.finalReason??'restored-final-verdict');
    if(state.stage==='actions'){
     for(const call of [...state.pendingCalls]){
      if(input.signal.aborted)return missing('ABORTED');
      if(state.committedCallIds.includes(call.callId))return missing('DUPLICATE_TOOL_CALL_ID');
      if(state.actions>=32)return await finish(false,'action-budget');
      // This state is private until the result and callId are published together.
      const result=await dispatcher.execute(state.stateSnapshot,call,input.signal);
      state.stateSnapshot=result.snapshot;state.actions++;state.committedCallIds.push(call.callId);state.callsByTurn[state.userTurn]!.push(call);state.pendingCalls.shift();
      state.messages.push({id:randomUUID(),role:'tool',source:{kind:'tool',callId:call.callId},toolCallId:call.callId,isError:result.isError,content:[{type:'text',text:result.text}]});
      await save();
     }
     state.stage='model';await save();continue;
    }
    if(state.stage==='judge'){
     const verdict=await dispatcher.grade(state.callsByTurn,input.signal);return await finish(verdict.passed,verdict.reason);
    }
    if(!state.roundReserved){if(state.logicalRounds>=24)return await finish(false,'logical-round-budget');state.logicalRounds++;state.roundReserved=true;await save();}
    const outcome=await runAttempt(async()=>{
     const context={attemptId:randomUUID(),itemId:question.id,track:'general' as const,phase:'answer' as const};
     const report:ToolSessionInput['onAttempt']=async(...args)=>{try{await input.onAttempt(...args);}catch{throw Error('CHECKPOINT_SAVE_FAILED');}};
     const startedAt=new Date().toISOString();await report({...context,startedAt,endedAt:'',usage:{available:false}});
     const child=new AbortController(),cancel=()=>child.abort();input.signal.addEventListener('abort',cancel,{once:true});if(input.signal.aborted)cancel();
     let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.abort();},options.callTimeoutMs??300000);
     let result:Awaited<ReturnType<HostToolAdapter['generateTurn']>>;
     try{result=await adapter.generateTurn({target:input.target,messages:state.messages,tools:dispatcher.tools,signal:child.signal,context});}
     catch{result={kind:'technical-missing',error:{code:'CALL_FAILED',phase:'answer',retryable:true,message:'工具模型调用未完成。'},observation:{...context,startedAt,endedAt:new Date().toISOString(),usage:{available:false}}};}
     finally{clearTimeout(timer);input.signal.removeEventListener('abort',cancel);}
     if(timedOut||input.signal.aborted)result={kind:'technical-missing',error:{code:timedOut?'CALL_TIMEOUT':'ABORTED',phase:'answer',retryable:timedOut&&!input.signal.aborted,message:'工具模型调用已中断。'},observation:result.observation};
     await report(result.observation,result.kind==='technical-missing'?result.error:undefined);
     return result.kind==='completed'?{ok:true as const,value:result}:{ok:false as const,error:result.error};
    },input.signal,options.clock);
    if(!outcome.ok)return {kind:'technical-missing',track:'general',itemId:question.id,error:outcome.error,evidence:null};
    const turn=outcome.value;
    const ids=turn.calls.map(c=>c.callId);
    if(new Set(ids).size!==ids.length||ids.some(id=>!id||state.committedCallIds.includes(id)))return missing('DUPLICATE_TOOL_CALL_ID');
    state.roundReserved=false;state.messages.push(turn.assistant);
    if(turn.finish==='max-tokens')return await finish(false,'output-budget');
    if(turn.calls.length){state.pendingCalls=structuredClone(turn.calls);state.stage='actions';await save();continue;}
    state.userTurn++;
    if(state.userTurn>=dispatcher.userTurns.length)state.stage='judge';else{addUserTurn();state.stage='model';}
    await save();
   }
   return missing('ABORTED');
  }catch(error){return missing(input.signal.aborted?'ABORTED':error instanceof Error&&error.message==='CHECKPOINT_SAVE_FAILED'?'CHECKPOINT_SAVE_FAILED':'TOOL_ENVIRONMENT_UNAVAILABLE');}
 };
}

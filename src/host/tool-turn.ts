import {randomUUID} from 'node:crypto';
import type {HostToolAdapter,ToolCall,ToolBlock,ToolTurnInput,TechnicalError,AttemptObservation} from '../contracts.ts';
import type {DshCallConfig,DshGenerateOptions,DshChunk} from './adapter.ts';
type Prepared={config:DshCallConfig;stream(options:DshGenerateOptions):AsyncIterable<DshChunk>;unchanged():boolean};
/** Stream data is assembled as data only. No tool action is dispatched here. */
export function nativeToolTurn(prepare:(input:ToolTurnInput)=>Promise<Prepared>,failure:(error:unknown)=>TechnicalError):HostToolAdapter['generateTurn'] {
 return async input=>{
  const started=performance.now(),observation:AttemptObservation={...(input.context??{attemptId:randomUUID(),itemId:'tool-session',track:'general',phase:'answer'}),startedAt:new Date().toISOString(),endedAt:'',usage:{available:false}};
  const timing:NonNullable<AttemptObservation['timing']>={prepareMs:0,streamMs:0,totalMs:0,sawReasoning:false,outputTokenScope:'unknown'};observation.timing=timing;
  let error:TechnicalError|undefined,finish:'stop'|'tool-calls'|'max-tokens'|undefined,invalid:string|undefined,streamStart=started,unchanged:(()=>boolean)|undefined;
  const calls=new Map<number,ToolCall>(),texts=new Map<number,string>();
  try{
   const prepared=await prepare(input);unchanged=prepared.unchanged;streamStart=performance.now();timing.prepareMs=streamStart-started;
   for await(const chunk of prepared.stream({...prepared.config,messages:structuredClone(input.messages) as DshGenerateOptions['messages'],tools:structuredClone(input.tools),signal:input.signal,purpose:'model-evaluation-tools'})){
    if(chunk.type==='usage'){const usage:AttemptObservation['usage']={available:false};for(const key of ['inputTokens','outputTokens','reasoningTokens','cacheReadTokens','cacheWriteTokens','totalTokens'] as const){const v=chunk.usage[key];if(Number.isSafeInteger(v)&&v!>=0)usage[key]=v!;}usage.available=usage.inputTokens!==undefined||usage.outputTokens!==undefined;observation.usage=usage;}
    if(chunk.type==='reasoning-delta'||chunk.type==='tool-call-delta'||chunk.type==='text-delta'&&chunk.text){const now=performance.now()-streamStart;timing.firstOutputMs??=now;timing.lastOutputMs=now;if(chunk.type==='reasoning-delta')timing.sawReasoning=true;else{timing.firstTextMs??=now;observation.firstContentAt??=new Date().toISOString();}}
    if(chunk.type==='text-delta')texts.set(chunk.index,(texts.get(chunk.index)??'')+chunk.text);
    if(chunk.type==='block-end'&&chunk.block.type==='text'&&typeof chunk.block.text==='string')texts.set(chunk.index,chunk.block.text);
    if(chunk.type==='tool-call-delta'){
     const previous=calls.get(chunk.index);
     if(!Number.isSafeInteger(chunk.index)||chunk.index<0||!chunk.id||typeof chunk.argumentsDelta!=='string'||previous&&previous.callId!==chunk.id||previous?.name&&chunk.name&&previous.name!==chunk.name)invalid='INVALID_TOOL_CALL_STREAM';
     if(!previous)calls.set(chunk.index,{callId:chunk.id??'',name:chunk.name??'',argumentsJson:chunk.argumentsDelta??''});
     else{previous.name=chunk.name??previous.name;previous.argumentsJson+=chunk.argumentsDelta??'';}
    }
    if(chunk.type==='finish'){if(['stop','tool-calls','max-tokens'].includes(chunk.reason.kind))finish=chunk.reason.kind as typeof finish;else error=failure(chunk.reason.failure??{code:'INCOMPLETE_STREAM'});break;}
   }
  }catch(thrown){error=failure(thrown);}
  timing.streamMs=performance.now()-streamStart;timing.totalMs=performance.now()-started;observation.endedAt=new Date().toISOString();
  const completeCalls=[...calls.entries()].sort(([a],[b])=>a-b).map(([,v])=>v);
  if(!finish&&!error)invalid??='INCOMPLETE_STREAM';
  if(completeCalls.some(c=>!c.callId||!c.name)||new Set(completeCalls.map(c=>c.callId)).size!==completeCalls.length||finish==='tool-calls'&&!completeCalls.length||finish==='stop'&&completeCalls.length)invalid??='INVALID_TOOL_CALL_STREAM';
  if(input.signal.aborted)error={code:'ABORTED',phase:'answer',retryable:false,message:'本轮已暂停。'};
  else if(unchanged&&!unchanged())error={code:'TARGET_CHANGED',phase:'config',retryable:false,message:'模型配置已变化，请创建新运行。'};
  else if(invalid)error={code:invalid,phase:'answer',retryable:true,message:'工具调用流不完整，未执行动作。'};
  if(error)return {kind:'technical-missing',error,observation};
  const blocks:ToolBlock[]=[...texts.entries()].sort(([a],[b])=>a-b).map(([,text])=>({type:'text',text}));
  blocks.push(...completeCalls.map(c=>({type:'tool-call' as const,id:c.callId,name:c.name,arguments:c.argumentsJson})));
  return {kind:'completed',finish:finish!,calls:completeCalls,observation,assistant:{id:randomUUID(),role:'assistant',source:{kind:'model',provider:input.target.providerId,model:input.target.modelId},content:blocks}};
 };
}

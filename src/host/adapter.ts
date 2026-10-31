import { randomUUID } from 'node:crypto';
import type { GeneratedAnswer, GenerationInput, HostAdapter, JsonValue, ModelChoice, ParamValue, TargetSnapshot, TechnicalError } from '../contracts.ts';
import { fingerprintTarget } from '../model/identity.ts';

export interface DshCallConfig { provider:string;model:string;temperature?:number;maxTokens?:number;reasoningEffort?:string;stop?:string[] }
export interface DshGenerateOptions extends DshCallConfig {
  messages:{role:'user';content:{type:'text';text:string}[]}[];system?:string;signal:AbortSignal;purpose?:string;
}
interface Failure {code?:string;status?:number;providerRetryAfterMs?:number;message?:string}
export type DshChunk = {type:'text-delta';index:number;text:string}
  | {type:'block-end';index:number;block:{type:string;text?:string}}
  | {type:'usage';usage:{inputTokens:number;outputTokens:number;reasoningTokens?:number;cacheReadTokens?:number;cacheWriteTokens?:number;totalTokens?:number}}
  | {type:'finish';reason:{kind:string;failure?:Failure}}
  | {type:'block-start'|'reasoning-delta'|'tool-call-delta';index:number};
interface ProviderDirectory {provider:string;settingsNs:string;settingsPath:readonly string[];defaultBaseURL?:string;baseURLEnv?:readonly string[]}
export interface AdapterContext {
  scopeId:string;
  settings:{describe(options:{redactSecrets:true}):{ns:string;revision:number;value:unknown}[]};
  llm:{listProviders():{id:string;name?:string}[];listModels(provider:string):Promise<{id:string;name?:string}[]>;
    listConfigurableProviders():ProviderDirectory[];
    prepareCall(config:DshCallConfig,signal?:AbortSignal):Promise<{config:DshCallConfig;stream(options:DshGenerateOptions):AsyncIterable<DshChunk>}>};
  subscribeChanges?(callback:()=>void):()=>void;
  effect?(install:()=>()=>void,label?:string):unknown;
}
const FIELDS=['temperature','maxTokens','reasoningEffort','stop'] as const;
type Field=typeof FIELDS[number];
function fault(code:string):never {throw Object.assign(new Error(code),{code});}
function assign(config:DshCallConfig,field:Field,value:JsonValue):void {
  if (field==='temperature') {if (typeof value!=='number'||!Number.isFinite(value)||value<0)fault('INVALID_PARAMETER');config.temperature=value;}
  else if (field==='maxTokens') {if (typeof value!=='number'||!Number.isSafeInteger(value)||value<=0)fault('INVALID_PARAMETER');config.maxTokens=value;}
  else if (field==='reasoningEffort') {if (typeof value!=='string'||!value)fault('INVALID_PARAMETER');config.reasoningEffort=value;}
  else {if (!Array.isArray(value)||!value.every(x=>typeof x==='string'&&x.length>0))fault('INVALID_PARAMETER');config.stop=value as string[];}
}
function safeFailure(failure:Failure|undefined,phase:'answer'|'judge'):TechnicalError {
  const configCodes=['UNSUPPORTED_OPTION','UNSUPPORTED_REASONING_EFFORT','INVALID_CONFIG','INVALID_PREPARED_CALL','MISSING_CREDENTIAL','NO_ADAPTER','UNKNOWN_MODEL','REGISTRATION_DISPOSED','INVALID_MODEL_MAX_TOKENS','AUTHENTICATION_ERROR','AUTHENTICATION_FAILED','PERMISSION_DENIED','INVALID_REQUEST','MODEL_NOT_FOUND'];
  const allowed=new Set([...configCodes,'NETWORK_ERROR','TIMEOUT','LLM_STREAM_IDLE_TIMEOUT','RATE_LIMIT','RATE_LIMITED','OVERLOADED','SERVICE_UNAVAILABLE','AUTHENTICATION_ERROR','AUTHENTICATION_FAILED','PERMISSION_DENIED','INVALID_REQUEST','MODEL_NOT_FOUND','ABORTED','INCOMPLETE_STREAM']);
  const code=allowed.has(failure?.code??'')?failure!.code!:'UPSTREAM_ERROR';
  const status=failure?.status, retryAfterMs=failure?.providerRetryAfterMs;
  return {code,phase:configCodes.includes(code)?'config':phase,retryable:!configCodes.includes(code)&&(['NETWORK_ERROR','TIMEOUT','LLM_STREAM_IDLE_TIMEOUT','RATE_LIMIT','RATE_LIMITED','OVERLOADED','SERVICE_UNAVAILABLE','INCOMPLETE_STREAM'].includes(code)||status===429||(typeof status==='number'&&status>=500&&status<=599)),
    message:configCodes.includes(code)?'模型接口不支持当前配置或凭据不可用，请核对本轮设置。':code==='ABORTED'?'调用已中断。':'模型接口未完成本次回答。',
    ...(typeof status==='number'&&Number.isInteger(status)&&status>=100&&status<=599?{status}:{}),
    ...(typeof retryAfterMs==='number'&&Number.isFinite(retryAfterMs)&&retryAfterMs>=0?{retryAfterMs:Math.min(retryAfterMs,60_000)}:{})};
}

/** Source-observed DSH prepared-call adapter. It owns NO retry or fallback. */
export function createHostAdapter(ctx:AdapterContext):HostAdapter {
  const instance=randomUUID();let epoch=0,known=new Set<string>();
  if (ctx.subscribeChanges&&ctx.effect)ctx.effect(()=>ctx.subscribeChanges!(()=>{epoch++;known.clear();}),'model-eval: adapter changes');
  const key=(provider:string,model:string)=>JSON.stringify([provider,model]);
  async function catalog():Promise<ModelChoice[]> {
    const providers=ctx.llm.listProviders();
    const results=await Promise.allSettled(providers.map(async provider=>(await ctx.llm.listModels(provider.id)).map(model=>({
      scopeId:ctx.scopeId,providerId:provider.id,modelId:model.id,displayName:model.name??model.id,
      capabilities:{temperature:true,maxTokens:true,reasoningEffort:true,stop:true},
    }))));
    const choices=results.flatMap(x=>x.status==='fulfilled'?x.value:[]);
    known=new Set(choices.map(x=>key(x.providerId,x.modelId)));return choices;
  }
  function route(provider:string):{target:ParamValue;ns?:string;revision?:number} {
    const entry=ctx.llm.listConfigurableProviders().find(x=>x.provider===provider);
    if (!entry)return {target:{state:'unknown'}};
    const descriptor=ctx.settings.describe({redactSecrets:true}).find(x=>x.ns===entry.settingsNs);
    let value:unknown=descriptor?.value;
    for (const part of entry.settingsPath)value=value&&typeof value==='object'&&Object.hasOwn(value,part)?(value as Record<string,unknown>)[part]:undefined;
    const configured=value&&typeof value==='object'?(value as Record<string,unknown>).baseURL:undefined;
    const endpoint=typeof configured==='string'&&configured?configured:entry.baseURLEnv?.length?undefined:entry.defaultBaseURL;
    let target:ParamValue={state:'unknown'};
    if (endpoint) {
      try {
        const url=new URL(endpoint);
        // Keep nonsecret service paths so same-host deployments never merge.
        // Query/userinfo may carry credentials; unresolved endpoints stay unknown.
        if (['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash)
          target={state:'known',value:url.href,source:typeof configured==='string'?'user':'adapter'};
      }catch { /* no raw endpoint is returned or logged */ }
    }
    return {target,ns:entry.settingsNs,...(descriptor?{revision:descriptor.revision}:{})};
  }
  async function prepare(choice:ModelChoice,overrides:Record<string,ParamValue>,signal?:AbortSignal) {
    if (!known.size)await catalog();
    if (choice.scopeId!==ctx.scopeId||!known.has(key(choice.providerId,choice.modelId)))fault('MODEL_NOT_CONFIGURED');
    const config:DshCallConfig={provider:choice.providerId,model:choice.modelId};
    for (const [field,param] of Object.entries(overrides)) {
      if (!FIELDS.includes(field as Field))fault('UNSUPPORTED_PARAMETER');
      if (param.state==='known')assign(config,field as Field,param.value);
      else if (param.state!=='unset')fault('UNKNOWN_PARAMETER_OVERRIDE');
    }
    const before=route(choice.providerId),capturedEpoch=epoch;
    const prepared=await ctx.llm.prepareCall(config,signal);
    const after=route(choice.providerId);
    if (capturedEpoch!==epoch||before.revision!==after.revision)fault('TARGET_CHANGED');
    const controls:Record<string,ParamValue>={};
    for (const field of FIELDS) {
      const value=prepared.config[field];
      controls[field]=value===undefined?{state:'unset'}:{state:'known',value,source:overrides[field]?.state==='known'?'override':'adapter'};
    }
    const target:TargetSnapshot={scopeId:ctx.scopeId,providerId:choice.providerId,modelId:choice.modelId,routeTarget:after.target,controls,
      origin:{adapterInstance:instance,adapterEpoch:capturedEpoch,...(after.ns?{settingsNs:after.ns}:{}),...(after.revision!==undefined?{settingsRevision:after.revision}:{})}};
    fingerprintTarget(target);
    return {prepared,target,revision:after.revision,capturedEpoch};
  }
  return {catalog,async snapshot(choice,overrides){return (await prepare(choice,overrides)).target;},
    async generateOnce(input:GenerationInput):Promise<GeneratedAnswer> {
      const choice:ModelChoice={scopeId:input.target.scopeId,providerId:input.target.providerId,modelId:input.target.modelId,displayName:input.target.modelId,capabilities:{}};
      const before=route(choice.providerId),origin=input.target.origin;
      if (origin?.adapterInstance===instance&&(origin.adapterEpoch!==epoch||origin.settingsRevision!==before.revision))fault('TARGET_CHANGED');
      const current=await prepare(choice,input.target.controls,input.signal);
      if (input.target.deployment)current.target.deployment=structuredClone(input.target.deployment);
      if (fingerprintTarget(input.target)!==fingerprintTarget(current.target))fault('TARGET_CHANGED');
      const system=input.messages.filter(x=>x.role==='system').map(x=>x.content).join('\n\n');
      if (input.messages.some(x=>x.role==='assistant'))fault('UNSUPPORTED_PROMPT_ROLE');
      const messages=input.messages.filter(x=>x.role==='user').map(x=>({role:'user' as const,content:[{type:'text' as const,text:x.content}]}));
      const observations:GeneratedAnswer['observations']={...input.context,startedAt:new Date().toISOString(),endedAt:'',usage:{available:false}};
      const blocks=new Map<number,string>();let complete=false,truncated=false,error:TechnicalError|undefined;
      try {
        for await (const chunk of current.prepared.stream({...current.prepared.config,messages,...(system?{system}:{}),signal:input.signal,purpose:'model-evaluation'})) {
          if (chunk.type==='text-delta') {if (chunk.text&&!observations.firstContentAt)observations.firstContentAt=new Date().toISOString();blocks.set(chunk.index,(blocks.get(chunk.index)??'')+chunk.text);}
          else if (chunk.type==='block-end'&&chunk.block.type==='text'&&typeof chunk.block.text==='string')blocks.set(chunk.index,chunk.block.text);
          else if (chunk.type==='usage') {
            const usage:GeneratedAnswer['observations']['usage']={available:true};
            for (const field of ['inputTokens','outputTokens','reasoningTokens','cacheReadTokens','cacheWriteTokens','totalTokens'] as const) {
              const value=chunk.usage[field];if (typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)usage[field]=value;
            }
            if (usage.inputTokens===undefined&&usage.outputTokens===undefined)usage.available=false;
            observations.usage=usage;
          }else if (chunk.type==='finish') {
            complete=['stop','max-tokens','tool-calls'].includes(chunk.reason.kind);truncated=chunk.reason.kind==='max-tokens';
            if (!complete)error=safeFailure(chunk.reason.failure,input.context.phase);
            break;
          }
        }
      }catch (thrown) {error=safeFailure(thrown as Failure,input.context.phase);}
      observations.endedAt=new Date().toISOString();
      if (input.signal.aborted) {complete=false;error=safeFailure({code:'ABORTED'},input.context.phase);}
      if (current.capturedEpoch!==epoch||current.revision!==route(choice.providerId).revision) {
        complete=false;error={code:'TARGET_CHANGED',phase:'config',retryable:false,message:'宿主配置已变化，请核对后创建新运行。'};
      }
      if (!complete&&!error)error=safeFailure({code:'INCOMPLETE_STREAM'},input.context.phase);
      return {text:[...blocks.values()].join(''),complete,truncated,observations,...(error?{error}:{})};
    }};
}

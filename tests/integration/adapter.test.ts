import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostAdapter, type AdapterContext, type DshCallConfig, type DshGenerateOptions, type DshChunk } from '../../src/host/adapter.ts';
const context={attemptId:'attempt-1',itemId:'item-1',track:'general',phase:'answer'} as const;
test('only output activity pulses watchdog for normal and native tool streams',async()=>{
 const chunks:DshChunk[]=[{type:'block-start',index:0},{type:'text-delta',index:0,text:''},{type:'usage',usage:{inputTokens:1,outputTokens:0}},{type:'reasoning-delta',index:0},{type:'text-delta',index:1,text:'a'},{type:'block-end',index:1,block:{type:'text',text:'a'}},{type:'finish',reason:{kind:'stop'}}];
 const f=fixture(chunks),adapter=createHostAdapter(f.ctx),target=await adapter.snapshot((await adapter.catalog())[0]!,{});let pulses=0;
 await adapter.generateOnce({target,messages:[{role:'user',content:'q'}],context,signal:new AbortController().signal,onActivity:()=>pulses++});assert.equal(pulses,3);
 pulses=0;await adapter.generateTurn!({target,messages:[],tools:[],signal:new AbortController().signal,onActivity:()=>pulses++});assert.equal(pulses,3);
});
test('empty or invalid native tool deltas cannot keep a call alive',async()=>{
 const f=fixture([{type:'tool-call-delta',index:0,id:'a',name:'x',argumentsDelta:''},{type:'tool-call-delta',index:0,id:'a',argumentsDelta:''},{type:'tool-call-delta',index:0,id:'different',argumentsDelta:'bad'},{type:'finish',reason:{kind:'tool-calls'}}]);
 const a=createHostAdapter(f.ctx),target=await a.snapshot((await a.catalog())[0]!,{});let pulses=0;
 const result=await a.generateTurn!({target,messages:[],tools:[],signal:new AbortController().signal,onActivity:()=>pulses++});assert.equal(result.kind,'technical-missing');assert.equal(pulses,1);
});
function fixture(chunks: DshChunk[]) {
  const calls:DshGenerateOptions[]=[];
  let revision=0,endpoint='https://example.test/deployment-one/v1',preparedCount=0;
  const ctx:AdapterContext={scopeId:'installation-id',settings:{describe(options){
    assert.equal(options.redactSecrets,true);
    return [{ns:'route.settings',revision,value:{baseURL:endpoint,apiKey:'[redacted]'}}];
  }},llm:{
    listProviders:()=>[{id:'provider-1',name:'Provider'}],
    listModels:async()=>[{id:'model-1',name:'Model'}],
    listConfigurableProviders:()=>[{provider:'provider-1',settingsNs:'route.settings',settingsPath:[]}],
    async prepareCall(config:DshCallConfig,signal?:AbortSignal){
      signal?.throwIfAborted();preparedCount++;let sent=false;
      const resolved={maxTokens:2048,reasoningEffort:'medium',...config};
      return {config:resolved,stream(options){
        assert.equal(sent,false);sent=true;calls.push(options);
        return (async function*(){for (const chunk of chunks)yield chunk;})();
      }};
    },
  }};
  return {ctx,calls,revision:()=>revision,prepared:()=>preparedCount,
    changeEndpoint:()=>{endpoint='https://example.test/deployment-two/v1';revision++;}};
}
test('configured defaults and independent overrides are sent once without writing settings', async () => {
  const f=fixture([{type:'text-delta',index:0,text:'hello'},{type:'usage',usage:{inputTokens:12,outputTokens:3}},{type:'finish',reason:{kind:'stop'}}]);
  const adapter=createHostAdapter(f.ctx), choice=(await adapter.catalog())[0]!;
  const defaults=await adapter.snapshot(choice,{});
  assert.equal(defaults.controls.maxTokens!.state,'known');
  const changed=await adapter.snapshot(choice,{temperature:{state:'known',value:0,source:'override'}});
  const controller=new AbortController();
  const answer=await adapter.generateOnce({target:changed,messages:[{role:'user',content:'question'}],signal:controller.signal,context});
  assert.equal(f.calls.length,1);assert.equal(f.calls[0]!.temperature,0);assert.equal(f.calls[0]!.maxTokens,2048);
  assert.equal(f.calls[0]!.signal,controller.signal);
  assert.deepEqual(f.calls[0]!.messages,[{role:'user',content:[{type:'text',text:'question'}]}]);
  assert.equal(f.revision(),0);assert.equal(answer.text,'hello');assert.equal(answer.complete,true);
  assert.equal(answer.observations.usage.inputTokens,12);
  await adapter.generateOnce({target:changed,messages:[{role:'user',content:'question'}],signal:controller.signal,context});
  assert.equal(f.calls.length,2);assert.equal(f.prepared(),4);
});
test('route changes stop old targets before dispatch, missing finishes stay incomplete', async () => {
  const f=fixture([{type:'text-delta',index:0,text:'partial'}]),adapter=createHostAdapter(f.ctx);
  const target=await adapter.snapshot((await adapter.catalog())[0]!,{});
  const partial=await adapter.generateOnce({target,messages:[{role:'user',content:'q'}],signal:new AbortController().signal,context});
  assert.equal(partial.complete,false);assert.equal(partial.error?.code,'INCOMPLETE_STREAM');
  f.changeEndpoint();
  await assert.rejects(adapter.generateOnce({target,messages:[{role:'user',content:'q'}],signal:new AbortController().signal,context}),/TARGET_CHANGED/);
  assert.equal(f.calls.length,1);
});
test('length limits are complete answers while transport failures redact messages', async () => {
  for (const [reason,complete,truncated] of [[{kind:'max-tokens'},true,true],[{kind:'error',failure:{code:'NETWORK_ERROR',message:'private-example'}},false,false]] as const) {
    const f=fixture([{type:'text-delta',index:0,text:'x'},{type:'finish',reason}]),adapter=createHostAdapter(f.ctx);
    const target=await adapter.snapshot((await adapter.catalog())[0]!,{});
    const result=await adapter.generateOnce({target,messages:[{role:'user',content:'q'}],signal:new AbortController().signal,context});
    assert.equal(result.complete,complete);assert.equal(result.truncated,truncated);
    assert.ok(!JSON.stringify(result).includes('private-example'));assert.equal(f.calls.length,1);
  }
});
test('unsupported route parameters are explicit configuration failures without retry',async()=>{
  const f=fixture([{type:'finish',reason:{kind:'error',failure:{code:'UNSUPPORTED_OPTION',message:'raw-private-provider-detail'}}}]);
  const adapter=createHostAdapter(f.ctx),target=await adapter.snapshot((await adapter.catalog())[0]!,{});
  const result=await adapter.generateOnce({target,messages:[{role:'user',content:'q'}],signal:new AbortController().signal,context});
  assert.equal(result.error?.code,'UNSUPPORTED_OPTION');assert.equal(result.error?.phase,'config');
  assert.equal(result.error?.retryable,false);assert.equal(f.calls.length,1);
  assert.ok(!JSON.stringify(result).includes('raw-private'));
});

test('host canonical context-window failures stay actionable in normal and tool calls without changing parameters',async()=>{
 const f=fixture([{type:'finish',reason:{kind:'error',failure:{code:'CONTEXT_WINDOW_EXCEEDED',message:'raw-private-context-details'}}}]),adapter=createHostAdapter(f.ctx),target=await adapter.snapshot((await adapter.catalog())[0]!,{});
 const normal=await adapter.generateOnce({target,messages:[{role:'user',content:'q'}],context,signal:new AbortController().signal}),tool=await adapter.generateTurn!({target,messages:[],tools:[],signal:new AbortController().signal});
 assert.equal(normal.complete,false);assert.equal(tool.kind,'technical-missing');
 for(const error of [normal.error,tool.kind==='technical-missing'?tool.error:undefined]){
  assert.equal(error?.code,'CONTEXT_WINDOW_EXCEEDED');assert.equal(error?.phase,'config');assert.equal(error?.retryable,false);assert.match(error!.message,/上下文/);assert(!JSON.stringify(error).includes('raw-private'));
 }
 assert.equal(f.calls.length,2);assert(f.calls.every(call=>call.maxTokens===2048&&call.reasoningEffort==='medium'));
});

test('performance observes generated reasoning but not block-start as output',async()=>{
  const f=fixture([{type:'block-start',index:0},{type:'reasoning-delta',index:0},{type:'text-delta',index:1,text:'answer'},{type:'finish',reason:{kind:'stop'}}]);
  const a=createHostAdapter(f.ctx),target=await a.snapshot((await a.catalog())[0]!,{}),r=await a.generateOnce({target,messages:[{role:'user',content:'q'}],signal:new AbortController().signal,context});
  assert.ok(r.observations.timing);assert.equal(r.observations.timing.sawReasoning,true);assert.ok(r.observations.timing.firstOutputMs!<=r.observations.timing.firstTextMs!);assert.ok(r.observations.timing.totalMs>=r.observations.timing.streamMs);
  const b=fixture([{type:'block-start',index:0},{type:'finish',reason:{kind:'stop'}}]),adapter=createHostAdapter(b.ctx),t=await adapter.snapshot((await adapter.catalog())[0]!,{}),empty=await adapter.generateOnce({target:t,messages:[{role:'user',content:'q'}],signal:new AbortController().signal,context});assert.equal(empty.observations.timing?.firstOutputMs,undefined);
});

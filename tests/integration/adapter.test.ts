import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostAdapter, type AdapterContext, type DshCallConfig, type DshGenerateOptions, type DshChunk } from '../../src/host/adapter.ts';
import type {Question,TechnicalError} from '../../src/contracts.ts';
import {createToolSessionRunner} from '../../src/host/tool-session.ts';
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
function fixture(chunks: DshChunk[] | (()=>DshChunk[])) {
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
        return (async function*(){for (const chunk of typeof chunks==='function'?chunks():chunks)yield chunk;})();
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

test('diagnostics survive the DSH finish envelope for answer, judge and native tool streams',async()=>{
  const failure={code:'SERVER',message:'502 {"code":"BadGateway","requestId":"req_fixture_example_123","message":"Bad gateway. Cookie: fixture-secret"}'};
  const f=fixture([{type:'finish',reason:{kind:'error',failure}}]),adapter=createHostAdapter(f.ctx);
  const target=await adapter.snapshot((await adapter.catalog())[0]!,{}),signal=new AbortController().signal;
  const answer=(phase:'answer'|'judge')=>adapter.generateOnce({target,messages:[{role:'user',content:'q'}],context:{...context,phase},signal});
  const [normal,judge,tool]=await Promise.all([answer('answer'),answer('judge'),adapter.generateTurn!({target,messages:[],tools:[],signal})]);
  assert.equal(tool.kind,'technical-missing');
  for(const error of [normal.error,judge.error,tool.kind==='technical-missing'?tool.error:undefined]){
    assert.equal(error?.code,'UPSTREAM_ERROR');assert.equal(error?.status,undefined);assert.equal(error?.retryable,false);
    assert.deepEqual(error?.upstream,{codes:['SERVER','BadGateway'],httpStatus:502,statusFromMessage:true,requestId:'req_fixture_example_123',
      detail:'Bad gateway',detailFiltered:true});
    assert.doesNotMatch(JSON.stringify(error),/Cookie|fixture-secret/);
  }
  assert.equal(judge.error?.phase,'judge');
});

test('records stream termination and visible output evidence without changing failure behavior',async()=>{
  const reason = {kind:'error',failure:{code:'PI_AI_ERROR',message:'Provider finish_reason: network_error'}};
  const f=fixture([{type:'reasoning-delta',index:0},{type:'finish',reason}]),adapter=createHostAdapter(f.ctx);
  const target=await adapter.snapshot((await adapter.catalog())[0]!,{}),signal=new AbortController().signal;
  const judge=await adapter.generateOnce({target,messages:[],context:{...context,phase:'judge'},signal});
  const tool=await adapter.generateTurn!({target,messages:[],tools:[],signal});
  assert.equal(tool.kind,'technical-missing');
  for(const result of [{error:judge.error,observation:judge.observations},tool]){
    assert.equal(result.error?.code,'UPSTREAM_ERROR');
    assert.equal(result.error?.retryable,false);
    assert.equal(result.error?.upstream?.finishReason,'network_error');
    assert.equal(result.observation.streamFinishReason,'error');
    assert.equal(result.observation.textReceived,false);
    assert.equal(result.observation.timing?.sawReasoning,true);
    assert.equal(typeof result.observation.timing?.firstOutputMs,'number');
    assert.equal(result.observation.timing?.firstTextMs,undefined);
  }
  const block=fixture([{type:'block-end',index:0,block:{type:'text',text:'fixture body'}},{type:'finish',reason:{kind:'max-tokens'}}]);
  const b=createHostAdapter(block.ctx),bt=await b.snapshot((await b.catalog())[0]!,{});
  const observed=await b.generateOnce({target:bt,messages:[],context,signal});
  assert.equal(observed.observations.textReceived,true);
  assert.equal(observed.observations.streamFinishReason,'max-tokens');
  assert.equal(observed.truncated,true);

  const malformed=fixture([{type:'finish',reason:{kind:'fixture-secret',failure:{code:'PI_AI_ERROR',message:'fixture-secret'}}}]);
  const m=createHostAdapter(malformed.ctx),mt=await m.snapshot((await m.catalog())[0]!,{});
  const unknown=await m.generateOnce({target:mt,messages:[],context,signal});
  assert.equal(unknown.observations.streamFinishReason,undefined);
  assert.doesNotMatch(JSON.stringify(unknown),/fixture-secret/);
});

test('multi-turn tool retries report each upstream failure before holding the scenario',async()=>{
  const failures=[
    {code:'TIMEOUT',message:'Connect timeout: UND_ERR_CONNECT_TIMEOUT'},
    {code:'TIMEOUT',message:'Headers timeout: UND_ERR_HEADERS_TIMEOUT'},
    {code:'SERVER',message:'502 {"code":"BadGateway","request_id":"req_fixture_tool_retry_3","message":"Bad Gateway. Bearer fixture-secret"}'},
  ];
  let index=0;
  const f=fixture(()=>[{type:'finish',reason:{kind:'error',failure:failures[index++]!}}]);
  const adapter=createHostAdapter(f.ctx),target=await adapter.snapshot((await adapter.catalog())[0]!,{});
  const question:Question={id:'fixture/tool-error',datasetId:'bfcl-v4-multi-turn-selected',track:'general',sourceId:'fixture',sourceHash:'fixture',prompt:[],grading:null};
  const errors:TechnicalError[]=[], attemptIds=new Set<string>();
  const run=createToolSessionRunner({generateTurn:adapter.generateTurn!},question,{
    tools:[],userTurns:[[{role:'user',content:'fixture task'}]],
    async initialize(){return {};},
    async execute(){return assert.fail('failed model turns must not dispatch tools');},
    async grade(){return assert.fail('failed model turns must not be graded');},
  },{failurePolicy:'output-idle-v1',clock:{async wait(){}}});
  const grade=await run({target,scenarioId:question.sourceId,signal:new AbortController().signal,async commit(){},
    async onAttempt(observation,error){if(error){attemptIds.add(observation.attemptId);errors.push(error);}},
  });
  assert.equal(grade.kind,'technical-missing');
  assert.equal(f.calls.length,3);
  assert.equal(attemptIds.size,3);
  assert.deepEqual(errors.map(error=>[error.code,error.upstream?.codes]),[
    ['TIMEOUT',['TIMEOUT','UND_ERR_CONNECT_TIMEOUT']],
    ['TIMEOUT',['TIMEOUT','UND_ERR_HEADERS_TIMEOUT']],
    ['UPSTREAM_ERROR',['SERVER','BadGateway']],
  ]);
  assert.equal(errors[2]?.upstream?.requestId,'req_fixture_tool_retry_3');
  assert.equal(errors[2]?.upstream?.httpStatus,502);
  assert.doesNotMatch(JSON.stringify(errors),/Bearer|fixture-secret/);
});

test('confirmed overload diagnostics are retryable while explicit statuses and config errors take precedence',async()=>{
  const overload='529 {"type":"error","error":{"type":"overloaded_error"},"request_id":"req_fixture_overloaded_529"}';
  for(const row of [
    {failure:{code:'SERVER',message:overload},retry:true,label:'529 with an explicit overload code'},
    {failure:{code:'SERVER',message:'529 status code (no body)'},retry:true,label:'529 without body'},
    {failure:{code:'PI_AI_ERROR',message:'{"error":{"type":"overloaded_error"}}'},retry:true,label:'explicit provider code alone'},
    {failure:{code:'SERVER',message:'503 {"error":{"code":"overloaded_error"}}'},retry:true,label:'compatible 5xx status'},
    {failure:{code:'SERVER',status:400,message:overload},retry:false,label:'structured 400 takes precedence'},
    {failure:{code:'SERVER',status:403,message:overload},retry:false,label:'structured 403 takes precedence'},
    {failure:{code:'SERVER',message:'400 {"error":{"type":"overloaded_error"}}'},retry:false,label:'explicit 400 forbids diagnostic fallback'},
    {failure:{code:'INVALID_REQUEST',message:overload},retry:false,label:'normalized config failure'},
    {failure:{code:'AUTH',message:overload},retry:false,label:'normalized auth failure'},
    {failure:{code:'ABORTED',message:overload},retry:false,label:'explicit cancellation'},
    {failure:{code:'SERVER',message:'529 {"error":{"type":"invalid_request_error"}}'},retry:false,label:'conflicting provider error type'},
    {failure:{code:'SERVER',status:429,message:'service unavailable'},retry:true,label:'original 429 policy'},
    {failure:{code:'SERVER',status:502,message:'bad gateway'},retry:true,label:'original structured 5xx policy'},
    {failure:{code:'SERVER',message:'evaluation prompt mentions 529 or overloaded_error'},retry:false,label:'unstructured prose'},
  ]){
    const f=fixture([{type:'finish',reason:{kind:'error',failure:row.failure}}]);
    const adapter=createHostAdapter(f.ctx),target=await adapter.snapshot((await adapter.catalog())[0]!,{}),signal=new AbortController().signal;
    const [answer,judge,tool]=await Promise.all([
      adapter.generateOnce({target,messages:[{role:'user',content:'q'}],context,signal}),
      adapter.generateOnce({target,messages:[{role:'user',content:'q'}],context:{...context,phase:'judge'},signal}),
      adapter.generateTurn!({target,messages:[],tools:[],signal}),
    ]);
    assert.equal(tool.kind,'technical-missing',row.label);
    for(const error of [answer.error,judge.error,tool.kind==='technical-missing'?tool.error:undefined]){
      assert.equal(error?.retryable,row.retry,row.label);
      assert.equal(error?.status,row.failure.status,row.label);
    }
    if(row.failure.message===overload&&row.failure.status===undefined&&row.failure.code==='SERVER'){
      assert.equal(answer.error?.code,'UPSTREAM_ERROR');
      assert.equal(answer.error?.upstream?.httpStatus,529);
      assert.equal(answer.error?.upstream?.statusFromMessage,true);
    }
  }
});

test('explicit transport errors retry only when no output evidence has ever arrived',async()=>{
  const transport={code:'TRANSPORT',message:'connection closed'};
  const emptyUsage:DshChunk={type:'usage',usage:{inputTokens:4,outputTokens:0,totalTokens:4}};
  const cases:{name:string;chunks:DshChunk[];failure?:{code:string;message:string;status?:number};retryable:boolean;cause?:TechnicalError['upstreamCause']}[]=[
    {name:'no output',chunks:[],retryable:true,cause:'transport'},
    {name:'only input usage',chunks:[emptyUsage],retryable:true,cause:'transport'},
    {name:'text delta',chunks:[{type:'text-delta',index:0,text:'saved partial'}],retryable:false,cause:'transport'},
    {name:'block-end text',chunks:[{type:'block-end',index:0,block:{type:'text',text:'saved partial'}}],retryable:false,cause:'transport'},
    {name:'reasoning delta',chunks:[{type:'reasoning-delta',index:0}],retryable:false,cause:'transport'},
    {name:'incomplete tool delta',chunks:[{type:'tool-call-delta',index:0,id:'fake',argumentsDelta:''}],retryable:false,cause:'transport'},
    {name:'positive output then zero usage',chunks:[{type:'usage',usage:{inputTokens:4,outputTokens:1}},emptyUsage],retryable:false,cause:'transport'},
    {name:'positive reasoning usage',chunks:[{type:'usage',usage:{inputTokens:0,outputTokens:0,reasoningTokens:1}}],retryable:false,cause:'transport'},
    {name:'certificate conflict',chunks:[],failure:{code:'TRANSPORT',message:'fetch failed CERT_HAS_EXPIRED'},retryable:false,cause:'transport'},
    {name:'structured bad request',chunks:[],failure:{...transport,status:400},retryable:false,cause:'transport'},
    {name:'authentication',chunks:[],failure:{...transport,status:401},retryable:false},
    {name:'permission',chunks:[],failure:{...transport,status:403},retryable:false},
    {name:'textual client rejection',chunks:[],failure:{code:'TRANSPORT',message:'400 invalid request'},retryable:false,cause:'transport'},
    {name:'untyped network text',chunks:[],failure:{code:'PI_AI_ERROR',message:'connection closed'},retryable:false,cause:'unknown'},
    {name:'unknown after partial text',chunks:[{type:'text-delta',index:0,text:'saved partial'}],failure:{code:'PI_AI_ERROR',message:'opaque'},retryable:false,cause:'unknown'},
  ];
  for(const {name,chunks,failure,retryable,cause} of cases){
    const f=fixture([...chunks,{type:'finish',reason:{kind:'error',failure:failure??transport}}]);
    const a=createHostAdapter(f.ctx),target=await a.snapshot((await a.catalog())[0]!,{}),signal=new AbortController().signal;
    const normal=await a.generateOnce({target,context,messages:[{role:'user',content:'q'}],signal});
    const tool=await a.generateTurn!({target,messages:[],tools:[],signal});
    assert.equal(tool.kind,'technical-missing',name);
    assert.equal(normal.error?.retryable,retryable,name);
    assert.equal(tool.error.retryable,retryable,name);
    assert.equal(normal.error?.upstreamCause,cause,name);
    assert.equal(tool.error.upstreamCause,cause,name);
    if(name==='unknown after partial text')assert.equal(normal.text,'saved partial');
  }
});

test('transport retry reuses the tool round transcript without dispatching a saved action again',async()=>{
  const toolCall:DshChunk[]=[
    {type:'tool-call-delta',index:0,id:'saved-call',name:'fixture_tool',argumentsDelta:'{}'},
    {type:'finish',reason:{kind:'tool-calls'}},
  ];
  const transport:DshChunk[]=[{type:'finish',reason:{kind:'error',failure:{code:'TRANSPORT',message:'socket closed'}}}];
  const success:DshChunk[]=[{type:'text-delta',index:0,text:'finished'},{type:'finish',reason:{kind:'stop'}}];
  const chunks=[toolCall,transport,success];
  let next=0,executions=0,actions=0,rounds=0;
  const f=fixture(()=>chunks[next++]!),host=createHostAdapter(f.ctx);
  const target=await host.snapshot((await host.catalog())[0]!,{}),errors:(string|undefined)[]=[],waits:number[]=[];
  const question:Question={id:'tool/retry',datasetId:'bfcl-v4-multi-turn-selected',track:'general',sourceId:'fixture',sourceHash:'fixture',prompt:[],grading:null};
  const run=createToolSessionRunner({generateTurn:host.generateTurn!},question,{
    tools:[],userTurns:[[{role:'user',content:'call the fixture tool'}]],
    async initialize(){return {};},
    async execute(snapshot,call){executions++;assert.equal(call.callId,'saved-call');return {snapshot,text:'saved result',isError:false};},
    async grade(){return {passed:true,reason:'fixture'};},
  },{failurePolicy:'output-idle-v1',clock:{async wait(ms){waits.push(ms);}}});
  const result=await run({target,scenarioId:question.sourceId,signal:new AbortController().signal,
    async commit(checkpoint){actions=checkpoint.actions;rounds=checkpoint.logicalRounds;},
    async onAttempt(observation,error){if(observation.endedAt)errors.push(error?.upstreamCause);},
  });
  assert.equal(result.kind,'scored');
  assert.equal(executions,1);
  assert.equal(actions,1);
  assert.equal(rounds,2);
  assert.deepEqual(waits,[2000]);
  assert.deepEqual(errors,[undefined,'transport',undefined]);
  assert.equal(f.calls.length,3);
  assert.deepEqual(f.calls[1]!.messages,f.calls[2]!.messages);
  assert.ok(f.calls[2]!.messages.some(m=>m.role==='tool'));
});

test('pausing while waiting to retry a tool transport failure dispatches no further calls',async()=>{
  const f=fixture([{type:'finish',reason:{kind:'error',failure:{code:'TRANSPORT',message:'socket closed'}}}]);
  const host=createHostAdapter(f.ctx),target=await host.snapshot((await host.catalog())[0]!,{});
  const controller=new AbortController(),question:Question={id:'tool/cancel',datasetId:'bfcl-v4-multi-turn-selected',
    track:'general',sourceId:'fixture',sourceHash:'fixture',prompt:[],grading:null};
  const run=createToolSessionRunner({generateTurn:host.generateTurn!},question,{
    tools:[],userTurns:[[{role:'user',content:'fixture'}]],
    async initialize(){return {};},
    async execute(){return assert.fail('no tool action should be dispatched');},
    async grade(){return assert.fail('no grade should be produced');},
  },{clock:{async wait(){controller.abort();}}});
  await run({target,scenarioId:question.sourceId,signal:controller.signal,async commit(){},async onAttempt(){}});
  assert.equal(f.calls.length,1);
});

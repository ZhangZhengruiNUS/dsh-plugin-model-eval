import test from 'node:test';import assert from 'node:assert/strict';
import {createHostAdapter,type AdapterContext} from '../../src/host/adapter.ts';
function fixture(plans:any[][]){let prepares=0,dispatches=0;const requests:any[]=[];
 const ctx:AdapterContext={scopeId:'fixture',settings:{describe:()=>[]},llm:{listProviders:()=>[{id:'fixture'}],listModels:async()=>[{id:'model'}],listConfigurableProviders:()=>[],prepareCall:async(config)=>{const i=prepares++;return {config,async*stream(options){dispatches++;requests.push(options);for(const c of plans[i]??[])yield c;}};}}};
 return {adapter:createHostAdapter(ctx) as any,requests,counts:()=>({prepares,dispatches})};
}
const chunks=(id='a',name='set_value',args='{"value":7}')=>[{type:'tool-call-delta',index:0,id,name,argumentsDelta:args.slice(0,5)},{type:'tool-call-delta',index:0,id,argumentsDelta:args.slice(5)},{type:'usage',usage:{inputTokens:8,outputTokens:4}},{type:'finish',reason:{kind:'tool-calls'}}];
async function target(f:ReturnType<typeof fixture>){const choices=await f.adapter.catalog();return f.adapter.snapshot(choices[0],{});}
const tools=[{name:'set_value',description:'Set a simulated value',parameters:{type:'object',properties:{value:{type:'integer'}},required:['value']}}];
test('host has a native tool turn path with fresh one-shot preparation and complete fragments',async()=>{
 const f=fixture([[],chunks(),[{type:'text-delta',index:0,text:'done'},{type:'finish',reason:{kind:'stop'}}]]),t=await target(f);
 assert.equal(typeof f.adapter.generateTurn,'function');
 const first=await f.adapter.generateTurn({target:t,messages:[],tools,signal:new AbortController().signal});
 assert.equal(first.kind,'completed');assert.deepEqual(first.calls,[{callId:'a',name:'set_value',argumentsJson:'{"value":7}'}]);
 const tool={id:'tool',role:'tool',source:{kind:'tool',callId:'a'},toolCallId:'a',isError:false,content:[{type:'text',text:'{"value":7}'}]};
 const second=await f.adapter.generateTurn({target:t,messages:[first.assistant,tool],tools,signal:new AbortController().signal});assert.equal(second.kind,'completed');assert.equal(second.calls.length,0);
 assert.equal(first.observation.usage.outputTokens,4);assert.deepEqual(f.counts(),{prepares:3,dispatches:2});assert.equal(f.requests[1].messages[1].toolCallId,'a');
});
test('tool stream rejects missing/changing/duplicate identities and preserves failed usage',async()=>{
 const bad=[chunks('',undefined),chunks().map((c,i)=>i===1?{...c,id:'changed'}:c),[...chunks().slice(0,-1),...chunks().slice(0,2).map(c=>({...c,index:1})),{type:'finish',reason:{kind:'tool-calls'}}],chunks().slice(0,-1)];
 for(const plan of bad){const f=fixture([[],plan]),t=await target(f);assert.equal(typeof f.adapter.generateTurn,'function');const r=await f.adapter.generateTurn({target:t,messages:[],tools,signal:new AbortController().signal});assert.equal(r.kind,'technical-missing');assert.equal(r.observation.usage.outputTokens,4);}
});
test('restored adapter detects current request settings changes during streaming',async()=>{
 let revision=1;const ctx:AdapterContext={scopeId:'fixture',settings:{describe:()=>[{ns:'fixture',revision,value:{baseURL:'https://fixture.invalid/v1'}}]},llm:{listProviders:()=>[{id:'fixture'}],listModels:async()=>[{id:'model'}],listConfigurableProviders:()=>[{provider:'fixture',settingsNs:'fixture',settingsPath:[]}],prepareCall:async(config)=>({config,async*stream(){revision++;yield {type:'usage',usage:{inputTokens:1,outputTokens:2}};yield {type:'finish',reason:{kind:'stop'}};}})}};
 const old=createHostAdapter(ctx),choice=(await old.catalog())[0]!,t=await old.snapshot(choice,{}),restored=createHostAdapter(ctx);
 const result=await restored.generateTurn!({target:t,messages:[],tools,signal:new AbortController().signal});assert.equal(result.kind,'technical-missing');if(result.kind==='technical-missing')assert.equal(result.error.code,'TARGET_CHANGED');assert.equal(result.observation.usage.outputTokens,2);
});

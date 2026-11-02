/** Developer-only: installed native runtime methods with a synthetic adapter. No credentials. */
const assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{resolve}=require('node:path');
let networkAttempts=0;const deny=()=>{networkAttempts++;throw Error('NETWORK_DISABLED');};globalThis.fetch=deny;require('node:net').Socket.prototype.connect=deny;
let stage='imports';const deadline=setTimeout(()=>{console.error('NATIVE_PROBE_TIMEOUT:'+stage);process.exitCode=1;},15000);
(async()=>{
 const [sdkPath,pluginPath]=process.argv.slice(2),sdk=await import(pathToFileURL(resolve(sdkPath,'index.js')).href),{createHostAdapter}=await import(pathToFileURL(resolve(pluginPath,'src/host/adapter.ts')).href);
 let prepares=0,dispatches=0;const requests=[];
 const runtime=Object.create(sdk.LlmRuntime.prototype);Object.defineProperty(runtime,'ctx',{value:{waterfall:(_self,_event,_opts,next)=>next()}});
 runtime.adapters=new Map([['fixture',{provider:{id:'fixture'},adapter:{prepareCall:async()=>{const turn=prepares++;return {model:{provider:'fixture',id:'model',name:'model'},stream:async function*(opts){dispatches++;requests.push(opts);if(turn===1){yield {type:'tool-call-delta',index:0,id:'action',name:'set_value',argumentsDelta:'{"value":'};yield {type:'tool-call-delta',index:0,id:'action',argumentsDelta:'7}'};yield {type:'usage',usage:{inputTokens:5,outputTokens:4}};yield {type:'finish',reason:{kind:'tool-calls'}};}else{yield {type:'text-delta',index:0,text:'done'};yield {type:'finish',reason:{kind:'stop'}};}}};}}}]]);
 const adapter=createHostAdapter({scopeId:'fixture',settings:{describe:()=>[]},llm:{listProviders:()=>[{id:'fixture'}],listModels:async()=>[{id:'model'}],listConfigurableProviders:()=>[],prepareCall:(...args)=>runtime.prepareCall(...args)}});
 stage='snapshot';const choice=(await adapter.catalog())[0],target=await adapter.snapshot(choice,{}),tools=[{name:'set_value',description:'Only fixture state',parameters:{type:'object',properties:{value:{type:'integer'}},required:['value']}}];
 stage='first-turn';
 const first=await adapter.generateTurn({target,messages:[],tools,signal:new AbortController().signal});assert.equal(first.kind,'completed');assert.equal(first.calls[0].argumentsJson,'{"value":7}');
 const tool=sdk.createToolResultMessage({callId:'action',content:[{type:'text',text:'7'}],isError:false});
 stage='second-turn';const last=await adapter.generateTurn({target,messages:[first.assistant,tool],tools,signal:new AbortController().signal});assert.equal(last.kind,'completed');assert.equal(last.calls.length,0);assert.equal(requests[1].messages[1].toolCallId,'action');assert.equal(prepares,3);assert.equal(dispatches,2);assert.equal(networkAttempts,0);
 console.log(JSON.stringify({scope:'native runtime methods with synthetic adapter; not Cordis lifecycle or model calibration',prepares,dispatches,fragmentAssembly:true,toolMessageCorrelation:true,networkAttempts,realModelCalls:0}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(deadline));

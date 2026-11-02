/** Isolated installed Cordis/LlmRuntime, memory transport and synthetic provider. No user profile. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),{resolve,join}=require('node:path'),{pathToFileURL}=require('node:url'),{tmpdir}=require('node:os');
let networkAttempts=0;const deny=()=>{networkAttempts++;throw Error('NETWORK_DISABLED');};globalThis.fetch=deny;require('node:net').Socket.prototype.connect=deny;
let stage='imports';const timer=setTimeout(()=>{console.error('CORDIS_PROBE_TIMEOUT:'+stage);process.exit(1);},120000);
(async()=>{
 const [modules,pluginRoot]=process.argv.slice(2),home=await fs.mkdtemp(join(tmpdir(),'model-eval-cordis-'));process.env.USERPROFILE=home;process.env.HOME=home;process.env.DSH_HOME=join(home,'dsh');process.env.DSH_AGENTS_HOME=join(home,'agents');
 const load=p=>import(pathToFileURL(resolve(p)).href),{Context}=await load(join(modules,'@deepseek-ai/cordis/lib/index.js')),{LlmRuntime,LlmAdapter,createToolResultMessage}=await load(join(modules,'@deepseek-ai/dsh-llm/lib/index.js'));
 const plugin=await load(join(pluginRoot,'lib/index.js')),{createHostAdapter}=await load(join(pluginRoot,'src/host/adapter.ts'));
 const routes=new Map(),ctx=new Context();let prepares=0,dispatches=0;const requests=[];
 try{
  stage='services';ctx.provide('connection',{fetch:{register(route){assert.ok(!routes.has(route.path));routes.set(route.path,route);return async()=>{routes.delete(route.path);};}}});
  ctx.provide('settings',{documentPath:join(home,'isolated-profile.patch.yml'),describe:()=>[{ns:'fixture-provider',revision:1,value:{baseURL:'https://fixture.invalid/v1'}}]});
  stage='llm';await ctx.plugin(LlmRuntime);
  stage='provider';await ctx.plugin({name:'synthetic-provider',inject:['llm'],apply(c){
   class Synthetic extends LlmAdapter {async listModels(){return[{provider:'fixture',id:'model',name:'model'}];}async prepareCall(){prepares++;return {model:{provider:'fixture',id:'model',name:'model'},async *stream(options){dispatches++;requests.push(options);if(dispatches===1){yield {type:'tool-call-delta',index:0,id:'action',name:'set_value',argumentsDelta:'{"value":'};yield {type:'tool-call-delta',index:0,id:'action',argumentsDelta:'7}'};yield {type:'usage',usage:{inputTokens:5,outputTokens:4}};yield {type:'finish',reason:{kind:'tool-calls'}};}else{yield {type:'text-delta',index:0,text:'done'};yield {type:'finish',reason:{kind:'stop'}};}}};}}
   c.llm.registerAdapter(['fixture'],new Synthetic());c.llm.registerConfigurableProviders([{provider:'fixture',displayName:'Fixture',settingsNs:'fixture-provider',settingsPath:[]}]);
  }});
  const runtime=ctx.llm;
  stage='plugin';const fiber=await ctx.plugin({name:plugin.name,inject:plugin.inject,apply:plugin.apply});
  const request=async(action,payload={})=>{const route=routes.get('/api/aico/model-eval/v1/operation');assert.ok(route);const response=await route.fetch(new Request('http://fixture/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({schemaVersion:1,requestId:'cordis-fixture',action,payload})}));const body=await response.json();assert.equal(body.ok,true,JSON.stringify(body.error));return body.data;};
  stage='routes';assert.equal((await request('status')).ready,true);const catalog=await request('catalog');assert.equal(catalog[0].providerId,'fixture');await request('snapshot',{providerId:'fixture',modelId:'model'});
  stage='native-turns';const adapter=createHostAdapter({scopeId:'fixture',settings:ctx.settings,llm:runtime}),target=await adapter.snapshot((await adapter.catalog())[0],{}),tools=[{name:'set_value',description:'Fixture data only',parameters:{type:'object',properties:{value:{type:'integer'}},required:['value']}}];
  const first=await adapter.generateTurn({target,messages:[],tools,signal:new AbortController().signal});assert.equal(first.kind,'completed');assert.equal(first.calls[0].argumentsJson,'{"value":7}');
  const last=await adapter.generateTurn({target,messages:[first.assistant,createToolResultMessage({callId:'action',content:[{type:'text',text:'7'}],isError:false})],tools,signal:new AbortController().signal});assert.equal(last.kind,'completed');assert.equal(requests[1].messages[1].toolCallId,'action');assert.equal(dispatches,2);assert.equal(prepares,4);
  stage='unload-plugin';await fiber.dispose();assert.equal(routes.size,0);assert.equal(runtime.listProviders().length,1);
  stage='unload-root';await ctx.fiber.dispose();assert.equal(runtime.adapters.size,0);assert.equal(runtime.listConfigurableProviders().length,0);assert.equal(networkAttempts,0);
  console.log(JSON.stringify({status:'passed',scope:'installed Cordis Context and LlmRuntime with memory settings/connection, isolated profile and synthetic provider',dispatches,prepares,routesAfterDispose:routes.size,adaptersAfterDispose:runtime.adapters.size,networkAttempts,realModelCalls:0,limits:'Not profile Loader, owner-auth transport, real model or OS firewall validation'}));
 }finally{await ctx.fiber.dispose();assert.ok(resolve(home).startsWith(resolve(tmpdir())+require('node:path').sep+'model-eval-cordis-'));await fs.rm(home,{recursive:true,force:true});}
})().catch(e=>{console.error('stage='+stage,e);process.exitCode=1;}).finally(()=>clearTimeout(timer));

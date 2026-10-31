import test from 'node:test';import assert from 'node:assert/strict';
import {registerHostChannel,type ChannelContext} from '../../src/host/channel.ts';
import type {FetchRoute} from '../../src/index.ts';
test('source-contract carrier fixture and DTO validation fence local data',async()=>{
  const routes:FetchRoute[]=[],ctx:ChannelContext={connection:{fetch:{register(route){routes.push(route);return async()=>{routes.splice(routes.indexOf(route),1);};}}}};let calls=0;
  const dispose=registerHostChannel(ctx,{async dispatch(action){calls++;return {action};},async dispose(){}});
  const route=routes.find(x=>x.methods.includes('POST'))!;
  // Mirrors the pinned official owner check. This fixture is not actual-host admission evidence.
  const carrier=(request:Request,kind:string)=>kind==='owner'?route.fetch(request):Promise.resolve(new Response('forbidden',{status:403}));
  const request=(body:string,origin?:string)=>new Request('http://localhost'+route.path,{method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},body});
  assert.equal((await carrier(request('{}'),'guest')).status,403);
  assert.equal((await carrier(request('{}','https://other.example'),'owner')).status,403);
  for(const body of ['{"schemaVersion":1,"requestId":"a","action":"execute","payload":{}}','{"schemaVersion":1,"requestId":"a","action":"report","payload":{"runId":"../../private"}}','{"schemaVersion":1,"requestId":"a","action":"commitCleanup","payload":{"path":"C:/private"}}','{"schemaVersion":1,"requestId":"a","action":"catalog","payload":{"__proto__":{"admin":true}}}']){
    const result=await carrier(request(body),'owner');assert.equal(result.status,400);assert.equal((await result.json()).ok,false);
  }
  assert.equal(calls,0);
  const result=await carrier(request('{"schemaVersion":1,"requestId":"a","action":"catalog","payload":{}}'),'owner');assert.equal(result.status,200);assert.equal((await result.json()).ok,true);assert.equal(calls,1);
  await dispose();assert.equal(routes.length,0);
});

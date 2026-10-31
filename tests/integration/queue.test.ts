import test from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';
import type {GeneratedAnswer,HostAdapter,ProtocolSet,Question,TargetSnapshot} from '../../src/contracts.ts';
import {switchRoot} from '../../src/resources/prepare.ts';import {openHistory} from '../../src/history/store.ts';import {withTempRoot} from '../support/temp.ts';
import {createQueue} from '../../src/jobs/queue.ts';
import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
const target=(modelId:string):TargetSnapshot=>({scopeId:'test',providerId:'test',modelId,controls:{},routeTarget:{state:'unknown'}});
const items:Question[]=['tiny-mmlu','tiny-gsm8k','ifeval','humaneval-plus'].map((datasetId,i)=>({id:'q'+i,datasetId,track:'general',sourceId:'test',sourceHash:'test',prompt:[{role:'user',content:'fixture'}],grading:null}));
const protocols:ProtocolSet={items,generalId:'fixture',writingId:'fixture',resourceVersion:'fixture'};
test('three_real_attempts_and_resume_only_missing',async()=>withTempRoot(async parent=>{
  const {path:root}=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(root);let calls=0,failing=true,inFlight=0,max=0;const order:string[]=[];
  const adapter:HostAdapter={async catalog(){return[];},async snapshot(){return target('a');},async generateOnce(input){calls++;inFlight++;max=Math.max(max,inFlight);order.push(input.target.modelId);
    await new Promise(resolve=>setTimeout(resolve,100));inFlight--;
    const observations={...input.context,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:false}};
    return failing?{text:'partial',complete:false,truncated:false,observations,error:{code:'TEMPORARY',phase:'answer',retryable:true,message:'fixture'}}:{text:'saved',complete:true,truncated:false,observations};}};
  const queue=createQueue(store,adapter,protocols,{async general(q,a){assert.equal((await store.getItem(queue.snapshot().batches[0]!.runIds[0]!,q.id))?.answer?.complete,true);return {kind:'scored',track:'general',itemId:q.id,passed:a.text==='saved',evidence:null};}},{clock:{async wait(){}}});
  const batch=await queue.enqueue({targets:[target('a')],tracks:['general'],execution:{concurrency:1,callTimeoutMs:1000}});await queue.idle();assert.equal(calls,3);assert.equal(queue.snapshot().activeBatchId,undefined);
  assert.equal((await store.getRun(batch.runIds[0]!)).summary.tracks.general!.score,undefined);
  failing=false;await queue.resume(batch.batchId);await queue.idle();assert.equal(calls,7);assert.equal((await store.getRun(batch.runIds[0]!)).summary.tracks.general!.score,100);
  await queue.resume(batch.batchId);await queue.idle();assert.equal(calls,7);
  const second=await queue.enqueue({targets:[target('b'),target('c')],tracks:['general'],execution:{concurrency:4,callTimeoutMs:1000}});await queue.idle();
  assert.equal(max,4);assert.deepEqual(order.slice(-8),['b','b','b','b','c','c','c','c']);assert.equal(second.runIds.length,2);
  await queue.dispose();await store.close();
}));
test('startup journal failure releases the active batch gate',async()=>withTempRoot(async parent=>{
  const {path:root}=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(root);let count=0,armed=true;const original=fs.promises.rename;
  const queue=createQueue(store,{async catalog(){return[];},async snapshot(){return target('a');},async generateOnce(){throw new Error('must not call');}},protocols,{async general(){throw new Error('must not grade');}});
  fs.promises.rename=async(from,to)=>{if(String(to).includes('batch-')&&++count===2&&armed){armed=false;throw Object.assign(new Error('fixture'),{code:'EIO'});}return original(from,to);};syncBuiltinESMExports();
  try{await queue.enqueue({targets:[target('a')],tracks:['general'],execution:{concurrency:1,callTimeoutMs:1000}});await queue.idle().catch(()=>{});assert.equal(queue.snapshot().activeBatchId,undefined);}
  finally{fs.promises.rename=original;syncBuiltinESMExports();await queue.dispose().catch(()=>{});await store.close();}
}));
test('auth failures pause once; persisted complete answers only need regrading',async()=>withTempRoot(async parent=>{
  const {path:root}=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(root);let calls=0,auth=true,gradeFail=true;
  const adapter:HostAdapter={async catalog(){return[];},async snapshot(){return target('a');},async generateOnce(input){calls++;return {text:'answer',complete:!auth,truncated:false,observations:{...input.context,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:false}},...(auth?{error:{code:'AUTH',phase:'config' as const,retryable:false,message:'auth'}}:{})};}};
  const queue=createQueue(store,adapter,protocols,{async general(q){return gradeFail?{kind:'technical-missing',track:'general',itemId:q.id,error:{code:'GRADER',retryable:false,phase:'grader',message:'fixture'},evidence:null}:{kind:'scored',track:'general',itemId:q.id,passed:false,evidence:null};}},{clock:{async wait(){}}});
  const batch=await queue.enqueue({targets:[target('a')],tracks:['general'],execution:{concurrency:1,callTimeoutMs:1000}});await queue.idle();assert.equal(calls,1);
  auth=false;await queue.resume(batch.batchId);await queue.idle();assert.equal(calls,2);assert.ok((await store.getItem(batch.runIds[0]!,'q0'))?.answer?.complete);
  gradeFail=false;await queue.resume(batch.batchId);await queue.idle();assert.equal(calls,5);assert.equal((await store.getRun(batch.runIds[0]!)).summary.tracks.general!.score,0);
  await queue.dispose();await store.close();
}));

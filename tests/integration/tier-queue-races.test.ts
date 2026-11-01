import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import type {HostAdapter,Question,ProtocolSet} from '../../src/contracts.ts';
import {createQueue} from '../../src/jobs/queue.ts';
import {switchRoot} from '../../src/resources/prepare.ts';
import {openHistory} from '../../src/history/store.ts';
import {writeRecord} from '../../src/history/atomic.ts';
import {LEGACY_PROTOCOL_REFS} from '../../src/evaluation/definitions.ts';
import {legacyFixtureRegistry} from '../support/fixture-registry.ts';
import {withTempRoot} from '../support/temp.ts';
const target={scopeId:'fixture',providerId:'fixture',modelId:'a',routeTarget:{state:'unknown' as const},controls:{}};
const items:Question[]=['tiny-mmlu','tiny-gsm8k','ifeval','humaneval-plus'].map((datasetId,i)=>({id:'old/'+i,datasetId,track:'general',sourceId:String(i),sourceHash:'fixture',prompt:[{role:'user',content:'fixture'}],grading:null}));
const protocols:ProtocolSet={...LEGACY_PROTOCOL_REFS,items};

test('dispose_waits_for_held_resume_admission_and_never_starts_a_new_controller',{timeout:10000},async()=>withTempRoot(async parent=>{
  const {path}=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(path),batchId='22222222-2222-4222-8222-222222222222';
  const run=await store.createRun({batchId,target,protocols:LEGACY_PROTOCOL_REFS,requiredItems:items.map(({id,track,datasetId})=>({id,track,datasetId}))});
  await writeRecord(join(path,'history/maintenance','batch-'+batchId+'.json'),{batchId,runIds:[run.runId],status:'paused',createdAt:new Date().toISOString(),execution:{concurrency:1,callTimeoutMs:1000}});
  let release!:()=>void,entered!:()=>void,calls=0;const held=new Promise<void>(r=>release=r),inside=new Promise<void>(r=>entered=r),base=legacyFixtureRegistry(protocols);
  const registry={...base,async resolve(refs:typeof LEGACY_PROTOCOL_REFS){entered();await held;return base.resolve(refs);}};
  const adapter:HostAdapter={async catalog(){return[];},async snapshot(){return target;},async generateOnce(i){calls++;return {text:'x',complete:true,truncated:false,observations:{...i.context,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:false}}};}};
  const queue=createQueue(store,adapter,registry,{async general(q){return {kind:'scored',track:'general',itemId:q.id,passed:true,evidence:null};}});
  let closing:Promise<void>|undefined;const resume=queue.resume(batchId);const observed=resume.then(()=>undefined,error=>error);
  try{
    await inside;let disposed=false;closing=queue.dispose().then(()=>{disposed=true;});await new Promise<void>(r=>setImmediate(r));
    assert.equal(disposed,false,'dispose must wait for the in-flight admission');release();
    assert.match(String(await observed),/QUEUE_DISPOSED/);await closing;assert.equal(calls,0);assert.equal(queue.snapshot().activeBatchId,undefined);
  }finally{release();await observed;await queue.idle().catch(()=>{});await closing;await queue.dispose();await store.close();}
}));

test('held_resume_reserves_admission_against_a_concurrent_enqueue',{timeout:10000},async()=>withTempRoot(async parent=>{
  const {path}=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(path),batchId='33333333-3333-4333-8333-333333333333';
  const run=await store.createRun({batchId,target,protocols:LEGACY_PROTOCOL_REFS,requiredItems:items.map(({id,track,datasetId})=>({id,track,datasetId}))});
  await writeRecord(join(path,'history/maintenance','batch-'+batchId+'.json'),{batchId,runIds:[run.runId],status:'paused',createdAt:new Date().toISOString(),execution:{concurrency:1,callTimeoutMs:1000}});
  let release!:()=>void,entered!:()=>void;const held=new Promise<void>(r=>release=r),inside=new Promise<void>(r=>entered=r),base=legacyFixtureRegistry(protocols),calls:string[]=[];
  const registry={...base,async resolve(refs:typeof LEGACY_PROTOCOL_REFS){entered();await held;return base.resolve(refs);}};
  const adapter:HostAdapter={async catalog(){return[];},async snapshot(){return target;},async generateOnce(i){calls.push(i.target.modelId);return {text:'x',complete:true,truncated:false,observations:{...i.context,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:false}}};}};
  const queue=createQueue(store,adapter,registry,{async general(q){return {kind:'scored',track:'general',itemId:q.id,passed:true,evidence:null};}}),resuming=queue.resume(batchId);
  try{await inside;await assert.rejects(queue.enqueue({targets:[{...target,modelId:'b'}],tracks:['general'],execution:{concurrency:1,callTimeoutMs:1000}}),/QUEUE_BUSY/);release();await resuming;await queue.idle();assert.deepEqual(calls,['a','a','a','a']);assert.equal((await store.listSummaries()).length,1);}finally{release();await resuming.catch(()=>{});await queue.dispose();await store.close();}
}));

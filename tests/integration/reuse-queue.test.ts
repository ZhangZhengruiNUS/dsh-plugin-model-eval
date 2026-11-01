import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {join} from 'node:path';import {rename} from 'node:fs/promises';
import {withTempRoot} from '../support/temp.ts';import {persistReuseSource} from '../support/reuse-fixture.ts';import {fixtureRegistry} from '../support/fixture-registry.ts';
import {switchRoot} from '../../src/resources/prepare.ts';import {openHistory,type HistoryStore} from '../../src/history/store.ts';import {createReuseHistory} from '../../src/history/reuse.ts';import {checkUpgrade} from '../../src/evaluation/reuse-eligibility.ts';import {createQueue,type BatchView} from '../../src/jobs/queue.ts';
import type {GenerationInput,HostAdapter,GeneratedAnswer} from '../../src/contracts.ts';
const execution={concurrency:4 as const,callTimeoutMs:300000};
const answer=(input:GenerationInput,complete=true):GeneratedAnswer=>({text:'synthetic new answer',complete,truncated:false,observations:{...input.context,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:true,totalTokens:250}}});
async function batchFor(store:HistoryStore,runId:string):Promise<BatchView>{const {manifest}=await store.getRun(runId);return {batchId:manifest.batchId,runIds:[runId],createdAt:manifest.createdAt,status:'queued',execution};}
test('attach_ready_import_and_call_only_remaining_280',{timeout:60000},async()=>{
  await withTempRoot(async parent=>{
    const {path:root}=await switchRoot(join(parent,'owned'),{writing:false}),store=await openHistory(root),f=await persistReuseSource(store),reuse=createReuseHistory(store);
    let calls=0,grades=0,release!:()=>void;const held=new Promise<void>(r=>release=r),adapter:HostAdapter={catalog:async()=>[],snapshot:async()=>f.current,async generateOnce(input){calls++;await held;return answer(input);}};
    const queue=createQueue(store,adapter,fixtureRegistry([f.source.protocol,f.deep]),{general:async(q)=>{grades++;return {kind:'scored',track:'general',itemId:q.id,passed:true,evidence:null};}});
    try{
      await queue.idle();const imported=await reuse.import(checkUpgrade(f.source,f.deep,f.current),{token:randomUUID(),target:f.current,protocol:f.deep,execution});const initial=(await store.getRun(imported.runId)).summary;assert.equal(initial.tracks.general?.graded,120);assert.equal(initial.tracks.general?.required,400);
      const batch=await batchFor(store,imported.runId);await assert.rejects(queue.attachImported({...batch,execution:{...execution,concurrency:1}},imported.runId,imported.operationId),/REUSE_IMPORT_MISMATCH/);assert.equal(calls,0);await Promise.all([queue.attachImported(batch,imported.runId,imported.operationId),queue.attachImported(batch,imported.runId,imported.operationId)]);
      assert.equal(queue.snapshot().batches.filter(x=>x.batchId===batch.batchId).length,1);release();await queue.idle();
      const final=(await store.getRun(imported.runId)).summary;assert.equal(calls,280);assert.equal(grades,280);assert.equal(final.tracks.general?.required,400);assert.equal(final.tracks.general?.graded,400);assert.equal(final.tracks.general?.score,85);assert.equal(final.tracks.writing,undefined);
      await queue.attachImported(batch,imported.runId,imported.operationId);assert.equal(calls,280);
    }finally{release();await queue.dispose();await store.close();}
  });
});
test('ready_orphan_is_rebuilt_paused_and_pause_reopen_calls_only_missing_work',{timeout:60000},async()=>{
  await withTempRoot(async parent=>{
    const {path:root}=await switchRoot(join(parent,'owned'),{writing:false});let store=await openHistory(root);const f=await persistReuseSource(store),reuse=createReuseHistory(store),imported=await reuse.import(checkUpgrade(f.source,f.deep,f.current),{token:randomUUID(),target:f.current,protocol:f.deep,execution});let calls=0,blocking=true,started!:()=>void;const invoked=new Promise<void>(r=>started=r);
    const adapter:HostAdapter={catalog:async()=>[],snapshot:async()=>f.current,async generateOnce(input){calls++;if(blocking){started();await new Promise<void>(r=>{if(input.signal.aborted)r();else input.signal.addEventListener('abort',()=>r(),{once:true});});return answer(input,false);}return answer(input);}};
    let queue=createQueue(store,adapter,fixtureRegistry([f.source.protocol,f.deep]),{general:async q=>({kind:'scored',track:'general',itemId:q.id,passed:true,evidence:null})});await queue.idle();assert.equal(calls,0);assert.equal(queue.snapshot().batches.find(x=>x.batchId===imported.batchId)?.status,'paused');
    await queue.resume(imported.batchId);await invoked;await queue.pause(imported.batchId);await queue.dispose();await store.close();blocking=false;const interrupted=calls;
    store=await openHistory(root);await store.recover();await createReuseHistory(store).recover();queue=createQueue(store,adapter,fixtureRegistry([f.source.protocol,f.deep]),{general:async q=>({kind:'scored',track:'general',itemId:q.id,passed:true,evidence:null})});
    try{await queue.idle();assert.equal(calls,interrupted);await queue.resume(imported.batchId);await queue.idle();assert.equal(calls-interrupted,280);assert.equal((await store.getRun(imported.runId)).summary.tracks.general!.score,85);}finally{await queue.dispose();await store.close();}
  });
});
test('copying_failed_and_missing_imports_are_never_dispatched',{timeout:60000},async()=>{
  await withTempRoot(async parent=>{for(const mode of ['copying','failed','missing']){
    const {path:root}=await switchRoot(join(parent,mode),{writing:false});let store=await openHistory(root);const f=await persistReuseSource(store),token=randomUUID(),reuse=createReuseHistory(store,mode==='copying'?{checkpoint:async stage=>{if(stage==='created')throw Error('INTERRUPTED');}}:{});
    let runId:string;
    if(mode==='copying'){await assert.rejects(reuse.import(checkUpgrade(f.source,f.deep,f.current),{token,target:f.current,protocol:f.deep,execution}));runId=(await reuse.operation(token))!.destinationRunId;}
    else{runId=(await reuse.import(checkUpgrade(f.source,f.deep,f.current),{token,target:f.current,protocol:f.deep,execution})).runId;await store.close();const path=join(root,'history','runs',runId,'details','items',createHash('sha256').update(f.source.items[0]!.itemId).digest('hex')+'.json');await rename(path,path+'.preserved');store=await openHistory(root);if(mode==='failed')await createReuseHistory(store).recover();}
    let calls=0;const queue=createQueue(store,{catalog:async()=>[],snapshot:async()=>f.current,async generateOnce(input){calls++;return answer(input);}},fixtureRegistry([f.source.protocol,f.deep]),{general:async q=>({kind:'scored',track:'general',itemId:q.id,passed:true,evidence:null})});
    try{await queue.idle();await assert.rejects(queue.attachImported(await batchFor(store,runId),runId,token),/REUSE_/);assert.equal(calls,0);assert.equal(queue.snapshot().activeBatchId,undefined);}finally{await queue.dispose();await store.close();}
  }});
});

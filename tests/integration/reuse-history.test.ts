import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {writeFile,mkdir,rename,rmdir,readFile} from 'node:fs/promises';
import {withTempRoot} from '../support/temp.ts';import {persistReuseSource} from '../support/reuse-fixture.ts';
import {switchRoot} from '../../src/resources/prepare.ts';import {openHistory} from '../../src/history/store.ts';import {createCleanup} from '../../src/history/cleanup.ts';
import {createReuseHistory} from '../../src/history/reuse.ts';import {checkUpgrade} from '../../src/evaluation/reuse-eligibility.ts';
const execution={concurrency:4 as const,callTimeoutMs:300000};
test('import_commit_recovers_and_survives_source_cleanup',{timeout:30000},async()=>{
  await withTempRoot(async parent=>{
    const {path:root}=await switchRoot(join(parent,'owned'),{writing:false}),store=await openHistory(root);
    try{
      const f=await persistReuseSource(store),before=await store.getRun(f.source.manifest.runId),beforeItems=await store.listItems(before.manifest.runId),reuse=createReuseHistory(store),token=randomUUID();
      const input={token,target:f.current,protocol:f.deep,execution},result=await reuse.import(checkUpgrade(f.source,f.deep,f.current),input);
      assert.deepEqual(await reuse.import(checkUpgrade(f.source,f.deep,f.current),input),result);
      assert.equal((await reuse.operation(result.operationId))?.state,'ready');
      const childItems=await store.listItems(result.runId);assert.equal(childItems.length,120);assert.equal(childItems.flatMap(x=>x.attempts).length,0);
      assert.equal(childItems.filter(x=>x.grade?.kind==='scored'&&x.grade.track==='general'&&!x.grade.passed).length,60);
      assert.ok(childItems.every(x=>x.reuse?.sourceRecordHash&&x.reuse.sourceAttempts.length===1&&!x.gradingObservation));
      assert.deepEqual(await store.getRun(before.manifest.runId),before);assert.deepEqual(await store.listItems(before.manifest.runId),beforeItems);
      const cleanup=createCleanup(store,()=>undefined),preview=await cleanup.previewCleanup([before.summary.batchId]);await cleanup.commitCleanup(preview.token);
      assert.deepEqual(await store.listItems(result.runId),childItems);await reuse.recover();assert.equal((await reuse.operation(result.operationId))?.state,'ready');
      const childPreview=await cleanup.previewCleanup([result.batchId]);await cleanup.commitCleanup(childPreview.token);assert.equal((await store.getRun(before.manifest.runId)).summary.tracks.general!.score,50);
    }finally{await store.close();}
  });
});
test('copying_journal_serializes_cleanup_and_recovers_without_nested_lock',{timeout:30000},async()=>{
  await withTempRoot(async parent=>{
    const {path:root}=await switchRoot(join(parent,'owned'),{writing:false}),store=await openHistory(root);
    try{
      const f=await persistReuseSource(store),check=checkUpgrade(f.source,f.deep,f.current),token=randomUUID();let reached!:()=>void,release!:()=>void;
      const atCopy=new Promise<void>(r=>reached=r),held=new Promise<void>(r=>release=r);
      const reuse=createReuseHistory(store,{checkpoint:async(stage,index)=>{if(stage==='copied'&&index===10){reached();await held;}}});
      const importing=reuse.import(check,{token,target:f.current,protocol:f.deep,execution});await atCopy;
      let cleaned=false;const cleanup=createCleanup(store,()=>undefined),waiting=cleanup.previewCleanup([f.source.manifest.batchId]).then(x=>{cleaned=true;return x;});
      await new Promise(r=>setTimeout(r,20));assert.equal(cleaned,false);release();const imported=await importing;await waiting;
      assert.equal((await reuse.operation(imported.operationId))?.state,'ready');
      // The other serialized order invalidates the source, rather than silently doing400 new calls.
      const f2=await persistReuseSource(store),check2=checkUpgrade(f2.source,f2.deep,f2.current),preview=await cleanup.previewCleanup([f2.source.manifest.batchId]);await cleanup.commitCleanup(preview.token);
      await assert.rejects(reuse.import(check2,{token:randomUUID(),target:f2.current,protocol:f2.deep,execution}),/UPGRADE_/);
    }finally{await store.close();}
  });
});
test('process_exit_before_during_and_before_ready_import_is_recoverable',{timeout:60000},async()=>{
  await withTempRoot(async parent=>{for(const stage of ['journal','copied','before-ready']){
    const {path:root}=await switchRoot(join(parent,stage),{writing:false});let result:{operationId:string;sourceRunId:string};
    try{execFileSync(process.execPath,['--import','tsx','tests/support/reuse-crash-worker.ts',root,stage],{encoding:'utf8',windowsHide:true});assert.fail('worker must exit');}
    catch(error){assert.equal((error as any).status,79);result=JSON.parse((error as any).stdout.trim());}
    const store=await openHistory(root);try{await store.recover();const reuse=createReuseHistory(store),cleanup=createCleanup(store,()=>undefined);await assert.rejects(cleanup.previewCleanup([(await store.getRun(result!.sourceRunId)).summary.batchId]),/REUSE_RECOVERY_REQUIRED/);await reuse.recover();const operation=await reuse.operation(result!.operationId);assert.equal(operation?.state,'ready');assert.equal((await store.listItems(operation!.destinationRunId)).length,120);assert.ok((await store.listItems(operation!.destinationRunId)).every(x=>x.attempts.length===0));}finally{await store.close();}
  }});
});
test('corrupt_copied_answer_is_diagnosed_without_repair_or_source_dependency',{timeout:30000},async()=>{
  await withTempRoot(async parent=>{
    const {path:root}=await switchRoot(join(parent,'owned'),{writing:false});let store=await openHistory(root);
    const f=await persistReuseSource(store),reuse=createReuseHistory(store),result=await reuse.import(checkUpgrade(f.source,f.deep,f.current),{token:randomUUID(),target:f.current,protocol:f.deep,execution});await store.close();
    const itemPath=join(root,'history','runs',result.runId,'details','items',createHash('sha256').update(f.source.items[0]!.itemId).digest('hex')+'.json');await writeFile(itemPath,'broken copy');
    store=await openHistory(root);try{await createReuseHistory(store).recover();assert.equal((await createReuseHistory(store).operation(result.operationId))?.state,'failed');await assert.rejects(store.getItem(result.runId,f.source.items[0]!.itemId),/ITEM_CORRUPT/);}finally{await store.close();}
  });
});
test('storage_write_failure_preserves_source_and_a_diagnosable_uncommitted_import',{timeout:30000},async()=>{
  await withTempRoot(async parent=>{
    const {path:root}=await switchRoot(join(parent,'owned'),{writing:false}),store=await openHistory(root);
    const f=await persistReuseSource(store),before=await store.getRun(f.source.manifest.runId),token=randomUUID(),journal=join(root,'history','maintenance',`reuse-${token}.json`);
    const reuse=createReuseHistory(store,{checkpoint:async(stage)=>{if(stage==='before-ready'){await rename(journal,journal+'.preserved');await mkdir(journal);}}});
    try{
      await assert.rejects(reuse.import(checkUpgrade(f.source,f.deep,f.current),{token,target:f.current,protocol:f.deep,execution}));
      assert.deepEqual(await store.getRun(f.source.manifest.runId),before);
      await rmdir(journal);await rename(journal+'.preserved',journal);assert.equal((await reuse.operation(token))?.state,'copying');
      await store.recover();await createReuseHistory(store).recover();const op=await createReuseHistory(store).operation(token);assert.equal(op?.state,'ready');assert.equal((await store.listItems(op!.destinationRunId)).length,120);
    }finally{await store.close();}
  });
});
test('ready_admission_checks_disk_bytes_instead_of_warm_item_cache',{timeout:30000},async()=>{
  await withTempRoot(async parent=>{
    const {path:root}=await switchRoot(join(parent,'owned'),{writing:false}),store=await openHistory(root),f=await persistReuseSource(store),token=randomUUID();
    const reuse=createReuseHistory(store,{checkpoint:async(stage)=>{if(stage==='copied'){const journal=JSON.parse(await readFile(join(root,'history','maintenance',`reuse-${token}.json`),'utf8'));const pin=journal.value.items[0];await writeFile(join(root,'history','runs',journal.value.destinationRunId,'details','items',createHash('sha256').update(pin.id).digest('hex')+'.json'),'changed durable copy');throw Error('INTERRUPTED_AFTER_DAMAGED_COPY');}}});
    try{await assert.rejects(reuse.import(checkUpgrade(f.source,f.deep,f.current),{token,target:f.current,protocol:f.deep,execution}));await createReuseHistory(store).recover();assert.equal((await reuse.operation(token))?.state,'failed');}finally{await store.close();}
  });
});
test('missing_previously_journaled_copy_is_never_silently_reimported',{timeout:30000},async()=>{
  await withTempRoot(async parent=>{
    const {path:root}=await switchRoot(join(parent,'owned'),{writing:false}),store=await openHistory(root),f=await persistReuseSource(store),token=randomUUID();
    const reuse=createReuseHistory(store,{checkpoint:async(stage,index)=>{if(stage==='copied'&&index===10)throw Error('SIMULATED_INTERRUPTION');}});
    try{await assert.rejects(reuse.import(checkUpgrade(f.source,f.deep,f.current),{token,target:f.current,protocol:f.deep,execution}),/SIMULATED/);const op=await reuse.operation(token);const item=join(root,'history','runs',op!.destinationRunId,'details','items',createHash('sha256').update(f.source.items[0]!.itemId).digest('hex')+'.json');await store.close();await rename(item,item+'.preserved');const reopened=await openHistory(root);try{await createReuseHistory(reopened).recover();assert.equal((await createReuseHistory(reopened).operation(token))?.state,'failed');assert.equal(await reopened.getItem(op!.destinationRunId,f.source.items[0]!.itemId),undefined);}finally{await reopened.close();}}finally{await store.close();}
  });
});

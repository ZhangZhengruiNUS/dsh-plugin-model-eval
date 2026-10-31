import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { withTempRoot } from '../support/temp.ts';
import { switchRoot } from '../../src/resources/prepare.ts';
import { openHistory, type RunManifestInput } from '../../src/history/store.ts';
const manifest=():RunManifestInput=>({batchId:'batch-fixture',target:{scopeId:'scope',providerId:'provider',modelId:'model',routeTarget:{state:'unknown'},controls:{}},
  protocols:{generalId:'fixture',writingId:'fixture',resourceVersion:'fixture'},requiredItems:[{id:'q1',track:'general',datasetId:'tiny-mmlu'}]});
const answer={text:'完整回答',complete:true,truncated:false,observations:{attemptId:'a1',itemId:'q1',track:'general',phase:'answer',startedAt:'2026-01-01T00:00:00.000Z',endedAt:'2026-01-01T00:00:01.000Z',usage:{available:false}}} as const;

test('recover_only_committed_items_without_overwriting_runs',async()=>{
  await withTempRoot(async parent=>{
    for(const mode of ['before','after']) {
      const {path:root}=await switchRoot(join(parent,mode),{writing:false});
      let output='';
      try {execFileSync(process.execPath,['--import','tsx','tests/support/history-crash-worker.ts',root,mode],{encoding:'utf8',windowsHide:true});assert.fail('worker must crash');}
      catch(error){const result=error as {status?:number;stdout?:string};assert.equal(result.status,mode==='before'?76:77);output=result.stdout!;}
      const {runId}=JSON.parse(output.trim());
      const store=await openHistory(root);assert.equal(store.writable,true);
      const report=await store.recover();assert.ok(report.recoveredRunIds.includes(runId));
      const item=await store.getItem(runId,'q1');
      assert.equal(item?.answer?.text,mode==='after'?'已提交的回答':undefined);
      const summary=(await store.getRun(runId)).summary;
      assert.equal(summary.tracks.general!.status,'paused');
      assert.equal(summary.tracks.general!.answered,mode==='after'?1:0);
      const second=await store.createRun(manifest());assert.notEqual(second.runId,runId);
      await assert.rejects(store.saveItem(runId,0,{itemId:'q1',attempts:[]}),{code:'REVISION_CONFLICT'});
      await store.close();
    }
  });
});
test('one writer, item CAS and corrupted-record diagnostics preserve committed data',async()=>{
  await withTempRoot(async parent=>{
    const {path:root}=await switchRoot(join(parent,'中文记录'),{writing:false});
    const store=await openHistory(root),reader=await openHistory(root);
    assert.equal(reader.writable,false);
    await assert.rejects(reader.createRun(manifest()),{code:'HISTORY_READ_ONLY'});
    const run=await store.createRun(manifest());
    const writes=await Promise.allSettled([store.saveItem(run.runId,0,{itemId:'q1',attempts:[],answer}),store.saveItem(run.runId,0,{itemId:'q1',attempts:[],answer})]);
    assert.equal(writes.filter(x=>x.status==='fulfilled').length,1);
    assert.equal((await reader.listSummaries()).length,1);
    await reader.close();
    const itemPath=join(root,'history','runs',run.runId,'details','items',createHash('sha256').update('q1').digest('hex')+'.json');
    await writeFile(itemPath,'{"truncated":');
    await store.close();
    const reopened=await openHistory(root),report=await reopened.recover();
    assert.ok(report.diagnostics.some(x=>x.runId===run.runId&&x.code==='ITEM_CORRUPT'));
    assert.equal((await reopened.getItem(run.runId,'q1'))?.answer,undefined);
    assert.ok((await readdir(join(root,'history','runs',run.runId,'diagnostics'))).length>0);
    await reopened.close();
  });
});
test('recovery never turns cleared completed summaries into incomplete runs',async()=>{
  await withTempRoot(async parent=>{
    const {path:root}=await switchRoot(join(parent,'root'),{writing:false});const store=await openHistory(root);
    const run=await store.createRun(manifest());
    await store.updateSummary(run.runId,run.revision,next=>{
      next.tracks.general={status:'completed',required:1,graded:1,answered:1,score:100,completedAt:'2026-01-01T00:00:00.000Z',measures:{}};
      next.details='cleared';next.resumeAllowed=false;
    });
    await rm(join(root,'history','runs',run.runId,'details'),{recursive:true,force:true});await store.close();
    await writeFile(join(root,'history','runs',run.runId,'summary.json'),'broken');
    const reopened=await openHistory(root);await reopened.recover();
    const summary=(await reopened.getRun(run.runId)).summary;
    assert.equal(summary.tracks.general!.score,100);assert.equal(summary.details,'cleared');assert.equal(summary.resumeAllowed,false);
    await reopened.close();
  });
});
test('closing synchronously stops admission of new writes',async()=>{
  await withTempRoot(async parent=>{
    const {path:root}=await switchRoot(join(parent,'root'),{writing:false});const store=await openHistory(root);
    const run=await store.createRun(manifest());const closing=store.close();
    await assert.rejects(store.saveItem(run.runId,0,{itemId:'q1',attempts:[],answer}),{code:'HISTORY_CLOSED'});
    await closing;
  });
});
test('recovering unfinished writing preserves completed general summary',async()=>{
  await withTempRoot(async parent=>{
    const {path:root}=await switchRoot(join(parent,'root'),{writing:false});const store=await openHistory(root);
    const input=manifest();input.requiredItems.push({id:'w1',track:'writing',datasetId:'writing'});const run=await store.createRun(input);
    await store.updateSummary(run.runId,0,next=>{next.tracks.general={status:'completed',required:1,graded:1,answered:1,score:100,completedAt:'2026-01-01',measures:{}};});
    await store.close();const reopened=await openHistory(root);await reopened.recover();
    const summary=(await reopened.getRun(run.runId)).summary;assert.equal(summary.tracks.general!.graded,1);assert.equal(summary.tracks.general!.score,100);
    await reopened.close();
  });
});

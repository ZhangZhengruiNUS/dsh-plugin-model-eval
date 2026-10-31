import test from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';import {writeFile,symlink,rm} from 'node:fs/promises';
import {switchRoot} from '../../src/resources/prepare.ts';import {openHistory,type HistoryStore} from '../../src/history/store.ts';import {withTempRoot} from '../support/temp.ts';import {createCleanup} from '../../src/history/cleanup.ts';
import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
async function makeRun(store:HistoryStore,batchId:string){const run=await store.createRun({batchId,target:{scopeId:'s',providerId:'p',modelId:'m',routeTarget:{state:'unknown'},controls:{}},protocols:{generalId:'fixture',writingId:'fixture',resourceVersion:'fixture'},requiredItems:[{id:'q',track:'general',datasetId:'tiny-mmlu'}]});
  await store.saveItem(run.runId,0,{itemId:'q',attempts:[],answer:{text:'large answer'.repeat(500),complete:true,truncated:false,observations:{attemptId:'a',itemId:'q',track:'general',phase:'answer',startedAt:'2026-01-01',endedAt:'2026-01-01',usage:{available:false}}}});
  const latest=(await store.getRun(run.runId)).summary;await store.updateSummary(run.runId,latest.revision,next=>{next.tracks.general={status:'completed',required:1,graded:1,answered:1,score:80,completedAt:'2026-01-01',measures:{}};});return (await store.getRun(run.runId)).summary;}
test('cleanup_is_idempotent_and_preserves_complete_summaries',async()=>withTempRoot(async parent=>{
  const {path:root}=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(root),run=await makeRun(store,'batch-a');let active:string|undefined;
  const cleanup=createCleanup(store,()=>active);
  const usage=await cleanup.measureHistory();assert.ok(usage.historyBytes>0);assert.ok(usage.runs[0]!.detailBytes>0);
  const preview=await cleanup.previewCleanup(['batch-a','batch-a']);assert.equal(preview.batchIds.length,1);assert.equal(preview.bytes,usage.runs[0]!.detailBytes);
  active='batch-a';await assert.rejects(cleanup.commitCleanup(preview.token),{code:'BATCH_ACTIVE'});active=undefined;
  await makeRun(store,'batch-b');const operation=await cleanup.commitCleanup(preview.token);assert.equal(operation.status,'completed');assert.equal(operation.deletedBytes,preview.bytes);
  const after=(await store.getRun(run.runId)).summary;assert.deepEqual(after.target,run.target);assert.deepEqual(after.tracks,run.tracks);assert.equal(after.details,'cleared');assert.equal(after.resumeAllowed,false);
  assert.deepEqual(await cleanup.commitCleanup(preview.token),operation);
  const measured=await cleanup.measureHistory();assert.equal(measured.runs.find(x=>x.runId===run.runId)!.detailBytes,0);assert.ok(measured.runs.find(x=>x.batchId==='batch-b')!.detailBytes>0);
  await store.close();
}));
test('a journal write failure after unlink remains recoverable',async()=>withTempRoot(async parent=>{
  const {path:root}=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(root);await makeRun(store,'batch-a');const original=fs.promises.rename;let arm=false,injected=false;
  const cleanup=createCleanup(store,()=>undefined,{async beforeDelete(){arm=true;}}),preview=await cleanup.previewCleanup(['batch-a']);
  fs.promises.rename=async(from,to)=>{if(arm&&!injected&&String(to).includes('cleanup-')){injected=true;throw Object.assign(new Error('fixture'),{code:'EIO'});}return original(from,to);};syncBuiltinESMExports();
  try{await cleanup.commitCleanup(preview.token).catch(()=>{});}finally{fs.promises.rename=original;syncBuiltinESMExports();}
  const result=await cleanup.commitCleanup(preview.token);assert.equal(result.status,'completed');assert.equal(result.deletedBytes,preview.bytes);await store.close();
}));
test('cleanup rejects changed revisions and links; partial failure is retried without double counting',async()=>withTempRoot(async parent=>{
  const {path:root}=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(root),run=await makeRun(store,'batch-a');
  const cleanup=createCleanup(store,()=>undefined);const old=await cleanup.previewCleanup(['batch-a']);
  await store.updateSummary(run.runId,(await store.getRun(run.runId)).summary.revision,next=>{next.metrics.incompleteTiming=true;});await assert.rejects(cleanup.commitCleanup(old.token),{code:'CLEANUP_PREVIEW_STALE'});
  const another=await makeRun(store,'batch-b'),details=join(root,'history','runs',another.runId,'details');await symlink(parent,join(details,'redirect'),'junction');
  await assert.rejects(cleanup.previewCleanup(['batch-b']),{code:'CLEANUP_PATH_REJECTED'});await rm(join(details,'redirect'));
  let injected=true;const broken=createCleanup(store,()=>undefined,{async beforeDelete(){if(injected){injected=false;throw Object.assign(new Error('fixture'),{code:'EBUSY'});}}});
  const preview=await broken.previewCleanup(['batch-a']);const partial=await broken.commitCleanup(preview.token);assert.equal(partial.status,'partial');assert.equal(partial.deletedBytes,0);
  const done=await broken.commitCleanup(preview.token);assert.equal(done.status,'completed');assert.equal(done.deletedBytes,preview.bytes);
  await store.close();
}));

import test from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';import {withTempRoot} from '../support/temp.ts';import {switchRoot} from '../../src/resources/prepare.ts';import {openHistory} from '../../src/history/store.ts';
test('crash recovery never includes the offline gap in active wall time',async()=>withTempRoot(async parent=>{
  const {path:root}=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(root);const run=await store.createRun({batchId:'test',target:{scopeId:'s',providerId:'p',modelId:'m',routeTarget:{state:'unknown'},controls:{}},protocols:{generalId:'g',writingId:'w',resourceVersion:'v'},requiredItems:[{id:'q',track:'general',datasetId:'tiny-mmlu'}]});
  await store.updateSummary(run.runId,0,next=>{next.metrics.activeIntervals=[{startedAt:new Date().toISOString()}];});
  await store.saveItem(run.runId,0,{itemId:'q',attempts:[]});const committed=(await store.getItem(run.runId,'q'))!.updatedAt;
  await store.close();await new Promise(r=>setTimeout(r,75));const reopened=await openHistory(root);await reopened.recover();const summary=(await reopened.getRun(run.runId)).summary;
  assert.equal(summary.metrics.incompleteTiming,true);assert.equal(summary.metrics.activeIntervals[0]!.endedAt,committed);await reopened.close();
}));

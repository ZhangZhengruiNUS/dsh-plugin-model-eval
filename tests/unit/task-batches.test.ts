import assert from 'node:assert/strict';
import test from 'node:test';
import type {RunSummary} from '../../src/contracts.ts';
import type {BatchView} from '../../src/jobs/queue.ts';
import {taskBatches} from '../../src/client/task-batches.ts';

function makeRun(runId:string,status:'completed'|'pending',details:RunSummary['details']='available'){
  return {
    runId,details,resumeAllowed:details==='available',
    tracks:{writing:{status}},
  } as RunSummary;
}

function makeBatch(batchId:string,status:BatchView['status'],extra:Partial<BatchView>={}):BatchView {
  return {
    batchId,runIds:[batchId],status,createdAt:'2026-11-19T00:00:00Z',
    execution:{concurrency:1,callTimeoutMs:45000},...extra,
  };
}

test('tasks keep only running batches and actionable unfinished configurations',()=>{
  const active=makeBatch('active','running');
  const paused=makeBatch('paused','paused');
  const held=makeBatch('held','pending',{runControls:{held:{state:'held'}}});
  const removed=makeBatch('removed','completed',{runControls:{removed:{state:'removed'}}});
  const cleared=makeBatch('cleared','pending');
  const completed=makeBatch('completed','completed');
  const original=makeBatch('original','paused');
  const replacement=makeBatch('replacement','pending',{supersedesBatchId:'original'});
  const work=taskBatches({
    activeBatchId:active.batchId,batches:[active,paused,held,removed,cleared,completed,original,replacement],
  },[
    makeRun('active','pending'),makeRun('paused','pending'),makeRun('held','pending'),
    makeRun('removed','pending'),makeRun('cleared','pending','cleared'),makeRun('completed','completed'),
    makeRun('original','pending'),makeRun('replacement','pending'),
  ]);
  assert.equal(work.active,active);
  assert.deepEqual(work.pending,[paused,held,removed,replacement]);
  assert.equal(work.runsFor(removed)[0]?.runId,'removed');
});

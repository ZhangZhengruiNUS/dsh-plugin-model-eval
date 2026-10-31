import test from 'node:test';import assert from 'node:assert/strict';
import {summarizeMetrics,activeMilliseconds} from '../../src/jobs/metrics.ts';
import type {AttemptRecord} from '../../src/history/store.ts';
test('unknown_usage_and_active_time_are_not_fabricated',()=>{
  const attempt=(id:string,available:boolean,status:AttemptRecord['status']='completed'):AttemptRecord=>({attemptId:id,phase:'answer',status,startedAt:'2026-01-01T00:00:00.000Z',endedAt:'2026-01-01T00:00:02.000Z',observations:{attemptId:id,itemId:'q',track:'general',phase:'answer',startedAt:'2026-01-01T00:00:00.000Z',endedAt:'2026-01-01T00:00:02.000Z',usage:available?{available:true,inputTokens:100,outputTokens:20,reasoningTokens:10,cacheReadTokens:50}:{available:false}}});
  const intervals=[{startedAt:'2026-01-01T00:00:00.000Z',endedAt:'2026-01-01T00:00:03.000Z'},{startedAt:'2026-01-02T00:00:00.000Z'}];
  const metrics=summarizeMetrics([attempt('a',true),attempt('b',false),attempt('c',true,'failed')],intervals);
  assert.equal(metrics.tracks.general!.answer.inputTokens,200);assert.equal(metrics.tracks.general!.answer.outputTokens,40);
  assert.equal(metrics.tracks.general!.answer.calls,3);assert.equal(metrics.tracks.general!.answer.failures,1);
  assert.equal(metrics.tracks.general!.answer.usageCoverage,2/3);assert.equal(metrics.tracks.general!.answer.latencyMedianMs,2000);
  assert.equal(metrics.tracks.general!.answer.ttftMedianMs,undefined);
  assert.equal(activeMilliseconds(metrics),3000);assert.equal(metrics.incompleteTiming,true);
  assert.equal(summarizeMetrics([attempt('a',false)],[]).tracks.general!.answer.inputTokens,undefined);
});
test('an interrupted dispatch retains its attempt count and unknown usage',()=>{
  const interrupted:AttemptRecord={attemptId:'started-before-crash',phase:'answer',status:'interrupted',startedAt:'2026-01-01',itemId:'q',track:'general'};
  const metrics=summarizeMetrics([interrupted],[]);assert.equal(metrics.tracks.general!.answer.calls,1);assert.equal(metrics.tracks.general!.answer.failures,1);assert.equal(metrics.tracks.general!.answer.usageCoverage,0);assert.equal(metrics.tracks.general!.answer.inputTokens,undefined);assert.equal(metrics.tracks.general!.answer.latencyMedianMs,undefined);
});

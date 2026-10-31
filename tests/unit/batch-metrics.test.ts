import test from 'node:test';import assert from 'node:assert/strict';
import {summarizeBatchMetrics,formatElapsed} from '../../src/client/batch-metrics.ts';import type {RunMetrics} from '../../src/contracts.ts';
const metrics=(start:string,end?:string):RunMetrics=>({tracks:{},activeIntervals:[{startedAt:start,...(end?{endedAt:end}:{})}],incompleteTiming:false});
test('batch wall time merges intervals and excludes pause, queued and offline gaps',()=>{
  const a=metrics('2026-01-01T00:00:00Z','2026-01-01T00:00:10Z'),b=metrics('2026-01-01T00:00:05Z','2026-01-01T00:00:15Z');
  b.activeIntervals.push({startedAt:'2026-01-01T00:01:00Z'});const now=Date.parse('2026-01-01T00:01:05Z');
  assert.equal(summarizeBatchMetrics([a,b],true,now).elapsedMs,20000);
  const paused=summarizeBatchMetrics([a,b],false,now+100000);assert.equal(paused.elapsedMs,15000);assert.equal(paused.incompleteTiming,true);
  assert.equal(formatElapsed(3661000),'01:01:01');assert.equal(formatElapsed(90061000),'25:01:01');
});
test('token totals include all tracks and judges without adding cache or reasoning twice',()=>{
  const a=metrics('2026-01-01T00:00:00Z','2026-01-01T00:00:10Z');
  a.tracks.general={answer:{calls:3,failures:1,usageCoverage:2/3,inputTokens:100,outputTokens:20,reasoningTokens:10,cacheReadTokens:50},judge:{calls:0,failures:0,usageCoverage:0},gradingMs:0};
  a.tracks.writing={answer:{calls:1,failures:0,usageCoverage:1,inputTokens:10,outputTokens:5},judge:{calls:1,failures:0,usageCoverage:1,inputTokens:30,outputTokens:2},gradingMs:0};
  const result=summarizeBatchMetrics([a,a],false,0);assert.equal(result.inputTokens,280);assert.equal(result.outputTokens,54);assert.equal(result.tokens,334);assert.equal(result.partialUsage,true);
  const unknown=metrics('2026-01-01T00:00:00Z');unknown.tracks.general={answer:{calls:1,failures:0,usageCoverage:0},judge:{calls:0,failures:0,usageCoverage:0},gradingMs:0};
  assert.equal(summarizeBatchMetrics([unknown],true,0).tokens,undefined);
  assert.equal(summarizeBatchMetrics([],false,0).tokens,undefined);
  a.tracks.general.answer={calls:1,failures:0,usageCoverage:1,inputTokens:0,outputTokens:0};delete a.tracks.writing;
  assert.equal(summarizeBatchMetrics([a],false,0).tokens,0);assert.equal(summarizeBatchMetrics([a],false,0).partialUsage,false);
});

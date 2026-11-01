import test from 'node:test';import assert from 'node:assert/strict';
import {buildComparison} from '../../src/client/comparison/model.ts';import {frontier,clusterPoints} from '../../src/client/comparison/geometry.ts';
import {comparisonRun as run,comparisonSnapshot as snapshot} from '../support/comparison-fixture.ts';
test('non-dominated frontier retains exact ties and rejects incomparable conditions',()=>{
  const runs=[run('A',90),run('B',90),run('C',89),run('D',91)];runs.forEach((r,i)=>r.metrics.tracks.general!.answer.latencyMedianMs=[10,10,11,20][i]!);
  const rows=buildComparison(snapshot(runs),'general')[0]!.rows;
  const keys=frontier(rows,'latencyMs');assert.deepEqual(rows.filter(r=>keys.includes(r.configKey)).map(r=>r.runId).sort(),['A','B','D']);
  assert.equal(clusterPoints(rows,'latencyMs').find(g=>g.rows.length===2)!.rows.length,2);
  rows[0]!.execution={state:'unknown'};assert.deepEqual(frontier(rows,'latencyMs'),[]);
  for(const r of runs)r.protocols.generalId='unrecognized';assert.deepEqual(frontier(buildComparison(snapshot(runs),'general')[0]!.rows,'latencyMs'),[]);
});
test('invalid coordinates are not plotted and a single best coordinate has no connecting frontier',()=>{
  const runs=[run('A',95),run('B',90),run('C',NaN)];runs[0]!.metrics.tracks.general!.answer.latencyMedianMs=1;runs[1]!.metrics.tracks.general!.answer.latencyMedianMs=2;runs[2]!.metrics.tracks.general!.answer.latencyMedianMs=Infinity;
  const rows=buildComparison(snapshot(runs),'general')[0]!.rows;assert.deepEqual(frontier(rows,'latencyMs'),[]);assert.equal(clusterPoints(rows,'latencyMs').length,2);
});

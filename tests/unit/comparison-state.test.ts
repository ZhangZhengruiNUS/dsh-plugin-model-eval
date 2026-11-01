import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileSelection,toggleSelection} from '../../src/client/comparison/state.ts';import {buildComparison} from '../../src/client/comparison/model.ts';
import {comparisonRun,comparisonSnapshot} from '../support/comparison-fixture.ts';
test('selection preserves manual choices on refresh but resets at protocol boundary',()=>{
  const runs=[comparisonRun('A',90),comparisonRun('B',80),comparisonRun('C',70),comparisonRun('D',60)];runs[1]!.metrics.tracks.general!.answer.latencyMedianMs=100;
  const rows=buildComparison(comparisonSnapshot(runs),'general')[0]!.rows,keys=rows.map(r=>r.configKey);
  let state=reconcileSelection(undefined,'scope',rows);assert.deepEqual(state.selected,[keys[0],keys[1]]);
  state=toggleSelection(state,keys[2]!);assert.equal(state.selected.length,3);assert.deepEqual(toggleSelection(state,keys[3]!),state);
  state=toggleSelection(state,state.baseline!);assert.equal(state.baseline,keys[1]);assert.deepEqual(reconcileSelection(state,'scope',rows),state);
  assert.deepEqual(reconcileSelection(state,'other',rows).selected,[keys[0],keys[1]]);
});

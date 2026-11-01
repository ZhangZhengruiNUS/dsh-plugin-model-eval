import test from 'node:test';import assert from 'node:assert/strict';
import {runInput,addHistoryPriors} from '../../src/estimation/inputs.ts';import {performanceConditionKey,emptyPerformance} from '../../src/estimation/observations.ts';import {reusedMetricsFixture} from '../support/reuse-metrics-fixture.ts';import {makeTierFixture} from '../support/tier-fixture.ts';import {selectProbeQuestions} from '../../src/speed/probe-set.ts';import {createProtocolRegistry} from '../../src/evaluation/registry.ts';import {resolve} from 'node:path';
test('upgrade_estimate_only_plans_remaining_280_and_never_borrows_other_tiers',()=>{
  const {f,imported,manifest,summary}=reusedMetricsFixture(),now='2026-11-01T02:00:00.000Z',input=runInput(manifest,summary,imported,'paused',now);
  assert.equal(input.jobs.length,280);assert.equal(input.activeElapsedMs,0);assert.equal(runInput(manifest,summary,imported,'paused','2026-11-02T02:00:00.000Z').activeElapsedMs,0);
  const keys=['light','deep','legacy'].map(t=>performanceConditionKey(f.current,makeTierFixture(t as any).descriptor.refs,input.execution));assert.equal(new Set(keys).size,3);
  const sample={sampleId:'old-light-sample',itemId:'old',conditionKey:keys[0]!,datasetId:input.jobs[0]!.datasetId,phase:'answer' as const,outcome:'completed' as const,startedAt:now,endedAt:now,durationMs:1000};
  assert.deepEqual(addHistoryPriors(input,[{...summary,performance:{...emptyPerformance(),samples:[sample]}}]).priorSamples,[]);
});
test('new_tier_probes_are_fixed_two_per_source_and_keep_full_question_budgets',async()=>{
  const registry=await createProtocolRegistry(resolve('.'));
  for(const descriptor of registry.list().filter(d=>d.general.tier!=='legacy')){
    const protocol=await registry.resolve(descriptor.refs),items=selectProbeQuestions(protocol,['general','writing']);assert.equal(items.length,10);assert.equal(selectProbeQuestions(protocol,['general']).length,8);
    for(const dataset of new Set(items.map(q=>q.datasetId)))assert.equal(items.filter(q=>q.datasetId===dataset).length,2);
    for(const q of items)assert.deepEqual(q,protocol.items.find(item=>item.id===q.id));
    const changed=structuredClone(protocol),selected=changed.items.find(q=>q.id===items[0]!.id)!;selected.prompt=[{role:'user',content:'changed'}];assert.throws(()=>selectProbeQuestions(changed,['general']),/PROBE_/);
  }
});

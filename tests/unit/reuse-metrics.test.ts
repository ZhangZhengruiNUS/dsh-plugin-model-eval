import test from 'node:test';import assert from 'node:assert/strict';
import type {RunSummary,ReuseOrigin} from '../../src/contracts.ts';import type {ItemRecord,RunManifest} from '../../src/history/store.ts';
import {reusedMetricsFixture} from '../support/reuse-metrics-fixture.ts';import {summarizeReuse} from '../../src/jobs/metrics.ts';import {rebuildRunSummary} from '../../src/evaluation/aggregate-run.ts';
test('separate_reused_general_consumption_from_new_work',()=>{
  const {f,origin,imported,manifest,summary}=reusedMetricsFixture(),ids=new Set(imported.map(i=>i.itemId));
  const newer:ItemRecord[]=f.deep.items.filter(q=>q.track==='general'&&!ids.has(q.id)).map((q,i)=>{const example=structuredClone(f.source.items[0]!);example.itemId=q.id;example.grade={kind:'scored',track:'general',itemId:q.id,passed:true,evidence:null};example.attempts=example.attempts.map(a=>({...a,attemptId:`new-${i}`,itemId:q.id,track:'general',observations:{...a.observations!,attemptId:`new-${i}`,itemId:q.id}}));return example;});
  const result=rebuildRunSummary(manifest,summary,[...imported,...newer]);
  assert.equal(result.metrics.tracks.general?.answer.totalTokens,70000);assert.equal(result.reuse?.sourceAnswerMetrics.totalTokens,30000);assert.equal(result.reuse?.reusedItems,120);assert.equal(result.metrics.tracks.writing,undefined);
  assert.deepEqual(result.reuse?.sourceActivity.tracks,['general','writing']);assert.deepEqual(result.metrics.activeIntervals,[]);assert.ok(!(result.performance?.samples??[]).some(s=>s.sampleId.startsWith('source-sample-')));
  // A source writing record is outside the reusable general-item set, even if it shared the original activity interval.
  const writing={...structuredClone(imported[0]!),itemId:'source-writing',attempts:[{...f.source.items[0]!.attempts[0]!,track:'writing' as const,observations:{...f.source.items[0]!.attempts[0]!.observations!,track:'writing' as const,usage:{available:true,totalTokens:5000}}}]};delete writing.reuse;
  assert.equal(summarizeReuse([...imported,writing],origin).sourceAnswerMetrics.totalTokens,30000);
  const unknown=structuredClone(imported);for(const item of unknown)for(const attempt of item.reuse!.sourceAttempts){if(attempt.observations)attempt.observations.usage={available:false};}
  assert.equal(summarizeReuse(unknown,origin).sourceAnswerMetrics.totalTokens,undefined);
});

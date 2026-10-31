import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createProtocolRegistry} from '../../src/evaluation/registry.ts';
import {questionCompatibility} from '../../src/evaluation/protocol-identity.ts';
import {makeTierFixture} from '../support/tier-fixture.ts';

test('resolve_legacy_and_nested_tiers_without_mutating_ready_resources',async()=>{
  const registry=await createProtocolRegistry(resolve('.'));
  const descriptors=registry.list(),legacy=await registry.resolve(descriptors.find(x=>x.general.tier==='legacy')!.refs);
  const light=await registry.resolve(descriptors.find(x=>x.general.tier==='light')!.refs);
  const deep=await registry.resolve(descriptors.find(x=>x.general.tier==='deep')!.refs);
  assert.equal(legacy.items.length,917);
  assert.equal(light.items.filter(q=>q.track==='general').length,120);
  assert.equal(deep.items.filter(q=>q.track==='general').length,400);
  assert.equal(light.items.filter(q=>q.track==='writing').length,12);
  for(const question of light.items){
    assert.deepEqual(question,deep.items.find(q=>q.id===question.id));
    assert.deepEqual(light.compatibility[question.id],deep.compatibility[question.id]);
  }
  assert.equal(light.descriptor.allowNewRuns,false,'unverified runtime must remain unavailable');
  await assert.rejects(registry.forNewRun(light.generalId),/PROTOCOL_NOT_VERIFIED/);
  await assert.rejects(registry.resolve({...light.descriptor.refs,resourceVersion:'unknown'}),/UNKNOWN_PROTOCOL/);
  const altered=registry.list() as any;altered[0].general.label='tampered';
  assert.notEqual(registry.list()[0]!.general.label,'tampered');
});

test('compatibility_covers_actual_messages_tests_and_runtime_but_not_tier_labels',()=>{
  const light=makeTierFixture('light'),deep=makeTierFixture('deep'),q=light.items[0]!;
  assert.deepEqual(light.compatibility[q.id],deep.compatibility[q.id]);
  const original=questionCompatibility(q,{extractor:'strict-v1'},{memoryBytes:512});
  assert.notEqual(questionCompatibility({...q,prompt:[{role:'user',content:'changed'}]},{extractor:'strict-v1'},{memoryBytes:512}).combinedHash,original.combinedHash);
  assert.notEqual(questionCompatibility({...q,grading:{answer:'changed'}},{extractor:'strict-v1'},{memoryBytes:512}).combinedHash,original.combinedHash);
  assert.notEqual(questionCompatibility(q,{extractor:'strict-v2'},{memoryBytes:512}).combinedHash,original.combinedHash);
  assert.notEqual(questionCompatibility(q,{extractor:'strict-v1'},{memoryBytes:1024}).combinedHash,original.combinedHash);
});

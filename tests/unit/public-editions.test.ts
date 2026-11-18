import assert from 'node:assert/strict';
import test from 'node:test';
import {generalReleaseName} from '../../src/client/protocol-editions.ts';
import {builtInReferences} from '../../src/client/comparison/reference-data.ts';
import {admittedNativeReference} from '../../src/client/comparison/native-reference.ts';
import {scopeKeyFor} from '../../src/client/comparison/model.ts';

test('current general editions show 1.0 and existing timed references keep their pinned identity', () => {
  const refs = builtInReferences.filter(ref => ref.nativeRun && ref.summary.tracks.general);
  assert.equal(refs.length, 2);
  for (const ref of refs) {
    const {summary,execution,nativeRun} = ref;
    assert(nativeRun && summary.generalDefinition);
    const light = summary.generalDefinition.tier === 'light';
    const short = light ? '轻量 1.0' : '深入 1.0';
    assert.equal(generalReleaseName(summary.protocols), short);
    assert.equal(generalReleaseName(summary.protocols,true), '通用能力评测 · '+short);
    assert.equal(summary.runId,light?'openai-gpt-6.2-astra-max-light-v1-1':'openai-gpt-6.2-astra-max-deep-v1-2');
    assert(admittedNativeReference(summary,execution,nativeRun));
    assert(!admittedNativeReference({...summary,runId:light?'openai-gpt-6.2-astra-max-light-v1-0':'openai-gpt-6.2-astra-max-deep-v1-0'},execution,nativeRun));
  }
  assert.notEqual(scopeKeyFor(refs[0]!.summary,'general'),scopeKeyFor(refs[1]!.summary,'general'));
});

test('archived general editions retain their old numbers with a distinct preview label', () => {
  const light={generalId:'general-task-five-v3-r3-light',resourceVersion:'task-five-v3-r3',writingId:'work-writing-12-v2'};
  const deep={...light,generalId:'general-task-five-v3-r3-deep'};
  const deepRevision={...deep,generalId:'general-task-five-original-v1-deep',resourceVersion:'task-five-original-v1'};
  assert.equal(generalReleaseName(light),'轻量 1.0（试用版）');
  assert.equal(generalReleaseName(deep),'深入 1.0（试用版）');
  assert.equal(generalReleaseName(deepRevision),'深入 1.1（试用版）');
});

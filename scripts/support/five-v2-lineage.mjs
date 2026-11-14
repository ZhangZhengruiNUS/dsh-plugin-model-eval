import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export function fiveV2Projection(catalog) {
  return {
    ...catalog,
    entries: catalog.entries.filter(entry => entry.refs.resourceVersion !== 'task-five-v2'),
    bundles: catalog.bundles.filter(bundle => bundle.id !== 'task-five-v2'),
  };
}

export function fiveV2AdmissionHash(catalog) {
  const entries = catalog.entries.filter(entry => entry.refs.resourceVersion === 'task-five-v2')
    .map(entry => ({...entry, allowNewRuns:false}));
  const bundle = catalog.bundles.find(entry => entry.id === 'task-five-v2');
  assert.ok(bundle);
  return createHash('sha256').update(JSON.stringify({entries, bundle:{...bundle, runtimePassed:false}})).digest('hex');
}

export function verifyFiveV2(catalog, get) {
  const entries = catalog.entries.filter(entry => entry.refs.resourceVersion === 'task-five-v2');
  const bundles = catalog.bundles.filter(bundle => bundle.id === 'task-five-v2');
  if (!entries.length && !bundles.length) return;
  assert.equal(entries.length, 2);
  assert.equal(bundles.length, 1);
  const [bundle] = bundles;
  for (const [tier, counts] of [['light',[20,8,20,8,8]], ['deep',[100,50,100,70,30]]]) {
    const entry = entries.find(candidate => candidate.general.tier === tier);
    assert.ok(entry);
    assert.equal(entry.bundleId, bundle.id);
    assert.equal(entry.allowNewRuns, bundle.runtimePassed);
    assert.equal(entry.refs.generalId, 'general-task-five-v2-' + tier);
    assert.equal(entry.refs.writingId, catalog.legacyRefs.writingId);
    assert.equal(entry.general.schema, 'task-five-v2');
    assert.equal(entry.general.executionPolicy, 'long-tasks-first-v1');
    assert.deepEqual(entry.general.domains.map(domain => domain.id), ['knowledge','reading','instructions','coding','tools']);
    assert.ok(entry.general.domains.every(domain => domain.weight === .2));
    assert.deepEqual(entry.general.domains.map(domain => domain.itemIds.length), counts);
    const ids = entry.general.domains.flatMap(domain => domain.itemIds);
    assert.equal(entry.questionCount, ids.length);
    assert.equal(new Set(ids).size, ids.length);
  }
  if (get) {
    const packedBundle = JSON.parse(get('resources/suites/task-five-v2/bundle.json'));
    assert.deepEqual(packedBundle, bundle);
    const questions = JSON.parse(get('resources/' + bundle.questionPath));
    const byId = new Map(questions.map(question => [question.id, question]));
    assert.equal(byId.size, questions.length);
    const [light, deep] = ['light', 'deep'].map(tier => entries.find(entry => entry.general.tier === tier));
    const deepIds = new Set(deep.general.domains.flatMap(domain => domain.itemIds));
    assert.ok(light.general.domains.every(domain => domain.itemIds.every(id => deepIds.has(id))));
    for (const domain of deep.general.domains) {
      for (const id of domain.itemIds) {
        const question = byId.get(id);
        assert.ok(question && question.track === 'general', id);
        if (domain.id === 'reading') assert.equal(question.grading.extractor, 'reading-choice-content-v2', id);
      }
    }
    const codeIds = entry => entry.general.domains.find(domain => domain.id === 'coding').itemIds;
    assert.ok(codeIds(light).includes('coding/code-contests-test/3'));
    assert.ok(!codeIds(light).includes('coding/code-contests-test/96'));
    assert.ok(codeIds(deep).includes('coding/code-contests-test/96'));
  }
  if (bundle.runtimePassed) {
    const admission = JSON.parse(get('resources/task-five-v2-admission.json'));
    assert.equal(admission.schemaVersion, 1);
    assert.match(admission.runtimeAcceptanceSha256, /^[a-f0-9]{64}$/);
    assert.equal(admission.status, 'passed');
    assert.equal(admission.scope, 'task-five-v2-product-runtime');
    assert.equal(admission.newProtocolSha256, fiveV2AdmissionHash(catalog));
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import type { TargetSnapshot } from '../../src/contracts.ts';
import { fingerprintTarget } from '../../src/model/identity.ts';
const baseline = (): TargetSnapshot => ({ scopeId: 'profile-1',providerId:'provider-A',modelId:'model-A',
  routeTarget:{state:'known',value:'https://example.test/v1',source:'adapter'},
  controls:{temperature:{state:'known',value:0,source:'user'},reasoning:{state:'unknown'}},
});
test('semantic_identity_preserves_unknown_and_route_changes', () => {
  const original=baseline(), explicit=baseline();
  explicit.controls.temperature={state:'known',value:0,source:'override'};
  assert.equal(fingerprintTarget(original),fingerprintTarget(explicit));
  assert.notDeepEqual(original,explicit);
  for (const state of [{state:'unknown'},{state:'unset'},{state:'known',value:null,source:'user'}] as const) {
    const changed=baseline();changed.controls.temperature=state;
    assert.notEqual(fingerprintTarget(original),fingerprintTarget(changed));
  }
  for (const mutate of [
    (x:TargetSnapshot)=>{x.modelId='model-a';},
    (x:TargetSnapshot)=>{x.providerId='provider-a';},
    (x:TargetSnapshot)=>{x.routeTarget={state:'known',value:'https://other.example.test/v1',source:'adapter'};},
    (x:TargetSnapshot)=>{x.deployment={value:'Q4-v2',source:'user'};},
  ]) {const changed=baseline();mutate(changed);assert.notEqual(fingerprintTarget(original),fingerprintTarget(changed));}
  const a=baseline(),b=baseline();
  a.controls.extra={state:'known',value:{b:2,a:1},source:'user'};
  b.controls.extra={state:'known',value:{a:1,b:2},source:'adapter'};
  assert.equal(fingerprintTarget(a),fingerprintTarget(b));
  a.controls.extra={state:'known',value:['a','b'],source:'user'};
  b.controls.extra={state:'known',value:['b','a'],source:'user'};
  assert.notEqual(fingerprintTarget(a),fingerprintTarget(b));
});
test('identity rejects credentials and non-JSON controls without echoing values', () => {
  for (const unsafe of [
    (x:TargetSnapshot)=>{x.controls.apiKey={state:'known',value:'private-example',source:'user'};},
    (x:TargetSnapshot)=>{x.routeTarget={state:'known',value:'https://user:private-example@example.test',source:'adapter'};},
    (x:TargetSnapshot)=>{x.routeTarget={state:'known',value:'https://example.test?api_key=private-example',source:'adapter'};},
    (x:TargetSnapshot)=>{x.controls.temperature={state:'known',value:NaN,source:'user'};},
  ]) {
    const changed=baseline();unsafe(changed);
    assert.throws(()=>fingerprintTarget(changed),error=>error instanceof Error && !error.message.includes('private-example'));
  }
});

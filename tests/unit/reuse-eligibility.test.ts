import test from 'node:test';import assert from 'node:assert/strict';
import {reuseFixture,reuseTarget} from '../support/reuse-fixture.ts';
import {checkUpgrade} from '../../src/evaluation/reuse-eligibility.ts';
import {reuseTargetBinding} from '../../src/model/reuse-identity.ts';
test('reuse_only_same_complete_light_configuration',()=>{
  const f=reuseFixture(),check=checkUpgrade(f.source,f.deep,f.current);
  assert.equal(check.eligible,true);assert.equal(check.reusedItems,120);assert.equal(check.newItems,280);
  assert.equal(f.source.items.filter(x=>x.grade?.kind==='scored'&&x.grade.track==='general'&&!x.grade.passed).length,60);
  const restarted=structuredClone(f.current);restarted.origin!.adapterInstance='new-process';restarted.origin!.adapterEpoch=9;
  assert.equal(checkUpgrade(f.source,f.deep,restarted).eligible,true,'stable settings evidence survives a host restart');
  for(const change of [
    (x:typeof f)=>{x.current.routeTarget={state:'known',value:'https://else.invalid/v1',source:'adapter'};},
    (x:typeof f)=>{x.current.controls.temperature={state:'known',value:.8,source:'override'};},
    (x:typeof f)=>{x.current.deployment={value:'q4-new',source:'user'};},
    (x:typeof f)=>{x.current.origin!.settingsRevision=8;},
    (x:typeof f)=>{x.current.origin!.settingsNs='another-source';},
    (x:typeof f)=>{x.current.routeTarget={state:'unknown'};},
    (x:typeof f)=>{x.current.controls.temperature={state:'unknown'};},
    (x:typeof f)=>{delete x.current.origin;},
    (x:typeof f)=>{x.source.summary.details='cleared';},
    (x:typeof f)=>{x.source.summary.tracks.general!.status='pending';},
    (x:typeof f)=>{x.source.items.pop();},
    (x:typeof f)=>{x.source.items[0]!.answer!.complete=false;},
    (x:typeof f)=>{x.source.items[0]!.question!.prompt[0]!.content='different sent message';},
    (x:typeof f)=>{x.deep.items.find(q=>q.id===x.source.items[0]!.itemId)!.prompt=[{role:'user',content:'changed prompt'}];},
    (x:typeof f)=>{x.deep.compatibility={...x.deep.compatibility,[x.source.items[0]!.itemId]:{...x.deep.compatibility[x.source.items[0]!.itemId]!,runtimeHash:'changed'}};},
    (x:typeof f)=>{x.source.protocol.descriptor.general={...x.source.protocol.descriptor.general,tier:'legacy'};},
  ]){const changed=reuseFixture();change(changed);const result=checkUpgrade(changed.source,changed.deep,changed.current);assert.equal(result.eligible,false);assert.ok(result.reasonCode);}
  for(const field of ['contentHash','promptHash','gradingHash','runtimeHash','combinedHash'] as const){const changed=reuseFixture(),id=changed.source.items[0]!.itemId;changed.deep.compatibility={...changed.deep.compatibility,[id]:{...changed.deep.compatibility[id]!,[field]:'different'}};assert.equal(checkUpgrade(changed.source,changed.deep,changed.current).eligible,false);}
});
test('reuse_binding_excludes_ephemeral_identity_and_rejects_secrets',()=>{
  const target=reuseTarget(),binding=reuseTargetBinding(target);assert.ok(binding);assert.ok(!JSON.stringify(binding.evidence).includes('ephemeral-a'));
  const secret=reuseTarget();secret.controls.apiKey={state:'known',value:'never-serialize-this',source:'user'};
  assert.equal(reuseTargetBinding(secret),undefined);
  assert.equal(reuseTargetBinding({...target,routeTarget:{state:'unknown'}}),undefined);
});

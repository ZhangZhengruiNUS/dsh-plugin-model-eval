import test from 'node:test';import assert from 'node:assert/strict';import {join,resolve} from 'node:path';
import {withTempRoot} from '../support/temp.ts';import {createEvaluationService} from '../../src/service.ts';import type {HostAdapter} from '../../src/contracts.ts';
test('service persists root selection, allows only configured handles, and unloads its writer',async()=>withTempRoot(async parent=>{
  let calls=0;const adapter:HostAdapter={async catalog(){return [{scopeId:'s',providerId:'p',modelId:'m',displayName:'model',capabilities:{}}];},async snapshot(choice){return {scopeId:choice.scopeId,providerId:choice.providerId,modelId:choice.modelId,routeTarget:{state:'unknown'},controls:{}};},async generateOnce(){calls++;throw new Error('must not call');}};
  const deps={adapter,scopeId:'s',packageResources:resolve('resources'),initialRoot:join(parent,'initial')};const service=await createEvaluationService(deps);
  assert.equal((await service.dispatch('status',{}) as any).prepared,false);
  await assert.rejects(service.dispatch('snapshot',{providerId:'p',modelId:'arbitrary'}),{code:'MODEL_NOT_CONFIGURED'});
  const config=await service.dispatch('snapshot',{providerId:'p',modelId:'m',deployment:'Q4'}) as any;assert.ok(config.handle);assert.equal(config.target.deployment.value,'Q4');
  await assert.rejects(service.dispatch('createBatch',{handles:[config.handle],tracks:['general'],execution:{concurrency:4,callTimeoutMs:300000}}),{code:'ENVIRONMENT_NOT_PREPARED'});assert.equal(calls,0);
  const changed=await service.dispatch('setRoot',{path:join(parent,'中文新目录')}) as any;assert.equal(changed.historyMoved,false);await service.dispose();
  const reopened=await createEvaluationService(deps);assert.equal((await reopened.dispatch('settings',{}) as any).rootPath,changed.rootPath);assert.equal((await reopened.dispatch('settings',{}) as any).writable,true);await reopened.dispose();
}));

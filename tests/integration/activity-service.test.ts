import {testEnvironment} from '../support/service-environment.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {join,resolve} from 'node:path';import {withTempRoot} from '../support/temp.ts';import {createEvaluationService} from '../../src/service.ts';import type {HostAdapter} from '../../src/contracts.ts';
test('service rejects competing mutation immediately while preparation owns activity',{timeout:120000},async()=>withTempRoot(async parent=>{
 const adapter:HostAdapter={async catalog(){return [];},async snapshot(){throw Error('unused');},async generateOnce(){throw Error('must not call');}};
 let release!:()=>void;const held=new Promise<void>(r=>release=r);
 const service=await createEvaluationService({adapter,scopeId:'activity',packageResources:resolve('resources'),initialRoot:join(parent,'root'),async prepareEnvironment(root){await held;return testEnvironment(root);}});
 try{const preparing=service.dispatch('prepare',{});await new Promise(r=>setTimeout(r,0));const status:any=await service.dispatch('status',{});assert.equal(status.activeActivity?.kind,'prepare');await assert.rejects(service.dispatch('setRoot',{path:join(parent,'other')}),{code:'ACTIVITY_BUSY'});release();await preparing;assert.equal((await service.dispatch('status',{}) as any).activeActivity,undefined);}finally{release();await service.dispose();}
}));

test('simultaneous preparation requests cannot silently queue into two real operations',async()=>withTempRoot(async parent=>{
 let release!:()=>void,calls=0;const hold=new Promise<void>(r=>release=r);const adapter:HostAdapter={async catalog(){return [];},async snapshot(){throw Error('unused');},async generateOnce(){throw Error('unused');}};
 const service=await createEvaluationService({adapter,scopeId:'race',packageResources:resolve('resources'),initialRoot:join(parent,'root'),async prepareEnvironment(root,descriptor){calls++;await hold;return {...testEnvironment(root),resourceVersion:descriptor?.refs.resourceVersion??testEnvironment(root).resourceVersion};}});
 const first=service.dispatch('prepare',{}),second=service.dispatch('prepare',{});const checked=assert.rejects(second,{code:'ACTIVITY_BUSY'});release();try{await first;await checked;const catalog=await service.dispatch('protocolCatalog',{}) as any[];assert.ok(catalog.filter(p=>p.descriptor.allowNewRuns).every(p=>p.prepared),'fixture must prepare every admitted version');const versions=new Set(catalog.filter(p=>p.descriptor.allowNewRuns).map(p=>p.descriptor.refs.resourceVersion));assert.equal(calls,versions.size,'one preparation per admitted resource version; a concurrent request cannot duplicate them');}finally{await service.dispose();}
}));

test('pause keeps activity reserved until a non-cooperating model actually settles',async()=>withTempRoot(async parent=>{
 let release!:()=>void,started!:()=>void;const held=new Promise<void>(r=>release=r),first=new Promise<void>(r=>started=r);
 const target:any={scopeId:'s',providerId:'p',modelId:'m',routeTarget:{state:'unknown'},controls:{}};
 const adapter:HostAdapter={async catalog(){return [{scopeId:'s',providerId:'p',modelId:'m',displayName:'m',capabilities:{}}];},async snapshot(){return target;},async generateOnce(input){started();await held;return {text:'',complete:false,truncated:false,observations:{...input.context,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:false}}};}};
 const service=await createEvaluationService({adapter,scopeId:'stop',packageResources:resolve('resources'),initialRoot:join(parent,'root'),prepareEnvironment:async root=>testEnvironment(root)});
 try{await service.dispatch('prepare',{});const {handle}=await service.dispatch('snapshot',{providerId:'p',modelId:'m'}) as any;const batch:any=await service.dispatch('createBatch',{handles:[handle],tracks:['general'],execution:{concurrency:1,callTimeoutMs:10000}});await first;const paused=service.dispatch('pause',{batchId:batch.batchId});await new Promise(r=>setTimeout(r,0));assert.equal((await service.dispatch('status',{}) as any).activeActivity?.state,'stopping');await assert.rejects(service.dispatch('prepare',{}),{code:'ACTIVITY_BUSY'});release();await paused;assert.equal((await service.dispatch('status',{}) as any).activeActivity,undefined);}finally{release();await service.dispose();}
}));

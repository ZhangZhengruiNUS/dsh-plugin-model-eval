import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import type {HostAdapter,Question,ProtocolSet,GradeResult} from '../../src/contracts.ts';
import {createQueue} from '../../src/jobs/queue.ts';
import {openHistory} from '../../src/history/store.ts';
import {switchRoot} from '../../src/resources/prepare.ts';
import {LEGACY_PROTOCOL_REFS} from '../../src/evaluation/definitions.ts';
import {makeTierFixture} from '../support/tier-fixture.ts';
import {fixtureRegistry,legacyFixtureSet} from '../support/fixture-registry.ts';
import {withTempRoot} from '../support/temp.ts';
const target={scopeId:'fixture',providerId:'fixture',modelId:'fixture',routeTarget:{state:'unknown' as const},controls:{}};

test('queue_resolves_each_manifest_and_never_sends_grading_metadata_to_models',{timeout:120000},async()=>withTempRoot(async parent=>{
  const {path}=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(path),light=makeTierFixture('light'),deep=makeTierFixture('deep');
  const legacyItems:Question[]=['tiny-mmlu','tiny-gsm8k','ifeval','humaneval-plus'].map((datasetId,i)=>({id:'old/'+i,track:'general',datasetId,sourceId:String(i),sourceHash:'fixture',prompt:[{role:'user',content:'Original legacy prompt '+i}],grading:{privateAnswer:'DO_NOT_SEND'}}));
  const legacy:ProtocolSet={...LEGACY_PROTOCOL_REFS,items:legacyItems},registry=fixtureRegistry([deep,light,legacyFixtureSet(legacy)]);let calls=0;const gradedRefs:string[]=[];
  const adapter:HostAdapter={async catalog(){return[];},async snapshot(){return target;},async generateOnce(input){calls++;assert.ok(!JSON.stringify(input).includes('DO_NOT_SEND'));return {text:'answer',complete:true,truncated:false,observations:{...input.context,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:false}}};}};
  const batchId='11111111-1111-4111-8111-111111111111';
  const old=await store.createRun({batchId,target,protocols:LEGACY_PROTOCOL_REFS,requiredItems:legacyItems.map(({id,track,datasetId})=>({id,track,datasetId}))});
  const oldFirst=legacyItems[0]!,answer={text:'saved',complete:true,truncated:false,observations:{attemptId:'old',itemId:oldFirst.id,track:'general' as const,phase:'answer' as const,startedAt:'2026-01-01T00:00:00Z',endedAt:'2026-01-01T00:00:01Z',usage:{available:false}}};
  await store.saveItem(old.runId,0,{itemId:oldFirst.id,answer,grade:{kind:'scored',track:'general',itemId:oldFirst.id,passed:true,evidence:null},attempts:[]});
  // Recover an old batch journal: no new default or current question set may replace its refs.
  const {writeRecord}=await import('../../src/history/atomic.ts');
  await writeRecord(join(path,'history/maintenance','batch-'+batchId+'.json'),{batchId,runIds:[old.runId],status:'paused',createdAt:new Date().toISOString(),execution:{concurrency:4,callTimeoutMs:1000}});
  const queue=createQueue(store,adapter,registry,{async general(q,a,signal,protocol){gradedRefs.push(protocol.generalId);assert.ok(protocol.items.some(x=>x.id===q.id));return {kind:'scored',track:'general',itemId:q.id,passed:true,evidence:null} as GradeResult;}});
  try{
    await queue.idle();assert.equal(calls,0);await queue.resume(batchId);await queue.idle();assert.equal(calls,3);assert.ok(gradedRefs.every(id=>id===legacy.generalId));
    const legacyBefore=(await store.getRun(old.runId)).summary;assert.equal(legacyBefore.tracks.general!.score,100);
    const batch=await queue.enqueue({generalId:light.generalId,targets:[target],tracks:['general'],execution:{concurrency:4,callTimeoutMs:1000}});await queue.idle();
    const run=await store.getRun(batch.runIds[0]!);assert.equal(run.summary.tracks.general!.required,120);assert.equal(run.summary.tracks.general!.score,100);assert.deepEqual(run.manifest.generalDefinition,light.descriptor.general);assert.deepEqual(run.summary.generalDefinition,light.descriptor.general);
    assert.equal(calls,123);assert.deepEqual((await store.getRun(old.runId)).summary.tracks.general,legacyBefore.tracks.general);
    await assert.rejects(queue.enqueue({generalId:'unknown',targets:[target],tracks:['general'],execution:{concurrency:1,callTimeoutMs:1000}}),/UNKNOWN_PROTOCOL/);assert.equal(calls,123);
  }finally{await queue.dispose();await store.close();}
}));

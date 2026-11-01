import test from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';import {readFileSync} from 'node:fs';
import type {HostAdapter,JudgeSnapshot,ProtocolSet,Question,TargetSnapshot} from '../../src/contracts.ts';
import {legacyFixtureRegistry} from '../support/fixture-registry.ts';
import {switchRoot} from '../../src/resources/prepare.ts';import {openHistory} from '../../src/history/store.ts';import {withTempRoot} from '../support/temp.ts';import {createQueue} from '../../src/jobs/queue.ts';import {createWritingGrader} from '../../src/writing/judge.ts';
const target=(modelId:string):TargetSnapshot=>({scopeId:'s',providerId:'p',modelId,controls:{},routeTarget:{state:'unknown'}});
test('switching judge fills only seven missing grades, preserving answers and general completion',async()=>withTempRoot(async parent=>{
  const {path:root}=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(root);
  const rubric=JSON.parse(readFileSync('resources/protocols/rubric-writing-v1.json','utf8'));
  const judge=(id:string):JudgeSnapshot=>({target:target(id),rubricId:rubric.id,promptId:rubric.promptId});
  const general:Question[]=['tiny-mmlu','tiny-gsm8k','ifeval','humaneval-plus'].map((datasetId,i)=>({id:'g'+i,track:'general',datasetId,sourceId:'fixture',sourceHash:'fixture',prompt:[{role:'user',content:'fixture'}],grading:null}));
  const writing:Question[]=Array.from({length:12},(_,i)=>({id:'w'+i,track:'writing',datasetId:'writing',sourceId:'fixture',sourceHash:'fixture',prompt:[{role:'user',content:'write'}],grading:null}));
  const protocols:ProtocolSet={items:[...general,...writing],generalId:'fixture',writingId:'fixture',resourceVersion:'fixture'};
  let old=0,newCalls=0,answers=0;
  const adapter:HostAdapter={async catalog(){return[];},async snapshot(){return target('answer');},async generateOnce(input){const obs={...input.context,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:false}};
    if(input.context.phase==='answer'){answers++;return {text:'report',complete:true,truncated:false,observations:obs};}
    if(input.target.modelId==='old'&&++old>5)return {text:'',complete:false,truncated:false,observations:obs,error:{code:'AUTH',phase:'config',retryable:false,message:'offline'}};
    if(input.target.modelId==='new')newCalls++;
    const dimensions=Object.fromEntries(['faithfulness','logic','coverage','concision','naturalness'].map(k=>[k,{score:3,reason:'report is clear',evidence:['report']}]));
    return {text:JSON.stringify({dimensions}),complete:true,truncated:false,observations:obs};}};
  const queue=createQueue(store,adapter,legacyFixtureRegistry(protocols),{async general(q){return {kind:'scored',track:'general',itemId:q.id,passed:true,evidence:null};},writing:createWritingGrader(rubric)},{clock:{async wait(){}}});
  const batch=await queue.enqueue({targets:[target('answer')],tracks:['general','writing'],judge:judge('old'),execution:{concurrency:1,callTimeoutMs:1000}});await queue.idle();
  const before=(await store.getRun(batch.runIds[0]!)).summary;assert.equal(before.tracks.general!.score,100);assert.equal(before.tracks.writing!.graded,5);
  // Remaining complete answers may be generated using the same original target; the saved sixth is reused.
  await queue.resume(batch.batchId,judge('new'));await queue.idle();
  const after=(await store.getRun(batch.runIds[0]!)).summary;assert.equal(newCalls,7);assert.equal(answers,16);
  assert.equal(after.tracks.writing!.score,75);assert.equal(after.tracks.general!.completedAt,before.tracks.general!.completedAt);
  assert.deepEqual(after.judges.map(x=>[x.snapshot.target.modelId,x.itemIds.length]),[['old',5],['new',7]]);
  assert.equal(after.judges[0]!.failedCalls,1);assert.equal(after.judges[0]!.calls,6);assert.equal(after.tracks.writing!.measures.logic!.score,3);
  assert.equal(after.metrics.incompleteTiming,false);
  await queue.dispose();await store.close();
}));

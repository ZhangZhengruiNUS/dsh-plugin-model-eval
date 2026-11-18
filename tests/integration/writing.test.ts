import test from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';import {readFileSync} from 'node:fs';
import type {HostAdapter,JudgeSnapshot,ProtocolSet,Question,TargetSnapshot} from '../../src/contracts.ts';
import {legacyFixtureRegistry} from '../support/fixture-registry.ts';
import {switchRoot} from '../../src/resources/prepare.ts';import {openHistory} from '../../src/history/store.ts';import {withTempRoot} from '../support/temp.ts';import {createQueue} from '../../src/jobs/queue.ts';import {createWritingGrader} from '../../src/writing/judge.ts';
const target=(modelId:string):TargetSnapshot=>({scopeId:'s',providerId:'p',modelId,controls:{},routeTarget:{state:'unknown'}});
test('writing-only ETA samples the first answer of every config before any judge call',async()=>withTempRoot(async parent=>{
  const {path}=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(path);
  const rubric=JSON.parse(readFileSync('resources/protocols/rubric-writing-v1.json','utf8'));
  const judge:JudgeSnapshot={target:target('judge'),rubricId:rubric.id,promptId:rubric.promptId};
  const items:Question[]=Array.from({length:12},(_,i)=>({id:'w'+i,track:'writing',datasetId:'writing',sourceId:'fixture',
    sourceHash:'fixture',prompt:[{role:'user',content:'fixture'}],grading:null}));
  const calls:string[]=[];
  const dimensions=Object.fromEntries(['faithfulness','logic','coverage','concision','naturalness']
    .map(name=>[name,{score:3,reason:'fixture',evidence:['report']}]));
  const host:HostAdapter={async catalog(){return[];},async snapshot(){return target('answer');},async generateOnce(input){
    calls.push(input.target.modelId+':'+input.context.itemId);
    return {text:input.context.phase==='answer'?'report':JSON.stringify({dimensions}),complete:true,truncated:false,
      observations:{...input.context,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:false}}};
  }};
  const queue=createQueue(store,host,legacyFixtureRegistry({items,generalId:'fixture',writingId:'fixture',resourceVersion:'fixture'}),
    {async general(){throw Error('unexpected general task');},writing:createWritingGrader(rubric)},{sampleMultiConfigEta:true});
  try{
    const batch=await queue.enqueue({targets:[target('first'),target('second')],tracks:['writing'],judge,execution:{concurrency:1,callTimeoutMs:1000}});
    await queue.idle();
    assert.deepEqual(calls.slice(0,3),['first:w0','second:w0','judge:w0']);
    assert.equal(calls.filter(x=>x==='first:w0'||x==='second:w0').length,2);
    assert.equal(calls.length,48);
    assert.equal(queue.snapshot().batches[0]?.status,'completed');
    for(const id of batch.runIds){
      const item=await store.getItem(id,'w0');
      assert.deepEqual(item?.attempts.map(a=>a.phase),['answer','judge']);
      assert.equal(item?.grade?.kind,'scored');
      assert.ok(queue.snapshot().batches[0]?.etaSamples?.[id]);
    }
  }finally{await queue.dispose();await store.close();}
}));
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

for(const issue of ['invalid-json','opaque-stream','judge-protocol'] as const)
test('single-item judge deferral: '+issue,async()=>withTempRoot(async parent=>{
  const {path}=await switchRoot(join(parent,'root'),{writing:false});
  const rubric=JSON.parse(readFileSync('resources/protocols/rubric-writing-v1.json','utf8'));
  const judge:JudgeSnapshot={target:target('judge'),rubricId:issue==='judge-protocol'?'unknown':rubric.id,promptId:rubric.promptId};
  const general:Question[]=['tiny-mmlu','tiny-gsm8k','ifeval','humaneval-plus'].map((datasetId,i)=>({id:'g'+i,track:'general',datasetId,sourceId:'fixture',sourceHash:'fixture',prompt:[{role:'user',content:'sample'}],grading:null}));
  const writing:Question[]=['w0','w1','w2'].map(id=>({id,track:'writing',datasetId:'writing',sourceId:id,sourceHash:'fixture',prompt:[{role:'user',content:'write'}],grading:null}));
  const registry=legacyFixtureRegistry({items:[...general,...writing],generalId:'fixture',writingId:'fixture',resourceVersion:'fixture'});
  const grader=createWritingGrader(rubric);
  const calls:string[]=[];
  let recover=false,retryableFailureOnResume=false;
  const adapter:HostAdapter={
    async catalog(){return [];},
    async snapshot(){return target('answer');},
    async generateOnce(input){
      const {itemId,phase}=input.context;
      calls.push(phase+':'+itemId);
      if(itemId==='w1'&&phase==='answer')assert.ok(queue.activeWork(queue.snapshot().activeBatchId!)?.deferred.get(queue.snapshot().batches[0]!.runIds[0]!)?.has('w0'));
      if(itemId==='w0'&&phase==='judge'&&(retryableFailureOnResume||recover))assert.equal(queue.activeWork(queue.snapshot().activeBatchId!)?.excludesDeferredWork,false);
      const observations={...input.context,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:true,inputTokens:3,outputTokens:1,totalTokens:4}};
      if(phase==='answer')return {text:'report',complete:true,truncated:false,observations};
      if(itemId==='w0'&&!recover){
        if(issue==='invalid-json')return {text:'{',complete:true,truncated:false,observations};
        if(retryableFailureOnResume)return {text:'',complete:false,truncated:false,observations,
          error:{code:'UPSTREAM_ERROR',phase:'judge',retryable:true,message:'fixture overload',status:529}};
        return {text:'',complete:false,truncated:false,observations:{...observations,firstContentAt:observations.startedAt,streamFinishReason:'error',textReceived:false},
          error:{code:'UPSTREAM_ERROR',retryable:false,phase:'judge',message:'fixture interruption',upstream:{codes:['PI_AI_ERROR'],finishReason:'network_error'}}};
      }
      const dimensions=Object.fromEntries(['faithfulness','logic','coverage','concision','naturalness'].map(k=>[k,{score:3,reason:'fixture',evidence:[]}]));
      return {text:JSON.stringify({dimensions}),complete:true,truncated:false,observations};
    },
  };
  const graders={async general(q:Question){return {kind:'scored' as const,track:'general' as const,itemId:q.id,passed:true,evidence:null};},writing:grader};
  let store=await openHistory(path);
  let queue=createQueue(store,adapter,registry,graders,{clock:{async wait(){}}});
  try{
    const batch=await queue.enqueue({targets:[target('answer')],tracks:['writing'],judge,execution:{concurrency:1,callTimeoutMs:1000}});
    const runId=batch.runIds[0]!;
    await queue.idle();
    if(issue==='judge-protocol'){
      assert.deepEqual(calls,[]);
      assert.equal(queue.snapshot().batches[0]?.lastError?.code,'JUDGE_PROTOCOL_CHANGED');
      assert.equal(queue.snapshot().batches[0]?.pendingItems?.length??0,0);
      return;
    }
    if(issue==='opaque-stream'){
      assert.deepEqual(calls,['answer:w0','judge:w0']);
      assert.equal(queue.snapshot().batches[0]?.lastError?.code,'UPSTREAM_ERROR');
      await queue.resume(batch.batchId);await queue.idle();
    }
    assert.equal(calls.filter(x=>x==='judge:w0').length,issue==='invalid-json'?3:2);
    const before=await store.getItem(runId,'w0');
    assert.equal(before?.answer?.complete,true);
    if(issue==='opaque-stream'){
      const judgeAttempts=before?.attempts.filter(a=>a.phase==='judge')??[];
      assert.equal(judgeAttempts.length,2);
      assert.ok(judgeAttempts.every(a=>a.observations?.streamFinishReason==='error'&&
        a.observations.textReceived===false&&a.error?.upstream?.finishReason==='network_error'));
    }
    assert.equal((await store.getRun(runId)).summary.tracks.writing?.graded,2);
    const pending=queue.snapshot().batches[0]!;
    assert.equal(pending.status,'pending');
    assert.deepEqual(pending.pendingItems?.map(x=>[x.itemId,x.error.code]),[['w0','JUDGE_ITEM_PENDING']]);
    assert.equal(pending.runControls,undefined);
    await queue.dispose();await store.close();
    store=await openHistory(path);
    queue=createQueue(store,adapter,registry,graders,{clock:{async wait(){}}});
    await queue.idle();
    assert.equal(queue.snapshot().batches[0]?.pendingItems?.[0]?.itemId,'w0');
    assert.deepEqual(await store.getItem(runId,'w0'),before);
    retryableFailureOnResume=true;
    const beforeFailedResume=calls.length;
    await queue.resume(batch.batchId);await queue.idle();
    assert.deepEqual(calls.slice(beforeFailedResume),['judge:w0']);
    const failedResume=await store.getItem(runId,'w0');
    assert.deepEqual(failedResume?.attempts.slice(0,-1),before?.attempts);
    assert.deepEqual(failedResume?.answer,before?.answer);
    assert.equal(failedResume?.attempts.at(-1)?.performance?.automaticRetry,false);
    assert.equal(queue.snapshot().batches[0]?.status,'pending');
    assert.deepEqual(queue.snapshot().batches[0]?.pendingItems?.map(x=>[x.itemId,x.error.code]),[['w0','JUDGE_ITEM_PENDING']]);
    const earlierCalls=calls.length;recover=true;
    await queue.resume(batch.batchId);await queue.idle();
    assert.deepEqual(calls.slice(earlierCalls),['judge:w0']);
    assert.equal((await store.getItem(runId,'w0'))?.grade?.kind,'scored');
    assert.deepEqual((await store.getItem(runId,'w0'))?.answer,before?.answer);
    assert.deepEqual((await store.getItem(runId,'w0'))?.attempts.slice(0,-1),failedResume?.attempts);
    assert.equal(queue.snapshot().batches[0]?.status,'completed');
    assert.equal(queue.snapshot().batches[0]?.pendingItems?.length,0);
  }finally{await queue.dispose();await store.close();}
}));


import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {captureUpstreamDiagnostic} from '../../src/host/upstream-error.ts';
import {createHostAdapter} from '../../src/host/adapter.ts';
import type {GeneratedAnswer, HostAdapter, Question, TargetSnapshot} from '../../src/contracts.ts';
import {openHistory} from '../../src/history/store.ts';
import {createQueue, type EvaluationQueue, type GradeServices} from '../../src/jobs/queue.ts';
import {switchRoot} from '../../src/resources/prepare.ts';
import {legacyFixtureRegistry} from '../support/fixture-registry.ts';
import {withTempRoot} from '../support/temp.ts';
import {performanceConditionKey} from '../../src/estimation/observations.ts';
import {validateEnvelope} from '../../src/host/api.ts';

const target=(modelId:string):TargetSnapshot=>({providerId:'fixture',modelId,scopeId:'fixture',routeTarget:{state:'unknown'},controls:{}});
const questions:Question[]=['tiny-mmlu','tiny-gsm8k','ifeval','humaneval-plus'].map((datasetId,index)=>({
  id:'q'+index,datasetId,track:'general',sourceId:'fixture',sourceHash:'fixture',prompt:[{role:'user',content:'fixture'}],grading:null,
}));
const registry=legacyFixtureRegistry({generalId:'general',writingId:'writing',resourceVersion:'test',items:questions});
const grade:GradeServices['general']=async q=>({kind:'scored',track:'general',itemId:q.id,passed:true,evidence:null});
const request={targets:[target('first'),target('second')],tracks:['general' as const],execution:{concurrency:1 as const,callTimeoutMs:10000,failurePolicy:'output-idle-v1' as const}};
type Input=Parameters<HostAdapter['generateOnce']>[0];
const response=(input:Input,reject=false):GeneratedAnswer=>({
  text:reject?'':'answer',complete:!reject,truncated:false,
  observations:{...input.context,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:true,inputTokens:2,outputTokens:3,totalTokens:5}},
  ...(reject?{error:{code:'INVALID_REQUEST',phase:'config' as const,retryable:false,message:'request refused',
    upstream:captureUpstreamDiagnostic({code:'INVALID_REQUEST',message:'400: {"code":"InvalidParameter.InvalidValue","request_id":"req_fixture_example_123","message":"max_tokens cannot exceed 12288 (Authorization: fixture-secret-do-not-store)","prompt":"sensitive fixture text"}'})!}}:{}),
});
function adapter(generate:HostAdapter['generateOnce']):HostAdapter {
  return {async catalog(){return [];},async snapshot(){return target('fixture');},generateOnce:generate};
}
function deferred(){
  let resolve!:()=>void;
  const promise=new Promise<void>(done=>{resolve=done;});
  return {promise,resolve};
}
function view(queue:EvaluationQueue){return queue.snapshot().batches[0]!;}

test('multi-config ETA samples one official item per configuration, persists it, and resumes without re-answering',async()=>withTempRoot(async directory=>{
  const {path}=await switchRoot(join(directory,'data'),{writing:false});
  let store=await openHistory(path);
  const entered=deferred();
  const calls:string[]=[],settled:string[]=[];
  let waiting=true;
  const host=adapter(async input=>{
    const id=input.target.modelId+':'+input.context.itemId;
    calls.push(id);
    if(id==='second:q0'&&waiting){
      entered.resolve();
      if(!input.signal.aborted)await new Promise<void>(resolve=>input.signal.addEventListener('abort',()=>resolve(),{once:true}));
    }
    return response(input);
  });
  const options={sampleMultiConfigEta:true,async onTimingRunSettled(ctx:{runId:string}){settled.push(ctx.runId);}};
  let queue=createQueue(store,host,registry,{general:grade},options);
  try{
    const batch=await queue.enqueue(request),[first,second]=batch.runIds as [string,string];
    await entered.promise;
    assert.deepEqual(calls,['first:q0','second:q0']);
    assert.deepEqual(settled,[]);
    const sampling=queue.activeWork(batch.batchId)?.sampling;
    assert.equal(sampling?.ready,1);
    assert.equal(sampling?.total,2);
    assert.ok(sampling?.answerMs[first]);
    const saved=await store.getItem(first,'q0');
    assert.equal(saved?.grade?.kind,'scored');
    await queue.pause(batch.batchId);
    assert.equal(view(queue).status,'paused');
    assert.equal(queue.activeWork(batch.batchId),undefined);
    await queue.dispose();await store.close();
    store=await openHistory(path);
    await store.recover();
    queue=createQueue(store,host,registry,{general:grade},options);
    waiting=false;
    await queue.resume(batch.batchId);
    await queue.idle();
    assert.deepEqual(calls,['first:q0','second:q0','second:q0','first:q1','first:q2','first:q3','second:q1','second:q2','second:q3']);
    assert.equal(view(queue).status,'completed');
    assert.ok(view(queue).etaSamples?.[first]&&view(queue).etaSamples?.[second]);
    assert.deepEqual(await store.getItem(first,'q0'),saved);
    assert.deepEqual(settled,[first,second]);
    assert.equal((await store.getRun(first)).summary.metrics.activeIntervals.length,2);
  }finally{await queue.dispose();await store.close();}
}));

test('a deferred first question holds only its configuration and can be explicitly resumed',async()=>withTempRoot(async directory=>{
  const {path}=await switchRoot(join(directory,'data'),{writing:false});
  const store=await openHistory(path);
  const calls:string[]=[];
  let reject=true;
  const queue=createQueue(store,adapter(async input=>{
    const id=input.target.modelId+':'+input.context.itemId;
    calls.push(id);
    const value=response(input);
    if(reject&&id==='first:q0')return {...value,complete:false,error:{code:'OBSERVED_OUTPUT_TIMEOUT',
      phase:'answer',retryable:false,message:'fixture timeout'}};
    return value;
  }),registry,{general:grade},{sampleMultiConfigEta:true});
  try{
    const batch=await queue.enqueue(request),[first,second]=batch.runIds as [string,string];
    await queue.idle();
    assert.deepEqual(calls,['first:q0','second:q0','second:q1','second:q2','second:q3']);
    assert.equal(view(queue).runControls?.[first]?.state,'held');
    assert.equal(view(queue).pendingItems?.[0]?.error.code,'OBSERVED_OUTPUT_TIMEOUT');
    assert.ok(view(queue).etaSamples?.[second]);
    reject=false;
    await queue.controlRun(batch.batchId,first,'resume',true);
    await queue.idle();
    assert.deepEqual(calls.slice(5),['first:q0','first:q1','first:q2','first:q3']);
    assert.equal(view(queue).status,'completed');
  }finally{await queue.dispose();await store.close();}
}));

test('one rejected configuration is held, later models finish, and rejoin never reruns a graded item',async()=>withTempRoot(async directory=>{
  const {path}=await switchRoot(join(directory,'data'),{writing:false});
  const store=await openHistory(path);
  const entered=deferred(),release=deferred();
  const calls:string[]=[];
  let reject=true;
  const q=createQueue(store,adapter(async input=>{
    const id=input.target.modelId+':'+input.context.itemId;
    calls.push(id);
    if(id==='second:q0'){entered.resolve();await release.promise;}
    return response(input,reject&&id==='first:q1');
  }),registry,{general:grade});
  try{
    const batch=await q.enqueue(request),[first,second]=batch.runIds as [string,string];
    await entered.promise;
    assert.equal(view(q).runControls?.[first]?.state,'held');
    assert.equal(view(q).runControls?.[first]?.itemId,'q1');
    assert.equal(view(q).runControls?.[first]?.error?.code,'INVALID_REQUEST');
    assert.equal(view(q).lastError,undefined);
    assert.equal(view(q).activeRunId,second);
    assert.deepEqual(q.activeWork(batch.batchId)?.runIds,[second]);
    assert.equal(q.activeWork(batch.batchId)?.excludesDeferredWork,true);
    const graded=await store.getItem(first,'q0'),failed=await store.getItem(first,'q1');
    const firstAttempt=failed!.attempts[0]!;
    const diagnostic=firstAttempt.error?.upstream;
    assert.deepEqual(diagnostic,{codes:['INVALID_REQUEST','InvalidParameter.InvalidValue'],httpStatus:400,statusFromMessage:true,
      requestId:'req_fixture_example_123',detail:'max_tokens cannot exceed 12288',detailFiltered:true});
    assert.equal(view(q).runControls?.[first]?.error?.upstream,undefined);
    const key=(id:string)=>createHash('sha256').update(id).digest('hex')+'.json';
    for(const file of [join('attempts',key(firstAttempt.attemptId)),join('items',key('q1'))]){
      const saved=await readFile(join(path,'history','runs',first,'details',file),'utf8');
      assert.match(saved,/req_fixture_example_123/);
      assert.match(saved,/InvalidParameter\.InvalidValue/);
      assert.doesNotMatch(saved,/Authorization|fixture-secret-do-not-store|sensitive fixture text/);
    }
    await q.controlRun(batch.batchId,first,'remove',false);
    assert.equal(view(q).runControls?.[first]?.state,'removed');
    assert.deepEqual(view(q).runIds,[first,second]);
    assert.deepEqual(await store.getItem(first,'q0'),graded);
    await assert.rejects(q.controlRun(batch.batchId,first,'resume',false),{code:'RUN_CONTROL_STALE'});
    reject=false;
    await q.controlRun(batch.batchId,first,'rejoin',false);
    assert.deepEqual(q.activeWork(batch.batchId)?.runIds,[first,second]);
    assert.equal(q.activeWork(batch.batchId)?.excludesDeferredWork,false);
    release.resolve();
    await q.idle();
    assert.deepEqual(calls,['first:q0','first:q1','second:q0','second:q1','second:q2','second:q3','first:q1','first:q2','first:q3']);
    assert.equal(view(q).status,'completed');
    assert.equal(q.activeWork(batch.batchId),undefined);
    assert.deepEqual(await store.getItem(first,'q0'),graded);
    const attempts=(await store.getItem(first,'q1'))!.attempts;
    assert.deepEqual(attempts[0],failed!.attempts[0]);
    assert.equal(attempts[0]!.observations?.usage.totalTokens,5);
    assert.equal((await store.getRun(first)).summary.tracks.general?.graded,4);
  }finally{release.resolve();await q.dispose();await store.close();}
}));

test('holding a running configuration cancels only its own work, survives reload, and can resume',async()=>withTempRoot(async directory=>{
  const {path}=await switchRoot(join(directory,'data'),{writing:false});
  let store=await openHistory(path);
  let q:EvaluationQueue;
  const entered=deferred();
  const calls:string[]=[];
  let waitForHold=true;
  const host=adapter(async input=>{
    const id=input.target.modelId+':'+input.context.itemId;
    calls.push(id);
    if(waitForHold&&id==='first:q1'){
      entered.resolve();
      if(!input.signal.aborted)await new Promise<void>(resolve=>input.signal.addEventListener('abort',()=>resolve(),{once:true}));
    }
    return response(input);
  });
  q=createQueue(store,host,registry,{general:grade});
  try{
    const batch=await q.enqueue(request),[first,second]=batch.runIds as [string,string];
    await entered.promise;
    await q.controlRun(batch.batchId,first,'hold',false);
    await q.idle();
    const graded=await store.getItem(first,'q0');
    assert.equal((await store.getItem(first,'q1'))!.attempts[0]!.status,'interrupted');
    assert.equal((await store.getRun(second)).summary.tracks.general?.graded,4);
    assert.equal(view(q).status,'pending');
    assert.deepEqual(view(q).runControls?.[first],{state:'held'});
    await q.dispose();await store.close();
    store=await openHistory(path);await store.recover();
    q=createQueue(store,host,registry,{general:grade});
    await q.idle();
    assert.deepEqual(view(q).runControls?.[first],{state:'held'});
    assert.equal(calls.length,6);
    waitForHold=false;
    await q.controlRun(batch.batchId,first,'resume',true);
    await q.idle();
    assert.equal(view(q).status,'completed');
    assert.equal(calls.length,9);
    assert.deepEqual(await store.getItem(first,'q0'),graded);
  }finally{await q.dispose();await store.close();}
}));

test('a sibling grader cancelled by a rejected call does not pause later configurations',async()=>withTempRoot(async directory=>{
  const {path}=await switchRoot(join(directory,'data'),{writing:false});
  const store=await openHistory(path);
  const grading=deferred();
  const calls:string[]=[];
  let cancelFirstGrade=true;
  const q=createQueue(store,adapter(async input=>{
    const model=input.target.modelId,id=input.context.itemId;
    calls.push(model+':'+id);
    if(model==='first'&&id==='q1'){await grading.promise;return response(input,true);}
    return response(input);
  }),registry,{async general(question,answer,signal,protocol){
    if(cancelFirstGrade&&question.id==='q0'){
      cancelFirstGrade=false;
      grading.resolve();
      if(!signal.aborted)await new Promise<void>(done=>signal.addEventListener('abort',()=>done(),{once:true}));
      return {kind:'technical-missing',track:'general',itemId:question.id,
        error:{code:'CANCELLED',phase:'grader',retryable:false,message:'Cancelled by run'},evidence:null};
    }
    return grade(question,answer,signal,protocol);
  }});
  try{
    const batch=await q.enqueue({...request,execution:{...request.execution,concurrency:2}});
    const [first,second]=batch.runIds as [string,string];
    await q.idle();
    assert.equal(view(q).runControls?.[first]?.error?.code,'INVALID_REQUEST');
    assert.equal(view(q).lastError,undefined);
    assert.equal((await store.getItem(first,'q0'))?.answer?.complete,true);
    assert.equal((await store.getRun(second)).summary.tracks.general?.graded,4);
    assert.equal(calls.filter(call=>call.startsWith('second:')).length,4);
  }finally{await q.dispose();await store.close();}
}));

test('local storage failure stops dispatch for the entire batch',async()=>withTempRoot(async directory=>{
  const {path}=await switchRoot(join(directory,'data'),{writing:false});
  const store=await openHistory(path);
  const save=store.saveItem.bind(store),calls:string[]=[];
  store.saveItem=async(...args)=>{
    if(args[2].itemId==='q1')throw Object.assign(Error('write failed'),{code:'EIO'});
    return save(...args);
  };
  const q=createQueue(store,adapter(async input=>{
    calls.push(input.target.modelId);return response(input);
  }),registry,{general:grade});
  try{
    await q.enqueue(request);await q.idle();
    assert.deepEqual(calls,['first']);
    assert.equal(view(q).lastError?.code,'EIO');
    assert.equal(view(q).runControls,undefined);
  }finally{await q.dispose();await store.close();}
}));

test('configuration operations accept only an explicit action and both IDs',()=>{
  const id='00000000-0000-4000-8000-000000000000';
  const payload={batchId:id,runId:id,operation:'remove'};
  const envelope={schemaVersion:1,requestId:'fixture',action:'controlRun',payload};
  assert.deepEqual(validateEnvelope(envelope),envelope);
  for(const invalid of [{batchId:id,operation:'remove'},{...payload,operation:'delete'},{...payload,force:true}]){
    assert.throws(()=>validateEnvelope({...envelope,payload:invalid}),{code:'INVALID_REQUEST'});
  }
});


test('prepare failures cannot persist unrecognized credential-shaped error codes',async()=>withTempRoot(async directory=>{
  const {path}=await switchRoot(join(directory,'data'),{writing:false});
  const store=await openHistory(path);
  const q=createQueue(store,adapter(async()=>{
    throw Object.assign(new Error('authentication failed at https://private.example'),{code:'AUTH_PRIVATE_CREDENTIAL_123456'});
  }),registry,{general:grade});
  try{
    const batch=await q.enqueue({...request,targets:[request.targets[0]!]});
    await q.idle();
    const runId=batch.runIds[0]!;
    const item=await store.getItem(runId,'q0');
    assert.equal(view(q).runControls?.[runId]?.state,'held');
    assert.equal(item?.attempts[0]?.error?.code,'CALL_FAILED');
    assert.equal(item?.attempts[0]?.error?.phase,'config');
    assert.equal(item?.attempts[0]?.error?.upstream?.detail,'authentication failed');
    assert.doesNotMatch(JSON.stringify([view(q),item]),/PRIVATE_CREDENTIAL|private\.example/);
  }finally{await q.dispose();await store.close();}
}));

for(const cause of ['overload','transport'] as const)
test(cause+' retries individual calls and holds only the configuration that exhausts retries',async()=>withTempRoot(async directory=>{
  const {path}=await switchRoot(join(directory,'data'),{writing:false});
  const store=await openHistory(path);
  const waits:number[]=[],calls:string[]=[];
  let firstCalls=0;
  const host=createHostAdapter({
    scopeId:'fixture',settings:{describe:()=>[]},
    llm:{
      listProviders:()=>[{id:'fixture'}],
      listModels:async()=>[{id:'first'},{id:'second'}],
      listConfigurableProviders:()=>[],
      async prepareCall(config){
        return {config,async *stream(){
          calls.push(config.model);
          const index=config.model==='first'?++firstCalls:0;
          yield {type:'usage',usage:{inputTokens:5,outputTokens:0,totalTokens:5}};
          if(index===2||index>=4){
            const failure=cause==='transport'?{code:'TRANSPORT',message:'connection closed'}:
              {code:'SERVER',message:'529 {"error":{"type":"overloaded_error"},"request_id":"req_fixture_overload_'+index+'"}'};
            yield {type:'finish',reason:{kind:'error',failure}};
          }else{
            yield {type:'text-delta',index:0,text:'answer'};
            yield {type:'finish',reason:{kind:'stop'}};
          }
        }};
      },
    },
  });
  const queue=createQueue(store,host,registry,{general:grade},{clock:{async wait(ms){waits.push(ms);}}});
  try{
    const choices=await host.catalog();
    const targets=await Promise.all(choices.map(c=>host.snapshot(c,{})));
    const started=await queue.enqueue({...request,targets});
    const [first,second]=started.runIds as [string,string];
    await queue.idle();
    assert.deepEqual(calls,['first','first','first','first','first','first','second','second','second','second']);
    assert.deepEqual(waits,[2000,2000,5000]);
    const batch=view(queue);
    assert.equal(batch.status,'pending');
    assert.equal(batch.lastError,undefined);
    assert.equal(batch.runControls?.[first]?.state,'held');
    assert.equal(batch.runControls?.[first]?.itemId,'q2');
    assert.equal(batch.runControls?.[first]?.error?.upstreamCause,cause);
    assert.equal(batch.runControls?.[second],undefined);
    assert.equal((await store.getRun(first)).summary.tracks.general?.graded,2);
    assert.equal((await store.getRun(second)).summary.tracks.general?.graded,4);
    const successfulRetry=(await store.getItem(first,'q1'))!;
    assert.equal(successfulRetry.grade?.kind,'scored');
    assert.deepEqual(successfulRetry.attempts.map(a=>a.status),['failed','completed']);
    const exhausted=(await store.getItem(first,'q2'))!;
    assert.deepEqual(exhausted.attempts.map(a=>a.retryIndex),[0,1,2]);
    assert.deepEqual(exhausted.attempts.map(a=>a.error?.upstreamCause),[cause,cause,cause]);
    assert.deepEqual(exhausted.attempts.map(a=>a.error?.upstream?.httpStatus),cause==='overload'?[529,529,529]:[undefined,undefined,undefined]);
    assert.deepEqual(exhausted.attempts.map(a=>a.performance?.automaticRetry),[true,true,false]);
    assert.deepEqual(exhausted.attempts.map(a=>a.observations?.usage.totalTokens),[5,5,5]);
  }finally{await queue.dispose();await store.close();}
}));

test('existing held rows recover only the matching terminal cause and do not rewrite prior records',async()=>withTempRoot(async directory=>{
  const {path}=await switchRoot(join(directory,'data'),{writing:false});
  let store=await openHistory(path);
  let queue:EvaluationQueue;
  const oldFailures:Record<string,NonNullable<GeneratedAnswer['error']>['upstream']>={
    overloaded:{codes:['SERVER','overloaded_error'],httpStatus:529,statusFromMessage:true},
    transport:{codes:['TRANSPORT']},
    unknown:{codes:['PI_AI_ERROR']},
    superseded:{codes:['TRANSPORT']},
  };
  const oldAdapter=adapter(async input=>({
    ...response(input,true),text:input.target.modelId==='unknown'?'partial answer':'',
    error:{code:'UPSTREAM_ERROR',phase:'answer',message:'old summary',retryable:false,upstream:oldFailures[input.target.modelId]!},
  }));
  queue=createQueue(store,oldAdapter,registry,{general:grade});
  try{
    const batch=await queue.enqueue({...request,targets:Object.keys(oldFailures).map(target)});
    await queue.idle();
    const superseded=batch.runIds[3]!,latest=await store.getItem(superseded,'q0');
    assert.ok(latest);
    await store.saveItem(superseded,latest.revision,{...latest,attempts:[...latest.attempts,{
      attemptId:'fixture-later-success',itemId:'q0',track:'general',phase:'answer',status:'completed',
      startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),
    }]});
    const file=join(path,'history','maintenance','batch-'+batch.batchId+'.json');
    const persisted=await readFile(file);
    await queue.dispose();await store.close();
    store=await openHistory(path);
    queue=createQueue(store,oldAdapter,registry,{general:grade});
    await queue.idle();
    assert.deepEqual(batch.runIds.map(runId=>view(queue).runControls?.[runId]?.error?.upstreamCause),
      ['overload','transport','unknown',undefined]);
    assert.deepEqual(await readFile(file),persisted);
    assert.equal((await store.getItem(batch.runIds[2]!,'q0'))?.answer?.text,'partial answer');
    await queue.controlRun(batch.batchId,batch.runIds[1]!,'resume',false);
    assert.equal(view(queue).runControls?.[batch.runIds[1]!],undefined);
  }finally{await queue.dispose();await store.close();}
}));

test('parallel models honor per-model worker counts, live edits, and selected pause and resume', {timeout:20000}, async()=>withTempRoot(async directory=>{
  const {path}=await switchRoot(join(directory,'data'),{writing:false});
  let store=await openHistory(path);
  const expandedRegistry=legacyFixtureRegistry({generalId:'general',writingId:'writing',resourceVersion:'test',
    items:Array.from({length:10},(_,index)=>({...questions[index%questions.length]!,id:'q'+index}))});
  const calls:string[]=[],inFlight=new Map<string,()=>void>();
  let block=true;
  const host=adapter(async input=>{
    const id=input.target.modelId+':'+input.context.itemId;
    calls.push(id);
    if(block&&!input.signal.aborted)await new Promise<void>(resolve=>{
      const release=()=>{input.signal.removeEventListener('abort',release);inFlight.delete(id);resolve();};
      inFlight.set(id,release);input.signal.addEventListener('abort',release,{once:true});
    });
    return response(input);
  });
  async function until(check:()=>boolean|Promise<boolean>){
    const deadline=Date.now()+5000;
    while(!await check()){
      if(Date.now()>deadline)assert.fail('Timed out waiting for controlled dispatch');
      await new Promise(resolve=>setTimeout(resolve,12));
    }
  }
  let queue=createQueue(store,host,expandedRegistry,{general:grade},{sampleMultiConfigEta:true});
  try{
    const batch=await queue.enqueue({...request,targets:[...request.targets,target('third')],
      execution:{...request.execution,parallelModels:2},modelConcurrency:[1,5,1]});
    const [first,second,third]=batch.runIds as [string,string,string];
    await until(()=>inFlight.size===6);
    assert.deepEqual([...inFlight.keys()].sort(),['first:q0',...Array.from({length:5},(_,i)=>'second:q'+i)]);
    assert.deepEqual(view(queue).activeRunIds,[first,second]);
    assert.equal(view(queue).etaSamples,undefined);

    await assert.rejects(queue.controlRuns(batch.batchId,[first,first],'hold'),{code:'BATCH_RUN_NOT_FOUND'});
    assert.equal(view(queue).runControls,undefined);
    await queue.setRunConcurrency(batch.batchId,first,8);
    await until(()=>inFlight.size===13);
    assert.deepEqual([...inFlight.keys()].filter(id=>id.startsWith('first:')).sort(),Array.from({length:8},(_,i)=>'first:q'+i));
    await queue.setRunConcurrency(batch.batchId,first,1);
    inFlight.get('first:q0')!();
    await until(async()=>!!(await store.getItem(first,'q0'))?.grade);
    assert.ok(!calls.includes('first:q8'));
    const saved=await store.getItem(first,'q0');
    const {manifest,summary}=await store.getRun(first);
    assert.deepEqual(summary.executionChanges?.map(change=>[change.before.concurrency,change.after.concurrency]),[[1,8],[8,1]]);
    assert.equal(saved?.attempts[0]?.performanceKey?.conditionKey,performanceConditionKey(manifest.target,manifest.protocols,manifest.execution!));
    assert.equal((await store.getItem(first,'q1'))?.attempts[0]?.performanceKey?.conditionKey,
      performanceConditionKey(manifest.target,manifest.protocols,{...manifest.execution!,concurrency:8}));

    await queue.controlRuns(batch.batchId,[first],'hold');
    await until(()=>inFlight.has('third:q0'));
    assert.equal((await store.getItem(first,'q1'))?.attempts[0]?.status,'interrupted');
    assert.ok(inFlight.has('second:q0')&&inFlight.has('second:q1'));
    await queue.controlRuns(batch.batchId,[second,third],'hold');
    await queue.idle();
    assert.equal(view(queue).status,'pending');
    assert.equal(inFlight.size,0);

    await queue.dispose();await store.close();
    store=await openHistory(path);await store.recover();
    queue=createQueue(store,host,expandedRegistry,{general:grade});
    const priorCalls=calls.length;
    await queue.idle();
    assert.equal(calls.length,priorCalls);
    block=false;
    await queue.controlRuns(batch.batchId,[first],'resume');
    await queue.idle();
    assert.deepEqual(calls.slice(priorCalls),Array.from({length:9},(_,i)=>'first:q'+(i+1)));
    assert.deepEqual(await store.getItem(first,'q0'),saved);
    assert.deepEqual(Object.keys(view(queue).runControls!).sort(),[second,third].sort());
    await queue.controlRuns(batch.batchId,[second,third],'resume');
    await queue.idle();
    assert.equal(view(queue).status,'completed');
    assert.equal((await store.getRun(second)).manifest.execution?.concurrency,5);
    assert.deepEqual((await store.getRun(first)).summary.executionChanges,summary.executionChanges);
  }finally{
    for(const release of inFlight.values())release();
    await queue.dispose();await store.close();
  }
}));

test('selected resume of a legacy paused batch is durable and leaves other models stopped', {timeout:15000},async()=>withTempRoot(async dir=>{
  const {path}=await switchRoot(join(dir,'data'),{writing:false});
  const store=await openHistory(path);
  const firstCall=deferred(),calls:string[]=[];
  let blocking=true;
  const queue=createQueue(store,adapter(async input=>{
    calls.push(input.target.modelId);
    if(blocking){
      firstCall.resolve();
      if(!input.signal.aborted)await new Promise<void>(resolve=>input.signal.addEventListener('abort',()=>resolve(),{once:true}));
    }
    return response(input);
  }),registry,{general:grade});
  try{
    const batch=await queue.enqueue({...request,execution:{concurrency:1,callTimeoutMs:10000}});
    const [first,second]=batch.runIds as [string,string];
    await firstCall.promise;
    await queue.pause(batch.batchId);
    await queue.setRunConcurrency(batch.batchId,first,2);
    blocking=false;
    await queue.controlRuns(batch.batchId,[second],'resume',undefined,'output-idle-v1');
    await queue.idle();
    assert.equal(calls.filter(id=>id==='first').length,1);
    assert.equal(calls.filter(id=>id==='second').length,4);
    assert.deepEqual(view(queue).runControls?.[first],{state:'held'});
    assert.deepEqual((await store.getRun(first)).summary.executionChanges?.map(change=>change.reason),
      ['run-concurrency-v1','output-idle-upgrade-v1']);
    await assert.rejects(queue.controlRuns(batch.batchId,[first,second],'resume'),{code:'RUN_CONTROL_STALE'});
    assert.equal(calls.length,5);
    await queue.controlRuns(batch.batchId,[first],'resume');
    await queue.idle();
    assert.equal(view(queue).status,'completed');
  }finally{await queue.dispose();await store.close();}
}));

test('the API rejects ambiguous model selections and invalid concurrency without dispatching',()=>{
  const batchId='a0000000-0000-4000-8000-000000000000',runId='b0000000-0000-4000-8000-000000000000';
  const envelope=(action:string,payload:Record<string,unknown>)=>({schemaVersion:1,requestId:'test',action,payload});
  const create={handles:[batchId,runId],tracks:['general'],execution:{concurrency:8,callTimeoutMs:10000},modelConcurrency:[1,10],parallelModels:2};
  assert.doesNotThrow(()=>validateEnvelope(envelope('createBatch',create)));
  assert.throws(()=>validateEnvelope(envelope('createBatch',{...create,modelConcurrency:[1]})),{code:'INVALID_REQUEST'});
  assert.throws(()=>validateEnvelope(envelope('createBatch',{...create,parallelModels:3})),{code:'INVALID_REQUEST'});
  assert.throws(()=>validateEnvelope(envelope('controlRuns',{batchId,runIds:[runId,runId],operation:'resume'})),{code:'INVALID_REQUEST'});
  assert.doesNotThrow(()=>validateEnvelope(envelope('setRunConcurrency',{batchId,runId,concurrency:8})));
  for(const concurrency of [0,-1,1.5,'8',Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>validateEnvelope(envelope('setRunConcurrency',{batchId,runId,concurrency})),{code:'INVALID_REQUEST'});
    assert.throws(()=>validateEnvelope(envelope('createBatch',{...create,execution:{...create.execution,concurrency}})),{code:'INVALID_REQUEST'});
    assert.throws(()=>validateEnvelope(envelope('createBatch',{...create,modelConcurrency:[1,concurrency]})),{code:'INVALID_REQUEST'});
  }
});

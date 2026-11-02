import test from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';
import {createQueue,type GradeServices,type EvaluationQueue} from '../../src/jobs/queue.ts';import {openHistory} from '../../src/history/store.ts';import {switchRoot} from '../../src/resources/prepare.ts';import {createToolSessionRunner} from '../../src/host/tool-session.ts';import type {ToolDispatcher} from '../../src/runtime/tool-dispatcher.ts';
import {fiveFixture} from '../support/five-fixture.ts';import {fixtureRegistry} from '../support/fixture-registry.ts';import {withTempRoot} from '../support/temp.ts';import {reuseTarget} from '../support/reuse-fixture.ts';import type {HostAdapter} from '../../src/contracts.ts';
const toolFirst=()=>{const p=fiveFixture();p.items=[...p.items].sort((a,b)=>Number(b.datasetId==='bfcl-v4-multi-turn-selected')-Number(a.datasetId==='bfcl-v4-multi-turn-selected'));return p;};
const dispatcher=(effect:()=>void):ToolDispatcher=>({tools:[],userTurns:[[{role:'user',content:'fixture'}]],initialize:async()=>0,execute:async state=>{effect();return {snapshot:(state as number)+1,text:'ok',isError:false};},grade:async()=>({passed:true,reason:'fixture'})});
test('tool scenario uses specialized queue service and never generic text generation',async()=>withTempRoot(async parent=>{
 const root=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(root.path),p=fiveFixture();let generic=0,tool=0;
 const adapter:HostAdapter={catalog:async()=>[],snapshot:async()=>reuseTarget(),generateOnce:async input=>{generic++;return {text:'fixture',complete:true,truncated:false,observations:{...input.context,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:false}}};}};
 const graders:GradeServices&Record<string,any>={general:async q=>({kind:'scored',track:'general',itemId:q.id,passed:true,evidence:null}),async tools(q:any,input:any){tool++;return {kind:'technical-missing',track:'general',itemId:q.id,error:{code:'FIXTURE_TOOL_PENDING',phase:'answer',retryable:false,message:'fixture'},evidence:null};}};
 // Put tools first so missing capability must stop without generic answer calls.
 p.items=[...p.items].sort((a,b)=>Number(b.datasetId==='bfcl-v4-multi-turn-selected')-Number(a.datasetId==='bfcl-v4-multi-turn-selected'));
 const queue=createQueue(store,adapter,fixtureRegistry([p]),graders);
 try{const batch=await queue.enqueue({generalId:p.generalId,targets:[reuseTarget()],tracks:['general'],execution:{concurrency:1,callTimeoutMs:1000}});await queue.idle();assert.equal(tool,1);assert.equal(generic,0);assert.equal(queue.snapshot().batches[0]!.status,'pending');assert.equal((await store.getRun(batch.runIds[0]!)).summary.tracks.general!.graded,0);}
 finally{await queue.dispose();await store.close();}
}));
test('tool checkpoints and every request survive reopening; resume does not repeat committed action',async()=>withTempRoot(async parent=>{
 const root=await switchRoot(join(parent,'root'),{writing:false}),p=toolFirst(),registry=fixtureRegistry([p]);let store=await openHistory(root.path),requests=0,effects=0,shouldPause=true,pause:Promise<void>|undefined,queue:EvaluationQueue;
 const adapter:HostAdapter={catalog:async()=>[],snapshot:async()=>reuseTarget(),generateOnce:async()=>{throw Error('no generic call expected');},async generateTurn(input){requests++;const calls=requests===1?[{callId:'a',name:'set',argumentsJson:'{}'},{callId:'b',name:'set',argumentsJson:'{}'}]:[];return {kind:'completed',calls,finish:calls.length?'tool-calls':'stop',assistant:{id:String(requests),role:'assistant',source:{kind:'model'},content:[]},observation:{...input.context!,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:true,inputTokens:1,outputTokens:2,totalTokens:3}}};}};
 const graders:GradeServices={general:async()=>{throw Error('no generic grade expected');},async tools(q,input){
  if(q.id!==p.items[0]!.id)return {kind:'technical-missing',track:'general',itemId:q.id,error:{code:'FIXTURE_STOP',phase:'answer',retryable:false,message:'fixture'},evidence:null};
  return createToolSessionRunner({generateTurn:adapter.generateTurn!},q,dispatcher(()=>effects++))({...input,commit:async cp=>{await input.commit(cp);if(shouldPause&&cp.actions===1){shouldPause=false;pause=queue.pause(queue.snapshot().activeBatchId!);}}});
 }};
 queue=createQueue(store,adapter,registry,graders);const batch=await queue.enqueue({generalId:p.generalId,targets:[reuseTarget()],tracks:['general'],execution:{concurrency:1,callTimeoutMs:1000}});await queue.idle();await pause;
 let item=await store.getItem(batch.runIds[0]!,p.items[0]!.id);assert.equal(item!.toolCheckpoint!.actions,1);assert.equal(requests,1);assert.equal(effects,1);
 await queue.dispose();await store.close();store=await openHistory(root.path);await store.recover();queue=createQueue(store,adapter,registry,graders);await queue.idle();assert.equal(requests,1,'reopen never automatically dispatches');
 try{await queue.resume(batch.batchId);await queue.idle();assert.equal(effects,2);assert.equal(requests,2);item=await store.getItem(batch.runIds[0]!,p.items[0]!.id);assert.equal(item!.grade!.kind,'scored');assert.equal(item!.answer!.complete,true);assert.deepEqual(item!.toolCheckpoint!.committedCallIds,['a','b']);assert.equal(item!.attempts.length,2);assert.equal((await store.getRun(batch.runIds[0]!)).summary.metrics.tracks.general!.answer.outputTokens,4);
  const previous=structuredClone(item!);previous.toolCheckpoint!.actions=0;await assert.rejects(store.saveItem(batch.runIds[0]!,item!.revision,previous),/INVALID_TOOL_CHECKPOINT|IMMUTABLE_TOOL_CHECKPOINT/);
 }finally{await queue.dispose();await store.close();}
}));
test('three failed tool requests retain tokens; explicit resume adds a finite retry cycle',async()=>withTempRoot(async parent=>{
 const root=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(root.path),p=toolFirst();let requests=0;
 const adapter:HostAdapter={catalog:async()=>[],snapshot:async()=>reuseTarget(),generateOnce:async()=>{throw Error('wrong path');},async generateTurn(input){requests++;return {kind:'technical-missing',error:{code:'NETWORK_ERROR',phase:'answer',retryable:true,message:'fixture'},observation:{...input.context!,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:true,outputTokens:2}}};}};
 const services:GradeServices={general:async()=>{throw Error('wrong path');},tools:async(q,input)=>createToolSessionRunner({generateTurn:adapter.generateTurn!},q,dispatcher(()=>{}),{clock:{wait:async()=>{}}})(input)};
 const queue=createQueue(store,adapter,fixtureRegistry([p]),services);
 try{const batch=await queue.enqueue({generalId:p.generalId,targets:[reuseTarget()],tracks:['general'],execution:{concurrency:1,callTimeoutMs:1000}});await queue.idle();assert.equal(requests,3);let item=await store.getItem(batch.runIds[0]!,p.items[0]!.id);assert.equal(item!.attempts.length,3);assert.equal(item!.toolCheckpoint!.logicalRounds,1);assert.equal(queue.snapshot().batches[0]!.status,'pending');
  await queue.resume(batch.batchId);await queue.idle();assert.equal(requests,6);item=await store.getItem(batch.runIds[0]!,p.items[0]!.id);assert.equal(item!.attempts.length,6);assert.equal(item!.toolCheckpoint!.logicalRounds,1);const track=(await store.getRun(batch.runIds[0]!)).summary;assert.equal(track.metrics.tracks.general!.answer.outputTokens,12);assert.equal(track.tracks.general!.score,undefined);
 }finally{await queue.dispose();await store.close();}
}));

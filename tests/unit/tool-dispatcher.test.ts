import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import {resolve} from 'node:path';
import {createToolDispatcher} from '../../src/runtime/tool-dispatcher.ts';import {createToolSessionRunner} from '../../src/host/tool-session.ts';import type {HostToolAdapter,Question,ToolCall,ToolSessionCheckpoint} from '../../src/contracts.ts';
import type {ToolDispatcher} from '../../src/runtime/tool-dispatcher.ts';import {reuseTarget} from '../support/reuse-fixture.ts';
const signal=()=>new AbortController().signal;
async function toolQuestions(){return (JSON.parse(await readFile('resources/suites/task-five-v1/questions.json','utf8')) as Question[]).filter(q=>q.datasetId==='bfcl-v4-multi-turn-selected');}
function references(q:Question):ToolCall[][]{
 const raw=q.grading as any,result=spawnSync(resolve('resources/runtime/rules/python.exe'),['-I','-B',resolve('resources/suites/task-five-v1/bfcl/tool_worker.py')],{encoding:'utf8',windowsHide:true,input:JSON.stringify({action:'reference',scenario:raw.scenario,reference:raw.reference})});
 assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout).turns.map((turn:any[],i:number)=>turn.map((call:any,j:number)=>({callId:i+'-'+j,name:call.name,argumentsJson:JSON.stringify(call.arguments)})));
}
test('all30 selected references pass product dispatcher and removed action negatives fail',{timeout:180000},async()=>{
 for(const q of await toolQuestions()){
  const dispatcher=await createToolDispatcher(resolve('resources'),q),calls=references(q);let state=await dispatcher.initialize(signal());
  for(const turn of calls)for(const call of turn){const result=await dispatcher.execute(state,call,signal());state=result.snapshot;}
  assert.equal((await dispatcher.grade(calls,signal())).passed,true,q.sourceId);
  assert.equal((await dispatcher.grade(calls.map(()=>[]),signal())).passed,false,q.sourceId+' empty');
  const removed=structuredClone(calls);removed.find(turn=>turn.length)!.pop();assert.equal((await dispatcher.grade(removed,signal())).passed,false,q.sourceId+' removed');
 }
});
test('sealed dispatcher rejects private/unknown tools and malformed arguments as recoverable business errors',async()=>{
 const q=(await toolQuestions())[0]!,d=await createToolDispatcher(resolve('resources'),q),state=await d.initialize(signal());
 for(const [name,args]of [['_load_scenario','{}'],['__import__','{"name":"os"}'],[d.tools[0]!.name,'{broken']]){const result=await d.execute(state,{callId:'bad',name:name!,argumentsJson:args!},signal());assert.equal(result.isError,true);assert.deepEqual(result.snapshot,state);}
});
test('JSON numeric binding, snapshot float types and mutable-default state stay isolated',async()=>{
 const q=(await toolQuestions()).find(q=>q.sourceId==='multi_turn_base_90')!,d=await createToolDispatcher(resolve('resources'),q);
 let state=await d.initialize(signal());
 const call=(name:string,args:unknown):ToolCall=>({callId:name,name,argumentsJson:JSON.stringify(args)});
 const filled=await d.execute(state,call('fillFuelTank',{fuelAmount:40}),signal());assert.equal(filled.text,'{"fuelLevel": 45.0}');
 state=JSON.parse(JSON.stringify(filled.snapshot));const filledAgain=await d.execute(state,call('fillFuelTank',{fuelAmount:0}),signal());assert.equal(filledAgain.text,'{"fuelLevel": 45.0}');
 for(const bad of [true,'40'])assert.equal((await d.execute(state,call('fillFuelTank',{fuelAmount:bad}),signal())).isError,true);
 let a=await d.initialize(signal()),b=await d.initialize(signal());
 a=(await d.execute(a,call('post_tweet',{content:'fixture'}),signal())).snapshot;
 b=(await d.execute(b,call('post_tweet',{content:'fixture'}),signal())).snapshot;
 a=(await d.execute(a,call('mention',{tweet_id:10,mentioned_usernames:['@wrong']}),signal())).snapshot;
 assert.ok(JSON.stringify(a).includes('@wrong'));assert.ok(!JSON.stringify(b).includes('@wrong'));
 const ref=references(q),copy=JSON.stringify(ref);assert.equal((await d.grade(ref,signal())).passed,true);assert.equal(JSON.stringify(ref),copy);
});
test('session commits action state before pause and resumes remaining calls without duplicate effects',async()=>{
 const question:Question={id:'tools/synthetic',track:'general',datasetId:'bfcl-v4-multi-turn-selected',sourceId:'synthetic',sourceHash:'fixture',prompt:[{role:'user',content:'Set7 and8'}],grading:{}};
 let effects=0,requests=0;const abort=new AbortController();let saved:ToolSessionCheckpoint|undefined;
 const dispatcher:ToolDispatcher={tools:[],userTurns:[[{role:'user',content:'set'}]],initialize:async()=>0,execute:async(state,call)=>{effects++;return {snapshot:(state as number)+1,text:call.name,isError:false};},grade:async()=>({passed:effects===2,reason:'fixture'})};
 const adapter:HostToolAdapter={async generateTurn(input){requests++;const calls=requests===1?[{callId:'a',name:'set',argumentsJson:'{}'},{callId:'b',name:'set',argumentsJson:'{}'}]:[];return {kind:'completed',finish:calls.length?'tool-calls':'stop',calls,assistant:{id:String(requests),role:'assistant',source:{kind:'model'},content:[]},observation:{...input.context!,startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),usage:{available:false}}};}};
 const runner=createToolSessionRunner(adapter,question,dispatcher),commit=async(cp:ToolSessionCheckpoint)=>{saved=structuredClone(cp);if(cp.actions===1)abort.abort();};
 const first=await runner({target:reuseTarget(),scenarioId:'synthetic',signal:abort.signal,commit,onAttempt:async()=>{}});assert.equal(first.kind,'technical-missing');assert.equal(effects,1);assert.equal(saved!.pendingCalls.length,1);
 const result=await runner({target:reuseTarget(),scenarioId:'synthetic',signal:signal(),checkpoint:saved!,commit:async(cp)=>{saved=structuredClone(cp);},onAttempt:async()=>{}});
 assert.equal(result.kind,'scored');if(result.kind==='scored'&&result.track==='general')assert.equal(result.passed,true);
 assert.equal(effects,2);assert.equal(requests,2);assert.equal(saved!.actions,2);assert.deepEqual(saved!.committedCallIds,['a','b']);
});
test('one reserved model round survives technical retries and resume; storage failure stops dispatch',async()=>{
 const q:Question={id:'tools/synthetic',track:'general',datasetId:'bfcl-v4-multi-turn-selected',sourceId:'synthetic',sourceHash:'fixture',prompt:[],grading:{}};
 const dispatcher:ToolDispatcher={tools:[],userTurns:[[{role:'user',content:'set'}]],initialize:async()=>0,execute:async()=>{throw Error('must not execute');},grade:async()=>({passed:false,reason:'fixture'})};
 let requests=0,saved:ToolSessionCheckpoint|undefined,attempts=0;
 const adapter:HostToolAdapter={async generateTurn(input){requests++;return {kind:'technical-missing',error:{code:'NETWORK_ERROR',phase:'answer',retryable:true,message:'fixture'},observation:{...input.context!,startedAt:'2026-11-02T00:00:00Z',endedAt:'2026-11-02T00:00:01Z',usage:{available:true,outputTokens:2}}};}};
 const runner=createToolSessionRunner(adapter,q,dispatcher,{clock:{wait:async()=>{}}}),base={target:reuseTarget(),scenarioId:'synthetic',signal:signal(),commit:async(cp:ToolSessionCheckpoint)=>{saved=structuredClone(cp);},onAttempt:async(o:any)=>{if(o.endedAt)attempts++;}};
 assert.equal((await runner(base)).kind,'technical-missing');assert.equal(requests,3);assert.equal(saved!.logicalRounds,1);
 await runner({...base,checkpoint:saved!});assert.equal(requests,6);assert.equal(attempts,6);assert.equal(saved!.logicalRounds,1);
 await runner({...base,commit:async()=>{throw Error('disk-full');}});assert.equal(requests,6);
});

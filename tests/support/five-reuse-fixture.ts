import {randomUUID} from 'node:crypto';import {fiveFixture} from './five-fixture.ts';import {reuseTarget} from './reuse-fixture.ts';import {refreshRunSummary} from '../../src/evaluation/aggregate-run.ts';import {identityHash} from '../../src/evaluation/protocol-identity.ts';import {fingerprintTarget} from '../../src/model/identity.ts';import type {HistoryStore,ItemInput} from '../../src/history/store.ts';
export async function persistFiveSource(store:HistoryStore){
 const light=fiveFixture(),deep=fiveFixture('deep'),target=reuseTarget(),run=await store.createRun({batchId:randomUUID(),target,protocols:light.descriptor.refs,generalDefinition:light.descriptor.general,requiredItems:light.items.map(({id,track,datasetId})=>({id,track,datasetId}))});
 for(const [i,q]of light.items.entries()){
  const {grading,...question}=q,time=new Date().toISOString(),observation={attemptId:'source-'+i,itemId:q.id,track:'general' as const,phase:'answer' as const,startedAt:time,endedAt:time,usage:{available:true,inputTokens:10,outputTokens:20}};
  const item:ItemInput={itemId:q.id,question,attempts:[{attemptId:observation.attemptId,phase:'answer',status:'completed',startedAt:time,endedAt:time,observations:observation}],answer:{text:'[]',complete:true,truncated:false,observations:observation},grade:{kind:'scored',track:'general',itemId:q.id,passed:i%2===0,evidence:null}};
  if(q.datasetId==='bfcl-v4-multi-turn-selected')item.toolCheckpoint={version:1,scenarioId:q.sourceId,scenarioHash:identityHash(q),targetHash:fingerprintTarget(target),userTurn:1,messages:[],logicalRounds:1,roundReserved:false,actions:1,committedCallIds:['tool-'+i],stateSnapshot:{fixture:i},callsByTurn:[[{callId:'tool-'+i,name:'fixture',argumentsJson:'{}'}]],pendingCalls:[],stage:'done',passed:i%2===0,finalReason:'fixture'};
  if(item.toolCheckpoint&&!item.toolCheckpoint.passed){const cp=item.toolCheckpoint;cp.actions=32;cp.committedCallIds=Array.from({length:32},(_,j)=>'action-'+j);cp.callsByTurn=[cp.committedCallIds.map(callId=>({callId,name:'fixture',argumentsJson:'{}'}))];cp.pendingCalls=[{callId:'budget-stopped',name:'fixture',argumentsJson:'{}'}];cp.finalReason='action-budget';}
  await store.saveItem(run.runId,0,item);
 }
 await store.exclusive(tx=>refreshRunSummary(store,tx,run.runId));
 return {source:{...await store.getRun(run.runId),items:await store.listItems(run.runId),protocol:light},deep,current:target};
}

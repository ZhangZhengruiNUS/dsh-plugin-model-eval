import {randomUUID} from 'node:crypto';
import type {TargetSnapshot,RunSummary} from '../../src/contracts.ts';
import type {RunManifest,ItemRecord,HistoryStore} from '../../src/history/store.ts';
import {makeTierFixture} from './tier-fixture.ts';
import {identityHash} from '../../src/evaluation/protocol-identity.ts';
export const reuseTarget=():TargetSnapshot=>({scopeId:'fixture-profile',providerId:'fixture-provider',modelId:'fixture-model',routeTarget:{state:'known',value:'https://fixture.invalid/v1',source:'adapter'},controls:{temperature:{state:'known',value:.4,source:'adapter'},maxTokens:{state:'unset'}},origin:{adapterInstance:'ephemeral-a',adapterEpoch:0,settingsNs:'fixture-provider-settings',settingsRevision:7}});
export function reuseFixture(){
  const light=makeTierFixture('light'),deep=makeTierFixture('deep');
  const {definitionHash,...deepValue}=deep.descriptor.general;
  deep.descriptor.general={...deepValue,parentGeneralId:light.generalId,definitionHash:identityHash({...deepValue,parentGeneralId:light.generalId})};
  const createdAt='2026-11-01T01:00:00.000Z',completedAt='2026-11-01T01:01:00.000Z',target=reuseTarget(),runId=randomUUID(),batchId=randomUUID();
  const manifest:RunManifest={schemaVersion:1,runId,batchId,createdAt,target,protocols:light.descriptor.refs,generalDefinition:light.descriptor.general,requiredItems:light.items.filter(q=>q.track==='general').map(({id,track,datasetId})=>({id,track,datasetId}))};
  const items:ItemRecord[]=light.items.filter(q=>q.track==='general').map((q,i)=>{const {grading,...question}=q;return {schemaVersion:1,revision:1,sequence:i+1,updatedAt:completedAt,itemId:q.id,answerCommittedAt:completedAt,gradeCommittedAt:completedAt,question,answer:{text:'fixture answer',complete:true,truncated:false,observations:{attemptId:`source-${i}`,itemId:q.id,track:'general',phase:'answer',startedAt:createdAt,endedAt:completedAt,usage:{available:true,inputTokens:100,outputTokens:150,totalTokens:250}}},grade:{kind:'scored',track:'general',itemId:q.id,passed:i%2===0,evidence:null},attempts:[{attemptId:`source-${i}`,phase:'answer',status:'completed',startedAt:createdAt,endedAt:completedAt,observations:{attemptId:`source-${i}`,itemId:q.id,track:'general',phase:'answer',startedAt:createdAt,endedAt:completedAt,usage:{available:true,inputTokens:100,outputTokens:150,totalTokens:250}}}]};});
  const summary:RunSummary={runId,batchId,createdAt,completedAt,target,revision:120,protocols:manifest.protocols,generalDefinition:light.descriptor.general,details:'available',resumeAllowed:true,judges:[],metrics:{tracks:{},activeIntervals:[{startedAt:createdAt,endedAt:completedAt}],incompleteTiming:false},tracks:{general:{status:'completed',required:120,graded:120,score:50,completedAt,measures:{}}}};
  return {source:{manifest,summary,items,protocol:light},deep,current:structuredClone(target)};
}
export async function persistReuseSource(store:HistoryStore){
  const fixture=reuseFixture(),{schemaVersion,runId,createdAt,...input}=fixture.source.manifest;
  const run=await store.createRun(input);
  for(const item of fixture.source.items){const {schemaVersion,revision,sequence,updatedAt,answerCommittedAt,gradeCommittedAt,...value}=item;await store.saveItem(run.runId,0,value);}
  const saved=await store.getRun(run.runId);
  await store.updateSummary(run.runId,saved.summary.revision,s=>{s.tracks.general=fixture.source.summary.tracks.general!;s.completedAt=fixture.source.summary.completedAt!;s.metrics=fixture.source.summary.metrics;});
  const source={...await store.getRun(run.runId),items:await store.listItems(run.runId),protocol:fixture.source.protocol};
  return {...fixture,source};
}

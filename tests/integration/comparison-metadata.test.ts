import test from 'node:test';
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {withTempRoot} from '../support/temp.ts';
import {switchRoot} from '../../src/resources/prepare.ts';
import {openHistory,type HistoryStore} from '../../src/history/store.ts';
import {createEvaluationService} from '../../src/service.ts';
import {validateEnvelope,safeApiError} from '../../src/host/api.ts';
import type {HostAdapter} from '../../src/contracts.ts';

const adapter:HostAdapter={async catalog(){return [];},async snapshot(){throw Error('unused');},async generateOnce(){throw Error('NO_MODEL_CALLS');}};
test('metadata_is_readonly_and_item_free',async()=>withTempRoot(async parent=>{
  const {path}=await switchRoot(join(parent,'initial'),{writing:false});const seed=await openHistory(path);
  const input={batchId:'fixture',target:{scopeId:'s',providerId:'p',modelId:'m',routeTarget:{state:'unknown' as const},controls:{}},protocols:{generalId:'g',writingId:'w',resourceVersion:'v'},requiredItems:[{id:'PRIVATE_QUESTION',track:'general' as const,datasetId:'tiny-mmlu'}]};
  const old=await seed.createRun(input),known=await seed.createRun({...input,execution:{concurrency:4,callTimeoutMs:300000}});await seed.close();
  const service=await createEvaluationService({adapter,scopeId:'s',initialRoot:path,packageResources:resolve('resources')});
  try{
    const recordPath=join(path,'history','runs',old.runId,'summary.json'),before=await readFile(recordPath,'utf8');
    const result:any=await service.dispatch('comparisonMetadata' as any,{});
    assert.ok(result,'comparison snapshot must be available');assert.equal(result.summaries.length,2);
    assert.deepEqual(result.runs.find((r:any)=>r.runId===old.runId).execution,{state:'unknown'});
    assert.deepEqual(result.runs.find((r:any)=>r.runId===known.runId).execution,{state:'known',concurrency:4,callTimeoutMs:300000});
    assert.equal(JSON.stringify(result).includes('PRIVATE_QUESTION'),false);assert.equal(JSON.stringify(result).includes(path),false);
    assert.equal(await readFile(recordPath,'utf8'),before);
    const status:any=await service.dispatch('status',{});assert.equal(result.rootId,status.rootId);assert.equal(result.rootEpoch,status.rootEpoch);
    const report:any=await service.dispatch('report',{runId:old.runId});assert.equal(report.rootId,status.rootId);assert.equal(report.rootEpoch,status.rootEpoch);
    const pendingRead=service.dispatch('comparisonMetadata' as any,{});
    const changing=service.dispatch('setRoot',{path:join(parent,'second')});
    await assert.rejects(service.dispatch('comparisonMetadata' as any,{}),{code:'COMPARISON_STALE'});
    await assert.rejects(pendingRead,{code:'COMPARISON_STALE'});await changing;
    const second:any=await service.dispatch('comparisonMetadata' as any,{});
    await service.dispatch('setRoot',{path});const returned:any=await service.dispatch('comparisonMetadata' as any,{});
    assert.notEqual(second.rootId,result.rootId);assert.equal(returned.rootId,result.rootId);assert.ok(returned.rootEpoch>second.rootEpoch&&second.rootEpoch>result.rootEpoch);
    const lastRead=service.dispatch('comparisonMetadata' as any,{}),disposing=service.dispose();
    await assert.rejects(lastRead,{code:'COMPARISON_STALE'});await disposing;
  }finally{await service.dispose();}
}));
test('metadata_payload_rejects_paths',()=>{
  const envelope={schemaVersion:1,requestId:'test',action:'comparisonMetadata',payload:{}};
  assert.equal(validateEnvelope(envelope).action,'comparisonMetadata');
  for(const payload of [{path:'C:/private'},{runIds:[]}])assert.throws(()=>validateEnvelope({...envelope,payload}),{code:'INVALID_REQUEST'});
  assert.equal(safeApiError({code:'COMPARISON_STALE'}).retryable,true);
});
test('projection keeps valid summaries on missing conditions without reading items',async()=>{
  const {readComparisonMetadata}=await import('../../src/comparison/project.ts');
  let items=0;const summary:any={runId:'one',revision:2};
  const store={rootId:'root',async listSummaries(){return [summary,{runId:'two',revision:1}];},async getRun(id:string){if(id==='two')throw Object.assign(Error(),{code:'RUN_CORRUPT'});return {summary,manifest:{execution:{concurrency:NaN,callTimeoutMs:300000}}};},async listItems(){items++;throw Error('item read');},async getItem(){items++;throw Error('item read');}} as unknown as HistoryStore;
  const result=await readComparisonMetadata(store,3);
  assert.equal(items,0);assert.equal(result.summaries.length,2);assert.deepEqual(result.runs[0]!.execution,{state:'unknown'});assert.equal(result.runs[1]!.conditionAvailable,false);
  for(const callTimeoutMs of [1.5,100,1800001]){
    store.getRun=async()=>({summary,manifest:{execution:{concurrency:4,callTimeoutMs}}} as any);
    assert.deepEqual((await readComparisonMetadata(store,3)).runs[0]!.execution,{state:'unknown'});
  }
  store.getRun=async()=>({summary:{...summary,revision:3,details:'cleared'},manifest:{}} as any);
  const changed=await readComparisonMetadata(store,3);assert.equal(changed.summaries[0]!.revision,3);assert.equal(changed.runs[0]!.revision,3);
  store.getRun=async()=>{throw Object.assign(Error(),{code:'HISTORY_CLOSED'});};
  await assert.rejects(readComparisonMetadata(store,3),{code:'HISTORY_CLOSED'});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {withTempRoot} from '../support/temp.ts';
import {switchRoot} from '../../src/resources/prepare.ts';
import {openHistory} from '../../src/history/store.ts';
import {loadProtocolSet} from '../../src/evaluation/protocols.ts';
import {createEvaluationService} from '../../src/service.ts';
import type {HostAdapter} from '../../src/contracts.ts';
import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';

test('unknown_refs_keep_history_readable_without_guessing_a_current_question',async()=>withTempRoot(async parent=>{
  const protocols=await loadProtocolSet(resolve('resources')),q=protocols.items[0]!,{path}=await switchRoot(join(parent,'root'),{writing:false}),store=await openHistory(path);
  const target={scopeId:'fixture',providerId:'fixture',modelId:'fixture',routeTarget:{state:'unknown' as const},controls:{}};
  const run=await store.createRun({batchId:'old-unknown',target,protocols:{generalId:'unknown-version',writingId:protocols.writingId,resourceVersion:protocols.resourceVersion},requiredItems:[{id:q.id,track:q.track,datasetId:q.datasetId}]});
  await store.close();let calls=0;
  const adapter:HostAdapter={async catalog(){return[];},async snapshot(){return target;},async generateOnce(){calls++;throw Error('must not call');}};
  const service=await createEvaluationService({adapter,scopeId:'fixture',packageResources:resolve('resources'),initialRoot:path});
  try{
    const history=await service.dispatch('history',{}) as any[];assert.equal(history.length,1);assert.equal(history[0].tracks.general.score,undefined);
    const item=await service.dispatch('item',{runId:run.runId,itemId:q.id}) as any;assert.equal(item.question,null,'same resourceVersion alone cannot bind a question from another generalId');
    assert.equal(calls,0);
  }finally{await service.dispose();}
}));

test('unavailable_registry_preserves_reports_and_blocks_preparation_and_model_calls',async()=>withTempRoot(async parent=>{
  const resources=join(parent,'package','resources');await mkdir(resources,{recursive:true});
  const source=JSON.parse(await readFile('resources/manifest.json','utf8'));
  for(const name of ['manifest.json',...source.files.filter((f:any)=>f.kind!=='runtime').map((f:any)=>f.path)]){const dest=join(resources,name);await mkdir(join(dest,'..'),{recursive:true});await copyFile(join('resources',name),dest);}
  await writeFile(join(resources,'protocol-registry.json'),'{}');let calls=0,prepared=0;
  const adapter:HostAdapter={async catalog(){return[];},async snapshot(){throw Error('not used');},async generateOnce(){calls++;throw Error('must not call');}};
  const service=await createEvaluationService({adapter,scopeId:'fixture-unavailable',packageResources:resources,initialRoot:join(parent,'root'),async prepareEnvironment(){prepared++;throw Error('must not prepare');}});
  try{assert.deepEqual(await service.dispatch('history',{}),[]);assert.equal((await service.dispatch('status',{}) as any).protocolError,'PROTOCOL_UNAVAILABLE');await assert.rejects(service.dispatch('prepare',{}),{code:'PROTOCOL_UNAVAILABLE'});assert.equal(calls,0);assert.equal(prepared,0);}finally{await service.dispose();}
}));

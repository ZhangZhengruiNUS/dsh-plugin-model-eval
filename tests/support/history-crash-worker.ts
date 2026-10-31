import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { openHistory } from '../../src/history/store.ts';
const root=process.argv[2]!,mode=process.argv[3]!;
const store=await openHistory(root);
const run=await store.createRun({batchId:'crash-batch',target:{scopeId:'scope',providerId:'provider',modelId:'model',routeTarget:{state:'unknown'},controls:{}},
  protocols:{generalId:'fixture',writingId:'fixture',resourceVersion:'fixture'},requiredItems:[{id:'q1',track:'general',datasetId:'tiny-mmlu'}]});
await store.updateSummary(run.runId,run.revision,next=>{next.tracks.general!.status='running';});
await store.saveItem(run.runId,0,{itemId:'q1',attempts:[]});
process.stdout.write(JSON.stringify({runId:run.runId})+'\n');
const original=fs.rename;
fs.rename=async function(from,to){
  const destination=String(to);
  if(destination.includes('items')&&destination.endsWith('.json')) {
    if(mode==='before')process.exit(76);
    await original(from,to);process.exit(77);
  }
  return original(from,to);
};
syncBuiltinESMExports();
await store.saveItem(run.runId,1,{itemId:'q1',attempts:[],answer:{text:'已提交的回答',complete:true,truncated:false,
  observations:{attemptId:'attempt',itemId:'q1',track:'general',phase:'answer',startedAt:'2026-01-01T00:00:00.000Z',endedAt:'2026-01-01T00:00:01.000Z',usage:{available:false}}}});
process.exit(99);

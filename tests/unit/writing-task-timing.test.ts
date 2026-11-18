import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {RunSummary,RunMetrics} from '../../src/contracts.ts';
import {CURRENT_WRITING_ID} from '../../src/evaluation/writing-edition.ts';
import {REPLACEMENT_WRITING_ITEM,REPLACED_WRITING_ITEM} from '../../src/history/writing-replacement.ts';
import {buildComparison} from '../../src/client/comparison/model.ts';
import {plottable,scatterGuides,writingGuideGroups} from '../../src/client/comparison/geometry.ts';

const phase={calls:1,failures:0,usageCoverage:1,latencyMedianMs:1000};
const draftMetrics:RunMetrics={tracks:{},activeIntervals:[],incompleteTiming:false};
function summary(modelId:string,score:number,meanMs:number,mode:'single'|'replaced'|'mixed'|'missing'):RunSummary {
  const isStaged=mode!=='single';
  return {
    runId:modelId,batchId:'fixture',target:{scopeId:'fixture',providerId:'fixture',modelId,controls:{},routeTarget:{state:'unknown'}},
    revision:1,tracks:{writing:{status:'completed',graded:12,required:12,score,measures:{}}},
    details:'available',resumeAllowed:true,
    protocols:{generalId:'general-task-five-original-v1-light',writingId:CURRENT_WRITING_ID,resourceVersion:'task-five-original-v1'},
    judges:[{snapshot:{target:{scopeId:'fixture',providerId:'fixture',modelId:'judge',controls:{},routeTarget:{state:'unknown'}},
      promptId:'p',rubricId:'r'},itemIds:['fixture-item']}],
    metrics:{...draftMetrics,tracks:{writing:{answer:{...phase,
      taskTiming:{schema:'task-duration-v1',required:12,measured:mode==='missing'?11:12,complete:mode!=='missing',meanMs}},
      judge:phase,gradingMs:0}}},
    ...(isStaged?{reuse:{operationId:'fixture',sourceRunId:'source',mixedPeriod:true as const,reusedItems:11,
      sourceAnswerMetrics:phase,sourceActivity:{scope:'source-items' as const,tracks:['writing' as const],activeIntervals:[],incompleteTiming:false},
      ...(mode!=='mixed'?{writingReplacement:{sourceBatchId:'older',fromItemId:REPLACED_WRITING_ITEM,toItemId:REPLACEMENT_WRITING_ITEM,sourceMetrics:draftMetrics}}:{})}}:{}),
  };
}

test('writing replacements expose a complete observed mean while excluding unrelated mixed or incomplete timing',()=>{
  const summaries=[summary('complete',90,91000,'replaced'),summary('mixed',75,20000,'mixed'),summary('incomplete',65,51000,'missing')];
  const rows=buildComparison({rootId:'test',rootEpoch:0,summaries,runs:[]},'writing')[0]!.rows;
  assert.deepEqual(rows.map(r=>r.taskMeanMs),[91000,null,null]);
  assert.deepEqual(rows.map(r=>r.taskTimingSource),['writing-replacement',undefined,undefined]);
  assert.deepEqual(plottable(rows).map(x=>x.runId),['complete']);
  assert.deepEqual(plottable(rows,'latencyMs'),[]);
});

test('general results from a writing-only replacement use the complete timing from the original batch',()=>{
  const original=summary('complete',90,91000,'replaced');
  const incomplete=summary('incomplete',75,20000,'replaced');
  for(const r of [original,incomplete]){
    r.protocols.generalId='general-chat-root-stable-rule-tokenizer-v3';
    r.tracks.general={status:'completed',graded:62,required:62,score:r.tracks.writing!.score!,measures:{}};
    r.reuse!.writingReplacement!.sourceMetrics={...draftMetrics,tracks:{general:{answer:{...phase,
      taskTiming:{schema:'task-duration-v1',required:62,measured:r===original?62:61,complete:r===original,meanMs:153000}},
      judge:phase,gradingMs:0}}};
  }
  const rows=buildComparison({rootId:'test',rootEpoch:0,summaries:[original,incomplete],runs:[]},'general')[0]!.rows;
  assert.deepEqual(rows.map(r=>r.taskMeanMs),[153000,null]);
  assert.deepEqual(rows.map(r=>r.taskTimingSource),['original-general',undefined]);
  assert.deepEqual(plottable(rows).map(x=>x.runId),['complete']);
  assert.deepEqual(scatterGuides(rows),{frontier:[{score:90,seconds:153}],region:null,execution:null});
});

test('staged writing can join the observed frontier',()=>{
  const summaries=[summary('staged',60,5000,'replaced'),summary('fast',80,10000,'single'),summary('high',95,40000,'single')];
  const rows=buildComparison({rootId:'test',rootEpoch:0,summaries,runs:summaries.map(r=>({runId:r.runId,revision:r.revision,
    conditionAvailable:true,execution:{state:'known',concurrency:4,callTimeoutMs:300000}}))},'writing')[0]!.rows;
  assert.equal(plottable(rows).length,3);
  assert.deepEqual(scatterGuides(rows),{
    frontier:[{score:60,seconds:5},{score:80,seconds:10},{score:95,seconds:40}],
    region:{score:80,seconds:10},execution:null,
  });
});

test('frontier and median region exclude references, collapse tied frontier coordinates, and use complete times',()=>{
  const summaries=[
    summary('incomplete',100,1000,'missing'),summary('fast',80,10000,'single'),
    summary('tie',80,10000,'single'),summary('lower',70,10000,'single'),
    summary('slower',80,20000,'single'),summary('high',90,30000,'single'),
  ];
  const rows=buildComparison({rootId:'test',rootEpoch:0,summaries,runs:[]},'writing')[0]!.rows;
  const first=rows.find(row=>row.runId==='fast')!;
  rows.push({...first,reference:'fixture',score:100,taskMeanMs:200});
  assert.deepEqual(scatterGuides(rows),{
    frontier:[{score:80,seconds:10},{score:90,seconds:30}],
    region:{score:80,seconds:10},execution:null,
  });
  const slower=rows.find(row=>row.runId==='slower')!;
  assert.deepEqual(scatterGuides([first,slower]).frontier,[{score:80,seconds:10}]);
  assert.deepEqual(scatterGuides([first,slower]).region,{score:80,seconds:15});
  assert.equal(scatterGuides([first,{...slower,judgeKey:'other'}]).unavailable,'judge');
  assert.equal(scatterGuides([first,{...slower,protocolKnown:false}]).unavailable,'protocol');
});

test('writing guides keep each judge scope intact when other observations are present',()=>{
  const summaries=[
    summary('fast',80,10000,'single'),summary('high',90,30000,'replaced'),
    summary('different-judge',99,5000,'single'),summary('no-timing',100,1000,'missing'),
    summary('missing-judge',100,1000,'single'),
  ];
  summaries[2]!.judges[0]!.snapshot.promptId='different-rubric-prompt';
  summaries[4]!.judges=[];
  const rows=buildComparison({rootId:'test',rootEpoch:0,summaries,runs:[]},'writing')[0]!.rows;
  const reference={...rows[0]!,runId:'reference',reference:'fixture'};
  const groups=writingGuideGroups([...rows,reference]);
  assert.deepEqual(groups.map(group=>group.rows.map(row=>row.runId).sort()),[['fast','high'],['different-judge']]);
  assert.deepEqual(scatterGuides(groups[0]!.rows).frontier,[{score:80,seconds:10},{score:90,seconds:30}]);
  assert.deepEqual(scatterGuides(groups[0]!.rows).region,{score:85,seconds:20});
});

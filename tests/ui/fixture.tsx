/** Synthetic view data ONLY. No model calls, no persistence or scoring evidence. */
import * as React from 'react';import {createRoot} from 'react-dom/client';import {App} from '../../src/client/App.tsx';
import {builtInReferences} from '../../src/client/comparison/reference-data.ts';
import type {AttemptRecord} from '../../src/history/store.ts';
import type {RunSummary,TargetSnapshot,Track,JudgeSnapshot} from '../../src/contracts.ts';import type {BatchView} from '../../src/jobs/queue.ts';
import type {SpeedSession} from '../../src/estimation/contracts.ts';
import type {EstimateSnapshot} from '../../src/estimation/contracts.ts';import {timingCleanupIds,type TimingGroup} from '../../src/estimation/timing-groups.ts';
const params=new URLSearchParams(location.search),version='suite-2026-10-31-v3',protocols={resourceVersion:version,generalId:'general-chat-root-stable-rule-tokenizer-v3',writingId:'work-writing-12-v1'};
const lightId='general-two-tier-v1-light',deepId='general-two-tier-v1-deep';
const fiveSchema=params.has('fiveV2')?'task-five-v2':'task-five-v1';
const fiveLight='general-'+fiveSchema+'-light',fiveDeep='general-'+fiveSchema+'-deep';
const fiveDefinition=(tier:'light'|'deep')=>({schema:fiveSchema,tier,label:tier==='light'?'轻量':'深入',definitionHash:'synthetic-five-'+tier,...(tier==='deep'?{parentGeneralId:fiveLight}:{}),domains:['knowledge','reading','instructions','coding','tools'].map((id,index)=>({id:id as any,weight:.2,itemIds:Array.from({length:(tier==='light'?(fiveSchema==='task-five-v2'?[20,8,20,8,8]:[30,10,30,20,10]):[100,50,100,70,30])[index]!},(_,i)=>id==='knowledge'?(i<(tier==='deep'?80:fiveSchema==='task-five-v2'?16:24)?'knowledge/mmlu-pro/':'math/olympiad-text-math/')+i:'synthetic/'+id+'/'+i)}))});
const fiveRefs=(tier:'light'|'deep')=>({generalId:tier==='light'?fiveLight:fiveDeep,writingId:protocols.writingId,resourceVersion:fiveSchema});
function applyFive(r:RunSummary,tier:'light'|'deep'){
 const d=fiveDefinition(tier),values=tier==='light'?[80,70,90,80,60]:[81,72,89,82,65],count=d.domains.reduce((sum,domain)=>sum+domain.itemIds.length,0);
 const reference=params.has('withReference')&&tier==='light'?builtInReferences[0]?.summary:undefined;
 r.metrics.tracks.general!.answer.taskTiming={schema:'task-duration-v1',meanMs:24000,required:count,measured:count,complete:true};r.protocols=reference?.protocols??fiveRefs(tier);r.generalDefinition=reference?.generalDefinition??d;r.tracks.general={status:'completed',required:count,graded:count,answered:count,completedAt:r.createdAt!,score:values.reduce((a,b)=>a+b,0)/5,measures:Object.fromEntries(d.domains.map((domain,i)=>[domain.id,{required:domain.itemIds.length,graded:domain.itemIds.length,score:values[i]!}]))};
}
const fixtureRefs=(id?:string)=>id===fiveLight||id===fiveDeep?fiveRefs(id===fiveLight?'light':'deep'):id===lightId||id===deepId?{generalId:id,writingId:protocols.writingId,resourceVersion:'two-tier-v1'}:protocols;
const fixtureDefinition=(tier:'light'|'deep')=>({tier,label:tier==='light'?'轻量':'深入',definitionHash:'synthetic-'+tier,...(tier==='deep'?{parentGeneralId:lightId}:{}),domains:['knowledge','math','instructions','coding'].map(id=>({id:id as any,weight:.25,itemIds:Array.from({length:tier==='light'?30:100},(_,i)=>id==='knowledge'?(i<(tier==='deep'?80:fiveSchema==='task-five-v2'?16:24)?'knowledge/mmlu-pro/':'math/olympiad-text-math/')+i:'synthetic/'+id+'/'+i)}))});
function applyTier(r:RunSummary,tier:'light'|'deep'){const values=Object.values(r.tracks.general!.measures).map(m=>m.score??75),n=tier==='light'?30:100;r.protocols=fixtureRefs(tier==='light'?lightId:deepId);r.generalDefinition=fixtureDefinition(tier);r.tracks.general!.required=n*4;r.tracks.general!.graded=n*4;r.tracks.general!.answered=n*4;r.tracks.general!.measures=Object.fromEntries(['knowledge','math','instructions','coding'].map((id,i)=>[id,{required:n,graded:n,score:values[i]??75}]));r.metrics.tracks.general!.answer.calls=n*4;r.metrics.tracks.general!.answer.taskTiming={schema:'task-duration-v1',meanMs:24000,required:n*4,measured:n*4,complete:true};}
const models=[{scopeId:'fixture',providerId:'local-lab',modelId:'Atlas-32B-Instruct',displayName:'Atlas-32B-Instruct',capabilities:{}},{scopeId:'fixture',providerId:'local-lab',modelId:'Orion-14B-Reasoning-Long-Deployment-Name',displayName:'Orion-14B-Reasoning-Long-Deployment-Name',capabilities:{}},{scopeId:'fixture',providerId:'local-lab',modelId:'Nebula-7B',displayName:'Nebula-7B',capabilities:{}},{scopeId:'fixture',providerId:'lab-review',modelId:'Reviewer-Large-v2',displayName:'Reviewer-Large-v2',capabilities:{}}];
if(params.has('manyModels'))models.push(...Array.from({length:24},(_,i)=>({...models[0]!,modelId:'Additional-model-'+i,displayName:'Additional-model-'+i+'-Long-Deployment-Name-For-Layout-Checks'})));
if(params.has('namedModels'))models.splice(0,models.length,...[
 {providerId:'local-lab',modelId:'atlas-32b-instruct',displayName:'Atlas 32B'},
 {providerId:'second-lab',modelId:'atlas-32b-instruct',displayName:'Atlas 32B'},
 {providerId:'local-lab',modelId:'orion-reasoning',displayName:'Orion Reasoning'},
 {providerId:'local-lab',modelId:'nebula-7b',displayName:'Nebula 7B'},
 {providerId:'local-lab',modelId:'helios-coder',displayName:'Helios Coder'},
 {providerId:'lab-review',modelId:'reviewer-large',displayName:'Reviewer Large'},
].map(m=>({scopeId:'fixture',capabilities:{},...m})));
if(params.has('longNamedModel'))Object.assign(models[1]!,{displayName:'Atlas Enterprise Reasoning Long Deployment Name for Multilingual Workloads',modelId:'atlas-32b-instruct-enterprise-reasoning-long-context-quantized-deployment-revision-2026-11'});
const target=(modelId:string,temp=.7,deployment='INT8'):TargetSnapshot=>({scopeId:'fixture',providerId:'local-lab',modelId,routeTarget:{state:'known',value:'http://localhost:8000/v1',source:'adapter'},deployment:{value:deployment,source:'user'},controls:{temperature:{state:'known',value:temp,source:'adapter'},maxTokens:{state:'known',value:8192,source:'adapter'},reasoningEffort:{state:'known',value:'medium',source:'adapter'},stop:{state:'unset'}}});
const judge=(modelId:string):JudgeSnapshot=>({target:target(modelId,.1,''),rubricId:'work-writing-five-dimensions-v1',promptId:'writing-judge-json-v1'});
function run(model:string,scores:number[],writing:number,temp=.7,deployment='INT8'):RunSummary {
  const runId=crypto.randomUUID(),batchId=crypto.randomUUID(),createdAt='2026-10-31T02:10:00.000Z';
  return {runId,batchId,target:target(model,temp,deployment),protocols,createdAt,completedAt:createdAt,revision:1,details:'available',resumeAllowed:true,
    tracks:{general:{status:'completed',required:905,graded:905,answered:905,completedAt:createdAt,score:scores.reduce((n,x)=>n+x,0)/4,measures:Object.fromEntries(['tiny-mmlu','tiny-gsm8k','ifeval','humaneval-plus'].map((id,i)=>[id,{required:[100,100,541,164][i]!,graded:[100,100,541,164][i]!,score:scores[i]!}]))},writing:{status:'completed',required:12,graded:12,answered:12,score:writing,completedAt:createdAt,measures:Object.fromEntries(['faithfulness','logic','coverage','concision','naturalness'].map(k=>[k,{required:12,graded:12,score:writing/25}]))}},
    judges:[{snapshot:judge('Reviewer-Large-v2'),itemIds:['writing/1','writing/2','writing/3','writing/4','writing/5'],calls:5},{snapshot:judge('Reviewer-Previous'),itemIds:Array.from({length:7},(_,i)=>'writing/'+(i+6)),calls:7}],
    metrics:{tracks:{general:{answer:{calls:905,failures:0,taskTiming:{schema:'task-duration-v1',meanMs:24000,required:905,measured:905,complete:true},latencyMedianMs:12500,latencyP95Ms:34300,inputTokens:1863250,outputTokens:451840,usageCoverage:1,ttftMedianMs:400},judge:{calls:0,failures:0,usageCoverage:0},gradingMs:14500},writing:{answer:{calls:12,failures:0,taskTiming:{schema:'task-duration-v1',meanMs:26000,required:12,measured:12,complete:true},latencyMedianMs:18300,latencyP95Ms:37200,inputTokens:23410,outputTokens:19490,usageCoverage:1},judge:{calls:12,failures:0,latencyMedianMs:12000,inputTokens:21200,outputTokens:3200,usageCoverage:1},gradingMs:5}},activeIntervals:[{startedAt:createdAt,endedAt:'2026-10-31T03:05:00.000Z'}],incompleteTiming:false}};
}
let runs:RunSummary[]=(params.has('empty')||params.has('speedOnly'))?[]:[run(models[0]!.modelId,[82,79,76,85],81.3),run(models[0]!.modelId,[80,74,75,83],77.5,.7,'Q4-v2'),run(models[1]!.modelId,[74,68,81,69],79.2,.4,'微调-v3'),run(models[2]!.modelId,[62,59,68,57],66.7,.7,'Q4')];
if(params.has('writingTiming')){
  runs=[run('Fast report',[82,79,76,85],85),run('Careful report',[82,79,76,85],90)];
  for(const [i,r] of runs.entries()){
    r.protocols={...r.protocols,writingId:'work-writing-12-v3'};
    const metrics=structuredClone(r.metrics);
    r.metrics.tracks.writing!.answer.taskTiming!.meanMs=[30860.585,92464.147][i]!;
    r.reuse={operationId:'fixture',sourceRunId:'source',mixedPeriod:true,reusedItems:73,
      sourceAnswerMetrics:metrics.tracks.general!.answer,sourceActivity:{scope:'source-items',tracks:['general','writing'],activeIntervals:[],incompleteTiming:false},
      writingReplacement:{sourceBatchId:'old',fromItemId:'writing/ziya:13',toItemId:'writing/dsh-original:community-fund-report-01',sourceMetrics:metrics}};
  }
}
if(params.has('tiers')&&runs.length===4){const source=runs[0]!,deep=structuredClone(source),legacy=runs[2]!,other=runs[3]!;deep.runId=crypto.randomUUID();deep.batchId=crypto.randomUUID();applyTier(source,'light');applyTier(deep,'deep');applyTier(other,'light');deep.tracks.general!.completedAt='2026-11-01T04:00:00Z';if(params.has('upgradeUnavailable')){source.details='cleared';source.resumeAllowed=false;}runs=[source,deep,legacy,other];}
if(params.has('five')&&runs.length===4){const source=runs[0]!,deep=structuredClone(source),peer=runs[1]!,legacy=runs[2]!;deep.runId=crypto.randomUUID();deep.batchId=crypto.randomUUID();applyFive(source,'light');applyFive(peer,'light');applyFive(deep,'deep');runs=[source,peer,deep,legacy];}
if(params.has('commonEdition')){
 const latest=runs[1]!;latest.protocols={...latest.protocols,generalId:'general-task-five-v3-light',resourceVersion:'task-five-v3'};latest.generalDefinition={...latest.generalDefinition!,schema:'task-five-v3',definitionHash:'synthetic-v3-light'};
 if(params.has('commonCleared'))runs[0]!.details='cleared';
}
if(params.has('offlineR1')){const fixed=builtInReferences.find(r=>r.summary.regradeOrigin)!.summary;const original=runs[0]!;runs=[0,1,2].map(i=>{const r=structuredClone(fixed);r.runId=crypto.randomUUID();r.batchId=crypto.randomUUID();r.details='available';r.target=target(['deepseek-v4.1-flash','glm-5.3','glm-5.3-flash'][i]!,.7,'');r.tracks.general!.score=[90.5,82.7,81.4][i]!;Object.values(r.tracks.general!.measures).forEach((m,j)=>m.score=[[100,62.5,90,100,100],[94.7,62.5,85,100,71.4],[94.7,75,80,100,57.1]][i]![j]!);return r;});runs.push(original);}
if(params.has('offlineR2')){const r=structuredClone(builtInReferences.find(r=>r.summary.protocols.generalId==='general-task-five-v3-r2-deep')!.summary);r.runId=crypto.randomUUID();r.batchId=crypto.randomUUID();r.details='available';r.target=target('deepseek-v4.1-flash',.7,'');r.tracks.general!.score=81.22822311787829;const timing=r.regradeOrigin!.sourceTaskTiming!.timing;timing.meanMs=71563.25495015293;for(const d of timing.domains!)d.meanMs=timing.meanMs;runs=[r];}
if(params.has('providerPair')){runs=[run('Shared-model',[80,80,80,80],80),run('Shared-model',[78,78,78,78],78)];runs[1]!.target.providerId='second-lab';runs[1]!.metrics.tracks.general!.answer.latencyMedianMs=20000;runs[1]!.metrics.tracks.general!.answer.taskTiming!.meanMs=32000;}
if(params.has('overlap')&&runs[1])runs[1].tracks.general!.score=runs[0]!.tracks.general!.score;
if(params.has('manyResults'))runs.push(...[0,1,2].map(i=>run('Additional-result-'+i,[86+i,75+i,85-i,87-i],80+i,.2+i/10,'v'+i)));
if(params.has('nearScores'))for(const [i,r] of runs.entries()){r.tracks.general!.score=95.5+i*.2;for(const m of Object.values(r.tracks.general!.measures))m.score=95.5+i*.2;}
if(params.has('unknownProtocol')&&runs[0]){runs[0].protocols={...protocols,generalId:'archived-unknown'};runs[0].tracks.general!.measures={};}
if(runs[3])runs[3].metrics.tracks.general!.answer={calls:905,failures:0,usageCoverage:0};
if(params.has('legacyTiming'))for(const r of runs)for(const m of Object.values(r.metrics.tracks))delete m.answer.taskTiming;
if(params.has('history')&&runs[0]){const old=structuredClone(runs[0]);old.runId=crypto.randomUUID();old.details='cleared';old.tracks.general!.score=72;old.tracks.general!.completedAt='2026-10-27T02:10:00.000Z';old.tracks.writing!.completedAt='2026-10-27T02:10:00.000Z';old.judges=[{snapshot:judge('Previous-Judge'),itemIds:['writing/1']}];runs.push(old);}
const attemptLogFixtures:AttemptRecord[]=[
  {
    attemptId:'fixture-log-new',phase:'judge',status:'failed',startedAt:'2026-11-17T11:00:00Z',endedAt:'2026-11-17T11:00:16Z',
    rawText:'fixture-raw-judge-secret',
    error:{code:'UPSTREAM_ERROR',phase:'judge',retryable:false,message:'fixture-raw-error-secret',
      upstream:{codes:['PI_AI_ERROR','ECONNRESET'],finishReason:'network_error',httpStatus:502,statusFromMessage:true,
        requestId:'req_fixture_example_123',detail:'connection reset by peer'}},
    observations:{attemptId:'fixture-log-new',itemId:'fixture/log',track:'writing',phase:'judge',startedAt:'2026-11-17T11:00:00Z',
      endedAt:'2026-11-17T11:00:16Z',streamFinishReason:'error',textReceived:false,usage:{available:false},
      timing:{prepareMs:50,streamMs:15000,totalMs:15050,firstOutputMs:3466,lastOutputMs:14715,sawReasoning:true,outputTokenScope:'unknown'}},
  },
  {
    attemptId:'fixture-log-legacy',phase:'judge',status:'failed',startedAt:'2026-11-17T12:00:00Z',endedAt:'2026-11-17T12:01:15Z',rawText:'',
    error:{code:'UPSTREAM_ERROR',phase:'judge',retryable:false,message:'fixture error',upstream:{codes:['PI_AI_ERROR'],detailFiltered:true}},
    observations:{attemptId:'fixture-log-legacy',itemId:'fixture/log',track:'writing',phase:'judge',startedAt:'2026-11-17T12:00:00Z',
      endedAt:'2026-11-17T12:01:15Z',usage:{available:true,inputTokens:2239,outputTokens:2792},
      timing:{prepareMs:46,streamMs:74749,totalMs:74795,firstOutputMs:3466,lastOutputMs:74465,sawReasoning:true,outputTokenScope:'unknown'}},
  },
  {
    attemptId:'fixture-log-invalid',phase:'judge',status:'completed',startedAt:'2026-11-17T13:00:00Z',endedAt:'2026-11-17T13:00:17Z',
    validationError:{code:'INVALID_JUDGE_RESULT',phase:'judge',retryable:true,message:'fixture invalid'},
    observations:{attemptId:'fixture-log-invalid',itemId:'fixture/log',track:'writing',phase:'judge',startedAt:'2026-11-17T13:00:00Z',
      endedAt:'2026-11-17T13:00:17Z',streamFinishReason:'stop',textReceived:true,usage:{available:false}},
  },
];
let diagnosticEnabled=false,diagnosticRecord:import('../../src/diagnostics/contracts.ts').CodingDiagnosticRecord|undefined;
const previewRuns=(window as Window&{timingPreviewRuns?:RunSummary[]}).timingPreviewRuns;
if(previewRuns){runs=previewRuns;protocols.writingId='work-writing-12-v3';}
let batches:BatchView[]=runs.map(x=>({batchId:x.batchId,runIds:[x.runId],status:'completed',createdAt:x.createdAt!,execution:{concurrency:4,callTimeoutMs:300000}})),active:string|undefined,prepared=!params.has('empty')&&!params.has('environmentUnprepared'),tierPreparationDone=false,root='C:\\Users\\demo\\.dsh-model-coordinates';
if(params.has('batchRecords')){
  const finished=Array.from({length:8},(_,index)=>{
    const name=index===0?models[1]!.modelId:index===1?models[0]!.modelId:'Model-'+(index+1);
    const row=run(name,[82,79,76,85],81+index);
    row.batchId='f0000001-0000-4000-8000-000000000001';
    row.createdAt='2026-11-18T03:04:00Z';
    return row;
  });
  const paused=run('Paused-model',[75,80,85,80],78);
  paused.batchId='f0000002-0000-4000-8000-000000000002';
  paused.createdAt='2026-11-17T03:04:00Z';
  delete paused.completedAt;
  const writing=paused.tracks.writing!;
  writing.status='pending';
  writing.graded=7;
  delete writing.score;
  delete writing.completedAt;
  const cleared=run('Legacy-cleared-model',[65,70,75,80],86);
  cleared.batchId='f0000003-0000-4000-8000-000000000003';
  cleared.createdAt='2026-11-16T03:04:00Z';
  cleared.details='cleared';
  cleared.resumeAllowed=false;
  runs=[cleared,paused,...finished];
  batches=[
    {batchId:paused.batchId,runIds:[paused.runId],status:'paused',createdAt:paused.createdAt,execution:{concurrency:1,callTimeoutMs:300000}},
    {batchId:finished[0]!.batchId,runIds:finished.map(row=>row.runId),status:'completed',createdAt:finished[0]!.createdAt!,execution:{concurrency:1,callTimeoutMs:300000}},
  ];
}
if(params.has('running')){const r=runs[0]!;runs=[r];r.createdAt=new Date(Date.now()-305000).toISOString();delete r.completedAt;r.metrics.activeIntervals=[{startedAt:r.createdAt}];r.metrics.tracks.general!.answer.usageCoverage=.9;for(const t of Object.values(r.tracks)){t.status='running';t.graded=Math.floor(t.required/2);delete t.score;}batches=[{batchId:r.batchId,runIds:[r.runId],status:'running',createdAt:r.createdAt,execution:{concurrency:4,callTimeoutMs:300000}}];active=r.batchId;}
if(params.has('cacheTotals')){const r=runs[0]!;delete r.tracks.writing;r.metrics.tracks={general:{answer:{calls:1,failures:0,usageCoverage:1,inputTokens:10,outputTokens:20,totalTokens:120,cacheReadTokens:90,recordedTokens:120,recordedUsageCoverage:1},judge:{calls:0,failures:0,usageCoverage:0},gradingMs:0}};}
if(params.has('cacheBoth')){const p=runs[0]!.metrics.tracks.general!.answer;p.cacheReadTokens=432768;p.cacheWriteTokens=123456;p.totalTokens=p.recordedTokens=1234567;}
if(params.has('pending')){runs=[runs[0]!];runs[0]!.tracks.writing!.status='pending';runs[0]!.tracks.writing!.graded=7;delete runs[0]!.tracks.writing!.score;batches=[{batchId:runs[0]!.batchId,runIds:[runs[0]!.runId],status:'pending',createdAt:runs[0]!.createdAt!,execution:{concurrency:4,callTimeoutMs:300000},lastError:{code:'ABORTED',phase:'answer',message:'本轮评测需要处理后继续。',retryable:false}}];}
if(params.has('runControls')){
  const group=runs.slice(1,4);
  const [held,running,queued]=group;
  if(held&&running&&queued){
    const batchId=held.batchId;
    for(const [index,run] of group.entries()){
      run.batchId=batchId;
      delete run.completedAt;
      const track=run.tracks.general!;
      track.required=62;
      track.graded=index===0?27:0;
      track.answered=track.graded;
      track.status=index===0?'pending':index===1?'running':'queued';
      delete track.score;
      delete track.completedAt;
      delete run.tracks.writing;
      delete run.metrics.tracks.writing;
    }
    runs=group;
    active=batchId;
    batches=[{
      batchId,status:'running',createdAt:held.createdAt!,runIds:group.map(run=>run.runId),
      activeRunId:running.runId,execution:{concurrency:4,callTimeoutMs:300000},
      runControls:{[held.runId]:{state:'held',error:{code:'INVALID_REQUEST',phase:'answer',message:'接口未能完成此次作答。',retryable:false}}},
    }];
  }
}
if(params.has('upstreamCases')&&params.has('runControls')){
  const batch=batches[0]!;
  const causes=['overload','transport','unknown'] as const;
  active=undefined;
  batch.status='pending';
  delete batch.activeRunId;
  batch.runControls=Object.fromEntries(runs.map((run,index)=>{
    run.tracks.general!.status='pending';
    return [run.runId,{state:'held',error:{code:'UPSTREAM_ERROR',phase:'answer',message:'fixture',retryable:false,
      upstreamCause:causes[index]!}}];
  }));
}
if(params.has('eta')&&batches[0]){batches[0].estimate={algorithm:'estimate-v1',asOf:new Date().toISOString(),state:'available',remainingMs:{low:600000,high:1200000},totalMs:{low:905000,high:1505000},coverage:{known:6,required:6},sources:['current'],reasons:[]};runs[0]!.estimation={current:batches[0].estimate};}
function firstPassSnapshot(done=false):EstimateSnapshot{return {algorithm:'estimate-v3',asOf:new Date().toISOString(),state:done?'completed':'available',referenceRemainingMs:done?0:1440000,referenceTotalMs:1440000,coverage:{known:done?100:0,required:100},sources:['local-history:synthetic'],reasons:['RANGE_NOT_CALIBRATED'],basis:{durationScope:'first-pass',phase:done?'first-pass':'preview',programHash:'a'.repeat(64),baselineIds:['synthetic'],probeTraceIds:['synthetic'],deferredItems:done?2:0}};}
if(params.has('firstPass')){const r=runs[0]!;runs=[r];applyFive(r,'light');delete r.tracks.writing;delete r.metrics.tracks.writing;delete r.tracks.general!.score;r.tracks.general!.status='pending';r.tracks.general!.graded=98;const estimate=firstPassSnapshot(true);r.estimation={current:estimate,final:estimate};batches=[{batchId:r.batchId,runIds:[r.runId],status:'pending',createdAt:r.createdAt!,execution:{concurrency:4,callTimeoutMs:300000},estimate}];active=undefined;}
if(params.has('mixedExecution')){const r=runs[0]!,before={concurrency:4 as const,callTimeoutMs:300000};r.executionChanges=[{at:new Date().toISOString(),before,after:{...before,failurePolicy:'output-idle-v1'},reason:'output-idle-upgrade-v1'}];const estimate:EstimateSnapshot={algorithm:'estimate-v3',asOf:new Date().toISOString(),state:'pending',coverage:{known:0,required:100},sources:[],reasons:['EXECUTION_CHANGED']};r.estimation={...r.estimation,current:estimate};batches[0]!.estimate=estimate;}
let queueOverride:any; (window as any).fixtureRecovered=()=>{queueOverride={[batches[0]!.batchId]:{...batches[0]!.estimate,state:'pending'}};};
(window as any).fixtureEstimate=(mode:string)=>{const b=batches[0]!;b.estimate={...b.estimate!,asOf:new Date().toISOString(),state:mode==='slow'?'available':mode as any,...(mode==='slow'?{remainingMs:{low:2700000,high:3900000}}:{})};for(const r of runs)r.estimation={...r.estimation,current:structuredClone(b.estimate!)};if(mode==='completed'){b.status='completed';b.estimate.remainingMs={low:0,high:0};active=undefined;for(const r of runs){for(const i of r.metrics.activeIntervals)if(!i.endedAt)i.endedAt=new Date().toISOString();}}};
const handles=new Map<string,TargetSnapshot>(),previews=new Map<string,any>(),operations=new Map<string,any>(),attempted=new Set<string>();
const speedRows=new Map<string,SpeedSession>(),speedPolls=new Map<string,number>();let speedActive:string|undefined;
(window as any).fixtureActions=[];(window as any).fixtureRequests=[];
const upgradeRows=new Map<string,any>();
const detailBytes=(r:RunSummary)=>r.details==='cleared'?0:r.details==='partial'?5*1024**2:10*1024**2;
const usage=()=>({historyBytes:runs.reduce((n,r)=>n+detailBytes(r)+4096,2000),resourceBytes:157878838,sharedBytes:2000,measurement:'file-bytes',runs:runs.map(r=>({runId:r.runId,batchId:r.batchId,detailBytes:detailBytes(r),summaryBytes:4096,totalBytes:detailBytes(r)+4096}))});
const timingA=crypto.randomUUID(),timingB=crypto.randomUUID(),timingShared=crypto.randomUUID();let timingFiles=params.has('timing')?[{traceId:timingA,bytes:1024},{traceId:timingB,bytes:1024},{traceId:timingShared,bytes:4096}]:[],timingRows:TimingGroup[]=params.has('timing')?[{id:runs[0]!.runId,kind:'run',createdAt:new Date().toISOString(),active:false,traceIds:[timingA,timingShared]},{id:runs[1]!.runId,kind:'run',createdAt:new Date().toISOString(),active:false,traceIds:[timingB,timingShared]}]:[];
let timingFinishing=params.has('timingFinish'),timingFinishScheduled=false;
if(timingFinishing)timingRows.forEach(g=>g.active=true);
let fixtureRootEpoch=1,comparisonGate:Promise<void>|undefined;
(window as any).fixtureRoot=(value:string,epoch:number)=>{root=value;fixtureRootEpoch=epoch;};
(window as any).holdComparison=()=>{comparisonGate=new Promise<void>(done=>(window as any).releaseComparison=done);};
let initialCatalogGate:Promise<void>|undefined=params.has('holdInitialCatalog')?new Promise<void>((done,fail)=>(window as any).finishInitialCatalog=(error?:string)=>error?fail(new Error(error)):done()):undefined;
let startupChecking=params.has('startupChecking');(window as any).finishStartupCheck=()=>{startupChecking=false;};
async function operation(action:string,p:any):Promise<any>{
  (window as any).fixtureActions.push(action);(window as any).fixtureRequests.push({action,payload:structuredClone(p)});
  if(params.has('latencyAudit')){
    if(action==='controlRun')await new Promise(resolve=>setTimeout(resolve,350));
    if(action==='history'&&(window as any).fixtureActions.includes('controlRun'))
      await new Promise(resolve=>setTimeout(resolve,2300));
    if(action==='catalog'||action==='comparisonMetadata')await new Promise(resolve=>setTimeout(resolve,7000));
  }
  if(action==='catalog'&&initialCatalogGate){const gate=initialCatalogGate;initialCatalogGate=undefined;await gate;}
  if(action==='protocolCatalog'&&params.has('offlineR2'))return builtInReferences.filter(r=>['general-task-five-v3-r1-light','general-task-five-v3-r2-light','general-task-five-v3-r2-deep'].includes(r.summary.protocols.generalId)).map(({summary:r})=>({descriptor:{refs:r.protocols,general:r.generalDefinition,questionCount:r.tracks.general!.required,allowNewRuns:true},prepared}));
  if(action==='protocolCatalog'&&params.has('commonEdition'))return runs.filter(r=>r.generalDefinition?.tier==='light').map(r=>({descriptor:{refs:r.protocols,general:r.generalDefinition,questionCount:r.tracks.general!.required,allowNewRuns:true},prepared:prepared&&(!params.has('tierUnprepared')||r.generalDefinition?.schema!=='task-five-v3'||tierPreparationDone)}));
  if(action==='previewEditionUpgrade'){
    const source=runs.find(r=>r.runId===p.sourceRunId)!,token=crypto.randomUUID(),eligible=source.details==='available',reusedItems=params.get('commonCount')==='60'?60:59;
    const row={token,expiresAt:new Date(Date.now()+300000).toISOString(),check:{eligible,...(!eligible?{reasonCode:'EDITION_DETAILS_UNAVAILABLE'}:{}),sourceRunId:p.sourceRunId,destinationGeneralId:p.destinationGeneralId,mapHash:'synthetic-map',reusedItems,newItems:64-reusedItems,mixedPeriod:true}};upgradeRows.set(token,{...row,source,execution:p.execution});return row;
  }
  if(action==='commitEditionUpgrade'){
    if(p.confirmSameDeployment!==true)throw Error('CONFIRMATION_REQUIRED');const row=upgradeRows.get(p.token),now=new Date().toISOString(),current=structuredClone(runs[1]!) as RunSummary;current.runId=crypto.randomUUID();current.batchId=crypto.randomUUID();current.createdAt=now;delete current.completedAt;delete current.tracks.writing;current.tracks.general!.status='running';current.tracks.general!.graded=row.check.reusedItems;delete current.tracks.general!.score;delete current.tracks.general!.completedAt;
    current.reuse={operationId:p.token,sourceRunId:row.source.runId,mixedPeriod:true,deploymentConfirmedAt:now,reusedItems:row.check.reusedItems,sourceAnswerMetrics:{calls:59,failures:0,usageCoverage:1,totalTokens:5900},sourceActivity:{scope:'source-items',tracks:['general'],activeIntervals:[],incompleteTiming:false}};runs.push(current);const batch:BatchView={batchId:current.batchId,runIds:[current.runId],createdAt:now,status:'running',execution:row.execution};batches.push(batch);active=batch.batchId;return {batchId:current.batchId,runId:current.runId,operationId:p.token};
  }
  switch(action){
 case 'setCodingDiagnostics':diagnosticEnabled=Boolean(p.enabled);return {enabled:diagnosticEnabled};
 case 'codingDiagnostic':return {rootId:root,rootEpoch:fixtureRootEpoch,enabled:diagnosticEnabled,...(diagnosticRecord?{record:diagnosticRecord}:{})};
 case 'startCodingDiagnostic':{
   diagnosticRecord={schemaVersion:1,diagnosticId:crypto.randomUUID(),runId:String(p.runId),itemId:String(p.itemId),startedAt:new Date().toISOString(),status:'running'};
   const id=diagnosticRecord.diagnosticId;
   setTimeout(()=>{if(diagnosticRecord?.diagnosticId===id&&diagnosticRecord.status==='running')diagnosticRecord={...diagnosticRecord,status:'completed',endedAt:new Date().toISOString(),outcome:params.has('diagnosticTrap')?{kind:'failed',reason:'assertion',elapsedMs:1427}:{kind:'passed',elapsedMs:1427},source:{protocols,itemRevision:1,questionHash:'a'.repeat(64),answerHash:'synthetic',gradeHash:'synthetic',limits:{wallMs:60000,computeBudget:800000000000,memoryBytes:536870912},cases:2},trace:{matchedCases:2,verifyMs:317,prepareMs:2,childMs:1100,cleanupMs:8,driver:{status:'complete',startupMs:700,readyObservedMs:850,caseMs:235,completedCases:2}}};},params.has('diagnosticSlow')?60000:1200);
   return {diagnosticId:id};
 }
 case 'cancelCodingDiagnostic':if(diagnosticRecord)diagnosticRecord={...diagnosticRecord,status:'cancelled',endedAt:new Date().toISOString()};return {accepted:true};
 case 'protocolCatalog':if(previewRuns){const source=builtInReferences.find(row=>row.summary.protocols.generalId===runs[0]?.protocols.generalId)?.summary;if(source?.generalDefinition)return [{descriptor:{refs:source.protocols,general:source.generalDefinition,questionCount:source.tracks.general!.required,allowNewRuns:true},prepared}];}return [{descriptor:{refs:protocols,general:{tier:'legacy',label:'通用基线',definitionHash:'synthetic-legacy',domains:[]},questionCount:905,allowNewRuns:true},prepared},...(['light','deep'] as const).map(tier=>({descriptor:{refs:fixtureRefs(tier==='light'?lightId:deepId),general:fixtureDefinition(tier),questionCount:tier==='light'?120:400,allowNewRuns:true},prepared:prepared&&!params.has('tierUnprepared')})),...(params.has('five')?(['light','deep'] as const).map(tier=>({descriptor:{refs:fiveRefs(tier),general:fiveDefinition(tier),questionCount:tier==='light'?(fiveSchema==='task-five-v2'?64:100):350,allowNewRuns:!params.has('fiveUnverified')},prepared:prepared&&!params.has('tierUnprepared')})):[])];case 'status':return {codingDiagnostics:{enabled:diagnosticEnabled},...(diagnosticRecord?.status==='running'?{activeActivity:{kind:'coding-diagnostic',id:diagnosticRecord.diagnosticId,state:'running'}}:{}),rootId:root,rootEpoch:fixtureRootEpoch,ready:true,prepared:prepared&&!startupChecking,preparing:startupChecking,writable:true,rootPath:root,...protocols,packageBytes:157878838,...(timingFinishing?{activeActivity:{kind:'evaluation',id:'synthetic-short-activity',state:'running'}}:{}),...(speedActive?{activeActivity:{kind:'speed-preview',id:speedActive,state:speedRows.get(speedActive)?.status==='stopping'?'stopping':'running'}}:{})};case 'comparisonMetadata':{const capturedRoot=root,capturedEpoch=fixtureRootEpoch,gate=comparisonGate;comparisonGate=undefined;const summaries=structuredClone(runs);if(params.has('scopeRace'))for(const r of summaries)r.target.modelId='Epoch-'+capturedEpoch+'-'+r.target.modelId;if(gate){(window as any).comparisonHeld=true;await gate;(window as any).comparisonReleased=true;}if(params.has('rootRace'))for(const r of summaries)r.target.modelId='CurrentRoot-'+r.target.modelId;return {rootId:capturedRoot,rootEpoch:capturedEpoch,summaries,runs:summaries.map(r=>({runId:r.runId,revision:r.revision,execution:{state:'known',concurrency:params.has('chartConditions')&&r===summaries[1]?2:4,callTimeoutMs:300000},conditionAvailable:true}))};}case 'catalog':return params.has('noModels')?[]:params.has('singleModel')?models.slice(0,1):models;case 'history':{if(params.has('rootRace'))return runs.map(r=>({...r,target:{...r.target,modelId:'WrongRoot-'+r.target.modelId}}));if(active&&!params.has('cacheTotals')&&!params.has('runControls'))for(const r of runs.filter(r=>r.batchId===active)){const phase=r.metrics.tracks.general?.answer??r.metrics.tracks.writing?.answer;if(phase){phase.inputTokens=(phase.inputTokens??0)+100;phase.outputTokens=(phase.outputTokens??0)+10;}}return runs;}case 'queue':return {batches,estimates:queueOverride??Object.fromEntries(batches.filter(b=>b.estimate).map(b=>[b.batchId,b.estimate])),...(active?{activeBatchId:active}:{})};case 'settings':return {prepared,rootPath:root,writable:true};case 'usage':return {...usage(),timingBytes:timingFiles.reduce((n,f)=>n+f.bytes,0),previews:[...speedRows.keys()].map(previewId=>({previewId,totalBytes:8192}))};
    case 'startSpeedPreview':{const previewId=crypto.randomUUID(),now=new Date().toISOString();const row:SpeedSession={version:1,rootId:'fixture',previewId,revision:1,createdAt:now,updatedAt:now,budgetMinutes:p.budgetMinutes,status:'running',configs:p.handles.map((handle:string,i:number)=>({conditionKey:handle,target:handles.get(handle)!,tracks:p.tracks,protocols:fixtureRefs(p.generalId),execution:p.execution,status:i===0?'running':'queued',startedAt:now,performance:{version:1,activeStages:[],censoredBounds:[],samples:[{sampleId:crypto.randomUUID(),itemId:'fixture/probe',conditionKey:handle,datasetId:'tiny-mmlu',phase:'answer',startedAt:now,endedAt:now,durationMs:2000,outcome:'completed',...(params.has('speedMissing')?{}:{timing:{prepareMs:20,streamMs:1980,totalMs:2000,firstOutputMs:300,sawReasoning:false,outputTokenScope:'observable-generated'},tpotMs:12}),usage:{inputTokens:100,outputTokens:60}}]}})),estimate:{algorithm:'estimate-v1',asOf:now,state:'available',remainingMs:{low:2700000,high:3900000},...(params.has('speedRough')?{approximate:true}:{}),coverage:{known:params.has('speedRough')?9:4,required:params.has('speedRough')?11:4},sources:['preview:'+previewId],reasons:[]}};if(params.has('speedRough'))row.estimate={algorithm:'estimate-v2',asOf:now,state:'partial',observedRemainingMs:600000,coverage:{known:8,required:11},sources:['preview'],reasons:['MISSING_STAGE:code-contests-selected:answer','MISSING_STAGE:code-contests-selected:local-grade','MISSING_STAGE:bfcl-v4-multi-turn-selected:tool-scenario']};if(params.has('speedMeasured'))row.estimate={algorithm:'estimate-v2',asOf:now,state:'available',referenceRemainingMs:1320000,coverage:{known:11,required:11},sources:['preview'],reasons:[]};if(params.has('speedLegacyApprox'))row.estimate={algorithm:'estimate-v1',asOf:now,state:'available',approximate:true,remainingMs:{low:240000,high:3120000},coverage:{known:8,required:11},sources:['approximation'],reasons:[]};if(params.has('firstPass')){row.probeMethod='speed-probe-v4';row.estimate=firstPassSnapshot();}speedRows.set(previewId,row);speedActive=previewId;return {previewId};}
    case 'speedPreviewStatus':{const row=speedRows.get(p.previewId)!,n=(speedPolls.get(p.previewId)??0)+1;speedPolls.set(p.previewId,n);if(params.has('speedBudgetEnd')){row.configs[0]!.status='stopping';return row;}if(row.status==='running'&&!params.has('speedSlow')&&n>=3){row.status=row.status==='stopping'?'stopped':'completed';row.configs.forEach(c=>{c.status=row.status==='stopped'?'stopped':'completed';c.endedAt=new Date().toISOString();});row.revision++;speedActive=undefined;}return row;}
    case 'cancelSpeedPreview':{const row=speedRows.get(p.previewId)!;row.status='stopping';setTimeout(()=>{row.status='stopped';row.configs.forEach(c=>{c.status='stopped';});row.revision++;speedActive=undefined;},1800);speedPolls.set(p.previewId,0);return {accepted:true,status:'stopping'};}
    case 'timingHistory':if(timingFinishing&&!timingFinishScheduled){timingFinishScheduled=true;setTimeout(()=>{timingFinishing=false;timingRows=timingRows.map(g=>({...g,active:false}));timingFiles[0]!.bytes+=1024;},300);}return {groups:[...timingRows],traces:[...timingFiles],totalBytes:timingFiles.reduce((n,f)=>n+f.bytes,0)};
    case 'previewTimingCleanup':{const traceIds=timingCleanupIds(timingRows,p.groupIds),token=crypto.randomUUID(),bytes=timingFiles.filter(f=>traceIds.includes(f.traceId)).reduce((n,f)=>n+f.bytes,0),preview={token,traceIds,bytes,expiresAt:new Date(Date.now()+600000).toISOString()};previews.set(token,{...preview,groupIds:p.groupIds});return preview;}
    case 'commitTimingCleanup':{const preview=previews.get(p.token);await new Promise(r=>setTimeout(r,250));timingRows=timingRows.filter(g=>!preview.groupIds.includes(g.id));timingFiles=timingFiles.filter(f=>!preview.traceIds.includes(f.traceId));return {token:p.token,status:'completed',deletedBytes:preview.bytes,remainingBytes:0,unconfirmedBytes:0};}
    case 'speedHistory':return [...speedRows.values()];
    case 'previewSpeedCleanup':{const token=crypto.randomUUID(),preview={token,rootId:'fixture',previewIds:p.previewIds,bytes:p.previewIds.length*8192,expiresAt:new Date(Date.now()+600000).toISOString()};previews.set(token,preview);return preview;}
    case 'speedCleanupStatus':return operations.get(p.token)??null;
    case 'commitSpeedCleanup':{const preview=previews.get(p.token),partial=params.has('partialSpeed')&&!attempted.has(p.token),op={operationId:p.token,rootId:'fixture',status:partial?'partial':'completed',plannedBytes:preview.bytes,deletedBytes:partial?0:preview.bytes-1024,remainingBytes:partial?preview.bytes-1024:0,unconfirmedBytes:1024,files:[]};operations.set(p.token,{...op,status:'running'});await new Promise(r=>setTimeout(r,700));attempted.add(p.token);if(!partial)for(const id of preview.previewIds)speedRows.delete(id);operations.set(p.token,op);return op;}

    case 'prepare':await new Promise(r=>setTimeout(r,params.has('slowPrepare')?3000:150));prepared=true;tierPreparationDone=true;return {prepared};case 'setRoot':root=p.path;return {rootPath:root,historyMoved:false};
    case 'snapshot':{if(params.has('snapshotFailOnce')&&(window as any).fixtureActions.filter((a:string)=>a==='snapshot').length===1)throw Error('Synthetic snapshot unavailable');const handle=crypto.randomUUID(),snapshot=target(p.modelId);snapshot.providerId=p.providerId;delete snapshot.deployment;Object.assign(snapshot.controls,p.overrides??{});if(p.deployment)snapshot.deployment={value:p.deployment,source:'user'};handles.set(handle,snapshot);return {handle,target:snapshot,fingerprint:handle};}
    case 'previewUpgrade':{const source=runs.find(r=>r.runId===p.sourceRunId)!,token=crypto.randomUUID(),eligible=source.details==='available'&&!params.has('upgradeMismatch'),check={eligible,...(!eligible?{reasonCode:source.details==='available'?'UPGRADE_TARGET_CHANGED':'UPGRADE_DETAILS_UNAVAILABLE'}:{}),sourceRunId:source.runId,sourceRevision:source.revision,sourceEvidenceHash:'synthetic',destinationEvidenceHash:'synthetic',targetBindingHash:'synthetic',deepGeneralId:source.generalDefinition?.schema==='task-five-v1'?fiveDeep:deepId,reusedItems:eligible?(source.generalDefinition?.schema==='task-five-v1'?100:120):0,newItems:eligible?(source.generalDefinition?.schema==='task-five-v1'?250:280):0},row={token,expiresAt:new Date(Date.now()+300000).toISOString(),check};upgradeRows.set(token,{...row,source,execution:p.execution});return row;}
    case 'commitUpgrade':{const row=upgradeRows.get(p.token);if(row.result)return row.result;await new Promise(r=>setTimeout(r,400));if(params.has('upgradeCommitFail'))throw Error('补测预览已失效，请重新核对。');const current=structuredClone(row.source) as RunSummary,now=new Date().toISOString();current.runId=crypto.randomUUID();current.batchId=crypto.randomUUID();current.createdAt=now;delete current.completedAt;if(row.source.generalDefinition?.schema==='task-five-v1')applyFive(current,'deep');else applyTier(current,'deep');delete current.tracks.writing;current.tracks.general!.status='running';current.tracks.general!.graded=row.check.reusedItems;current.tracks.general!.answered=row.check.reusedItems;delete current.tracks.general!.score;delete current.tracks.general!.completedAt;current.tracks.general!.measures={};current.metrics={tracks:{general:{answer:{calls:0,failures:0,usageCoverage:0},judge:{calls:0,failures:0,usageCoverage:0},gradingMs:0}},activeIntervals:[{startedAt:now}],incompleteTiming:false};current.reuse={operationId:p.token,sourceRunId:row.source.runId,reusedItems:row.check.reusedItems,sourceAnswerMetrics:{calls:120,failures:0,usageCoverage:1,totalTokens:30000,inputTokens:12000,outputTokens:18000},sourceActivity:{scope:'source-run',tracks:['general','writing'],activeIntervals:structuredClone(row.source.metrics.activeIntervals),incompleteTiming:false}};runs.push(current);const batch:BatchView={batchId:current.batchId,runIds:[current.runId],createdAt:now,status:'running',execution:row.execution};batches.push(batch);active=batch.batchId;row.result={batchId:current.batchId,runId:current.runId,operationId:p.token};return row.result;}
    case 'createBatch':{const batchId=crypto.randomUUID(),batch:BatchView={batchId,createdAt:new Date().toISOString(),status:'running',runIds:[],execution:p.execution};for(const handle of p.handles){const current=run(handles.get(handle)!.modelId,[50,50,50,50],50);current.batchId=batchId;if(p.previewId){current.estimation={current:speedRows.get(p.previewId)!.estimate!,originPreview:structuredClone(speedRows.get(p.previewId)!)};batch.estimate=speedRows.get(p.previewId)!.estimate!;}current.target=structuredClone(handles.get(handle)!);if(p.generalId===lightId||p.generalId===deepId)applyTier(current,p.generalId===lightId?'light':'deep');if(p.generalId===fiveLight||p.generalId===fiveDeep)applyFive(current,p.generalId===fiveLight?'light':'deep');current.createdAt=new Date().toISOString();delete current.completedAt;current.metrics.activeIntervals=[{startedAt:current.createdAt}];for(const track of ['general','writing'] as Track[]){if(!p.tracks.includes(track)){delete current.tracks[track];delete current.metrics.tracks[track];continue;}const value=current.tracks[track]!;value.status='running';value.graded=3;value.answered=4;delete value.score;delete value.completedAt;value.measures={};}runs.push(current);batch.runIds.push(current.runId);}batches.push(batch);active=batchId;return batch;}
    case 'controlRun':{
      const b=batches.find(batch=>batch.batchId===p.batchId)!;
      const state=b.runControls??(b.runControls={});
      if(p.operation==='hold'||p.operation==='remove'){
        state[p.runId]={state:p.operation==='hold'?'held':'removed'};
        if(b.activeRunId===p.runId){
          const next=b.runIds.find(runId=>!state[runId]);
          if(next)b.activeRunId=next;
          else{delete b.activeRunId;active=undefined;b.status='pending';}
        }
      }else{
        delete state[p.runId];
        if(!b.activeRunId&&b.status!=='paused'){b.activeRunId=p.runId;b.status='running';active=b.batchId;}
      }
      return {batches};
    }
    case 'pause':{const b=batches.find(x=>x.batchId===p.batchId)!;b.status='paused';delete b.activeRunId;if(b.estimate)b.estimate={...b.estimate,state:'paused'};for(const r of runs.filter(r=>b.runIds.includes(r.runId)))for(const i of r.metrics.activeIntervals)if(!i.endedAt)i.endedAt=new Date().toISOString();active=undefined;return {batches};}
    case 'resume':{const b=batches.find(x=>x.batchId===p.batchId)!;if(params.has('eta')){b.status='running';active=b.batchId;b.estimate={...b.estimate!,state:'calibrating'};for(const r of runs)r.metrics.activeIntervals.push({startedAt:new Date().toISOString()});return {batches};}b.status='completed';active=undefined;for(const id of b.runIds){const r=runs.find(x=>x.runId===id)!;for(const value of Object.values(r.tracks)){value.status='completed';value.graded=value.required;value.answered=value.required;value.score=75;value.completedAt=new Date().toISOString();}r.revision++;}return {batches};}
    case 'report':{const summary=runs.find(x=>x.runId===p.runId)!;return {rootId:root,rootEpoch:fixtureRootEpoch,summary,...(!params.has('unrecordedExecution')?{execution:{...batches.find(b=>b.batchId===summary.batchId)?.execution,...(params.has('newTimeoutPolicy')?{failurePolicy:'skip-observed-timeout-v1'}:{})}}:{}),...(p.includeQuestions===false?{}:{questions:params.has('attemptLog')?[{id:'writing/fixture-log',datasetId:'writing',track:'writing',answered:true,grade:null}]:params.has('longReport')?Array.from({length:80},(_,i)=>({id:'fixture/q'+i,datasetId:'tiny-mmlu',track:'general',answered:true,grade:{kind:'scored',track:'general',passed:false,evidence:{metric:'accuracy'}}})):[{id:params.has('codingDiagnostics')?'coding/fixture/1':'tiny-mmlu/tiny-mmlu:0',datasetId:params.has('codingDiagnostics')?'code-contests-selected':'tiny-mmlu',track:'general',answered:true,grade:{kind:'scored',track:'general',itemId:'tiny-mmlu/tiny-mmlu:0',passed:false,evidence:{metric:'accuracy'}}}]} )};}
    case 'item':if(params.has('longReport'))await new Promise(r=>setTimeout(r,150));return {rootId:params.has('wrongItemRoot')?'other-root':root,rootEpoch:fixtureRootEpoch,question:{id:p.itemId,track:params.has('attemptLog')?'writing':'general',datasetId:params.has('attemptLog')?'writing':params.has('codingDiagnostics')?'code-contests-selected':'tiny-mmlu',sourceId:'fixture',sourceHash:'fixture',prompt:[{role:'user',content:'这是界面测试题目。'}],grading:null},item:{itemId:p.itemId,answer:{text:params.has('attemptLog')?'这是已保存的测试答卷。':params.has('diagnosticLong')?'# 长代码与材料说明，用于界面换行检查。\n'.repeat(500):params.has('wrongItemRoot')?'MISMATCH_ROOT_ANSWER':'<img src=x onerror="window.fixtureInjected=true">',complete:true,truncated:false},grade:{kind:'scored',track:'general',itemId:p.itemId,passed:false,evidence:{metric:'accuracy'}},attempts:params.has('attemptLog')?attemptLogFixtures:[]}};
    case 'formalHistoryUsage':return {runs:usage().runs};
    case 'previewCleanup':{const token=crypto.randomUUID(),selected=runs.filter(r=>p.batchIds.includes(r.batchId)),preview={token,rootId:'fixture',batchIds:[...new Set(p.batchIds)],runs:selected.map(r=>({runId:r.runId,revision:r.revision,losesResume:Object.values(r.tracks).some(x=>x.status!=='completed')})),bytes:selected.reduce((n,r)=>n+detailBytes(r),0),expiresAt:new Date(Date.now()+600000).toISOString()};previews.set(token,preview);return preview;}
    case 'cleanupStatus':return operations.get(p.token)??null;
    case 'commitCleanup':{const preview=previews.get(p.token),partial=params.has('partial')&&!attempted.has(p.token),op={operationId:p.token,status:partial?'partial':'completed',plannedBytes:preview.bytes,deletedBytes:partial?preview.bytes/2:preview.bytes,unconfirmedBytes:0,remainingBytes:partial?preview.bytes/2:0,failedFiles:partial?1:0};operations.set(p.token,{...op,status:'running'});await new Promise(r=>setTimeout(r,650));attempted.add(p.token);for(const selected of preview.runs){const r=runs.find(x=>x.runId===selected.runId)!;r.details=partial?'partial':'cleared';r.resumeAllowed=false;r.revision++;}operations.set(p.token,op);return op;}
  }
  if(action==='comparisonCommon'){
    ((window as any).commonRequests??=[]).push(p);if(params.has('commonDelay'))await new Promise(r=>setTimeout(r,250));
    const counts=params.get('commonCount')==='60'?[17,8,19,8,8]:[17,8,19,7,8],ids=[...p.runIds,...p.referenceIds??[]],projected=ids.map(id=>{
      const row=runs.find(r=>r.runId===id)??builtInReferences.find(r=>r.summary.runId===id)?.summary;
      return row?.details==='cleared'&&!builtInReferences.some(r=>r.summary.runId===id)?{runId:id,available:false,reasonCode:'COMMON_DETAILS_UNAVAILABLE'}:{runId:id,available:true,domains:['knowledge','reading','instructions','coding','tools'].map((key,i)=>({id:key,required:counts[i],passed:counts[i]!-1}))};
    });
    return {rootId:root,rootEpoch:fixtureRootEpoch,runIds:p.runIds,referenceIds:p.referenceIds,projection:{mapHash:'synthetic-map',commonCount:counts.reduce((a,b)=>a+b,0),comparable:projected.every(r=>r.available),atCeiling:false,runs:projected}};
  }
  throw new Error('Unsupported fixture operation');
}
const original=window.fetch.bind(window);window.fetch=async(input,init)=>{
  if(String(input)!=='/api/dsh-model-coordinates/v1/operation')return original(input,init);const envelope=JSON.parse(String(init!.body));
  try{return Response.json({schemaVersion:1,requestId:envelope.requestId,ok:true,data:await operation(envelope.action,envelope.payload)});}catch{return Response.json({schemaVersion:1,requestId:envelope.requestId,ok:false,error:{code:'FIXTURE_ERROR',message:'界面测试操作失败。'}});}
};
createRoot(document.getElementById('root')!).render(<App/>);

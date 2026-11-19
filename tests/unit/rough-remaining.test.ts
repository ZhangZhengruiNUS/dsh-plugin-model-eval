import {simulateSchedule} from '../../src/estimation/engine.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import type {JudgeSnapshot, RunSummary, TargetSnapshot} from '../../src/contracts.ts';
import type {PerformanceSample, PlannedJob} from '../../src/estimation/contracts.ts';
import {performanceConditionKey} from '../../src/estimation/observations.ts';
import {estimateRoughRemaining} from '../../src/estimation/rough-remaining.ts';

const execution = {concurrency: 4 as const, callTimeoutMs: 300_000};
const protocols = {generalId: 'general-task-five-original-v1-light', resourceVersion: 'task-five-original-v1', writingId: 'work-writing-12-v3'};
const target = (id: string): TargetSnapshot => ({scopeId:'test', providerId:'test', modelId:id, routeTarget:{state:'unknown'}, controls:{}});
const judge: JudgeSnapshot = {target:target('judge'), rubricId:'rubric', promptId:'prompt'};
const sample = (phase: PerformanceSample['phase'], outputTokens: number, durationMs: number, conditionKey = '', datasetId = 'mmlu'): PerformanceSample => ({
  phase, datasetId, conditionKey, sampleId:phase, itemId:phase, startedAt:'2026-11-18T00:00:00.000Z',
  endedAt:'2026-11-18T00:00:02.000Z', durationMs, outcome:'completed', usage:{available:true, outputTokens},
});
const run = (id: string, samples: PerformanceSample[] = []) => ({
  runId:id, target:target(id), protocols,
  tracks:{general:{required:62, graded:1, status:'running'}} as RunSummary['tracks'],
  performance:{version:1 as const, samples, activeStages:[], censoredBounds:[]},
});
const general: PlannedJob[] = Array.from({length:8}, (_, i) => ({itemId:'g'+i, track:'general', datasetId:'mmlu', stages:['answer','local-grade']}));
const writing: PlannedJob = {itemId:'w', track:'writing', datasetId:'writing', stages:['answer','judge']};
const pending = new Map<string, readonly PlannedJob[]>([['a', [...general,writing]], ['b', general]]);

test('first successful output sample seeds mixed work and queued configurations, then measured rates take over', () => {
  const a=run('a',[sample('answer',1_000,2_000)]), b=run('b');
  const options={work:pending,execution,judge,excludesDeferredWork:false};
  assert.equal(estimateRoughRemaining({...options,runs:[run('a'),b]}),undefined);
  const rough=estimateRoughRemaining({...options,runs:[a,b]})!;
  assert.ok(rough.remainingMs>35_000);
  assert.equal(rough.borrowedConfigurations,1);
  assert.equal(rough.borrowedJudgeRate,true);
  const bMeasured=run('b',[sample('answer',3_000,1_000)]);
  const aWithJudge=run('a',[...a.performance.samples,
    sample('judge',1_200,1_000,performanceConditionKey(a.target,protocols,execution,judge),'writing')]);
  const updated=estimateRoughRemaining({...options,runs:[aWithJudge,bMeasured]})!;
  assert.ok(updated.remainingMs<rough.remainingMs);
  assert.equal(updated.borrowedConfigurations,0);
  assert.equal(updated.borrowedJudgeRate,false);
});

test('saved answers use judge-only work and old judge samples do not supply new judge throughput', () => {
  const a=run('a',[sample('answer',1_000,1_000),sample('judge',800,500,'different-judge-condition','writing')]);
  const b=run('b');
  const work=new Map([['b',[{...writing,stages:['judge'] as PlannedJob['stages']}]]]);
  assert.deepEqual(estimateRoughRemaining({runs:[a,b],work,execution,judge,excludesDeferredWork:true}),{
    remainingMs:33_098/12, borrowedConfigurations:0, borrowedJudgeRate:true, excludesDeferredWork:true,
  });
  assert.equal(estimateRoughRemaining({runs:[a,b],work:new Map(),execution,judge,excludesDeferredWork:true}),undefined);
});

test('ordinary concurrency and serial local grading are accounted for once', () => {
  const a=run('a',[sample('answer',1_000,1_000),sample('local-grade',0,60_000)]);
  const work=new Map([['a',general.slice(0,4)]]);
  const total=estimateRoughRemaining({runs:[a],work,execution,excludesDeferredWork:false})!.remainingMs;
  assert.equal(total,4*60_000+270_000/62);
});

test('output volume adapts after two whole answers from the same model and dataset', () => {
  const one=sample('answer',1_000,1_000);
  const two={...one,itemId:'second',sampleId:'second'};
  const tool={...one,itemId:'tool',sampleId:'tool',datasetId:'mmlu:turn'};
  const work=new Map([['a',general.slice(0,1)],['b',general.slice(0,1)]]);
  const options={work,execution,excludesDeferredWork:false};
  const a=run('a',[one,tool]), b=run('b');
  const initial=estimateRoughRemaining({...options,runs:[a,b]})!;
  const adjusted=estimateRoughRemaining({...options,runs:[run('a',[one,tool,two]),b]})!;
  const reference=270_000/62;
  assert.equal(initial.remainingMs,reference*2);
  assert.equal(adjusted.remainingMs,(4*reference+2_000)/6+reference);
  assert.equal(adjusted.borrowedConfigurations,1);
});

test('judge retry estimates apply observed automatic backoff without charging cancelled or other-judge calls', () => {
  const a=run('a',[sample('answer',1_000,1_000)]);
  const key=performanceConditionKey(a.target,protocols,execution,judge);
  a.performance.samples.push(sample('judge',600,10_000,key,'writing'));
  const failure={...sample('judge',0,5_000,key,'writing'),itemId:'w',sampleId:'f',
    outcome:'failed' as const,automaticRetry:true,retryWaitMs:2_000};
  const source={...a,performance:{...a.performance,recentFailures:[failure,
    {...failure,outcome:'cancelled' as const},{...failure,conditionKey:'other'}]}};
  const work=new Map([['a',[{...writing,stages:['judge'] as PlannedJob['stages']}]]]);
  const options={work,execution,judge,excludesDeferredWork:false};
  const automatic=estimateRoughRemaining({...options,runs:[source]})!;
  assert.equal(automatic.remainingMs,10_000+(1/6+(1/6)**2)*7_000);
  assert.equal(automatic.judgeRetryAdjusted,true);
  const single=estimateRoughRemaining({...options,runs:[source],singleJudgeAttempts:new Map([['a',new Set(['w'])]])})!;
  assert.equal(single.remainingMs,7_500);
});

test('completed sample durations cover unreported output usage and use the tested model for judge time', () => {
  const a=run('a'), b=run('b');
  const key=performanceConditionKey(a.target,protocols,execution,judge);
  a.performance.samples.push(sample('judge',600,90_000,key,'writing'));
  const work=new Map([['a',[{...writing,stages:['judge'] as PlannedJob['stages']}]],
    ['b',general.slice(0,1)]]);
  const estimate=estimateRoughRemaining({runs:[a,b],work,execution,judge,sampledAnswerMs:{a:30_000,b:90_000},
    excludesDeferredWork:false})!;
  assert.equal(estimate.borrowedConfigurations,0);
  assert.equal(estimate.borrowedJudgeRate,true);
  assert.equal(estimate.remainingMs,90_000+30_000*(33_098/12)/(270_000/62));
});

test('large positive concurrency allocates only as many workers as questions', () => {
  assert.equal(simulateSchedule([
    {track:'general',stages:[{phase:'answer',durationMs:10}]},
    {track:'general',stages:[{phase:'answer',durationMs:20}]},
    {track:'writing',stages:[{phase:'answer',durationMs:5}]},
  ],Number.MAX_SAFE_INTEGER),25);
});

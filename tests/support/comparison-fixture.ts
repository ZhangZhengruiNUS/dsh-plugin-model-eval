import type {RunSummary} from '../../src/contracts.ts';
import type {ComparisonMetadata} from '../../src/comparison/contracts.ts';
export const legacyRefs={generalId:'general-chat-root-stable-rule-tokenizer-v3',writingId:'work-writing-12-v1',resourceVersion:'suite-2026-10-31-v3'};
export function comparisonRun(id:string,score=80,modelId=id):RunSummary{return {
  runId:id,batchId:'b',revision:1,details:'available',resumeAllowed:true,protocols:{...legacyRefs},target:{scopeId:'s',providerId:'p',modelId,routeTarget:{state:'unknown'},controls:{}},judges:[],
  tracks:{general:{status:'completed',required:905,graded:905,score,completedAt:'2026-01-02',measures:Object.fromEntries(['tiny-mmlu','tiny-gsm8k','ifeval','humaneval-plus'].map(k=>[k,{required:1,graded:1,score}]))}},
  metrics:{tracks:{general:{answer:{calls:1,failures:0,usageCoverage:1,latencyMedianMs:10000,inputTokens:100,outputTokens:50},judge:{calls:0,failures:0,usageCoverage:0},gradingMs:0}},activeIntervals:[],incompleteTiming:false}};}
export function comparisonSnapshot(summaries:RunSummary[]):ComparisonMetadata{return {rootId:'r',rootEpoch:1,summaries,runs:summaries.map(r=>({runId:r.runId,revision:r.revision,execution:{state:'known',concurrency:4,callTimeoutMs:300000},conditionAvailable:true}))};}

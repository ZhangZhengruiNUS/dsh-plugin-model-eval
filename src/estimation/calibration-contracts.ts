import {isRunConcurrency,type RunConcurrency,type PromptMessage,type ProtocolRefs,type Track} from '../contracts.ts';
import type {GenerationTiming, StagePhase} from './contracts.ts';
import type {SpeedClock} from '../speed/clock.ts';

export type InputGroup = 'ordinary' | 'reading-short' | 'reading-long';
export interface WorkloadJobV1 {itemId:string;datasetId:string;track:Track;inputBytes:number;inputGroup:InputGroup;stages:StagePhase[]}
export interface WorkloadPlanV1 {version:1;refs:ProtocolRefs;protocolHash:string;workloadHash:string;readingSplitBytes:number;executionOrderHash?:string;jobs:WorkloadJobV1[]}
export interface TimingUsage {available:boolean;inputTokens?:number;outputTokens?:number;reasoningTokens?:number;totalTokens?:number;cacheReadTokens?:number;cacheWriteTokens?:number}
export interface TimingEventV1 {eventId:string;sequence:number;dispatchSequence?:number;itemId:string;datasetId:string;phase:StagePhase;
  inputGroup?:InputGroup;probeId?:string;startedAt:string;endedAt:string;durationMs:number;outcome:'completed'|'cancelled'|'timeout'|'failed'|'censored';
  usage?:TimingUsage;timing?:GenerationTiming;retryIndex?:number;queueWaitMs?:number}
export type DurationScope='all-scored'|'first-pass';
export interface FirstPassReceipt {version:1;sourceTraceId:string;sourceTraceHash:string;sourceUpdatedAt:string;capturedAt:string;scoredItemIds:string[];deferredItemIds:string[]}
export interface PredictionV3 {algorithm:'estimate-v3';asOf:string;state:'available'|'unavailable';reasons:string[];durationScope?:DurationScope;
  centerMs?:number;rangeMs?:{low:number;high:number};baselineIds:string[];measuredBuckets:string[];inferredBuckets:string[]}
export interface TimingTraceV1 {version:1;traceId:string;rootId:string;revision:number;conditionKey:string;protocolHash:string;workloadHash:string;
  machineKey:string;programHash:string;programId:string;algorithmId:string;startedAt:string;updatedAt:string;
  status:'running'|'completed'|'stopped'|'failed';events:TimingEventV1[];runId?:string;previewId?:string;pairedTraceId?:string;
  concurrency?:RunConcurrency;truthMs?:number;prediction?:PredictionV3;conditionKnown?:boolean;predictionProbeId?:string;observationCutoff?:string;firstPass?:FirstPassReceipt;durationScope?:DurationScope}
export interface BaselineProfileV1 {version:1;id:string;createdAt:string;algorithmId:'estimate-v3';programHash:string;protocolHash:string;workloadHash:string;
  conditionKey:string;machineKey:string;concurrency:RunConcurrency;scope:'same-configuration';trainingTraceIds:string[];
  formal:TimingTraceV1[];probes:TimingTraceV1[];residualRatios:number[];validated:boolean;rangeValidated?:boolean;durationScope?:DurationScope}
export interface PredictionInputV3 {workload:WorkloadPlanV1;conditionKey:string;machineKey:string;programHash:string;concurrency:RunConcurrency;
  asOf:string;profiles:readonly BaselineProfileV1[];probeEvents:readonly TimingEventV1[];durationScope?:DurationScope}
export interface ProbeDefinitionV3 {id:string;bucket:string;datasetId:string;track:Track;phase:'answer'|'judge';kind:'text'|'tool';messages:readonly PromptMessage[];followupOf?:string}
export type ProbeProgramId='speed-probe-v3'|'speed-probe-v4';
export const isProbeProgramId=(id:unknown):id is ProbeProgramId=>id==='speed-probe-v3'||id==='speed-probe-v4';
export const isProbePrefixId=(id:unknown):boolean=>id==='speed-probe-v3:30s'||id==='speed-probe-v4:30s';
export interface ProbeProgramV3 {id:ProbeProgramId;hash:string;probes:readonly ProbeDefinitionV3[];methodId?:string}
export interface ProbeDispatchResult {outcome:TimingEventV1['outcome'];usage?:TimingUsage;timing?:GenerationTiming}
export interface ProbeRunV3 {programHash:string;startedAt:string;endedAt:string;calls:number;events:TimingEventV1[];status:'completed'|'stopped';budgetReached?:true;first30Events:TimingEventV1[];first30At:string}
export interface CalibrationBudget {conditionKey:string;maxDispatches:number;maxWallMs:number;maxReportedTokens?:number}
export interface ProbeScheduleContext {clock?:SpeedClock;concurrency:RunConcurrency;budgetMs:number;mode:'preview'|'calibration';tracks:readonly Track[];signal:AbortSignal;
  knownBuckets?:ReadonlySet<string>;priorityWeights?:Readonly<Record<string,number>>;reserve?:()=>boolean;
  dispatch(probe:ProbeDefinitionV3,signal:AbortSignal):Promise<ProbeDispatchResult>;onEvent?:(event:TimingEventV1)=>Promise<void>;onBudget?:()=>void}
export interface TimingCleanupPreview {token:string;traceIds:string[];bytes:number;expiresAt:string}
export interface TimingCleanupResult {token:string;status:'completed'|'partial';deletedBytes:number;remainingBytes:number;unconfirmedBytes:number}
export interface TimingTraceHistory {save(trace:TimingTraceV1,expectedRevision:number):Promise<TimingTraceV1>;read(id:string):Promise<TimingTraceV1|undefined>;
  list(signal?:AbortSignal):Promise<TimingTraceV1[]>;measure():Promise<{totalBytes:number;traces:{traceId:string;bytes:number}[]}>;
  previewCleanup(ids:readonly string[],options?:{protectReferences:true}):Promise<TimingCleanupPreview>;commitCleanup(token:string):Promise<TimingCleanupResult>}

const hashPattern=/^[a-f0-9]{64}$/;
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const calibrationHash=(x:unknown):x is string=>typeof x==='string'&&hashPattern.test(x);
export const traceIdValid=(x:unknown):x is string=>typeof x==='string'&&uuidPattern.test(x);
const fail=(code:string):never=>{throw Object.assign(Error(code),{code});};
function object(x:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!x||typeof x!=='object'||Array.isArray(x)||![Object.prototype,null].includes(Object.getPrototypeOf(x)))return fail('TRACE_OBJECT');
  for(const key of Object.keys(x))if(!keys.includes(key))fail('TRACE_FIELD_REJECTED');
  return x as Record<string,unknown>;
}
const ms=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const stamp=(x:unknown)=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const identifier=(x:unknown)=>typeof x==='string'&&/^[\w./:-]{1,220}$/.test(x)&&!x.includes('://');
export function validateTimingEvent(value:unknown):asserts value is TimingEventV1 {
  const e=object(value,['eventId','sequence','dispatchSequence','itemId','datasetId','phase','inputGroup','probeId','startedAt','endedAt','durationMs','outcome','usage','timing','retryIndex','queueWaitMs']);
  if(!traceIdValid(e.eventId)||!Number.isSafeInteger(e.sequence)||Number(e.sequence)<1||!identifier(e.itemId)||!identifier(e.datasetId)||
    !['answer','judge','local-grade','tool-scenario'].includes(String(e.phase))||!stamp(e.startedAt)||!stamp(e.endedAt)||Date.parse(String(e.endedAt))<Date.parse(String(e.startedAt))||
    !ms(e.durationMs)||!['completed','cancelled','timeout','failed','censored'].includes(String(e.outcome)))fail('TRACE_EVENT_INVALID');
  for(const k of ['dispatchSequence','retryIndex'])if(e[k]!==undefined&&(!Number.isSafeInteger(e[k])||Number(e[k])<(k==='retryIndex'?0:1)))fail('TRACE_SEQUENCE_INVALID');
  if(e.queueWaitMs!==undefined&&!ms(e.queueWaitMs)||e.probeId!==undefined&&!identifier(e.probeId)||e.inputGroup!==undefined&&!['ordinary','reading-short','reading-long'].includes(String(e.inputGroup)))fail('TRACE_EVENT_INVALID');
  if(e.usage!==undefined){const u=object(e.usage,['available','inputTokens','outputTokens','reasoningTokens','totalTokens','cacheReadTokens','cacheWriteTokens']);
    if(typeof u.available!=='boolean')fail('TRACE_USAGE_INVALID');for(const [k,n] of Object.entries(u))if(k!=='available'&&(!Number.isSafeInteger(n)||Number(n)<0))fail('TRACE_USAGE_INVALID');}
  if(e.timing!==undefined){const t=object(e.timing,['prepareMs','streamMs','totalMs','firstOutputMs','firstTextMs','lastOutputMs','sawReasoning','outputTokenScope']);
    if(typeof t.sawReasoning!=='boolean'||!['observable-generated','unknown'].includes(String(t.outputTokenScope)))fail('TRACE_TIMING_INVALID');
    for(const k of ['prepareMs','streamMs','totalMs'])if(!ms(t[k]))fail('TRACE_TIMING_INVALID');
    for(const k of ['firstOutputMs','firstTextMs','lastOutputMs'])if(t[k]!==undefined&&!ms(t[k]))fail('TRACE_TIMING_INVALID');}
}
export function validateTimingTrace(value:unknown):asserts value is TimingTraceV1 {
  const t=object(value,['version','traceId','rootId','revision','conditionKey','protocolHash','workloadHash','machineKey','programHash','programId','algorithmId','startedAt','updatedAt','status','events','runId','previewId','pairedTraceId','concurrency','truthMs','prediction','conditionKnown','predictionProbeId','observationCutoff','firstPass','durationScope']);
  if(t.version!==1||!traceIdValid(t.traceId)||!traceIdValid(t.rootId)||!Number.isSafeInteger(t.revision)||Number(t.revision)<0)fail('TRACE_IDENTITY_INVALID');
  for(const k of ['conditionKey','protocolHash','workloadHash','machineKey','programHash'])if(!calibrationHash(t[k]))fail('TRACE_HASH_INVALID');
  for(const k of ['programId','algorithmId'])if(!identifier(t[k]))fail('TRACE_IDENTITY_INVALID');
  for(const k of ['runId','previewId','pairedTraceId','predictionProbeId'])if(t[k]!==undefined&&!traceIdValid(t[k]))fail('TRACE_IDENTITY_INVALID');
  if(t.conditionKnown!==undefined&&typeof t.conditionKnown!=='boolean')fail('TRACE_IDENTITY_INVALID');
  if(!stamp(t.startedAt)||!stamp(t.updatedAt)||Date.parse(String(t.updatedAt))<Date.parse(String(t.startedAt))||!['running','completed','stopped','failed'].includes(String(t.status))||!Array.isArray(t.events))fail('TRACE_STATE_INVALID');
  if(t.observationCutoff!==undefined&&(!stamp(t.observationCutoff)||!isProbePrefixId(t.programId)||Date.parse(String(t.observationCutoff))<Date.parse(String(t.startedAt))||Date.parse(String(t.observationCutoff))>Date.parse(String(t.updatedAt))))fail('TRACE_CUTOFF_INVALID');
  if(t.concurrency!==undefined&&!isRunConcurrency(t.concurrency)||t.truthMs!==undefined&&(!ms(t.truthMs)||t.status!=='completed'))fail('TRACE_TRUTH_INVALID');
  let sequence=0;const ids=new Set<string>();
  for(const e of t.events as unknown[]){validateTimingEvent(e);if(e.sequence<=sequence||ids.has(e.eventId))fail('TRACE_ORDER_INVALID');
    if(Date.parse(e.startedAt)<Date.parse(String(t.startedAt))||Date.parse(e.endedAt)>Date.parse(String(t.observationCutoff??t.updatedAt)))fail('TRACE_EVENT_OUTSIDE_SPAN');
    sequence=e.sequence;ids.add(e.eventId);}
  if(t.durationScope!==undefined&&!['all-scored','first-pass'].includes(String(t.durationScope)))fail('TRACE_DURATION_SCOPE_INVALID');
  if(t.firstPass!==undefined){const f=object(t.firstPass,['version','sourceTraceId','sourceTraceHash','sourceUpdatedAt','capturedAt','scoredItemIds','deferredItemIds']);
    if(t.programId!=='formal-first-pass-v1'||t.durationScope!=='first-pass'||f.version!==1||!stamp(f.capturedAt)||!stamp(f.sourceUpdatedAt)||Date.parse(String(f.capturedAt))<Date.parse(String(f.sourceUpdatedAt))||Date.parse(String(f.sourceUpdatedAt))<Date.parse(String(t.startedAt))||(t.events as TimingEventV1[]).some(e=>Date.parse(e.endedAt)>Date.parse(String(f.sourceUpdatedAt)))||!traceIdValid(f.sourceTraceId)||f.sourceTraceId===t.traceId||!calibrationHash(f.sourceTraceHash)||!Array.isArray(f.scoredItemIds)||!Array.isArray(f.deferredItemIds)||[...f.scoredItemIds,...f.deferredItemIds].some(x=>!identifier(x))||new Set([...f.scoredItemIds,...f.deferredItemIds]).size!==f.scoredItemIds.length+f.deferredItemIds.length)fail('FIRST_PASS_RECEIPT_INVALID');
  }else if(t.programId==='formal-first-pass-v1'||t.durationScope==='first-pass')fail('FIRST_PASS_RECEIPT_MISSING');
  if(t.prediction!==undefined){const p=object(t.prediction,['algorithm','asOf','state','reasons','centerMs','rangeMs','baselineIds','measuredBuckets','inferredBuckets','durationScope']);
    if(p.algorithm!=='estimate-v3'||!stamp(p.asOf)||!['available','unavailable'].includes(String(p.state)))fail('TRACE_PREDICTION_INVALID');
    for(const k of ['reasons','baselineIds','measuredBuckets','inferredBuckets'])if(!Array.isArray(p[k])||(p[k] as unknown[]).some(x=>!identifier(x)))fail('TRACE_PREDICTION_INVALID');
    if(p.centerMs!==undefined&&!ms(p.centerMs))fail('TRACE_PREDICTION_INVALID');
    if(p.durationScope!==undefined&&!['all-scored','first-pass'].includes(String(p.durationScope)))fail('TRACE_PREDICTION_INVALID');
    if(p.rangeMs!==undefined){const r=object(p.rangeMs,['low','high']);if(!ms(r.low)||!ms(r.high)||Number(r.high)<Number(r.low))fail('TRACE_PREDICTION_INVALID');}
  }
}

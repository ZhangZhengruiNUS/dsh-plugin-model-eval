import {isDeepStrictEqual} from 'node:util';
import type {EvaluationRequest,ResolvedProtocolSet} from '../contracts.ts';
import {identityHash} from '../evaluation/protocol-identity.ts';
import type {HistoryStore} from '../history/store.ts';
import type {ProbePreviewEvidence} from '../speed/ordinary-preview.ts';
import {buildShortProbeProgram} from '../speed/short-probes.ts';
import {assertCompleteFormalTrace} from './baseline-validation.ts';
import type {BaselineProfileV1,TimingTraceHistory,TimingTraceV1} from './calibration-contracts.ts';
import type {TimeAdvisorResult} from './contracts.ts';
import {localMachineKey} from './local-calibration.ts';
import {readFirstPassSource,readPairedBaseline} from './local-baselines.ts';
import {knownTimingTarget,performanceConditionKey} from './observations.ts';
import {buildWorkloadPlan} from './workload.ts';

export function timeAdvisorScope(protocol:ResolvedProtocolSet,request:EvaluationRequest){
 const {tracks,execution,judge}=request;
 const workload=buildWorkloadPlan(protocol,tracks);
 const program=buildShortProbeProgram(protocol,tracks);
 const machineKey=localMachineKey(identityHash([...new Set(Object.values(protocol.compatibility).map(c=>c.runtimeHash))].sort()));
 return {workload,program,machineKey,concurrency:execution.concurrency,conditions:request.targets.map(target=>({
  known:knownTimingTarget(target)&&(!judge||knownTimingTarget(judge.target)),
  key:performanceConditionKey(target,workload.refs,execution,judge),
 }))};
}
type Scope=ReturnType<typeof timeAdvisorScope>;
type TraceScope={rootId:string;conditionKey:string;protocolHash:string;workloadHash:string;programHash:string;machineKey:string;concurrency:number};
const inScope=(trace:TimingTraceV1,scope:TraceScope)=>trace.conditionKnown===true&&
 (['rootId','conditionKey','protocolHash','workloadHash','programHash','machineKey','concurrency'] as const).every(key=>trace[key]===scope[key]);

export function timingTraceScope(rootId:string,scope:Scope,conditionKey:string):TraceScope{
 return {rootId,conditionKey,protocolHash:scope.workload.protocolHash,workloadHash:scope.workload.workloadHash,
  programHash:scope.program.hash,machineKey:scope.machineKey,concurrency:scope.concurrency};
}

async function usableProbe(history:Pick<TimingTraceHistory,'read'>,scope:TraceScope,trace:TimingTraceV1,prefixId:string|undefined){
 if(!prefixId||trace.programId!=='speed-probe-v4'||!['completed','stopped'].includes(trace.status)||trace.runId||
  !inScope(trace,scope)||!trace.events.some(event=>event.outcome==='completed'&&event.durationMs>0)||
  trace.events.some(event=>event.outcome==='failed'||event.outcome==='cancelled'))return;
 const prefix=await history.read(prefixId);
 if(!prefix||prefix.programId!=='speed-probe-v4:30s'||prefix.pairedTraceId!==trace.traceId||!inScope(prefix,scope)||
  !prefix.prediction||prefix.prediction.reasons.includes('PREVIEW_CANCELLED')||prefix.events.some(event=>event.outcome==='failed'||event.outcome==='cancelled'))return;
 return prefix;
}

export async function usablePreviewEvidence(history:Pick<TimingTraceHistory,'read'>,scope:TraceScope,evidence:ProbePreviewEvidence):Promise<boolean>{
 if(evidence.programId!=='speed-probe-v4'||evidence.programHash!==scope.programHash||evidence.conditionKey!==scope.conditionKey||
  evidence.workloadHash!==scope.workloadHash||evidence.machineKey!==scope.machineKey)return false;
 const trace=await history.read(evidence.traceId);
 const prefix=trace&&await usableProbe(history,scope,trace,evidence.prefixId);
 return !!prefix&&isDeepStrictEqual(prefix.prediction,evidence.prediction);
}

async function isOriginalRun(store:HistoryStore,workload:Scope['workload'],formal:TimingTraceV1):Promise<boolean>{
 try{
  const {manifest,summary}=await store.getRun(formal.runId!);
  if(summary.details!=='available'||summary.metrics.incompleteTiming||summary.executionChanges?.length||summary.reuse||
   manifest.reuseOrigin||manifest.regradeOrigin||!manifest.execution||!knownTimingTarget(manifest.target)||
   manifest.judge&&!knownTimingTarget(manifest.judge.target)||manifest.executionOrder?.hash!==workload.executionOrderHash||
   manifest.createdAt!==formal.startedAt||performanceConditionKey(manifest.target,manifest.protocols,manifest.execution,manifest.judge)!==formal.conditionKey)return false;
  const required=manifest.requiredItems.map(item=>[item.id,item.datasetId,item.track]).sort();
  if(!isDeepStrictEqual(required,workload.jobs.map(job=>[job.itemId,job.datasetId,job.track]).sort()))return false;
  await store.detailsDirectory(manifest.runId);
  return true;
 }catch(error){
  if((error as {code?:string}).code==='ENOENT')return false;
  throw error;
 }
}

export async function readTimeAdvisorEvidence(store:HistoryStore,history:TimingTraceHistory,scope:Scope,asOf:string,signal?:AbortSignal){
 const rows=await history.list(signal),cutoff=Date.parse(asOf),configs:TimeAdvisorResult['configs']=[],profiles:BaselineProfileV1[][]=[],evidenceIds:string[][]=[];
 for(const condition of scope.conditions){
  const traceScope=timingTraceScope(store.rootId,scope,condition.key),refs:BaselineProfileV1[]=[],observations:TimingTraceV1[]=[];
  profiles.push(refs);
  if(condition.known){
   const candidates=rows.filter(row=>row.firstPass&&inScope(row,traceScope))
    .sort((a,b)=>b.firstPass!.capturedAt.localeCompare(a.firstPass!.capturedAt)||b.traceId.localeCompare(a.traceId)).slice(0,20);
   const seen=new Set<string>();
   for(const formal of candidates){
    signal?.throwIfAborted();
    if(!formal.runId||seen.has(formal.runId)||formal.firstPass!.sourceTraceId!==formal.runId)continue;
    const source=await readFirstPassSource(history,formal,cutoff);
    if(!source)continue;
    try{assertCompleteFormalTrace(scope.workload,formal);}catch{continue;}
    if(!await isOriginalRun(store,scope.workload,formal))continue;
    seen.add(formal.runId);observations.push(formal);
    const profile=await readPairedBaseline(history,scope.workload,formal,source,cutoff);
    const probe=profile?.probes[0];
    if(profile&&probe&&await usableProbe(history,traceScope,probe,formal.predictionProbeId))refs.push(profile);
   }
  }
  const latest=observations[0];
  configs.push({hasBaseline:refs.length>0,...(latest?{observation:{durationMs:latest.truthMs!,capturedAt:latest.firstPass!.capturedAt,
   recordCount:observations.length,deferredItems:latest.firstPass!.deferredItemIds.length}}:{})});
  evidenceIds.push([...observations.map(row=>identityHash(row)),...refs.map(profile=>profile.id)]);
 }
 return {configs,profiles,evidenceKey:identityHash(evidenceIds)};
}

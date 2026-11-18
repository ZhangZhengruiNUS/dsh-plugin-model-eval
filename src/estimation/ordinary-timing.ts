import {resolveProtocolForRead} from '../evaluation/protocol-resolution.ts';
import {randomUUID} from 'node:crypto';import type {HistoryStore} from '../history/store.ts';import type {ProtocolRegistry} from '../contracts.ts';import type {QueueTimingObserver,RunSettlement} from '../jobs/queue.ts';import type {EstimateSnapshot} from './contracts.ts';import type {TimingTraceHistory} from './calibration-contracts.ts';
import {isFiveCapabilitySchema} from '../evaluation/five-schema.ts';
import {createTimingTraceHistory} from '../history/timing-traces.ts';import {createTimingRecorder} from './timing-recorder.ts';import {createSafeTimingObserver} from './safe-observer.ts';import {buildWorkloadPlan} from './workload.ts';import {buildShortProbeProgram} from '../speed/short-probes.ts';import {identityHash} from '../evaluation/protocol-identity.ts';import {localMachineKey} from './local-calibration.ts';import {performanceConditionKey} from './observations.ts';import {readLocalBaselines} from './local-baselines.ts';import {captureSettledRunFirstPassTrace} from './first-pass-trace.ts';import {predictRemainingRun} from './profile-dynamic.ts';import {dynamicWorkState} from './dynamic-state.ts';import {dynamicFirstPassSnapshot} from './first-pass-snapshots.ts';import {summarizeBatchMetrics} from '../client/batch-metrics.ts';

export function createOrdinaryTiming(deps:{store:HistoryStore;registry:ProtocolRegistry;history?:TimingTraceHistory;now?:()=>string}){
 const {store,registry}=deps,history=deps.history??createTimingTraceHistory(store),now=deps.now??(()=>new Date().toISOString()),recorders=new Map<string,Promise<ReturnType<typeof createTimingRecorder>|undefined>>(),settlements=new Map<string,RunSettlement>(),rejections=new Map<string,string>();
 let recoveryUnavailable=false;
 const finished=(s:EstimateSnapshot|undefined)=>s?.algorithm==='estimate-v3'&&s.basis?.durationScope==='first-pass'&&s.basis.phase!=='makeup'&&s.state==='completed';
 async function context(id:string){const {manifest,summary}=await store.getRun(id);if(summary.executionChanges?.length||summary.reuse?.mixedExecution||summary.reuse?.mixedPeriod)return;
  if(manifest.generalDefinition&&!isFiveCapabilitySchema(manifest.generalDefinition.schema))return;
  const protocol=await resolveProtocolForRead(registry,manifest.protocols);if(!isFiveCapabilitySchema(protocol.descriptor.general.schema))return;
  const tracks=Object.keys(summary.tracks) as ('general'|'writing')[],workload=buildWorkloadPlan(protocol,tracks,undefined,manifest.executionOrder),program=buildShortProbeProgram(protocol,tracks),machineKey=localMachineKey(identityHash([...new Set(Object.values(protocol.compatibility).map(c=>c.runtimeHash))].sort())),execution=manifest.execution;if(!execution)return;
  const conditionKey=performanceConditionKey(manifest.target,manifest.protocols,execution,manifest.judge),candidate=summary.estimation?.originPreview?.configs[0]?.probe,probe=candidate&&candidate.programHash===program.hash&&candidate.machineKey===machineKey&&candidate.conditionKey===conditionKey&&candidate.workloadHash===workload.workloadHash?candidate:undefined;
  return {manifest,summary,protocol,workload,program,machineKey,execution,conditionKey,probe};
 }
 async function recorder(id:string){const row=await store.getRun(id);if(row.summary.executionChanges?.length||row.summary.reuse?.mixedExecution||row.summary.reuse?.mixedPeriod)return undefined;if(recoveryUnavailable)return Promise.resolve(undefined);const saved=recorders.get(id);if(saved)return saved;
  // Register initialization before its first await. Four queue workers must
  // share one recorder and its serial CAS tail from their first dispatch.
  const pending=(async()=>{const c=await context(id);if(!c)return;const makeup=finished(c.summary.estimation?.final)||(await history.list()).some(t=>t.runId===id&&!!t.firstPass);
   return createTimingRecorder(store,registry,{machineKey:c.machineKey,programHash:c.program.hash,...(c.probe?{previewId:c.probe.traceId,predictionProbeId:c.probe.prefixId,prediction:c.probe.prediction}:{}),...(makeup?{traceId:randomUUID(),programId:'formal-makeup-v1' as const}:{})},history);
  })();recorders.set(id,pending);return pending;
 }
 const raw:QueueTimingObserver={async onTimingStart(id,sample){await(await recorder(id))?.hooks.onTimingStart?.(id,sample);},async onTimingSample(id,sample){await(await recorder(id))?.hooks.onTimingSample?.(id,sample);},async onTimingRunEnd(id){await(await recorder(id))?.hooks.onTimingRunEnd?.(id);},async onTimingRunSettled(s){
  if(recoveryUnavailable)return;settlements.set(s.runId,s);const c=await context(s.runId);if(!c)return;
  if(!finished(c.summary.estimation?.final)&&s.reason==='drained'){
   const source=await history.read(s.runId);if(source){let receipt;try{receipt=captureSettledRunFirstPassTrace(c.workload,source,{rootId:store.rootId,manifest:c.manifest,summary:c.summary,items:await store.listItems(s.runId),settlement:s},now());}catch{rejections.set(s.runId,'FIRST_PASS_NOT_COMPLETE');}
    if(receipt)await history.save(receipt,0);
   }
  }
  const estimate=await snapshot(s.runId,s.reason==='drained'?'pending':s.reason==='paused'?'paused':'pending',now());if(estimate){const fresh=await store.getRun(s.runId);await store.updateSummary(s.runId,fresh.summary.revision,next=>{next.estimation={...next.estimation,current:estimate,...(finished(estimate)&&!finished(next.estimation?.final)?{final:estimate}:{})};});}
  recorders.delete(s.runId);
 }};
 const safe=createSafeTimingObserver(raw,(id,error)=>{const code=(error as {code?:string;message?:string})?.code??(error as Error)?.message;rejections.set(id,/^[A-Z][A-Z0-9_]{1,70}$/.test(code??'')?code!:'TIMING_UNAVAILABLE');});
 async function snapshot(id:string,status:'running'|'queued'|'paused'|'pending'|'completed',asOf=now()):Promise<EstimateSnapshot|undefined>{
  const record=await store.getRun(id);if(record.summary.executionChanges?.length||record.summary.reuse?.mixedExecution||record.summary.reuse?.mixedPeriod)return {algorithm:'estimate-v3',asOf,state:Object.values(record.summary.tracks??{}).length>0&&Object.values(record.summary.tracks).every(t=>t.status==='completed')?'completed':'pending',coverage:{known:0,required:record.manifest.requiredItems.length},sources:[],reasons:[record.summary.reuse?.mixedPeriod?'MIXED_PERIOD':'EXECUTION_CHANGED']};
  const c=await context(id);if(!c)return;const {manifest,summary,workload,program,probe}=c,old=summary.estimation?.final;
  const phase:'makeup'|'first-pass'=finished(old)&&status==='running'?'makeup':'first-pass';const items=summary.details==='available'?await store.listItems(id):[],state=dynamicWorkState(workload.jobs,items,asOf),deferred=state.terminalItems.filter(t=>t.state==='deferred-timeout').length;
  if(finished(old)&&phase!=='makeup')return structuredClone(old!);
  const base={programHash:program.hash,probeTraceIds:probe?[probe.traceId,probe.prefixId]:[],known:state.terminalItems.length,required:workload.jobs.length,deferredItems:deferred,phase,previousBaselineIds:summary.estimation?.current.basis?.baselineIds??[]};
  const unavailable=(reason:string)=>dynamicFirstPassSnapshot({algorithm:'estimate-v3',durationScope:'first-pass',asOf,state:phase==='makeup'?'pending':'unavailable',reasons:[reason],baselineIds:[]},base);
  if(phase==='makeup')return unavailable('MAKEUP_EXCLUDED');if(recoveryUnavailable||!safe.eligible(id))return unavailable('TIMING_UNAVAILABLE');
  const trace=await history.read(id);if(!trace){if(status==='queued'&&summary.estimation?.current.algorithm==='estimate-v3')return structuredClone(summary.estimation.current);return unavailable('NO_CURRENT_TRACE');}
  const settled=settlements.get(id),done=!state.remainingJobs.length&&!state.activeStages.length&&settled?.reason==='drained',elapsed=summarizeBatchMetrics([summary.metrics],status==='running',Date.parse(asOf)).elapsedMs;
  const candidates=probe?await readLocalBaselines(history,workload,asOf,[id]):[],profiles=candidates.filter(p=>probe!.prediction.baselineIds.includes(p.id)),prefix=probe?await history.read(probe.prefixId):undefined;
  const prediction=predictRemainingRun({workload,conditionKey:c.conditionKey,machineKey:c.machineKey,programHash:program.hash,concurrency:c.execution.concurrency,asOf,durationScope:'first-pass',profiles,probeEvents:prefix?.events??[],currentEvents:trace.events,...state,activeElapsedMs:elapsed,status:done?'first-pass-completed':status==='completed'?'pending':status});
  return dynamicFirstPassSnapshot(prediction,base);
 }
 return {hooks:safe.hooks,history,get available(){return !recoveryUnavailable;},eligible:(id:string)=>!recoveryUnavailable&&safe.eligible(id),referenceRejection:(id:string)=>rejections.get(id),snapshot,async recover(){if(!store.writable)return;try{await createTimingTraceHistory(store).recoverCleanup();for(const row of await history.list())if(row.status==='running'){row.status='stopped';row.updatedAt=now();delete row.truthMs;await history.save(row,row.revision);}}catch{/* Optional timing metadata must not prevent reading or evaluating capability. Keep original files intact. */recoveryUnavailable=true;}}};
}

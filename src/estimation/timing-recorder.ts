import {resolveProtocolForRead} from '../evaluation/protocol-resolution.ts';
import {createTimingTraceHistory} from '../history/timing-traces.ts';
import type {HistoryStore} from '../history/store.ts';
import type {ProtocolRegistry} from '../contracts.ts';
import type {QueueTimingObserver} from '../jobs/queue.ts';
import {knownTimingTarget,performanceConditionKey} from './observations.ts';
import {buildWorkloadPlan} from './workload.ts';
import {validateTimingEvent,type TimingEventV1,type TimingTraceV1,type PredictionV3,type TimingTraceHistory} from './calibration-contracts.ts';

/** Explicit opt-in hooks. Never reconstructs events from historic answers or checkpoints. */
export function createTimingRecorder(store:HistoryStore,registry:ProtocolRegistry,identity:{machineKey:string;programHash:string;previewId?:string;predictionProbeId?:string;prediction?:PredictionV3;traceId?:string;programId?:'formal-trace-v1'|'formal-makeup-v1'},history:TimingTraceHistory=createTimingTraceHistory(store)) {
  const dispatches=new Map<string,Map<string,number>>();
  let tail:Promise<unknown>=Promise.resolve();
  function serial<T>(fn:()=>Promise<T>):Promise<T>{const next=tail.then(fn);tail=next.catch(()=>{});return next;}
  async function initial(runId:string):Promise<TimingTraceV1>{
    const old=await history.read(identity.traceId??runId);if(old)return old;
    const {manifest,summary}=await store.getRun(runId),protocol=await resolveProtocolForRead(registry,manifest.protocols);
    const workload=buildWorkloadPlan(protocol,Object.keys(summary.tracks) as ('general'|'writing')[],undefined,manifest.executionOrder);
    const execution=manifest.execution;if(!execution)throw Error('TRACE_EXECUTION_UNKNOWN');
    return {version:1,traceId:identity.traceId??runId,runId,rootId:store.rootId,revision:0,
      conditionKnown:knownTimingTarget(manifest.target)&&(!manifest.judge||knownTimingTarget(manifest.judge.target)),
      conditionKey:performanceConditionKey(manifest.target,manifest.protocols,execution,manifest.judge),protocolHash:workload.protocolHash,workloadHash:workload.workloadHash,
      machineKey:identity.machineKey,programHash:identity.programHash,programId:identity.programId??'formal-trace-v1',algorithmId:'estimate-v3',
      startedAt:manifest.createdAt,updatedAt:new Date().toISOString(),status:'running',concurrency:execution.concurrency,events:[],...(identity.previewId?{previewId:identity.previewId,pairedTraceId:identity.previewId}:{}),
      ...(identity.predictionProbeId&&identity.prediction?{predictionProbeId:identity.predictionProbeId,prediction:structuredClone(identity.prediction)}:{})};
  }
  const hooks:QueueTimingObserver={
    async onTimingStart(runId,sampleId){await serial(async()=>{
      const row=await initial(runId);if(row.machineKey!==identity.machineKey||row.programHash!==identity.programHash)throw Error('TRACE_IDENTITY_CHANGED');
      const map=dispatches.get(runId)??new Map<string,number>();if(!map.has(sampleId))map.set(sampleId,Math.max(0,...row.events.map(e=>e.dispatchSequence??0),...map.values())+1);dispatches.set(runId,map);
      if(!row.revision||row.status!=='running'){row.status='running';delete row.truthMs;await history.save(row,row.revision);}
    });},
    async onTimingSample(runId,sample){await serial(async()=>{
      const row=await initial(runId);if(row.events.some(e=>e.eventId===sample.sampleId))throw Error('TRACE_DUPLICATE_EVENT');
      const event:TimingEventV1={eventId:sample.sampleId,sequence:(row.events.at(-1)?.sequence??0)+1,itemId:sample.itemId,datasetId:sample.datasetId,phase:sample.phase,
        startedAt:sample.startedAt,endedAt:sample.endedAt,durationMs:sample.durationMs,outcome:sample.outcome};
      const dispatchSequence=dispatches.get(runId)?.get(sample.sampleId);if(dispatchSequence!==undefined)event.dispatchSequence=dispatchSequence;
      if(sample.queueWaitMs!==undefined)event.queueWaitMs=sample.queueWaitMs;
      if(sample.usage){event.usage={available:sample.usage.available};for(const k of ['inputTokens','outputTokens','reasoningTokens','totalTokens','cacheReadTokens','cacheWriteTokens'] as const){const n=sample.usage[k];if(n!==undefined)event.usage[k]=n;}}
      if(sample.timing)event.timing=structuredClone(sample.timing);
      validateTimingEvent(event);row.events.push(event);row.updatedAt=new Date().toISOString();row.status='running';await history.save(row,row.revision);
    });},
    async onTimingRunEnd(runId){await serial(async()=>{
      const row=await history.read(identity.traceId??runId);if(!row)return;
      const {summary}=await store.getRun(runId),complete=Object.values(summary.tracks).every(t=>t.status==='completed')&&!summary.metrics.incompleteTiming;
      row.status=complete?'completed':'stopped';row.updatedAt=new Date().toISOString();
      if(complete)row.truthMs=summary.metrics.activeIntervals.reduce((n,x)=>n+Math.max(0,Date.parse(x.endedAt??row.updatedAt)-Date.parse(x.startedAt)),0);
      await history.save(row,row.revision);dispatches.delete(runId);
    });},
  };
  return {hooks,history,async idle(){await tail;}};
}

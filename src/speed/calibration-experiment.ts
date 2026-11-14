import {randomUUID} from 'node:crypto';
import type {EvaluationRequest,HostAdapter,ProtocolRegistry,ToolMessage,ResolvedProtocolSet} from '../contracts.ts';
import type {HistoryStore} from '../history/store.ts';
import {createTimingTraceHistory} from '../history/timing-traces.ts';
import {createQueue,type GradeServices,type EvaluationQueue} from '../jobs/queue.ts';
import type {createActivityGate,ActivityLease} from '../jobs/activity.ts';
import {buildWorkloadPlan} from '../estimation/workload.ts';
import {createTimingRecorder} from '../estimation/timing-recorder.ts';
import {createCalibrationBudget} from '../estimation/calibration-budget.ts';
import {predictFullRun} from '../estimation/profile-predictor.ts';
import {localMachineKey,measureLocalCalibration,type LocalCalibration} from '../estimation/local-calibration.ts';
import {identityHash} from '../evaluation/protocol-identity.ts';
import {performanceConditionKey} from '../estimation/observations.ts';
import {captureFirstPassTrace} from '../estimation/first-pass-trace.ts';
import type {CalibrationBudget,TimingTraceV1,BaselineProfileV1} from '../estimation/calibration-contracts.ts';
import {buildShortProbeProgram} from './short-probes.ts';
import {scheduleProbes} from './probe-scheduler.ts';
import {speedClock,type SpeedClock} from './clock.ts';

/** Host-only experiment API. Ordinary service/channel callers never enable this implicitly. */
export function createCalibrationExperiment(deps:{store:HistoryStore;adapter:HostAdapter;registry:ProtocolRegistry;graders:GradeServices;
  activity:ReturnType<typeof createActivityGate>;clock?:SpeedClock;assertPrepared?:(p:ResolvedProtocolSet)=>void;localFixtures?:(p:ResolvedProtocolSet)=>readonly ((signal:AbortSignal)=>Promise<void>)[]}) {
  const clock=deps.clock??speedClock,history=createTimingTraceHistory(deps.store);
  let budget:ReturnType<typeof createCalibrationBudget>|undefined,queue:EvaluationQueue|undefined,pending=Promise.resolve(),cancel=new AbortController();
  let binding:string|undefined,probe:TimingTraceV1|undefined,formalStarted=false,disposed=false,error:unknown,previewBusy=false;
  let prefix:TimingTraceV1|undefined,forecast:TimingTraceV1|undefined,firstPassTraceId:string|undefined;
  let admission=Promise.resolve(),stopped=false;
  async function admit<T>(work:()=>Promise<T>):Promise<T>{const previous=admission;let release!:()=>void;admission=new Promise<void>(r=>release=r);await previous;try{if(disposed||stopped)throw Error('CALIBRATION_DISPOSED');return await work();}finally{release();}}
  let currentLease:ActivityLease|undefined;const localCache=new Map<string,LocalCalibration>();
  const stop=()=>{stopped=true;currentLease?.stopping();cancel.abort();budget?.dispose();};
  async function prepare(request:EvaluationRequest){
    if(disposed)throw Error('CALIBRATION_DISPOSED');
    if(request.targets.length!==1||request.tracks.length!==1||request.tracks[0]!=='general'||request.judge||request.initialEstimates||!request.generalId||![1,2,3,4].includes(request.execution.concurrency)||!Number.isSafeInteger(request.execution.callTimeoutMs)||request.execution.callTimeoutMs<1000||request.execution.callTimeoutMs>1800000)throw Error('CALIBRATION_SCOPE_INVALID');
    const target=request.targets[0]!;
    if(target.routeTarget.state==='unknown'||Object.values(target.controls).some(v=>v.state==='unknown'))throw Error('CALIBRATION_CONDITION_UNKNOWN');
    const p=await deps.registry.forNewRun(request.generalId,request.tracks);if(disposed||stopped)throw Error('CALIBRATION_DISPOSED');const workload=buildWorkloadPlan(p,request.tracks);
    if(workload.jobs.length!==100||p.descriptor.general.schema!=='task-five-v1'||p.descriptor.general.tier!=='light')throw Error('CALIBRATION_SCOPE_INVALID');
    if(!deps.adapter.generateTurn)throw Error('CALIBRATION_TOOLS_UNSUPPORTED');
    const program=buildShortProbeProgram(p,request.tracks),conditionKey=performanceConditionKey(target,p,request.execution);
    const runtimeHash=identityHash([...new Set(Object.values(p.compatibility).map(c=>c.runtimeHash))].sort());
    const machineKey=localMachineKey(runtimeHash);
    return {p,workload,program,conditionKey,machineKey,runtimeHash,requestHash:identityHash({conditionKey,workloadHash:workload.workloadHash,programHash:program.hash}),
      questionCount:workload.jobs.length,theoreticalMaxRequests:12+workload.jobs.reduce((n,j)=>n+(j.stages[0]==='tool-scenario'?24:1)*3,0)};
  }
  return {
    async prepare(request:EvaluationRequest){const p=await prepare(request);return {conditionKey:p.conditionKey,machineKey:p.machineKey,protocolHash:p.workload.protocolHash,workloadHash:p.workload.workloadHash,programHash:p.program.hash,programId:p.program.id,questionCount:p.questionCount,theoreticalMaxRequests:p.theoreticalMaxRequests};},
    async measureLocal(request:EvaluationRequest){return admit(async()=>{
      const p=await prepare(request),key=identityHash([p.machineKey,p.runtimeHash]),old=localCache.get(key);if(old)return structuredClone(old);
      if(!deps.localFixtures)throw Error('CALIBRATION_LOCAL_UNAVAILABLE');deps.assertPrepared?.(p.p);
      const lease=deps.activity.claim('prepare',randomUUID());currentLease=lease;
      try {const result=await measureLocalCalibration({machineKey:p.machineKey,runtimeHash:p.runtimeHash,clock,fixtures:deps.localFixtures(p.p),signal:cancel.signal});if(result.complete)localCache.set(key,result);return result;}
      finally{if(currentLease===lease)currentLease=undefined;lease.release();}
    });},
    async startPreview(request:EvaluationRequest,grant:CalibrationBudget,mode:'preview'|'calibration'='calibration'){if(!['preview','calibration'].includes(mode))throw Error('CALIBRATION_MODE_INVALID');return admit(async()=>{
      if(disposed||budget||previewBusy)throw Error('CALIBRATION_ALREADY_STARTED');
      const input=structuredClone(request),prepared=await prepare(input);if(!grant)throw Error('CALIBRATION_BUDGET_REQUIRED');deps.assertPrepared?.(prepared.p);if(disposed||stopped)throw Error('CALIBRATION_DISPOSED');
      const lease=deps.activity.claim('calibration',randomUUID());
      currentLease=lease;
      try {
        budget=createCalibrationBudget(grant,prepared.conditionKey,clock);binding=prepared.requestHash;previewBusy=true;cancel=new AbortController();
        probe={version:1,traceId:randomUUID(),rootId:deps.store.rootId,revision:0,conditionKnown:true,conditionKey:prepared.conditionKey,protocolHash:prepared.workload.protocolHash,workloadHash:prepared.workload.workloadHash,machineKey:prepared.machineKey,programHash:prepared.program.hash,programId:prepared.program.id,algorithmId:'estimate-v3',startedAt:clock.now(),updatedAt:clock.now(),status:'running',concurrency:input.execution.concurrency,events:[]};
        probe=await history.save(probe,0);lease.identify(probe.traceId);
        const target=input.targets[0]!,messages:ToolMessage[]=[];
        const running=scheduleProbes(prepared.program,{clock,concurrency:input.execution.concurrency,budgetMs:mode==='calibration'?120000:30000,mode,tracks:input.tracks,signal:AbortSignal.any([cancel.signal,budget.signal]),reserve:()=>budget!.reserve(),
          async dispatch(p,signal){
            const context={attemptId:randomUUID(),itemId:p.id,track:p.track,phase:p.phase};
            if(p.kind==='text'){
              const answer=await deps.adapter.generateOnce({target,messages:p.messages,signal,context});budget!.recordUsage(answer.observations.usage);
              return {outcome:answer.complete?'completed':'failed',usage:answer.observations.usage,...(answer.observations.timing?{timing:answer.observations.timing}:{})};
            }
            if(!p.followupOf)messages.push({id:randomUUID(),role:'user',content:[{type:'text',text:p.messages.map(m=>m.content).join('\n')}],source:{kind:'user'}});
            const result=await deps.adapter.generateTurn!({target,messages,signal,context,tools:[{name:'read_inventory',description:'Read a fixed demonstration inventory entry.',parameters:{type:'object',properties:{item:{type:'string',enum:['sample']}},required:['item'],additionalProperties:false}}]});
            budget!.recordUsage(result.observation.usage);
            let outcome:'completed'|'failed'=result.kind==='completed'?'completed':'failed';
            if(result.kind==='completed'&&!p.followupOf){
              if(result.calls.length!==1||result.calls[0]!.name!=='read_inventory')outcome='failed';
              else {let args:unknown;try{args=JSON.parse(result.calls[0]!.argumentsJson);}catch{outcome='failed';}
                if(identityHash(args??null)!==identityHash({item:'sample'}))outcome='failed';
                if(outcome==='completed'){messages.push(result.assistant,{id:randomUUID(),role:'tool',toolCallId:result.calls[0]!.callId,content:[{type:'text',text:'{"item":"sample","stock":12}'}],source:{kind:'tool',callId:result.calls[0]!.callId}});}
              }
            }
            return {outcome,usage:result.observation.usage,...(result.observation.timing?{timing:result.observation.timing}:{})};
          },
          async onEvent(event){probe!.events.push(event);probe!.updatedAt=clock.now();probe=await history.save(probe!,probe!.revision);},
        }).then(async result=>{
          probe!.status=result.status==='completed'?'completed':'stopped';probe!.updatedAt=clock.now();probe=await history.save(probe!,probe!.revision);
          prefix={...structuredClone(probe!),traceId:randomUUID(),revision:0,programId:prepared.program.id+':30s',pairedTraceId:probe!.traceId,updatedAt:result.first30At,observationCutoff:result.first30At,events:result.first30Events,status:'stopped'};
          prefix=await history.save(prefix,0);
        });
        pending=running.catch(e=>{error=e;cancel.abort();}).finally(()=>{previewBusy=false;if(currentLease===lease)currentLease=undefined;lease.release();});
        return {previewId:probe.traceId};
      }catch(e){previewBusy=false;budget?.dispose();budget=undefined;if(currentLease===lease)currentLease=undefined;lease.release();throw e;}
    });},
    async forecast(request:EvaluationRequest,profiles:readonly BaselineProfileV1[]){return admit(async()=>{
      if(previewBusy||formalStarted||!prefix)throw Error('CALIBRATION_NOT_READY');
      const prepared=await prepare(request);if(prepared.requestHash!==binding)throw Error('CALIBRATION_CONDITION_CHANGED');
      const durationScope=profiles[0]?.durationScope;if(profiles.some(p=>p.durationScope!==durationScope))throw Error('DURATION_SCOPE_CHANGED');
      const prediction=predictFullRun({workload:prepared.workload,conditionKey:prepared.conditionKey,machineKey:prepared.machineKey,programHash:prepared.program.hash,concurrency:request.execution.concurrency,asOf:prefix.observationCutoff!,profiles,probeEvents:prefix.events,...(durationScope?{durationScope}:{})});
      forecast=await history.save({...structuredClone(prefix),traceId:randomUUID(),revision:0,prediction},0);
      return {predictionProbeId:forecast.traceId,prediction:structuredClone(prediction)};
    });},
    async startFormal(request:EvaluationRequest,durationScope:'all-scored'|'first-pass'='all-scored'){return admit(async()=>{
      if(disposed||previewBusy||formalStarted||!probe||!budget)throw Error('CALIBRATION_NOT_READY');
      const input=structuredClone(request),prepared=await prepare(input);if(prepared.requestHash!==binding)throw Error('CALIBRATION_CONDITION_CHANGED');
      if(budget.signal.aborted||budget.snapshot().calls>=budget.snapshot().maxDispatches)throw Error('CALIBRATION_BUDGET_REACHED');deps.assertPrepared?.(prepared.p);if(disposed||stopped)throw Error('CALIBRATION_DISPOSED');
      const lease=deps.activity.claim('calibration',randomUUID());
      currentLease=lease;
      try {
        formalStarted=true;
        const recorder=createTimingRecorder(deps.store,deps.registry,{machineKey:prepared.machineKey,programHash:prepared.program.hash,previewId:probe.traceId,
          ...(forecast?.prediction?{predictionProbeId:forecast.traceId,prediction:forecast.prediction}:{})});
        queue=createQueue(deps.store,deps.adapter,deps.registry,deps.graders,{...recorder.hooks,calibration:{signal:budget.signal,reserve:()=>budget!.reserve(),canDispatch:()=>budget!.canDispatch(),recordUsage:u=>budget!.recordUsage(u)}});
        const batch=await queue.enqueue(input);lease.identify(batch.batchId);
        pending=queue.idle().then(async()=>{
          await recorder.idle();if(durationScope!=='first-pass')return;
          const view=queue!.snapshot(),current=view.batches.find(b=>b.batchId===batch.batchId);if(!current||view.activeBatchId)throw Error('FIRST_PASS_STILL_ACTIVE');
          const source=await recorder.history.read(batch.runIds[0]!);if(!source)throw Error('FIRST_PASS_TRACE_MISSING');
          const captured=await deps.store.exclusive(async tx=>{const {manifest,summary}=await tx.getRun(batch.runIds[0]!);return captureFirstPassTrace(prepared.workload,source,{rootId:deps.store.rootId,manifest,summary,batch:current,items:await tx.listItems(manifest.runId)});});
          const saved=await history.save(captured,0);firstPassTraceId=saved.traceId;
        }).catch(e=>{error=e;}).finally(()=>{if(currentLease===lease)currentLease=undefined;lease.release();});return batch;
      }catch(e){formalStarted=false;await queue?.dispose();if(currentLease===lease)currentLease=undefined;lease.release();throw e;}
    });},
    status(){return {previewBusy,...(probe?{previewId:probe.traceId}:{}),...(prefix?{prefixId:prefix.traceId}:{}),...(firstPassTraceId?{firstPassTraceId}:{}),...(budget?{budget:budget.snapshot()}:{}),...(queue?{formal:queue.snapshot()}:{}),failed:!!error};},
    async idle(){await pending;if(error)throw error;},
    cancel:stop,
    async dispose(){disposed=true;stop();await admission;await pending;await queue?.dispose();},
  };
}

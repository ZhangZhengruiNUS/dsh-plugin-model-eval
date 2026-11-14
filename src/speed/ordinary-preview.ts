import {randomUUID} from 'node:crypto';
import type {HostAdapter,TargetSnapshot,JudgeSnapshot,ResolvedProtocolSet,Track,EvaluationRequest,ToolMessage} from '../contracts.ts';
import type {BaselineProfileV1,TimingTraceHistory,TimingTraceV1,TimingEventV1,PredictionV3,ProbeProgramId} from '../estimation/calibration-contracts.ts';
import {identityHash} from '../evaluation/protocol-identity.ts';import {readLocalBaselines} from '../estimation/local-baselines.ts';import {predictFullRun} from '../estimation/profile-predictor.ts';
import {timeAdvisorScope} from '../estimation/time-advisor.ts';
import {scheduleProbes} from './probe-scheduler.ts';import {speedClock,type SpeedClock} from './clock.ts';

export interface ProbePreviewEvidence {version:1;traceId:string;prefixId:string;programId:ProbeProgramId;programHash:string;machineKey:string;conditionKey:string;workloadHash:string;requiredItems:number;prediction:PredictionV3}
export interface OrdinaryProbeResult extends ProbePreviewEvidence {state:'completed'|'stopped'|'failed';errorCode?:string;fatalConfig?:boolean}
interface Input {rootId:string;adapter:HostAdapter;history:TimingTraceHistory;protocol:ResolvedProtocolSet;target:TargetSnapshot;tracks:readonly Track[];judge?:JudgeSnapshot;execution:EvaluationRequest['execution'];budgetMs:number;signal:AbortSignal;clock?:SpeedClock;profiles?:readonly BaselineProfileV1[];onEvent?:(event:TimingEventV1)=>Promise<void>;onBudget?:()=>void}

/** The ordinary path uses the frozen v4 prompts/scheduler and records no answer,
 * prompt, endpoint or tool argument. It never invokes a formal grader.
 */
export async function runOrdinaryProbePreview(input:Input):Promise<OrdinaryProbeResult>{
 const {adapter,history,protocol,target,execution}=input,clock=input.clock??speedClock;
 if(input.tracks.includes('general')&&!adapter.generateTurn)throw Error('TOOLS_NOT_SUPPORTED');if(input.tracks.includes('writing')&&!input.judge)throw Error('JUDGE_REQUIRED');
 const {workload,program,machineKey,conditions}=timeAdvisorScope(protocol,{targets:[target],tracks:[...input.tracks],execution,...(input.judge?{judge:input.judge}:{})});
 const {known,key:conditionKey}=conditions[0]!;
 let trace:TimingTraceV1=await history.save({version:1,traceId:randomUUID(),rootId:input.rootId,revision:0,conditionKnown:known,conditionKey,protocolHash:workload.protocolHash,workloadHash:workload.workloadHash,machineKey,programHash:program.hash,programId:program.id,algorithmId:'estimate-v3',startedAt:clock.now(),updatedAt:clock.now(),status:'running',concurrency:execution.concurrency,events:[]},0);
 const controller=new AbortController(),parent=()=>controller.abort();input.signal.addEventListener('abort',parent,{once:true});if(input.signal.aborted)controller.abort();
 const messages:ToolMessage[]=[];let errorCode:string|undefined,fatalConfig=false;
 const failed=(error:{code?:string;phase?:string}|undefined)=>{errorCode??=/^[A-Z][A-Z0-9_]{1,70}$/.test(error?.code??'')?error!.code:'PROBE_FAILED';if(error?.phase==='config'){fatalConfig=true;controller.abort();}};
 try{
  const run=await scheduleProbes(program,{clock,concurrency:execution.concurrency,budgetMs:input.budgetMs,mode:'preview',tracks:input.tracks,signal:controller.signal,...(input.onBudget?{onBudget:input.onBudget}:{}),
   async dispatch(p,parentSignal){const child=new AbortController(),abort=()=>child.abort();let timedOut=false;parentSignal.addEventListener('abort',abort,{once:true});if(parentSignal.aborted)child.abort();const cancelCall=clock.schedule(execution.callTimeoutMs,()=>{timedOut=true;child.abort();}),signal=child.signal;
    try{const result=await(async()=>{const context={attemptId:randomUUID(),itemId:p.id,track:p.track,phase:p.phase};
    if(p.kind==='text'){const answer=await adapter.generateOnce({target:p.phase==='judge'?input.judge!.target:target,messages:p.messages,signal,context});if(!answer.complete&&(!signal.aborted||answer.error?.phase==='config'))failed(answer.error);return {outcome:answer.complete?'completed' as const:'failed' as const,usage:answer.observations.usage,...(answer.observations.timing?{timing:answer.observations.timing}:{})};}
    if(!p.followupOf)messages.push({id:randomUUID(),role:'user',content:[{type:'text',text:p.messages.map(m=>m.content).join('\n')}],source:{kind:'user'}});
    const result=await adapter.generateTurn!({target,messages,signal,context,tools:[{name:'read_inventory',description:'Read a fixed demonstration inventory entry.',parameters:{type:'object',properties:{item:{type:'string',enum:['sample']}},required:['item'],additionalProperties:false}}]});
    let outcome:'completed'|'failed'=result.kind==='completed'?'completed':'failed';
    if(result.kind!=='completed'&&(!signal.aborted||result.error.phase==='config'))failed(result.error);
    if(result.kind==='completed'&&!p.followupOf){
     if(result.calls.length!==1||result.calls[0]!.name!=='read_inventory')outcome='failed';
     else{let args:unknown;try{args=JSON.parse(result.calls[0]!.argumentsJson);}catch{outcome='failed';}if(identityHash(args??null)!==identityHash({item:'sample'}))outcome='failed';
      if(outcome==='completed')messages.push(result.assistant,{id:randomUUID(),role:'tool',toolCallId:result.calls[0]!.callId,content:[{type:'text',text:'{"item":"sample","stock":12}'}],source:{kind:'tool',callId:result.calls[0]!.callId}});
     }
    }
    if(outcome==='failed'&&!signal.aborted)failed(undefined);return {outcome,usage:result.observation.usage,...(result.observation.timing?{timing:result.observation.timing}:{})};})();
     return timedOut&&!fatalConfig?{...result,outcome:'timeout' as const}:result;
    }finally{cancelCall();parentSignal.removeEventListener('abort',abort);}
   },
   async onEvent(event){trace.events.push(event);trace.updatedAt=clock.now();trace=await history.save(trace,trace.revision);await input.onEvent?.(event);},
  });
  if(run.events.some(e=>e.outcome==='failed'))errorCode??='PROBE_FAILED';trace.status=run.status==='completed'&&!errorCode?'completed':'stopped';trace.updatedAt=clock.now();trace=await history.save(trace,trace.revision);
  // A longer optional budget can complete the paired reference. The prospective
  // estimate still uses the saved first-thirty-second prefix, exactly as tested.
  const withdrawn=errorCode??(input.signal.aborted?'PREVIEW_CANCELLED':undefined);
  const profiles=known&&!withdrawn?(input.profiles??await readLocalBaselines(history,workload,run.first30At)):[];
  const prediction:PredictionV3=withdrawn?{algorithm:'estimate-v3',asOf:run.first30At,state:'unavailable',durationScope:'first-pass',reasons:[withdrawn],baselineIds:[],measuredBuckets:[],inferredBuckets:[]}:predictFullRun({workload,conditionKey,machineKey,programHash:program.hash,concurrency:execution.concurrency,asOf:run.first30At,durationScope:'first-pass',profiles,probeEvents:run.first30Events});
  const prefix=await history.save({...structuredClone(trace),traceId:randomUUID(),revision:0,programId:program.id+':30s',pairedTraceId:trace.traceId,updatedAt:run.first30At,observationCutoff:run.first30At,events:run.first30Events,status:'stopped',prediction},0);
  return {version:1,traceId:trace.traceId,prefixId:prefix.traceId,programId:program.id,programHash:program.hash,machineKey,conditionKey,workloadHash:workload.workloadHash,requiredItems:workload.jobs.length,prediction,state:errorCode?'failed':input.signal.aborted?'stopped':run.status,...(errorCode?{errorCode,fatalConfig}:input.signal.aborted?{errorCode:'PREVIEW_CANCELLED'}:run.budgetReached?{errorCode:'SPEED_BUDGET_REACHED'}:{})};
 }catch(error){controller.abort();trace.status='stopped';trace.updatedAt=clock.now();try{await history.save(trace,trace.revision);}catch{/* Retain the original diagnostic if timing storage is unavailable. */}throw error;}
 finally{input.signal.removeEventListener('abort',parent);}
}

import {randomUUID} from 'node:crypto';
import type {EvaluationRequest,GeneratedAnswer,HostAdapter,PromptMessage,ProtocolRegistry,ResolvedProtocolSet,Question} from '../contracts.ts';
import type {SpeedConfigRecord,SpeedSession,PerformanceSample,StageKey} from '../estimation/contracts.ts';
import {appendPerformanceSample,emptyPerformance,performanceConditionKey,isTimeoutFailure} from '../estimation/observations.ts';
import type {SpeedHistory} from '../history/speed.ts';import {speedFail} from '../history/speed.ts';
import {fingerprintTarget} from '../model/identity.ts';import {buildPrompt} from '../evaluation/grade-general.ts';import type {GradeServices} from '../jobs/queue.ts';
import {selectProbeQuestions} from './probe-set.ts';import {speedClock,type SpeedClock} from './clock.ts';
export function createSpeedRunner(deps:{adapter:HostAdapter;registry:ProtocolRegistry;graders:GradeServices;history:SpeedHistory;clock?:SpeedClock}){
 const clock=deps.clock??speedClock;let session:SpeedSession|undefined,controller=new AbortController(),running=Promise.resolve(),writeTail=Promise.resolve(),executing=false,disposed=false,failed:unknown;
 let admissionDone=Promise.resolve();
 const code=(e:unknown)=>{const c=(e as {code?:unknown})?.code;return typeof c==='string'&&/^[A-Z][A-Z0-9_]{1,70}$/.test(c)?c:'SPEED_FAILED';};
 function update(change:(s:SpeedSession)=>void):Promise<void>{const next=writeTail.then(async()=>{const value=structuredClone(session!);change(value);session=await deps.history.save(value,session!.revision);});writeTail=next.catch(e=>{failed=e;controller.abort();});return next;}
 async function execute(request:EvaluationRequest,protocols:ResolvedProtocolSet){
  for(let index=0;index<request.targets.length&&!controller.signal.aborted;index++){
   const config=session!.configs[index]!,abort=new AbortController(),start=clock.monotonicMs(),deadline=start+session!.budgetMinutes*60000;let expired=false,gradingTail:Promise<unknown>=Promise.resolve();
   const stop=()=>abort.abort();controller.signal.addEventListener('abort',stop,{once:true});if(controller.signal.aborted)abort.abort();
   const cancelBudget=clock.schedule(Math.max(0,deadline-clock.monotonicMs()),()=>{expired=true;abort.abort();void update(s=>{if(s.configs[index]!.status==='running')s.configs[index]!.status='stopping';}).catch(()=>{});});
   const record=(sample:PerformanceSample)=>update(s=>{s.configs[index]!.performance=appendPerformanceSample(s.configs[index]!.performance,sample);});
   const key=(q:Question,phase:'answer'|'judge'|'local-grade'):StageKey=>({conditionKey:performanceConditionKey(config.target,config.protocols,config.execution,phase==='judge'?config.judge:undefined),datasetId:q.datasetId,phase});
   async function generate(q:Question,phase:'answer'|'judge',messages:readonly PromptMessage[]):Promise<GeneratedAnswer|undefined>{
    if(abort.signal.aborted||clock.monotonicMs()>=deadline)return;const sampleId=randomUUID(),startedAt=clock.now(),stage=key(q,phase);
    await update(s=>{s.configs[index]!.performance.activeStages.push({...stage,sampleId,itemId:q.id,startedAt});});if(abort.signal.aborted)return;
    const child=new AbortController(),parentAbort=()=>child.abort();abort.signal.addEventListener('abort',parentAbort,{once:true});if(abort.signal.aborted)child.abort();
    let timeout=false;const cancelTimer=clock.schedule(Math.max(0,Math.min(config.execution.callTimeoutMs,deadline-clock.monotonicMs())),()=>{timeout=true;child.abort();});const invoked=clock.monotonicMs();let answer:GeneratedAnswer;
    try{answer=await deps.adapter.generateOnce({target:phase==='judge'?config.judge!.target:config.target,messages,signal:child.signal,context:{attemptId:sampleId,itemId:q.id,track:q.track,phase}});}catch(e){answer={text:'',complete:false,truncated:false,observations:{attemptId:sampleId,itemId:q.id,track:q.track,phase,startedAt,endedAt:clock.now(),usage:{available:false}},error:{code:code(e),phase:'config',retryable:false,message:'测速调用未完成。'}};}
    finally{cancelTimer();abort.signal.removeEventListener('abort',parentAbort);}
    const cancelled=abort.signal.aborted||child.signal.aborted;
    await record({...stage,sampleId,itemId:q.id,startedAt,endedAt:clock.now(),durationMs:answer.observations.timing?.totalMs??Math.max(0,clock.monotonicMs()-invoked),outcome:cancelled?(expired||timeout?'timeout':'cancelled'):answer.complete?'completed':isTimeoutFailure(answer.error)?'timeout':'failed',truncated:answer.truncated,...(answer.observations.timing?{timing:answer.observations.timing}:{}),usage:answer.observations.usage});
    if(!cancelled&&answer.error?.phase==='config'){await update(s=>{s.configs[index]!.errorCode=answer.error!.code;s.configs[index]!.status='failed';s.status='failed';});controller.abort();}
    return answer.complete&&!cancelled?answer:undefined;
   }
   try{
    await update(s=>{s.configs[index]!.status='running';s.configs[index]!.startedAt=clock.now();});const questions=selectProbeQuestions(protocols,config.tracks);let next=0;
    const outcomes=await Promise.allSettled(Array.from({length:config.execution.concurrency},async()=>{try{while(!abort.signal.aborted&&clock.monotonicMs()<deadline){const q=questions[next++];if(!q)break;const answer=await generate(q,'answer',buildPrompt(q));if(!answer||abort.signal.aborted)continue;
     if(q.track==='writing'){if(!deps.graders.writing)speedFail('WRITING_GRADER_UNAVAILABLE');if(!deps.graders.writing!.local(q,answer))await generate(q,'judge',deps.graders.writing!.build(q,answer));}
     else{const queued=clock.monotonicMs();const work=gradingTail.then(async()=>{if(abort.signal.aborted||clock.monotonicMs()>=deadline)return;const sampleId=randomUUID(),startedAt=clock.now(),started=clock.monotonicMs(),stage=key(q,'local-grade');await update(s=>{s.configs[index]!.performance.activeStages.push({...stage,sampleId,itemId:q.id,startedAt});});if(abort.signal.aborted)return;const result=await deps.graders.general(q,answer,abort.signal,protocols);await record({...stage,sampleId,itemId:q.id,startedAt,endedAt:clock.now(),durationMs:Math.max(0,clock.monotonicMs()-started),queueWaitMs:Math.max(0,started-queued),outcome:abort.signal.aborted?(expired?'timeout':'cancelled'):result.kind==='scored'?'completed':'failed'});if(result.kind==='technical-missing'&&['resource','config','storage'].includes(result.error.phase))speedFail(result.error.code);});gradingTail=work.catch(()=>{});await work;}
    }}catch(e){controller.abort();throw e;}}));
    const rejection=outcomes.find(x=>x.status==='rejected');if(rejection?.status==='rejected')throw rejection.reason;
    await update(s=>{const c=s.configs[index]!;c.endedAt=clock.now();if(c.status!=='failed')c.status=abort.signal.aborted?'stopped':'completed';if(expired)c.errorCode='SPEED_BUDGET_REACHED';c.performance.activeStages=[];});
   }finally{cancelBudget();controller.signal.removeEventListener('abort',stop);}
  }
  await update(s=>{if(s.status!=='failed')s.status=controller.signal.aborted?'stopped':'completed';});
 }
 return {
  async start(request:EvaluationRequest&{budgetMinutes:number}){
   if(disposed)speedFail('SERVICE_DISPOSED');if(executing)speedFail('ACTIVITY_BUSY');
   if(!Number.isInteger(request.budgetMinutes)||request.budgetMinutes<1||request.budgetMinutes>5||!request.targets.length||request.targets.length>20||!request.tracks.length||new Set(request.tracks).size!==request.tracks.length||request.tracks.some(t=>!['general','writing'].includes(t))||![1,2,3,4].includes(request.execution.concurrency)||!Number.isInteger(request.execution.callTimeoutMs)||request.execution.callTimeoutMs<1000||request.execution.callTimeoutMs>1800000)speedFail('INVALID_BATCH');
   const targets=request.targets.map(fingerprintTarget);if(new Set(targets).size!==targets.length)speedFail('DUPLICATE_TARGET');if(request.tracks.includes('writing')&&!request.judge)speedFail('JUDGE_REQUIRED');if(request.judge)fingerprintTarget(request.judge.target);
   const input=structuredClone(request);executing=true;let release!:()=>void;admissionDone=new Promise<void>(r=>release=r);
   try{
    const generalId=input.generalId??deps.registry.list().find(d=>d.general.tier==='legacy')?.refs.generalId;if(!generalId)speedFail('PROTOCOL_UNAVAILABLE');
    const protocols=await deps.registry.forNewRun(generalId!);if(disposed)speedFail('SERVICE_DISPOSED');selectProbeQuestions(protocols,input.tracks);
    controller=new AbortController();failed=undefined;writeTail=Promise.resolve();
    const refs={generalId:protocols.generalId,writingId:protocols.writingId,resourceVersion:protocols.resourceVersion},configs:SpeedConfigRecord[]=input.targets.map(target=>({conditionKey:performanceConditionKey(target,refs,input.execution),target,tracks:input.tracks,protocols:structuredClone(refs),execution:input.execution,...(input.judge?{judge:input.judge}:{}),status:'queued',performance:emptyPerformance()}));session=await deps.history.save({version:1,previewId:randomUUID(),rootId:deps.history.rootId,revision:0,createdAt:clock.now(),updatedAt:clock.now(),budgetMinutes:input.budgetMinutes,status:'running',configs},0);
    if(disposed){session.status='stopped';for(const c of session.configs)c.status='stopped';session=await deps.history.save(session,session.revision);speedFail('SERVICE_DISPOSED');}
    running=execute(input,protocols).catch(async e=>{failed=e;controller.abort();if(session){session.status='failed';for(const c of session.configs)if(c.status==='running'||c.status==='stopping'){c.status='failed';c.errorCode=code(e);}try{session=await deps.history.save(session,session.revision);}catch{/* retain diagnostic in memory; caller idle rejects */}}}).finally(()=>{executing=false;});return {previewId:session.previewId};
   }catch(e){executing=false;throw e;}finally{release();}
  },
  async cancel(id:string){if(session?.previewId!==id)speedFail('PREVIEW_NOT_FOUND');if(!executing)return;controller.abort();void update(s=>{if(s.status==='running')s.status='stopping';}).catch(()=>{});},
  snapshot(id:string):SpeedSession{if(session?.previewId!==id)speedFail('PREVIEW_NOT_FOUND');const value=structuredClone(session!);if(executing&&controller.signal.aborted&&value.status!=='failed')value.status='stopping';return value;},
  async idle(){await admissionDone;await running;await writeTail;if(failed)throw failed;},
  async dispose(){disposed=true;controller.abort();await admissionDone;controller.abort();await running;await writeTail;}
 };
}

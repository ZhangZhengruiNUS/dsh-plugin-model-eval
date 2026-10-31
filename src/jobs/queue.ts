import {performanceConditionKey,normalizeObservation,isTimeoutFailure} from '../estimation/observations.ts';
import type {PerformanceSample,EstimateSnapshot} from '../estimation/contracts.ts';
import {randomUUID} from 'node:crypto';
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import type {EvaluationRequest,GeneratedAnswer,GradeResult,HostAdapter,JudgeSnapshot,PromptMessage,ProtocolSet,Question,RunSummary,TechnicalError,Track} from '../contracts.ts';
import {fingerprintTarget} from '../model/identity.ts';
import {readRecord,writeRecord} from '../history/atomic.ts';
import type {AttemptRecord,HistoryStore,ItemInput,ItemRecord} from '../history/store.ts';
import {refreshRunSummary} from '../evaluation/aggregate-run.ts';
import {buildPrompt} from '../evaluation/grade-general.ts';
import {runAttempt,type RetryClock} from './attempts.ts';
import {summarizeMetrics} from './metrics.ts';
export interface BatchView {batchId:string;runIds:string[];status:'queued'|'running'|'paused'|'pending'|'completed';createdAt:string;estimate?:EstimateSnapshot;lastError?:TechnicalError;judge?:JudgeSnapshot;execution:EvaluationRequest['execution']}
export interface QueueView {activeBatchId?:string;batches:BatchView[];recoveryIssues?:{runId:string;code:string}[]}
export interface GradeServices {
  general(question:Question,answer:GeneratedAnswer,signal:AbortSignal):Promise<GradeResult>;
  writing?:{build(question:Question,answer:GeneratedAnswer):readonly PromptMessage[];parse(question:Question,answer:GeneratedAnswer,judge:JudgeSnapshot,candidate:GeneratedAnswer):GradeResult;local(question:Question,answer:GeneratedAnswer):GradeResult|undefined};
}
export interface EvaluationQueue {saveEstimate(batchId:string,estimate:EstimateSnapshot):Promise<void>;enqueue(request:EvaluationRequest):Promise<BatchView>;pause(batchId:string):Promise<void>;resume(batchId:string,judge?:JudgeSnapshot):Promise<void>;snapshot():QueueView;idle():Promise<void>;dispose():Promise<void>}
const failure=(code:string,phase:TechnicalError['phase']='storage',retryable=false):TechnicalError=>({code,phase,retryable,message:phase==='storage'?'本地记录无法完成保存，已停止派发。':'本轮评测需要处理后继续。'});
const fail=(code:string):never=>{throw Object.assign(new Error(code),{code});};
export function createQueue(store:HistoryStore,adapter:HostAdapter,protocols:ProtocolSet,graders:GradeServices,options:{clock?:RetryClock;onChange?:(runId:string)=>void}={}):EvaluationQueue {
  const batches=new Map<string,BatchView>(),recoveryIssues:NonNullable<QueueView['recoveryIssues']>=[];let active:string|undefined,controller:AbortController|undefined,running:Promise<void>=Promise.resolve(),disposed=false,admitting=false,gradingTail:Promise<unknown>=Promise.resolve();
  const metadata=join(store.root,'history','maintenance');
  const ready=(async()=>{
    for(const file of await readdir(metadata))if(/^batch-[a-f0-9-]{36}\.json$/.test(file)){
      try{const batch=await readRecord<BatchView>(join(metadata,file));if(!Array.isArray(batch.runIds))continue;batch.status=batch.status==='running'?'paused':batch.status;batches.set(batch.batchId,batch);}catch{/* service diagnostics expose invalid metadata; no automatic calls */}
    }
    if(store.writable)for(const run of await store.listSummaries())if(run.details==='available')try{await refresh(run.runId);}catch{recoveryIssues.push({runId:run.runId,code:'SUMMARY_REBUILD_FAILED'});}
  })();
  async function persist(batch:BatchView):Promise<void>{await store.exclusive(async tx=>{await writeRecord(join(tx.maintenanceDirectory,`batch-${batch.batchId}.json`),batch);});}
  async function refresh(runId:string):Promise<void> {await store.exclusive(tx=>refreshRunSummary(store,tx,runId));try{options.onChange?.(runId);}catch{/* optional observer cannot invalidate a committed grade */}}
  async function trackState(runId:string,status:'running'|'paused'|'pending',begin=false,end=false):Promise<void> {
    await store.exclusive(async tx=>{const {summary}=await tx.getRun(runId);await tx.updateSummary(runId,summary.revision,next=>{
      for(const value of Object.values(next.tracks))if(value.status!=='completed')value.status=status;
      if(begin)next.metrics.activeIntervals.push({startedAt:new Date().toISOString()});
      if(end){const interval=next.metrics.activeIntervals.at(-1);if(interval&&!interval.endedAt)interval.endedAt=new Date().toISOString();}
    });});
  }
  async function call(runId:string,q:Question,phase:'answer'|'judge',messages:readonly PromptMessage[],signal:AbortSignal,batch:BatchView):Promise<GeneratedAnswer|undefined> {
    const {manifest}=await store.getRun(runId),target=phase==='answer'?manifest.target:batch.judge?.target;if(!target)return undefined;
    const outcome=await runAttempt<GeneratedAnswer>(async(retryIndex)=>{
      let item=await store.getItem(runId,q.id);const attempt:AttemptRecord={attemptId:randomUUID(),phase,itemId:q.id,track:q.track,retryIndex,performanceKey:{conditionKey:performanceConditionKey(manifest.target,manifest.protocols,batch.execution,phase==='judge'?batch.judge:undefined),datasetId:q.datasetId,phase},status:'started',startedAt:new Date().toISOString(),...(phase==='judge'&&batch.judge?{judge:structuredClone(batch.judge)}:{})};
      const {grading:excluded,...question}=q;
      const state:ItemInput={itemId:q.id,question:item?.question??question,attempts:[...(item?.attempts??[]),attempt],...(item?.answer?{answer:item.answer}:{}),...(item?.grade?{grade:item.grade}:{})};
      await store.saveItem(runId,item?.revision??0,state);await refresh(runId);
      const child=new AbortController(),abort=()=>child.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
      let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.abort();},batch.execution.callTimeoutMs);
      const generatedStart=performance.now();let answer:GeneratedAnswer;
      try{answer=await adapter.generateOnce({target,messages,signal:child.signal,context:{attemptId:attempt.attemptId,itemId:q.id,track:q.track,phase}});}
      catch(thrown){const code=typeof (thrown as {code?:unknown})?.code==='string'?(thrown as {code:string}).code:'CALL_FAILED';const configuration=/AUTH|CONFIG|TARGET|UNSUPPORTED|REASONING|PARAMETER/.test(code);
        answer={text:'',complete:false,truncated:false,observations:{attemptId:attempt.attemptId,itemId:q.id,track:q.track,phase,startedAt:attempt.startedAt,endedAt:new Date().toISOString(),usage:{available:false}},error:failure(configuration?code:'CALL_FAILED',configuration?'config':phase,!configuration)};
      }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
      if(child.signal.aborted){answer.complete=false;answer.error=failure(timedOut?'CALL_TIMEOUT':'ABORTED',phase,timedOut&&!signal.aborted);}
      attempt.status=answer.complete?'completed':signal.aborted?'interrupted':'failed';attempt.endedAt=answer.observations.endedAt;attempt.observations=answer.observations;if(answer.error)attempt.error=answer.error;
      attempt.performance=normalizeObservation({...attempt.performanceKey!,sampleId:attempt.attemptId,itemId:q.id,startedAt:answer.observations.startedAt,endedAt:answer.observations.endedAt,durationMs:answer.observations.timing?.totalMs??(performance.now()-generatedStart),outcome:answer.complete?'completed':timedOut||isTimeoutFailure(answer.error)?'timeout':signal.aborted?'cancelled':'failed',truncated:answer.truncated,automaticRetry:!answer.complete&&!!answer.error?.retryable&&retryIndex<2&&!signal.aborted,...(answer.observations.timing?{timing:answer.observations.timing}:{}),usage:answer.observations.usage});
      if(phase==='judge')attempt.rawText=answer.text;
      item=await store.getItem(runId,q.id);state.attempts=[...(item?.attempts??[]).filter(x=>x.attemptId!==attempt.attemptId),attempt];
      if(phase==='answer')state.answer=answer;
      if(phase==='judge'&&answer.complete){const grade=graders.writing!.parse(q,answer,batch.judge!,state.answer!);state.grade=grade;
        if(grade.kind==='technical-missing'){attempt.validationError=grade.error;if(attempt.performance)attempt.performance.outcome='failed';await store.saveItem(runId,item?.revision??0,state);await refresh(runId);return {ok:false,error:grade.error};}}
      await store.saveItem(runId,item?.revision??0,state);await refresh(runId);
      return answer.complete?{ok:true,value:answer}:{ok:false,error:answer.error??failure('ANSWER_INCOMPLETE',phase,true)};
    },signal,options.clock);
    if(!outcome.ok){if(!signal.aborted)batch.lastError=outcome.error;controller?.abort();return undefined;}return outcome.value;
  }
  async function processItem(runId:string,q:Question,batch:BatchView,signal:AbortSignal):Promise<void> {
    let item=await store.getItem(runId,q.id);if(item?.grade?.kind==='scored')return;
    const answer=item?.answer?.complete?item.answer:await call(runId,q,'answer',buildPrompt(q),signal,batch);if(!answer||signal.aborted)return;
    let grade:GradeResult|undefined,gradingObservation:PerformanceSample|undefined;
    if(q.track==='writing'){
      if(!graders.writing){batch.lastError=failure('WRITING_GRADER_UNAVAILABLE','config');controller?.abort();return;}
      grade=graders.writing.local(q,answer);
      if(!grade){await call(runId,q,'judge',graders.writing.build(q,answer),signal,batch);if(!signal.aborted)await refresh(runId);return;}
    }else {
      const queued=performance.now();const work=gradingTail.then(async()=>{const start=performance.now(),startedAt=new Date().toISOString(),current=await store.getItem(runId,q.id),manifest=(await store.getRun(runId)).manifest;await store.saveItem(runId,current!.revision,{...current!,gradingActive:{conditionKey:performanceConditionKey(manifest.target,manifest.protocols,batch.execution),datasetId:q.datasetId,phase:'local-grade',sampleId:randomUUID(),itemId:q.id,startedAt}});await refresh(runId);const grade=await graders.general(q,answer,signal);return {grade,elapsed:performance.now()-start,queueWaitMs:start-queued,startedAt,endedAt:new Date().toISOString()};});gradingTail=work.catch(()=>{});const result=await work;grade=result.grade;const {manifest}=await store.getRun(runId);gradingObservation={conditionKey:performanceConditionKey(manifest.target,manifest.protocols,batch.execution),datasetId:q.datasetId,phase:'local-grade',sampleId:randomUUID(),itemId:q.id,startedAt:result.startedAt,endedAt:result.endedAt,durationMs:result.elapsed,queueWaitMs:result.queueWaitMs,outcome:grade.kind==='scored'?'completed':signal.aborted?'cancelled':'failed'};
      await store.exclusive(async tx=>{const {summary}=await tx.getRun(runId);await tx.updateSummary(runId,summary.revision,next=>{const value=next.metrics.tracks[q.track];if(value)value.gradingMs+=result.elapsed;});});
    }
    item=await store.getItem(runId,q.id);const {gradingActive:finishedStage,...savedItem}=item!;await store.saveItem(runId,item!.revision,{...savedItem,grade,...(gradingObservation?{gradingObservation}:{})});
    if(grade.kind==='technical-missing'){batch.lastError=grade.error;controller?.abort();}
    await refresh(runId);
  }
  async function execute(batch:BatchView):Promise<void> {
    const signal=controller!.signal;batch.status='running';delete batch.lastError;
    try {
      await persist(batch);
      for(const runId of batch.runIds){if(signal.aborted)break;const {summary,manifest}=await store.getRun(runId);
        if(!summary.resumeAllowed||summary.details!=='available')fail('RUN_CANNOT_RESUME');
        if(Object.values(summary.tracks).every(x=>x.status==='completed'))continue;
        if(manifest.protocols.generalId!==protocols.generalId||manifest.protocols.writingId!==protocols.writingId||manifest.protocols.resourceVersion!==protocols.resourceVersion)fail('PROTOCOL_CHANGED');
        await trackState(runId,'running',true);
        try {
          // General completion is committed before beginning the independent writing track.
          for(const track of ['general','writing'] as const){if(summary.tracks[track]?.status==='completed')continue;const required=new Set(manifest.requiredItems.filter(x=>x.track===track).map(x=>x.id)),questions=protocols.items.filter(x=>required.has(x.id));let index=0;
            const workers=await Promise.allSettled(Array.from({length:batch.execution.concurrency},async()=>{try{while(!signal.aborted){const q=questions[index++];if(!q)break;await processItem(runId,q,batch,signal);}}catch(error){controller?.abort();throw error;}}));
            const rejected=workers.find(x=>x.status==='rejected');if(rejected?.status==='rejected')throw rejected.reason;if(signal.aborted)break;
          }
        }finally{await trackState(runId,batch.lastError?'pending':'paused',false,true);await refresh(runId);}
      }
      const summaries=await Promise.all(batch.runIds.map(id=>store.getRun(id)));
      batch.status=summaries.every(x=>Object.values(x.summary.tracks).every(t=>t.status==='completed'))?'completed':batch.lastError?'pending':'paused';
    }catch{batch.status='pending';batch.lastError??=failure('QUEUE_STOPPED');controller?.abort();}
    finally{active=undefined;await persist(batch).catch(()=>{batch.lastError=failure('STORAGE_FAILED');});}
  }
  function start(batch:BatchView):void{active=batch.batchId;controller=new AbortController();running=execute(batch);}
  const queue:EvaluationQueue={async saveEstimate(id,estimate){const batch=batches.get(id);if(!batch)return;batch.estimate=structuredClone(estimate);await persist(batch);},snapshot(){return {batches:structuredClone([...batches.values()]),recoveryIssues:structuredClone(recoveryIssues),...(active?{activeBatchId:active}:{})};},async idle(){await ready;await running;},
    async enqueue(request){await ready;if(disposed)fail('QUEUE_DISPOSED');if(active||admitting)fail('QUEUE_BUSY');if(!store.writable)fail('HISTORY_READ_ONLY');
      if(!request.targets.length||!request.tracks.length||new Set(request.tracks).size!==request.tracks.length||request.tracks.some(x=>!['general','writing'].includes(x)))fail('INVALID_BATCH');
      if(![1,2,3,4].includes(request.execution.concurrency)||!Number.isInteger(request.execution.callTimeoutMs)||request.execution.callTimeoutMs<1000||request.execution.callTimeoutMs>1800000)fail('INVALID_EXECUTION');
      const ids=request.targets.map(fingerprintTarget);if(new Set(ids).size!==ids.length)fail('DUPLICATE_TARGET');if(request.tracks.includes('writing')&&!request.judge)fail('JUDGE_REQUIRED');if(request.judge)fingerprintTarget(request.judge.target);
      admitting=true;try{const batch:BatchView={batchId:randomUUID(),runIds:[],createdAt:new Date().toISOString(),status:'queued',execution:structuredClone(request.execution),...(request.judge?{judge:structuredClone(request.judge)}:{})};
        for(const target of request.targets){const run=await store.createRun({batchId:batch.batchId,target,protocols:{generalId:protocols.generalId,writingId:protocols.writingId,resourceVersion:protocols.resourceVersion},requiredItems:protocols.items.filter(x=>request.tracks.includes(x.track)).map(x=>({id:x.id,track:x.track,datasetId:x.datasetId})),execution:request.execution,...(request.initialEstimates?.[fingerprintTarget(target)]?{initialEstimation:request.initialEstimates[fingerprintTarget(target)]!}:{}),...(request.judge?{judge:request.judge}:{})});batch.runIds.push(run.runId);}
        batches.set(batch.batchId,batch);await persist(batch);await store.exclusive(async()=>{if(disposed)return;start(batch);});return structuredClone(batch);
      }finally{admitting=false;}
    },
    async pause(id){await ready;if(active!==id)fail('BATCH_NOT_ACTIVE');controller?.abort();await running;},
    async resume(id,judge){await ready;if(disposed)fail('QUEUE_DISPOSED');if(active||admitting)fail('QUEUE_BUSY');const batch=batches.get(id);if(!batch)return fail('BATCH_NOT_FOUND');
      await store.exclusive(async tx=>{if(active||admitting)fail('QUEUE_BUSY');if(disposed)fail('QUEUE_DISPOSED');for(const id of batch.runIds){const {summary}=await tx.getRun(id);if(!summary.resumeAllowed||summary.details!=='available')fail('RUN_CANNOT_RESUME');}
        if(judge){fingerprintTarget(judge.target);if(batch.judge&&(judge.rubricId!==batch.judge.rubricId||judge.promptId!==batch.judge.promptId))fail('JUDGE_PROTOCOL_CHANGED');batch.judge=structuredClone(judge);}start(batch);});},
    async dispose(){disposed=true;controller?.abort();await ready;await running;},
  };return queue;
}

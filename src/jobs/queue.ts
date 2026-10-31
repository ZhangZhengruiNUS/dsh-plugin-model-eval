import {randomUUID} from 'node:crypto';
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import type {EvaluationRequest,GeneratedAnswer,GradeResult,HostAdapter,JudgeSnapshot,PromptMessage,ProtocolSet,Question,RunSummary,TechnicalError,Track} from '../contracts.ts';
import {fingerprintTarget} from '../model/identity.ts';
import {readRecord,writeRecord} from '../history/atomic.ts';
import type {AttemptRecord,HistoryStore,ItemInput,ItemRecord} from '../history/store.ts';
import {summarizeGeneral} from '../evaluation/aggregate.ts';
import {buildPrompt} from '../evaluation/grade-general.ts';
import {runAttempt,type RetryClock} from './attempts.ts';
import {summarizeMetrics} from './metrics.ts';
export interface BatchView {batchId:string;runIds:string[];status:'queued'|'running'|'paused'|'pending'|'completed';createdAt:string;lastError?:TechnicalError;judge?:JudgeSnapshot;execution:EvaluationRequest['execution']}
export interface QueueView {activeBatchId?:string;batches:BatchView[]}
export interface GradeServices {
  general(question:Question,answer:GeneratedAnswer,signal:AbortSignal):Promise<GradeResult>;
  writing?:{build(question:Question,answer:GeneratedAnswer):readonly PromptMessage[];parse(question:Question,answer:GeneratedAnswer,judge:JudgeSnapshot,candidate:GeneratedAnswer):GradeResult;local(question:Question,answer:GeneratedAnswer):GradeResult|undefined};
}
export interface EvaluationQueue {enqueue(request:EvaluationRequest):Promise<BatchView>;pause(batchId:string):Promise<void>;resume(batchId:string,judge?:JudgeSnapshot):Promise<void>;snapshot():QueueView;idle():Promise<void>;dispose():Promise<void>}
const failure=(code:string,phase:TechnicalError['phase']='storage',retryable=false):TechnicalError=>({code,phase,retryable,message:phase==='storage'?'本地记录无法完成保存，已停止派发。':'本轮评测需要处理后继续。'});
const fail=(code:string):never=>{throw Object.assign(new Error(code),{code});};
export function createQueue(store:HistoryStore,adapter:HostAdapter,protocols:ProtocolSet,graders:GradeServices,options:{clock?:RetryClock}={}):EvaluationQueue {
  const batches=new Map<string,BatchView>();let active:string|undefined,controller:AbortController|undefined,running:Promise<void>=Promise.resolve(),disposed=false,admitting=false,gradingTail:Promise<unknown>=Promise.resolve();
  const metadata=join(store.root,'history','maintenance');
  const ready=(async()=>{
    for(const file of await readdir(metadata))if(/^batch-[a-f0-9-]{36}\.json$/.test(file)){
      try{const batch=await readRecord<BatchView>(join(metadata,file));if(!Array.isArray(batch.runIds))continue;batch.status=batch.status==='running'?'paused':batch.status;batches.set(batch.batchId,batch);}catch{/* service diagnostics expose invalid metadata; no automatic calls */}
    }
  })();
  async function persist(batch:BatchView):Promise<void>{await store.exclusive(async tx=>{await writeRecord(join(tx.maintenanceDirectory,`batch-${batch.batchId}.json`),batch);});}
  async function refresh(runId:string):Promise<void> {
    await store.exclusive(async tx=>{
      const {summary,manifest}=await tx.getRun(runId),items=await store.listItems(runId),valid=items.flatMap(x=>x.grade?[x.grade]:[]);
      await tx.updateSummary(runId,summary.revision,next=>{
        for(const track of ['general','writing'] as const){const old=next.tracks[track];if(!old||old.status==='completed')continue;
          const selected=manifest.requiredItems.filter(x=>x.track===track),ids=new Set(selected.map(x=>x.id));
          if(track==='general'){
            const value=summarizeGeneral(valid,{...protocols,items:protocols.items.filter(x=>ids.has(x.id))});
            next.tracks.general={...value,answered:items.filter(x=>ids.has(x.itemId)&&x.answer?.complete).length};
          }else {
            const grades=valid.filter((x):x is Extract<GradeResult,{kind:'scored';track:'writing'}>=>x.kind==='scored'&&x.track==='writing'&&ids.has(x.itemId));
            const complete=grades.length===selected.length;
            next.tracks.writing={status:complete?'completed':'pending',required:selected.length,graded:grades.length,answered:items.filter(x=>ids.has(x.itemId)&&x.answer?.complete).length,measures:{},...(complete?{score:grades.reduce((n,x)=>n+x.score,0)/selected.length}:{})};
          }
          const updated=next.tracks[track]!;
          if(updated.status==='completed')updated.completedAt=items.filter(x=>ids.has(x.itemId)&&x.grade?.kind==='scored').map(x=>x.gradeCommittedAt!).sort().at(-1)??new Date().toISOString();
        }
        const previous=next.metrics,calculated=summarizeMetrics(items.flatMap(x=>x.attempts),previous.activeIntervals,Object.fromEntries(Object.entries(previous.tracks).map(([k,v])=>[k,v.gradingMs])));
        calculated.incompleteTiming ||=previous.incompleteTiming;next.metrics=calculated;
        next.judges=[];
        for(const item of items){const grade=item.grade;if(grade?.kind!=='scored'||grade.track!=='writing'||grade.assessment.method!=='model')continue;
          const judge=grade.assessment.judge,key=fingerprintTarget(judge.target)+judge.rubricId+judge.promptId;
          let group=next.judges.find(x=>fingerprintTarget(x.snapshot.target)+x.snapshot.rubricId+x.snapshot.promptId===key);if(!group){group={snapshot:judge,itemIds:[]};next.judges.push(group);}group.itemIds.push(item.itemId);
        }
        if(Object.values(next.tracks).every(x=>x.status==='completed')&&!next.completedAt)next.completedAt=new Date().toISOString();
      });
    });
  }
  async function trackState(runId:string,status:'running'|'paused'|'pending',begin=false,end=false):Promise<void> {
    await store.exclusive(async tx=>{const {summary}=await tx.getRun(runId);await tx.updateSummary(runId,summary.revision,next=>{
      for(const value of Object.values(next.tracks))if(value.status!=='completed')value.status=status;
      if(begin)next.metrics.activeIntervals.push({startedAt:new Date().toISOString()});
      if(end){const interval=next.metrics.activeIntervals.at(-1);if(interval&&!interval.endedAt)interval.endedAt=new Date().toISOString();}
    });});
  }
  async function call(runId:string,q:Question,phase:'answer'|'judge',messages:readonly PromptMessage[],signal:AbortSignal,batch:BatchView):Promise<GeneratedAnswer|undefined> {
    const {manifest}=await store.getRun(runId),target=phase==='answer'?manifest.target:batch.judge?.target;if(!target)return undefined;
    const outcome=await runAttempt<GeneratedAnswer>(async()=>{
      let item=await store.getItem(runId,q.id);const attempt:AttemptRecord={attemptId:randomUUID(),phase,status:'started',startedAt:new Date().toISOString()};
      const state:ItemInput={itemId:q.id,attempts:[...(item?.attempts??[]),attempt],...(item?.answer?{answer:item.answer}:{}),...(item?.grade?{grade:item.grade}:{})};
      await store.saveItem(runId,item?.revision??0,state);
      const child=new AbortController(),abort=()=>child.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
      let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.abort();},batch.execution.callTimeoutMs);
      let answer:GeneratedAnswer;
      try{answer=await adapter.generateOnce({target,messages,signal:child.signal,context:{attemptId:attempt.attemptId,itemId:q.id,track:q.track,phase}});}
      catch(thrown){const code=typeof (thrown as {code?:unknown})?.code==='string'?(thrown as {code:string}).code:'CALL_FAILED';const configuration=/AUTH|CONFIG|TARGET|UNSUPPORTED|REASONING|PARAMETER/.test(code);
        answer={text:'',complete:false,truncated:false,observations:{attemptId:attempt.attemptId,itemId:q.id,track:q.track,phase,startedAt:attempt.startedAt,endedAt:new Date().toISOString(),usage:{available:false}},error:failure(configuration?code:'CALL_FAILED',configuration?'config':phase,!configuration)};
      }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
      if(child.signal.aborted){answer.complete=false;answer.error=failure(timedOut?'CALL_TIMEOUT':'ABORTED',phase,timedOut&&!signal.aborted);}
      attempt.status=answer.complete?'completed':signal.aborted?'interrupted':'failed';attempt.endedAt=answer.observations.endedAt;attempt.observations=answer.observations;if(answer.error)attempt.error=answer.error;
      if(phase==='judge')attempt.rawText=answer.text;
      item=await store.getItem(runId,q.id);state.attempts=[...(item?.attempts??[]).filter(x=>x.attemptId!==attempt.attemptId),attempt];
      if(phase==='answer')state.answer=answer;
      if(phase==='judge'&&answer.complete){const grade=graders.writing!.parse(q,answer,batch.judge!,state.answer!);state.grade=grade;
        if(grade.kind==='technical-missing'){attempt.validationError=grade.error;await store.saveItem(runId,item?.revision??0,state);return {ok:false,error:grade.error};}}
      await store.saveItem(runId,item?.revision??0,state);
      return answer.complete?{ok:true,value:answer}:{ok:false,error:answer.error??failure('ANSWER_INCOMPLETE',phase,true)};
    },signal,options.clock);
    if(!outcome.ok){batch.lastError=outcome.error;controller?.abort();return undefined;}return outcome.value;
  }
  async function processItem(runId:string,q:Question,batch:BatchView,signal:AbortSignal):Promise<void> {
    let item=await store.getItem(runId,q.id);if(item?.grade?.kind==='scored')return;
    const answer=item?.answer?.complete?item.answer:await call(runId,q,'answer',buildPrompt(q),signal,batch);if(!answer||signal.aborted)return;
    let grade:GradeResult|undefined;
    if(q.track==='writing'){
      if(!graders.writing){batch.lastError=failure('WRITING_GRADER_UNAVAILABLE','config');controller?.abort();return;}
      grade=graders.writing.local(q,answer);
      if(!grade){await call(runId,q,'judge',graders.writing.build(q,answer),signal,batch);if(!signal.aborted)await refresh(runId);return;}
    }else {
      const work=gradingTail.then(async()=>{const start=performance.now();return {grade:await graders.general(q,answer,signal),elapsed:performance.now()-start};});gradingTail=work.catch(()=>{});const result=await work;grade=result.grade;
      await store.exclusive(async tx=>{const {summary}=await tx.getRun(runId);await tx.updateSummary(runId,summary.revision,next=>{const value=next.metrics.tracks[q.track];if(value)value.gradingMs+=result.elapsed;});});
    }
    item=await store.getItem(runId,q.id);await store.saveItem(runId,item!.revision,{...item!,grade});
    if(grade.kind==='technical-missing'){batch.lastError=grade.error;controller?.abort();}
    await refresh(runId);
  }
  async function execute(batch:BatchView):Promise<void> {
    const signal=controller!.signal;batch.status='running';delete batch.lastError;await persist(batch);
    try {
      for(const runId of batch.runIds){if(signal.aborted)break;const {summary,manifest}=await store.getRun(runId);
        if(!summary.resumeAllowed||summary.details!=='available')fail('RUN_CANNOT_RESUME');
        if(Object.values(summary.tracks).every(x=>x.status==='completed'))continue;
        if(manifest.protocols.generalId!==protocols.generalId||manifest.protocols.writingId!==protocols.writingId||manifest.protocols.resourceVersion!==protocols.resourceVersion)fail('PROTOCOL_CHANGED');
        await trackState(runId,'running',true);
        try {
          // General completion is committed before beginning the independent writing track.
          for(const track of ['general','writing'] as const){const required=new Set(manifest.requiredItems.filter(x=>x.track===track).map(x=>x.id)),questions=protocols.items.filter(x=>required.has(x.id));let index=0;
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
  const queue:EvaluationQueue={snapshot(){return {batches:structuredClone([...batches.values()]),...(active?{activeBatchId:active}:{})};},async idle(){await ready;await running;},
    async enqueue(request){await ready;if(disposed)fail('QUEUE_DISPOSED');if(active||admitting)fail('QUEUE_BUSY');if(!store.writable)fail('HISTORY_READ_ONLY');
      if(!request.targets.length||!request.tracks.length||new Set(request.tracks).size!==request.tracks.length||request.tracks.some(x=>!['general','writing'].includes(x)))fail('INVALID_BATCH');
      if(![1,2,3,4].includes(request.execution.concurrency)||!Number.isInteger(request.execution.callTimeoutMs)||request.execution.callTimeoutMs<1000||request.execution.callTimeoutMs>1800000)fail('INVALID_EXECUTION');
      const ids=request.targets.map(fingerprintTarget);if(new Set(ids).size!==ids.length)fail('DUPLICATE_TARGET');if(request.tracks.includes('writing')&&!request.judge)fail('JUDGE_REQUIRED');if(request.judge)fingerprintTarget(request.judge.target);
      admitting=true;try{const batch:BatchView={batchId:randomUUID(),runIds:[],createdAt:new Date().toISOString(),status:'queued',execution:structuredClone(request.execution),...(request.judge?{judge:structuredClone(request.judge)}:{})};
        for(const target of request.targets){const run=await store.createRun({batchId:batch.batchId,target,protocols:{generalId:protocols.generalId,writingId:protocols.writingId,resourceVersion:protocols.resourceVersion},requiredItems:protocols.items.filter(x=>request.tracks.includes(x.track)).map(x=>({id:x.id,track:x.track,datasetId:x.datasetId})),execution:request.execution,...(request.judge?{judge:request.judge}:{})});batch.runIds.push(run.runId);}
        batches.set(batch.batchId,batch);await persist(batch);start(batch);return structuredClone(batch);
      }finally{admitting=false;}
    },
    async pause(id){await ready;if(active!==id)fail('BATCH_NOT_ACTIVE');controller?.abort();await running;},
    async resume(id,judge){await ready;if(disposed)fail('QUEUE_DISPOSED');if(active||admitting)fail('QUEUE_BUSY');const batch=batches.get(id);if(!batch)return fail('BATCH_NOT_FOUND');if(judge){fingerprintTarget(judge.target);batch.judge=structuredClone(judge);}start(batch);},
    async dispose(){disposed=true;controller?.abort();await ready;await running;},
  };return queue;
}

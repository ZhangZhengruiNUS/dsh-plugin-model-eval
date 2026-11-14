import {generalSchemaFor} from '../evaluation/current-edition.ts';
import {usesContestWallSafety} from '../evaluation/five-schema.ts';
import {performanceConditionKey,normalizeObservation,isTimeoutFailure} from '../estimation/observations.ts';
import type {PerformanceSample,EstimateSnapshot} from '../estimation/contracts.ts';
import {randomUUID} from 'node:crypto';
import type {ExecutionChange} from '../contracts.ts';
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import type {EvaluationRequest,GeneratedAnswer,GradeResult,HostAdapter,JudgeSnapshot,PromptMessage,ProtocolSet,Question,RunSummary,TechnicalError,Track} from '../contracts.ts';
import {fingerprintTarget} from '../model/identity.ts';
import {readRecord,writeRecord} from '../history/atomic.ts';
import type {AttemptRecord,HistoryStore,HistoryTransaction,ItemInput,ItemRecord} from '../history/store.ts';
import {refreshRunSummary} from '../evaluation/aggregate-run.ts';
import {buildPrompt} from '../evaluation/grade-general.ts';
import type {ProtocolRegistry,ResolvedProtocolSet} from '../evaluation/tier-contracts.ts';
import {buildExecutionOrder,validateExecutionOrder,validateGeneralOrderPrefix} from './execution-order.ts';
import {LEGACY_WRITING_ID} from '../evaluation/writing-edition.ts';
import {identityHash} from '../evaluation/protocol-identity.ts';
import {validateGeneralDefinition} from '../evaluation/definitions.ts';
import {verifyReadyReuse} from '../history/reuse.ts';
import {verifyReadyEditionReuse} from '../history/edition-reuse.ts';
import {runAttempt,type RetryClock} from './attempts.ts';
import {createCallWatchdog} from './call-watchdog.ts';
import {assertFailurePolicy,hasObservedOutput,isDeferredTimeout,isFatalCallError,timeoutFailure} from './timeout-policy.ts';
import {summarizeMetrics} from './metrics.ts';
import type {ToolSessionInput} from '../host/tool-session.ts';
export interface BatchView {batchId:string;runIds:string[];status:'queued'|'running'|'paused'|'pending'|'completed';createdAt:string;estimate?:EstimateSnapshot;lastError?:TechnicalError;pendingItems?:{runId:string;itemId:string;error:TechnicalError}[];judge?:JudgeSnapshot;execution:EvaluationRequest['execution'];executionChanges?:ExecutionChange[]}
export interface QueueView {activeBatchId?:string;batches:BatchView[];recoveryIssues?:{runId:string;code:string}[]}
export interface GradeServices {
  general(question:Question,answer:GeneratedAnswer,signal:AbortSignal,protocol:ResolvedProtocolSet):Promise<GradeResult>;
  tools?(question:Question,input:ToolSessionInput,protocol:ResolvedProtocolSet,execution:EvaluationRequest['execution']):Promise<GradeResult>;
  writing?:{build(question:Question,answer:GeneratedAnswer):readonly PromptMessage[];parse(question:Question,answer:GeneratedAnswer,judge:JudgeSnapshot,candidate:GeneratedAnswer):GradeResult;local(question:Question,answer:GeneratedAnswer):GradeResult|undefined};
}
type LocalRegrade={operationId:string;batchId:string;items:{runId:string;itemId:string;revision:number}[];startedAt:string;finishedAt?:string};
const isLocalDeadline=(error:TechnicalError)=>error.phase==='grader'&&error.code==='CONTEST_WALL_LIMIT';
export interface EvaluationQueue {rejudge(batchId:string,operationId:string):Promise<void>;attachImported(batch:BatchView,runId:string,operationId:string):Promise<void>;saveEstimate(batchId:string,estimate:EstimateSnapshot):Promise<void>;enqueue(request:EvaluationRequest):Promise<BatchView>;pause(batchId:string):Promise<void>;resume(batchId:string,judge?:JudgeSnapshot,policy?:'output-idle-v1'):Promise<void>;snapshot():QueueView;idle():Promise<void>;dispose():Promise<void>}
const failure=(code:string,phase:TechnicalError['phase']='storage',retryable=false):TechnicalError=>({code,phase,retryable,message:phase==='storage'?'本地记录无法完成保存，已停止派发。':'本轮评测需要处理后继续。'});
const fail=(code:string):never=>{throw Object.assign(new Error(code),{code});};
export interface RunSettlement {runId:string;batchId:string;memberRunIds:string[];reason:'drained'|'paused'|'technical-error';pendingItems:NonNullable<BatchView['pendingItems']>}
export interface QueueTimingObserver {onTimingStart?:(runId:string,sampleId:string)=>Promise<void>;onTimingSample?:(runId:string,sample:PerformanceSample)=>Promise<void>;onTimingRunEnd?:(runId:string)=>Promise<void>;onTimingRunSettled?:(context:RunSettlement)=>Promise<void>}
const settlementReason=(batch:BatchView,aborted:boolean,threw:boolean):RunSettlement['reason']=>threw||batch.lastError&&batch.lastError.code!=='ABORTED'?'technical-error':aborted?'paused':'drained';
export function createQueue(store:HistoryStore,adapter:HostAdapter,registry:ProtocolRegistry,graders:GradeServices,options:QueueTimingObserver&{clock?:RetryClock;prepareRegrade?:(protocol:ResolvedProtocolSet)=>Promise<void>;onChange?:(runId:string)=>void;calibration?:{signal:AbortSignal;reserve:()=>boolean;canDispatch?:()=>boolean;recordUsage:(usage:GeneratedAnswer['observations']['usage'])=>void}}={}):EvaluationQueue {
  const batches=new Map<string,BatchView>(),recoveryIssues:NonNullable<QueueView['recoveryIssues']>=[];let active:string|undefined,controller:AbortController|undefined,running:Promise<void>=Promise.resolve(),disposed=false,admitting=false,gradingTail:Promise<unknown>=Promise.resolve();
  const attaching=new Map<string,{identity:string;promise:Promise<void>}>();
  const metadata=join(store.root,'history','maintenance');
  const operationPath=(id:string)=>join(metadata,'local-regrade-'+id+'.json');
  const isSavedWall=(item:ItemRecord)=>item.question?.datasetId==='code-contests-selected'&&item.answer?.complete&&!item.answer.truncated&&item.grade?.kind==='technical-missing'&&isLocalDeadline(item.grade.error);
  async function verifyImported(tx:HistoryTransaction,operationId:string,runId:string){
    const {manifest}=await tx.getRun(runId);
    return manifest.reuseOrigin?.edition?verifyReadyEditionReuse(tx,store.rootId,operationId,runId,await registry.resolve(manifest.protocols)):verifyReadyReuse(tx,store.rootId,operationId,runId);
  }
  let admissionDone:Promise<void>=Promise.resolve();
  function reserveAdmission():()=>void{
    if(disposed)fail('QUEUE_DISPOSED');if(active||admitting)fail('QUEUE_BUSY');
    admitting=true;let release!:()=>void;admissionDone=new Promise<void>(resolve=>release=resolve);
    return ()=>{admitting=false;release();};
  }
  const ready=(async()=>{
    for(const file of await readdir(metadata))if(/^batch-[a-f0-9-]{36}\.json$/.test(file)){
      try{const batch=await readRecord<BatchView>(join(metadata,file));if(!Array.isArray(batch.runIds))continue;batch.status=batch.status==='running'?'paused':batch.status;batches.set(batch.batchId,batch);}catch{/* service diagnostics expose invalid metadata; no automatic calls */}
    }
    if(store.writable)for(const batch of batches.values())try{await store.exclusive(tx=>reconcileExecution(batch,tx));}catch{for(const runId of batch.runIds)recoveryIssues.push({runId,code:'EXECUTION_RECONCILIATION_FAILED'});}
    if(store.writable)for(const run of await store.listSummaries())if(run.details==='available')try{await refresh(run.runId);}catch{recoveryIssues.push({runId:run.runId,code:'SUMMARY_REBUILD_FAILED'});}
    if(store.writable)for(const batch of batches.values())try{
      const selected=batch.pendingItems?.filter(p=>!isLocalDeadline(p.error))??[];
      for(const runId of batch.runIds){
        const {summary}=await store.getRun(runId);
        if(!usesContestWallSafety(generalSchemaFor(summary.protocols))||summary.details!=='available'||!summary.resumeAllowed)continue;
        for(const item of await store.listItems(runId))if(isSavedWall(item)&&item.grade?.kind==='technical-missing')selected.push({runId,itemId:item.itemId,error:item.grade.error});
      }
      if(identityHash(selected)!==identityHash(batch.pendingItems??[])){
        batch.pendingItems=selected;
        await persist(batch);
      }
    }catch{for(const runId of batch.runIds)recoveryIssues.push({runId,code:'LOCAL_REGRADE_RECOVERY_FAILED'});}
    // A crash after the import commit but before attach leaves a recoverable paused batch, never an automatic call.
    if(store.writable)for(const file of await readdir(metadata))if(/^(?:reuse|edition-reuse)-[a-f0-9-]{36}\.json$/.test(file)){
      let runId:string|undefined;
      try{const operation=await readRecord<import('../contracts.ts').ReuseImportOperation>(join(metadata,file));runId=operation.destinationRunId;if(operation.state!=='ready')continue;
        await store.exclusive(async tx=>{const {manifest,summary}=await tx.getRun(operation.destinationRunId);if(summary.details!=='available')return;await verifyImported(tx,operation.operationId,manifest.runId);
          const existing=batches.get(manifest.batchId);if(existing){if(existing.runIds.length!==1||existing.runIds[0]!==manifest.runId)fail('REUSE_IMPORT_MISMATCH');return;}
          if(!manifest.execution)fail('REUSE_EXECUTION_MISSING');const batch:BatchView={batchId:manifest.batchId,runIds:[manifest.runId],createdAt:manifest.createdAt,execution:manifest.execution!,status:summary.tracks.general?.status==='completed'?'completed':'paused'};
          await writeRecord(join(tx.maintenanceDirectory,`batch-${batch.batchId}.json`),batch);batches.set(batch.batchId,batch);
        });
      }catch{if(runId)recoveryIssues.push({runId,code:'REUSE_IMPORT_NOT_READY'});}
    }
  })();
  async function persist(batch:BatchView):Promise<void>{await store.exclusive(async tx=>{await writeRecord(join(tx.maintenanceDirectory,`batch-${batch.batchId}.json`),batch);});}
  async function reconcileExecution(batch:BatchView,tx:HistoryTransaction):Promise<void>{
    if(!batch.executionChanges?.length)return;
    for(const id of batch.runIds){const {summary,manifest}=await tx.getRun(id),saved=summary.executionChanges??[],changes=batch.executionChanges;
      let previous=manifest.execution??changes[0]!.before;for(const change of changes){if(change.reason!=='output-idle-upgrade-v1'||!Number.isFinite(Date.parse(change.at))||identityHash(change.before)!==identityHash(previous)||change.after.failurePolicy!=='output-idle-v1'||change.before.concurrency!==change.after.concurrency||change.before.callTimeoutMs!==change.after.callTimeoutMs)fail('EXECUTION_JOURNAL_INVALID');previous=change.after;}
      if(identityHash(previous)!==identityHash(batch.execution)||saved.length>changes.length||identityHash(saved)!==identityHash(changes.slice(0,saved.length)))fail('EXECUTION_JOURNAL_INVALID');
      if(saved.length<changes.length)await tx.updateSummary(id,summary.revision,next=>{next.executionChanges=structuredClone(changes);});
    }
  }
  async function resolvedRun(manifest:import('../history/store.ts').RunManifest,summary:RunSummary,transaction?:HistoryTransaction,localGeneralRegrade=false):Promise<ResolvedProtocolSet>{
    if(manifest.reuseOrigin){if(transaction)await verifyImported(transaction,manifest.reuseOrigin.operationId,manifest.runId);else await store.exclusive(tx=>verifyImported(tx,manifest.reuseOrigin!.operationId,manifest.runId));}
    const protocol=await registry.resolve(manifest.protocols);
    const missingArchivedWriting=localGeneralRegrade&&protocol.writingId===LEGACY_WRITING_ID&&summary.tracks.general&&summary.tracks.writing&&protocol.items.filter(q=>q.track==='writing').length!==summary.tracks.writing.required;
    const tracks=missingArchivedWriting?['general']:Object.keys(summary.tracks);
    if(protocol.generalId!==manifest.protocols.generalId||protocol.writingId!==manifest.protocols.writingId||protocol.resourceVersion!==manifest.protocols.resourceVersion)fail('PROTOCOL_CHANGED');
    if(tracks.some(t=>t!=='general'&&t!=='writing'))fail('PROTOCOL_ITEMS_CHANGED');
    const expected=protocol.items.filter(q=>tracks.includes(q.track)).map(({id,track,datasetId})=>({id,track,datasetId}));
    const ordered=(items:typeof expected)=>[...items].sort((a,b)=>a.id.localeCompare(b.id));
    const required=missingArchivedWriting?manifest.requiredItems.filter(q=>q.track==='general'):manifest.requiredItems;
    if(identityHash(ordered(expected))!==identityHash(ordered(required))||tracks.some(t=>summary.tracks[t as Track]!.required!==expected.filter(q=>q.track===t).length))fail('PROTOCOL_ITEMS_CHANGED');
    if(tracks.includes('general')){
      validateGeneralDefinition(protocol.descriptor.general,expected);
      if(manifest.generalDefinition){validateGeneralDefinition(manifest.generalDefinition,expected);if(identityHash(manifest.generalDefinition)!==identityHash(protocol.descriptor.general))fail('PROTOCOL_DEFINITION_CHANGED');}
      else if(protocol.descriptor.general.tier!=='legacy')fail('GENERAL_DEFINITION_MISSING');
    }
    const order=buildExecutionOrder(protocol,tracks as Track[]);
    if(order){
      if(!manifest.executionOrder)return fail('INVALID_EXECUTION_ORDER');
      if(missingArchivedWriting)validateGeneralOrderPrefix(manifest.executionOrder,manifest.requiredItems,order);
      else validateExecutionOrder(manifest.executionOrder,manifest.requiredItems,order);
    }else if(manifest.executionOrder)return fail('INVALID_EXECUTION_ORDER');
    return protocol;
  }
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
      if(options.calibration&&!options.calibration.reserve())return {ok:false,error:failure('CALIBRATION_BUDGET_REACHED','config')};
      let item=await store.getItem(runId,q.id);const attempt:AttemptRecord={attemptId:randomUUID(),phase,itemId:q.id,track:q.track,retryIndex,performanceKey:{conditionKey:performanceConditionKey(manifest.target,manifest.protocols,batch.execution,phase==='judge'?batch.judge:undefined),datasetId:q.datasetId,phase},status:'started',startedAt:new Date().toISOString(),...(phase==='judge'&&batch.judge?{judge:structuredClone(batch.judge)}:{})};
      const {grading:excluded,...question}=q;
      const state:ItemInput={itemId:q.id,question:item?.question??question,attempts:[...(item?.attempts??[]),attempt],...(item?.answer?{answer:item.answer}:{}),...(item?.grade?{grade:item.grade}:{})};
      await store.saveItem(runId,item?.revision??0,state);await refresh(runId);await options.onTimingStart?.(runId,attempt.attemptId);
      const child=new AbortController(),abort=()=>child.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
      let timedOut=false;const watchdog=createCallWatchdog(batch.execution.callTimeoutMs,batch.execution.failurePolicy,()=>{timedOut=true;child.abort();});
      const generatedStart=performance.now();let answer:GeneratedAnswer;
      try{if(child.signal.aborted||options.calibration?.canDispatch&&!options.calibration.canDispatch())throw Object.assign(Error('CALIBRATION_BUDGET_REACHED'),{code:'CALIBRATION_BUDGET_REACHED'});answer=await adapter.generateOnce({target,messages,signal:child.signal,onActivity:watchdog.activity,context:{attemptId:attempt.attemptId,itemId:q.id,track:q.track,phase}});}
      catch(thrown){const code=typeof (thrown as {code?:unknown})?.code==='string'?(thrown as {code:string}).code:'CALL_FAILED';const configuration=/AUTH|CONFIG|TARGET|UNSUPPORTED|REASONING|PARAMETER/.test(code);
        answer={text:'',complete:false,truncated:false,observations:{attemptId:attempt.attemptId,itemId:q.id,track:q.track,phase,startedAt:attempt.startedAt,endedAt:new Date().toISOString(),usage:{available:false}},error:failure(configuration?code:'CALL_FAILED',configuration?'config':phase,!configuration)};
      }finally{watchdog.dispose();signal.removeEventListener('abort',abort);}
      if(signal.aborted||!(batch.execution.failurePolicy&&isFatalCallError(answer.error))&&(timedOut||batch.execution.failurePolicy&&isTimeoutFailure(answer.error)&&hasObservedOutput(answer.observations,answer.text))){answer.complete=false;answer.error=timeoutFailure({policy:batch.execution.failurePolicy,phase,observation:answer.observations,text:answer.text,parentAborted:signal.aborted});}
      attempt.status=answer.complete?'completed':signal.aborted?'interrupted':'failed';attempt.endedAt=answer.observations.endedAt;attempt.observations=answer.observations;if(answer.error)attempt.error=answer.error;
      options.calibration?.recordUsage(answer.observations.usage);attempt.performance=normalizeObservation({...attempt.performanceKey!,sampleId:attempt.attemptId,itemId:q.id,startedAt:answer.observations.startedAt,endedAt:answer.observations.endedAt,durationMs:answer.observations.timing?.totalMs??(performance.now()-generatedStart),outcome:answer.complete?'completed':timedOut||isTimeoutFailure(answer.error)?'timeout':signal.aborted?'cancelled':'failed',truncated:answer.truncated,automaticRetry:!answer.complete&&!!answer.error?.retryable&&retryIndex<2&&!signal.aborted,...(answer.observations.timing?{timing:answer.observations.timing}:{}),usage:answer.observations.usage});
      if(phase==='judge')attempt.rawText=answer.text;
      item=await store.getItem(runId,q.id);state.attempts=[...(item?.attempts??[]).filter(x=>x.attemptId!==attempt.attemptId),attempt];
      if(phase==='answer')state.answer=answer;
      if(phase==='judge'&&answer.complete){const grade=graders.writing!.parse(q,answer,batch.judge!,state.answer!);state.grade=grade;
        if(grade.kind==='technical-missing'){attempt.validationError=grade.error;if(attempt.performance)attempt.performance.outcome='failed';await store.saveItem(runId,item?.revision??0,state);await options.onTimingSample?.(runId,attempt.performance!);await refresh(runId);return {ok:false,error:grade.error};}}
      await store.saveItem(runId,item?.revision??0,state);await options.onTimingSample?.(runId,attempt.performance);await refresh(runId);
      return answer.complete?{ok:true,value:answer}:{ok:false,error:answer.error??failure('ANSWER_INCOMPLETE',phase,true)};
    },signal,options.clock);
    if(!outcome.ok){await deferOrStop(batch,runId,q.id,outcome.error,signal);return undefined;}return outcome.value;
  }
  async function deferOrStop(batch:BatchView,runId:string,itemId:string,error:TechnicalError,signal:AbortSignal):Promise<void>{
    if(signal.aborted)return;
    if(isDeferredTimeout(batch.execution.failurePolicy,error)||isLocalDeadline(error)){
      const pending=batch.pendingItems??=[];
      const index=pending.findIndex(item=>item.runId===runId&&item.itemId===itemId);
      const next={runId,itemId,error};
      if(index<0)pending.push(next);else pending[index]=next;
      await persist(batch);return;
    }
    batch.lastError??=error;controller?.abort();
  }
  function resetPending(batch:BatchView):void{if(batch.pendingItems)batch.pendingItems=batch.pendingItems.filter(p=>isLocalDeadline(p.error));}
  function rememberFailure(batch:BatchView,error:unknown):void{
    const code=(error as {code?:string;message?:string})?.code??(error as Error)?.message;
    batch.lastError??=failure(/^[A-Z][A-Z0-9_]{1,70}$/.test(code??'')?code!:'QUEUE_STOPPED');
  }
  async function processItem(runId:string,q:Question,batch:BatchView,signal:AbortSignal,protocol:ResolvedProtocolSet,regrade?:LocalRegrade['items'][number]):Promise<void> {
    let item=await store.getItem(runId,q.id);if(item?.grade?.kind==='scored')return;
    if(regrade&&(!item||item.revision!==regrade.revision||!isSavedWall(item)||protocol.contestPolicy!=='wall-safety-v1'))fail('LOCAL_REGRADE_INPUT_CHANGED');
    if(q.datasetId==='bfcl-v4-multi-turn-selected'){
      if(!graders.tools){batch.lastError??=failure('TOOLS_NOT_SUPPORTED','config');controller?.abort();return;}
      const {manifest}=await store.getRun(runId),{grading:privateGrading,...publicQuestion}=q;
      let localGradingMs=0;const toolTimingKnown=!item?.toolActiveMs||item.toolTaskTimingVersion===1;const toolStarted=performance.now(),toolStage={conditionKey:performanceConditionKey(manifest.target,manifest.protocols,batch.execution),datasetId:q.datasetId,phase:'tool-scenario' as const,sampleId:randomUUID(),itemId:q.id,startedAt:new Date().toISOString()};
      await store.saveItem(runId,item?.revision??0,{...item,itemId:q.id,question:item?.question??publicQuestion,attempts:item?.attempts??[],toolActiveStage:toolStage});await options.onTimingStart?.(runId,toolStage.sampleId);
      let grade=await graders.tools(q,{onLocalGradingTime:ms=>{localGradingMs+=ms;},target:manifest.target,scenarioId:q.sourceId,signal,...(item?.toolCheckpoint?{checkpoint:item.toolCheckpoint}:{}),
        ...(options.calibration?{dispatchAllowed:options.calibration.reserve,...(options.calibration.canDispatch?{dispatchReady:options.calibration.canDispatch}:{})}:{}),
        async commit(checkpoint){try{const current=await store.getItem(runId,q.id);await store.saveItem(runId,current?.revision??0,{...current,itemId:q.id,question:current?.question??publicQuestion,attempts:current?.attempts??[],toolCheckpoint:checkpoint});await refresh(runId);}catch(error){rememberFailure(batch,error);throw error;}},
        async onAttempt(observation,error){try{const current=await store.getItem(runId,q.id),previous=current?.attempts.find(a=>a.attemptId===observation.attemptId),key={conditionKey:performanceConditionKey(manifest.target,manifest.protocols,batch.execution),datasetId:q.datasetId+':turn',phase:'answer' as const};
          const attempt:AttemptRecord=previous?structuredClone(previous):{attemptId:observation.attemptId,itemId:q.id,track:'general',phase:'answer',status:'started',startedAt:observation.startedAt,performanceKey:key};
          if(observation.endedAt){options.calibration?.recordUsage(observation.usage);attempt.status=error?signal.aborted?'interrupted':'failed':'completed';attempt.endedAt=observation.endedAt;attempt.observations=observation;if(error)attempt.error=error;
            attempt.performance=normalizeObservation({...key,sampleId:attempt.attemptId,itemId:q.id,startedAt:observation.startedAt,endedAt:observation.endedAt,durationMs:observation.timing?.totalMs??Math.max(0,Date.parse(observation.endedAt)-Date.parse(observation.startedAt)),outcome:error?signal.aborted?'cancelled':isTimeoutFailure(error)?'timeout':'failed':'completed',...(error&&isDeferredTimeout(batch.execution.failurePolicy,error)?{automaticRetry:false}:{}),...(observation.timing?{timing:observation.timing}:{}),usage:observation.usage});}
          await store.saveItem(runId,current?.revision??0,{...current,itemId:q.id,question:current?.question??publicQuestion,attempts:[...(current?.attempts??[]).filter(a=>a.attemptId!==attempt.attemptId),attempt]});if(observation.endedAt)await options.onTimingSample?.(runId,attempt.performance!);else await options.onTimingStart?.(runId,attempt.attemptId);await refresh(runId);
          }catch(error){rememberFailure(batch,error);throw error;}
        }},protocol,batch.execution);
      item=await store.getItem(runId,q.id);
      if(item){const completed=item.attempts.filter(a=>a.status==='completed'&&a.observations).sort((a,b)=>(b.endedAt??'').localeCompare(a.endedAt??''));const last=(item.toolCheckpoint?.lastCompletedAttemptId?completed.find(a=>a.attemptId===item!.toolCheckpoint!.lastCompletedAttemptId):completed[0])?.observations;const answer:GeneratedAnswer|undefined=item.toolCheckpoint?.stage==='done'&&last?{text:JSON.stringify(item.toolCheckpoint.messages),complete:true,truncated:false,observations:last}:undefined;
        if(grade.kind==='scored'&&!answer&&!item.answer)grade={kind:'technical-missing',track:'general',itemId:q.id,error:failure('TOOL_OBSERVATION_MISSING','storage'),evidence:null};
        const {toolActiveStage:finishedToolStage,...rest}=item,activeMs=(item.toolActiveMs??0)+performance.now()-toolStarted;
        const toolObservation:PerformanceSample={...toolStage,endedAt:new Date().toISOString(),durationMs:activeMs,outcome:grade.kind==='scored'?'completed':signal.aborted?'cancelled':isTimeoutFailure(grade.error)?'timeout':'failed',automaticRetry:false};
        await store.saveItem(runId,item.revision,{...rest,grade,toolActiveMs:activeMs,...(toolTimingKnown?{toolTaskTimingVersion:1 as const,toolLocalGradingMs:(item.toolLocalGradingMs??0)+localGradingMs}:{}),...(!item.toolTimingIncomplete?{toolObservation}:{}),...(answer&&!item.answer?{answer}:{})});if(!item.toolTimingIncomplete)await options.onTimingSample?.(runId,{...toolObservation,durationMs:activeMs-(item.toolActiveMs??0)});}
      if(grade.kind==='technical-missing')await deferOrStop(batch,runId,q.id,grade.error,signal);await refresh(runId);return;
    }
    const answer=regrade?item!.answer:item?.answer?.complete?item.answer:await call(runId,q,'answer',buildPrompt(q),signal,batch);if(!answer||signal.aborted)return;
    let grade:GradeResult|undefined,gradingObservation:PerformanceSample|undefined;
    if(q.track==='writing'){
      if(!graders.writing){batch.lastError??=failure('WRITING_GRADER_UNAVAILABLE','config');controller?.abort();return;}
      grade=graders.writing.local(q,answer);
      if(!grade){await call(runId,q,'judge',graders.writing.build(q,answer),signal,batch);if(!signal.aborted)await refresh(runId);return;}
    }else {
      const queued=performance.now();const work=gradingTail.then(async()=>{const start=performance.now(),startedAt=new Date().toISOString(),current=await store.getItem(runId,q.id),manifest=(await store.getRun(runId)).manifest;await store.saveItem(runId,current!.revision,{...current!,gradingActive:{conditionKey:performanceConditionKey(manifest.target,manifest.protocols,batch.execution),datasetId:q.datasetId,phase:'local-grade',sampleId:randomUUID(),itemId:q.id,startedAt}});await refresh(runId);const gradingId=(await store.getItem(runId,q.id))!.gradingActive!.sampleId;await options.onTimingStart?.(runId,gradingId);const grade=await graders.general(q,answer,signal,protocol);return {grade,gradingId,elapsed:performance.now()-start,queueWaitMs:start-queued,startedAt,endedAt:new Date().toISOString()};});gradingTail=work.catch(()=>{});const result=await work;grade=result.grade;const {manifest}=await store.getRun(runId);gradingObservation={conditionKey:performanceConditionKey(manifest.target,manifest.protocols,batch.execution),datasetId:q.datasetId,phase:'local-grade',sampleId:result.gradingId,itemId:q.id,startedAt:result.startedAt,endedAt:result.endedAt,durationMs:result.elapsed,queueWaitMs:result.queueWaitMs,outcome:grade.kind==='scored'?'completed':signal.aborted?'cancelled':'failed'};
      await store.exclusive(async tx=>{const {summary}=await tx.getRun(runId);await tx.updateSummary(runId,summary.revision,next=>{const value=next.metrics.tracks[q.track];if(value)value.gradingMs+=result.elapsed;});});
    }
    item=await store.getItem(runId,q.id);const {gradingActive:finishedStage,...savedItem}=item!;const savedWall=isSavedWall(item!);
    const savedGrade=savedWall&&grade.kind==='technical-missing'&&!isLocalDeadline(grade.error)?savedItem.grade!:grade;
    await store.saveItem(runId,item!.revision,{...savedItem,grade:savedGrade,...(gradingObservation?{gradingObservation}:{})});
    if(grade.kind==='scored'&&batch.pendingItems)batch.pendingItems=batch.pendingItems.filter(p=>p.runId!==runId||p.itemId!==q.id);
    if(gradingObservation)await options.onTimingSample?.(runId,gradingObservation);
    if(grade.kind==='technical-missing'&&protocol.contestPolicy==='wall-safety-v1'&&q.datasetId==='code-contests-selected'&&answer.complete&&!answer.truncated&&isLocalDeadline(grade.error))await deferOrStop(batch,runId,q.id,grade.error,signal);
    else if(grade.kind==='technical-missing'&&(!savedWall||!signal.aborted)){batch.lastError??=grade.error;controller?.abort();}
    await refresh(runId);
  }
  async function execute(batch:BatchView,local?:LocalRegrade):Promise<void> {
    const signal=controller!.signal;batch.status='running';delete batch.lastError;if(!local)resetPending(batch);const budgetAbort=()=>{batch.lastError??=failure('CALIBRATION_BUDGET_REACHED','config');controller?.abort();};options.calibration?.signal.addEventListener('abort',budgetAbort,{once:true});if(options.calibration?.signal.aborted)budgetAbort();
    try {
      await persist(batch);
      for(const runId of batch.runIds){if(signal.aborted)break;const selected=local?.items.filter(x=>x.runId===runId);if(selected?.length===0)continue;const {summary,manifest}=await store.getRun(runId);
        if(!summary.resumeAllowed||summary.details!=='available')fail('RUN_CANNOT_RESUME');
        if(Object.values(summary.tracks).every(x=>x.status==='completed'))continue;
        const protocol=await resolvedRun(manifest,summary,undefined,!!local);
        const byId=new Map(protocol.items.map(q=>[q.id,q]));
        const dispatch=manifest.executionOrder?.itemIds.filter(id=>!selected||selected.some(entry=>entry.itemId===id))
          .map(id=>byId.get(id)??fail('PROTOCOL_ITEMS_CHANGED'))??protocol.items;
        await trackState(runId,'running',true);let runThrew=false;
        try {
          // General completion is committed before beginning the independent writing track.
          for(const track of ['general','writing'] as const){if(summary.tracks[track]?.status==='completed')continue;const required=new Set(manifest.requiredItems.filter(x=>x.track===track).map(x=>x.id)),questions=dispatch.filter(x=>required.has(x.id)&&(!selected||selected.some(entry=>entry.itemId===x.id)));let index=0;
            const workers=await Promise.allSettled(Array.from({length:batch.execution.concurrency},async()=>{try{while(!signal.aborted){const q=questions[index++];if(!q)break;await processItem(runId,q,batch,signal,protocol,selected?.find(entry=>entry.itemId===q.id));}}catch(error){rememberFailure(batch,error);controller?.abort();throw error;}}));
            const rejected=workers.find(x=>x.status==='rejected');if(rejected?.status==='rejected')throw rejected.reason;if(signal.aborted)break;
          }
        }catch(error){runThrew=true;throw error;}
        finally{await trackState(runId,batch.lastError||batch.pendingItems?.some(x=>x.runId===runId)?'pending':'paused',false,true);await refresh(runId);await options.onTimingRunEnd?.(runId);
          if(!local)await options.onTimingRunSettled?.({runId,batchId:batch.batchId,memberRunIds:[...batch.runIds],reason:settlementReason(batch,signal.aborted,runThrew),pendingItems:structuredClone(batch.pendingItems?.filter(p=>p.runId===runId)??[])});
        }
      }
      const summaries=await Promise.all(batch.runIds.map(id=>store.getRun(id)));
      if(!batch.lastError&&batch.pendingItems?.length&&!signal.aborted)batch.lastError=batch.pendingItems[0]!.error;
      batch.status=summaries.every(x=>Object.values(x.summary.tracks).every(t=>t.status==='completed'))?'completed':batch.lastError?'pending':'paused';
    }catch(error){batch.status='pending';rememberFailure(batch,error);controller?.abort();}
    finally{options.calibration?.signal.removeEventListener('abort',budgetAbort);try{await persist(batch).catch(error=>{rememberFailure(batch,error);});if(local)await writeRecord(operationPath(local.operationId),{...local,finishedAt:new Date().toISOString()}).catch(error=>{rememberFailure(batch,error);});}finally{active=undefined;}}
  }
  function start(batch:BatchView,local?:LocalRegrade):void{if(disposed)fail('QUEUE_DISPOSED');if(active)fail('QUEUE_BUSY');active=batch.batchId;controller=new AbortController();running=execute(batch,local);}
  const queue:EvaluationQueue={async saveEstimate(id,estimate){const batch=batches.get(id);if(!batch)return;batch.estimate=structuredClone(estimate);await persist(batch);},snapshot(){return {batches:structuredClone([...batches.values()]),recoveryIssues:structuredClone(recoveryIssues),...(active?{activeBatchId:active}:{})};},async idle(){await ready;await admissionDone;await running;},
    async attachImported(batch,runId,operationId){
      const identity=identityHash({batch,runId,operationId}),pending=attaching.get(operationId);if(pending){if(pending.identity!==identity)fail('REUSE_IMPORT_MISMATCH');return pending.promise;}
      const promise=(async()=>{
      await ready;if(disposed)fail('QUEUE_DISPOSED');if(!store.writable)fail('HISTORY_READ_ONLY');
      async function validate(tx:HistoryTransaction){
        const operation=await verifyImported(tx,operationId,runId),{manifest,summary}=await tx.getRun(runId);
        if(batch.batchId!==operation.destinationBatchId||batch.runIds.length!==1||batch.runIds[0]!==runId||batch.createdAt!==manifest.createdAt||identityHash(batch.execution)!==identityHash(manifest.execution)||batch.judge||manifest.requiredItems.some(q=>q.track!=='general'))fail('REUSE_IMPORT_MISMATCH');
        await resolvedRun(manifest,summary,tx);if(disposed)fail('QUEUE_DISPOSED');return {manifest,summary};
      }
      const existing=batches.get(batch.batchId);
      if(existing){await store.exclusive(async tx=>{await validate(tx);if(identityHash(existing.runIds)!==identityHash(batch.runIds)||identityHash(existing.execution)!==identityHash(batch.execution))fail('REUSE_IMPORT_MISMATCH');});return;}
      const release=reserveAdmission();try{await store.exclusive(async tx=>{await validate(tx);const admitted:BatchView={batchId:batch.batchId,runIds:[runId],createdAt:batch.createdAt,execution:structuredClone(batch.execution),status:'queued'};await writeRecord(join(tx.maintenanceDirectory,`batch-${admitted.batchId}.json`),admitted);batches.set(admitted.batchId,admitted);start(admitted);});}finally{release();}
      })().finally(()=>attaching.delete(operationId));attaching.set(operationId,{identity,promise});return promise;
    },
    async enqueue(request){await ready;if(disposed)fail('QUEUE_DISPOSED');if(active||admitting)fail('QUEUE_BUSY');if(!store.writable)fail('HISTORY_READ_ONLY');
      assertFailurePolicy(request.execution.failurePolicy);
      if(!request.targets.length||!request.tracks.length||new Set(request.tracks).size!==request.tracks.length||request.tracks.some(x=>!['general','writing'].includes(x)))fail('INVALID_BATCH');
      if(![1,2,3,4].includes(request.execution.concurrency)||!Number.isInteger(request.execution.callTimeoutMs)||request.execution.callTimeoutMs<1000||request.execution.callTimeoutMs>1800000)fail('INVALID_EXECUTION');
      const ids=request.targets.map(fingerprintTarget);if(new Set(ids).size!==ids.length)fail('DUPLICATE_TARGET');if(request.tracks.includes('writing')&&!request.judge)fail('JUDGE_REQUIRED');if(request.judge)fingerprintTarget(request.judge.target);
      const release=reserveAdmission();try{
        const generalId=request.generalId??registry.list().find(d=>d.general.tier==='legacy')?.refs.generalId;if(!generalId)fail('PROTOCOL_UNAVAILABLE');
        const protocols=await registry.forNewRun(generalId!,request.tracks);validateGeneralDefinition(protocols.descriptor.general,protocols.items);
        if(disposed)fail('QUEUE_DISPOSED');
        const batch:BatchView={batchId:randomUUID(),runIds:[],createdAt:new Date().toISOString(),status:'queued',execution:structuredClone(request.execution),...(request.judge?{judge:structuredClone(request.judge)}:{})};
        const executionOrder=buildExecutionOrder(protocols,request.tracks);
        for(const target of request.targets){const run=await store.createRun({...(executionOrder?{executionOrder}:{}),batchId:batch.batchId,target,protocols:{generalId:protocols.generalId,writingId:protocols.writingId,resourceVersion:protocols.resourceVersion},requiredItems:protocols.items.filter(x=>request.tracks.includes(x.track)).map(x=>({id:x.id,track:x.track,datasetId:x.datasetId})),...(request.tracks.includes('general')?{generalDefinition:protocols.descriptor.general}:{}),execution:request.execution,...(request.initialEstimates?.[fingerprintTarget(target)]?{initialEstimation:request.initialEstimates[fingerprintTarget(target)]!}:{}),...(request.judge?{judge:request.judge}:{})});batch.runIds.push(run.runId);}
        batches.set(batch.batchId,batch);await persist(batch);await store.exclusive(async()=>{start(batch);});return structuredClone(batch);
      }finally{release();}
    },
    async pause(id){await ready;if(active!==id)fail('BATCH_NOT_ACTIVE');controller?.abort();await running;},
    async resume(id,judge,policy){await ready;if(disposed)fail('QUEUE_DISPOSED');if(active||admitting)fail('QUEUE_BUSY');let batch=batches.get(id);if(!batch)return fail('BATCH_NOT_FOUND');
      const release=reserveAdmission();try{await store.exclusive(async tx=>{if(active)fail('QUEUE_BUSY');if(disposed)fail('QUEUE_DISPOSED');for(const id of batch!.runIds){const {summary,manifest}=await tx.getRun(id);if(!summary.resumeAllowed||summary.details!=='available')fail('RUN_CANNOT_RESUME');await resolvedRun(manifest,summary,tx);if(disposed)fail('QUEUE_DISPOSED');}
        if(judge){fingerprintTarget(judge.target);if(batch!.judge&&(judge.rubricId!==batch!.judge.rubricId||judge.promptId!==batch!.judge.promptId))fail('JUDGE_PROTOCOL_CHANGED');}
        const next=structuredClone(batch!);if(judge)next.judge=structuredClone(judge);
        if(policy&&next.execution.failurePolicy!==policy){const before=structuredClone(next.execution);next.execution={...before,failurePolicy:policy};(next.executionChanges??=[]).push({at:new Date().toISOString(),before,after:structuredClone(next.execution),reason:'output-idle-upgrade-v1'});}
        await writeRecord(join(tx.maintenanceDirectory,`batch-${next.batchId}.json`),next);batches.set(id,next);batch=next;
        await reconcileExecution(next,tx);start(next);});}finally{release();}},
    async rejudge(id,operationId){
      await ready;
      if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(operationId)||!store.writable)fail('LOCAL_REGRADE_INVALID_REQUEST');
      const loadOperation=async()=>{
        try{return await readRecord<LocalRegrade>(operationPath(operationId));}
        catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
      };
      const existing=await loadOperation();
      if(existing){if(existing.batchId!==id||existing.operationId!==operationId)fail('LOCAL_REGRADE_OPERATION_MISMATCH');return;}
      const release=reserveAdmission();
      try{
        const committed=await loadOperation();
        if(committed){if(committed.batchId!==id||committed.operationId!==operationId)fail('LOCAL_REGRADE_OPERATION_MISMATCH');return;}
        const batch=batches.get(id);if(!batch)return fail('BATCH_NOT_FOUND');
        const items:LocalRegrade['items']=[];
        const pendingProtocols=new Map<string,ResolvedProtocolSet>();
        for(const runId of batch.runIds){
          const {manifest,summary}=await store.getRun(runId);
          if(!usesContestWallSafety(generalSchemaFor(manifest.protocols))||!summary.resumeAllowed||summary.details!=='available')continue;
          const protocol=await resolvedRun(manifest,summary,undefined,true);
          if(protocol.contestPolicy!=='wall-safety-v1')fail('LOCAL_REGRADE_POLICY_MISMATCH');
          for(const item of await store.listItems(runId))if(isSavedWall(item)){
            pendingProtocols.set(protocol.generalId,protocol);
            items.push({runId,itemId:item.itemId,revision:item.revision});
          }
        }
        if(!pendingProtocols.size)return fail('LOCAL_REGRADE_NOTHING_PENDING');
        for(const protocol of pendingProtocols.values())await options.prepareRegrade?.(protocol);
        const operation:LocalRegrade={operationId,batchId:id,items,startedAt:new Date().toISOString()};
        if(disposed)fail('QUEUE_DISPOSED');
        await store.exclusive(async()=>{await writeRecord(operationPath(operationId),operation);});
        start(batch,operation);
      }finally{release();}
    },
    async dispose(){disposed=true;controller?.abort();await ready;await admissionDone;controller?.abort();await running;},
  };return queue;
}

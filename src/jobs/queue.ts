import {createProtocolAdmission,type ProtocolAdmission} from '../evaluation/protocol-resolution.ts';
import {generalSchemaFor} from '../evaluation/current-edition.ts';
import {usesContestWallSafety} from '../evaluation/five-schema.ts';
import {performanceConditionKey,normalizeObservation,isTimeoutFailure} from '../estimation/observations.ts';
import type {PerformanceSample,EstimateSnapshot} from '../estimation/contracts.ts';
import {randomUUID} from 'node:crypto';
import {JUDGE_ITEM_PENDING,type ExecutionChange,type UpstreamFailureCause} from '../contracts.ts';
import {hasRepeatedItemJudgeFailure} from './judge-item-policy.ts';
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
import {verifyReadyWritingReplacement} from '../history/writing-replacement.ts';
import {createCallWatchdog} from './call-watchdog.ts';
import {captureUpstreamDiagnostic,upstreamFailureCause} from '../host/upstream-error.ts';
import {assertFailurePolicy,hasObservedOutput,isDeferredTimeout,isFatalCallError,timeoutFailure} from './timeout-policy.ts';
import {summarizeMetrics} from './metrics.ts';
import type {ToolSessionInput} from '../host/tool-session.ts';
export type RunOperation = 'hold' | 'resume' | 'remove' | 'rejoin';
export interface RunControl {
  state: 'held' | 'removed';
  error?: TechnicalError;
  itemId?: string;
}
export interface BatchView {batchId:string;supersedesBatchId?:string;runIds:string[];status:'queued'|'running'|'paused'|'pending'|'completed';createdAt:string;estimate?:EstimateSnapshot;lastError?:TechnicalError;pendingItems?:{runId:string;itemId:string;error:TechnicalError}[];judge?:JudgeSnapshot;execution:EvaluationRequest['execution'];executionChanges?:ExecutionChange[];runControls?:Record<string,RunControl>;activeRunId?:string;settlingRunId?:string;etaSamples?:Record<string,number>}
export interface QueueView {activeBatchId?:string;batches:BatchView[];recoveryIssues?:{runId:string;code:string}[]}
interface ActiveWork {
  runIds: readonly string[];
  deferred: ReadonlyMap<string, ReadonlySet<string>>;
  excludesDeferredWork: boolean;
  sampling?: {ready:number;total:number;answerMs:Readonly<Record<string,number>>};
}
export interface GradeServices {
  general(question:Question,answer:GeneratedAnswer,signal:AbortSignal,protocol:ResolvedProtocolSet):Promise<GradeResult>;
  tools?(question:Question,input:ToolSessionInput,protocol:ResolvedProtocolSet,execution:EvaluationRequest['execution']):Promise<GradeResult>;
  writing?:{acceptsJudge?:(judge:JudgeSnapshot)=>boolean;build(question:Question,answer:GeneratedAnswer):readonly PromptMessage[];parse(question:Question,answer:GeneratedAnswer,judge:JudgeSnapshot,candidate:GeneratedAnswer):GradeResult;local(question:Question,answer:GeneratedAnswer):GradeResult|undefined};
}
type LocalRegrade={operationId:string;batchId:string;items:{runId:string;itemId:string;revision:number}[];startedAt:string;finishedAt?:string};
const isLocalDeadline=(error:TechnicalError)=>error.phase==='grader'&&error.code==='CONTEST_WALL_LIMIT';
export interface EvaluationQueue {controlRun(batchId:string,runId:string,operation:RunOperation,startIfIdle:boolean,prepare?: (runIds:readonly string[],admission:ProtocolAdmission)=>Promise<void>,policy?:'output-idle-v1'):Promise<void>;rejudge(batchId:string,operationId:string):Promise<void>;attachImported(batch:BatchView,runId:string,operationId:string):Promise<void>;saveEstimate(batchId:string,estimate:EstimateSnapshot):Promise<void>;enqueue(request:EvaluationRequest,admission?:ProtocolAdmission):Promise<BatchView>;pause(batchId:string):Promise<void>;resume(batchId:string,judge?:JudgeSnapshot,policy?:'output-idle-v1',admission?:ProtocolAdmission):Promise<void>;snapshot():QueueView;activeWork(batchId:string):ActiveWork|undefined;idle():Promise<void>;dispose():Promise<void>}
const preparationErrorCodes=new Set([
  'TARGET_CHANGED','MODEL_NOT_CONFIGURED','UNSUPPORTED_PARAMETER','UNKNOWN_PARAMETER_OVERRIDE','INVALID_PARAMETER',
  'UNSUPPORTED_PROMPT_ROLE','AUTH','AUTHENTICATION_ERROR','AUTHENTICATION_FAILED','INVALID_CONFIG',
  'UNSUPPORTED_OPTION','UNSUPPORTED_REASONING_EFFORT','UNSUPPORTED_TOOLS',
]);
const localErrorCodes=new Set([
  'EIO','ENOSPC','EACCES','EPERM','ENOENT','EROFS','EBUSY','EMFILE','ENFILE','EXDEV','ENOTDIR',
  'HISTORY_CLOSED','HISTORY_NEEDS_RECOVERY','HISTORY_PATH_REJECTED','HISTORY_READ_ONLY','REVISION_CONFLICT',
  'ITEM_CORRUPT','RUN_CORRUPT','INVALID_RUN_MANIFEST','IMMUTABLE_ATTEMPT','CHECKPOINT_SAVE_FAILED',
  'INVALID_EXECUTION_ORDER','EXECUTION_JOURNAL_INVALID','PROTOCOL_CHANGED','PROTOCOL_DEFINITION_CHANGED',
  'PROTOCOL_ITEMS_CHANGED','PROTOCOL_UNAVAILABLE','LOCAL_REGRADE_INPUT_CHANGED','JUDGE_PROTOCOL_CHANGED',
]);
const failure=(code:string,phase:TechnicalError['phase']='storage',retryable=false):TechnicalError=>({code,phase,retryable,message:phase==='storage'?'本地记录无法完成保存，已停止派发。':'本轮评测需要处理后继续。'});
const fail=(code:string):never=>{throw Object.assign(new Error(code),{code});};
export interface RunSettlement {runId:string;batchId:string;memberRunIds:string[];reason:'drained'|'paused'|'technical-error';pendingItems:NonNullable<BatchView['pendingItems']>}
export interface QueueTimingObserver {onTimingStart?:(runId:string,sampleId:string)=>Promise<void>;onTimingSample?:(runId:string,sample:PerformanceSample)=>Promise<void>;onTimingRunEnd?:(runId:string)=>Promise<void>;onTimingRunSettled?:(context:RunSettlement)=>Promise<void>}
const completed = (summary:RunSummary):boolean => Object.values(summary.tracks).every(track=>track.status==='completed');
const mayIsolate = (error:TechnicalError):boolean =>
  ['answer','judge','config'].includes(error.phase) && error.code!=='ABORTED' && !error.code.startsWith('CALIBRATION_');
export function dispatchableRunIds(batch:BatchView):string[] {
  return batch.runIds.filter(id=>!batch.runControls?.[id]);
}
export function createQueue(store:HistoryStore,adapter:HostAdapter,registry:ProtocolRegistry,graders:GradeServices,options:QueueTimingObserver&{sampleMultiConfigEta?:boolean;clock?:RetryClock;prepareRegrade?:(protocol:ResolvedProtocolSet)=>Promise<void>;onChange?:(runId:string)=>void;calibration?:{signal:AbortSignal;reserve:()=>boolean;canDispatch?:()=>boolean;recordUsage:(usage:GeneratedAnswer['observations']['usage'])=>void}}={}):EvaluationQueue {
  const batches=new Map<string,BatchView>(),recoveryIssues:NonNullable<QueueView['recoveryIssues']>=[];let active:string|undefined,controller:AbortController|undefined,running:Promise<void>=Promise.resolve(),disposed=false,admitting=false,gradingTail:Promise<unknown>=Promise.resolve();
  let currentRun:{id:string;controller:AbortController}|undefined;
  let dispatched=new Set<string>();
  const deferredThisExecution=new Map<string,Set<string>>();
  let dispatchClosed=false;
  let localRegrading=false;
  const attaching=new Map<string,{identity:string;promise:Promise<void>}>();
  const metadata=join(store.root,'history','maintenance');
  const operationPath=(id:string)=>join(metadata,'local-regrade-'+id+'.json');
  const isSavedWall=(item:ItemRecord)=>item.question?.datasetId==='code-contests-selected'&&item.answer?.complete&&!item.answer.truncated&&item.grade?.kind==='technical-missing'&&isLocalDeadline(item.grade.error);
  async function verifyImported(tx:HistoryTransaction,operationId:string,runId:string,resolver:Pick<ProtocolAdmission,'resolve'>=registry){
    const {manifest}=await tx.getRun(runId);
    if(manifest.reuseOrigin?.writingReplacement)return verifyReadyWritingReplacement(tx,store.rootId,operationId,runId,await resolver.resolve(manifest.protocols));
    return manifest.reuseOrigin?.edition?verifyReadyEditionReuse(tx,store.rootId,operationId,runId,await resolver.resolve(manifest.protocols)):verifyReadyReuse(tx,store.rootId,operationId,runId);
  }
  const legacyFailureCauses=new Map<string,{itemId:string;cause:UpstreamFailureCause}>();
  let admissionDone:Promise<void>=Promise.resolve();
  function reserveAdmission():()=>void{
    if(disposed)fail('QUEUE_DISPOSED');if(active||admitting)fail('QUEUE_BUSY');
    admitting=true;let release!:()=>void;admissionDone=new Promise<void>(resolve=>release=resolve);
    return ()=>{admitting=false;release();};
  }
  const ready=(async()=>{
    for(const file of await readdir(metadata))if(/^batch-[a-f0-9-]{36}\.json$/.test(file)){
      try{const batch=await readRecord<BatchView>(join(metadata,file));if(!Array.isArray(batch.runIds))continue;batch.status=batch.status==='running'?'paused':batch.status;delete batch.activeRunId;delete batch.settlingRunId;batches.set(batch.batchId,batch);}catch{/* service diagnostics expose invalid metadata; no automatic calls */}
    }
    if(store.writable)for(const batch of batches.values())try{await store.exclusive(tx=>reconcileExecution(batch,tx));}catch{for(const runId of batch.runIds)recoveryIssues.push({runId,code:'EXECUTION_RECONCILIATION_FAILED'});}
    if(store.writable)for(const run of await store.listSummaries())if(run.details==='available')try{await refresh(run.runId);}catch{recoveryIssues.push({runId:run.runId,code:'SUMMARY_REBUILD_FAILED'});}
    if(store.writable)for(const batch of batches.values())try{
      const selected=[];
      for(const item of batch.pendingItems??[]){
        if(isLocalDeadline(item.error))continue;
        if(item.error.code===JUDGE_ITEM_PENDING&&
          (await store.getItem(item.runId,item.itemId).catch(()=>undefined))?.grade?.kind==='scored')continue;
        selected.push(item);
      }
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
    for(const batch of batches.values()) {
      try { await attributePreviousError(batch); }
      catch { /* Old records without intact evidence keep their batch-level error. */ }
      await loadLegacyFailureCauses(batch);
    }
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
  // Old batches have no failed run ID. Assign an error only when committed
  // records identify one unfinished configuration; viewing never starts it.
  async function attributePreviousError(batch:BatchView):Promise<void> {
    const error=batch.lastError;
    if(batch.status!=='pending'||batch.runControls||!error||!mayIsolate(error)||batch.pendingItems?.some(item=>item.error.code===error.code))return;
    const matches:{runId:string;itemId:string;at:string}[]=[];
    for(const runId of batch.runIds) {
      const {summary}=await store.getRun(runId);
      if(completed(summary)||summary.details!=='available')continue;
      for(const item of await store.listItems(runId)) {
        if(item.grade?.kind==='scored')continue;
        const latest=item.attempts.at(-1);
        const current=latest?.validationError??latest?.error??(item.grade?.kind==='technical-missing'?item.grade.error:undefined);
        if(latest?.phase!=='judge'&&current?.code===error.code&&current.phase===error.phase)
          matches.push({runId,itemId:item.itemId,at:latest?.endedAt??item.updatedAt});
      }
    }
    if(new Set(matches.map(match=>match.runId)).size!==1)return;
    const match=matches.sort((a,b)=>b.at.localeCompare(a.at))[0]!;
    batch.runControls={[match.runId]:{state:'held',error,itemId:match.itemId}};
    delete batch.lastError;
  }
  async function loadLegacyFailureCauses(batch:BatchView):Promise<void>{
    for(const [runId,control] of Object.entries(batch.runControls??{})){
      const {error,itemId}=control;
      if(control.state!=='held'||!itemId||error?.code!=='UPSTREAM_ERROR'||error.phase!=='answer'||error.upstreamCause)continue;
      try{
        const item=await store.getItem(runId,itemId),attempt=item?.attempts.at(-1),failure=attempt?.error;
        if(item?.answer?.complete||item?.grade?.kind==='scored'||attempt?.status!=='failed'||attempt.phase!=='answer'||
          failure?.code!==error.code||failure.phase!==error.phase||failure.status!==error.status||failure.retryable!==error.retryable)continue;
        const cause=upstreamFailureCause(failure.code,failure.upstream?.codes?.[0],failure.status,failure.upstream);
        if(cause)legacyFailureCauses.set(runId,{itemId,cause});
      }catch{/* A missing or unreadable detail must not impede recovery. */}
    }
  }
  async function persist(batch:BatchView):Promise<void>{await store.exclusive(async tx=>{await writeRecord(join(tx.maintenanceDirectory,`batch-${batch.batchId}.json`),batch);});}
  async function reconcileExecution(batch:BatchView,tx:HistoryTransaction):Promise<void>{
    if(!batch.executionChanges?.length)return;
    for(const id of batch.runIds){const {summary,manifest}=await tx.getRun(id),saved=summary.executionChanges??[],changes=batch.executionChanges;
      let previous=manifest.execution??changes[0]!.before;for(const change of changes){if(change.reason!=='output-idle-upgrade-v1'||!Number.isFinite(Date.parse(change.at))||identityHash(change.before)!==identityHash(previous)||change.after.failurePolicy!=='output-idle-v1'||change.before.concurrency!==change.after.concurrency||change.before.callTimeoutMs!==change.after.callTimeoutMs)fail('EXECUTION_JOURNAL_INVALID');previous=change.after;}
      if(identityHash(previous)!==identityHash(batch.execution)||saved.length>changes.length||identityHash(saved)!==identityHash(changes.slice(0,saved.length)))fail('EXECUTION_JOURNAL_INVALID');
      if(saved.length<changes.length)await tx.updateSummary(id,summary.revision,next=>{next.executionChanges=structuredClone(changes);});
    }
  }
  async function resolvedRun(manifest:import('../history/store.ts').RunManifest,summary:RunSummary,transaction?:HistoryTransaction,localGeneralRegrade=false,resolver:Pick<ProtocolAdmission,'resolve'>=registry):Promise<ResolvedProtocolSet>{
    if(manifest.reuseOrigin){if(transaction)await verifyImported(transaction,manifest.reuseOrigin.operationId,manifest.runId,resolver);else await store.exclusive(tx=>verifyImported(tx,manifest.reuseOrigin!.operationId,manifest.runId,resolver));}
    const protocol=await resolver.resolve(manifest.protocols);
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
  async function call(runId:string,q:Question,phase:'answer'|'judge',messages:readonly PromptMessage[],signal:AbortSignal,batch:BatchView,singleJudgeAttempt=false):Promise<GeneratedAnswer|undefined> {
    const {manifest}=await store.getRun(runId),target=phase==='answer'?manifest.target:batch.judge?.target;if(!target)return undefined;
    const maxAttempts=singleJudgeAttempt?1:3;
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
        const upstream=captureUpstreamDiagnostic(thrown);
        answer={text:'',complete:false,truncated:false,observations:{attemptId:attempt.attemptId,itemId:q.id,track:q.track,phase,startedAt:attempt.startedAt,endedAt:new Date().toISOString(),usage:{available:false}},error:{...failure(configuration&&preparationErrorCodes.has(code)?code:'CALL_FAILED',configuration?'config':phase,!configuration),...(upstream?{upstream}:{})}};
      }finally{watchdog.dispose();signal.removeEventListener('abort',abort);}
      if(signal.aborted||!(batch.execution.failurePolicy&&isFatalCallError(answer.error))&&(timedOut||batch.execution.failurePolicy&&isTimeoutFailure(answer.error)&&hasObservedOutput(answer.observations,answer.text))){answer.complete=false;answer.error=timeoutFailure({policy:batch.execution.failurePolicy,phase,observation:answer.observations,text:answer.text,parentAborted:signal.aborted,upstream:answer.error?.upstream});}
      attempt.status=answer.complete?'completed':signal.aborted?'interrupted':'failed';attempt.endedAt=answer.observations.endedAt;attempt.observations=answer.observations;if(answer.error)attempt.error=answer.error;
      options.calibration?.recordUsage(answer.observations.usage);attempt.performance=normalizeObservation({...attempt.performanceKey!,sampleId:attempt.attemptId,itemId:q.id,startedAt:answer.observations.startedAt,endedAt:answer.observations.endedAt,durationMs:answer.observations.timing?.totalMs??(performance.now()-generatedStart),outcome:answer.complete?'completed':timedOut||isTimeoutFailure(answer.error)?'timeout':signal.aborted?'cancelled':'failed',truncated:answer.truncated,automaticRetry:!answer.complete&&!!answer.error?.retryable&&retryIndex+1<maxAttempts&&!signal.aborted,...(answer.observations.timing?{timing:answer.observations.timing}:{}),usage:answer.observations.usage});
      if(phase==='judge')attempt.rawText=answer.text;
      item=await store.getItem(runId,q.id);state.attempts=[...(item?.attempts??[]).filter(x=>x.attemptId!==attempt.attemptId),attempt];
      if(phase==='answer')state.answer=answer;
      if(phase==='judge'&&answer.complete){const grade=graders.writing!.parse(q,answer,batch.judge!,state.answer!);state.grade=grade;
        if(grade.kind==='technical-missing'){attempt.validationError=grade.error;if(attempt.performance)attempt.performance.outcome='failed';await store.saveItem(runId,item?.revision??0,state);await options.onTimingSample?.(runId,attempt.performance!);await refresh(runId);return {ok:false,error:grade.error};}}
      await store.saveItem(runId,item?.revision??0,state);await options.onTimingSample?.(runId,attempt.performance);await refresh(runId);
      return answer.complete?{ok:true,value:answer}:{ok:false,error:answer.error??failure('ANSWER_INCOMPLETE',phase,true)};
    },signal,options.clock,maxAttempts);
    if(!outcome.ok){
      if(!signal.aborted&&phase==='judge'&&batch.judge&&!options.calibration&&
        (singleJudgeAttempt&&outcome.error.phase==='judge'||hasRepeatedItemJudgeFailure(await store.getItem(runId,q.id),batch.judge))&&
        !signal.aborted){
        await deferJudgeItem(batch,runId,q.id);
      }else await deferOrStop(batch,runId,q.id,outcome.error,signal,phase);
      return undefined;
    }
    if(phase==='judge'&&batch.pendingItems?.some(item=>item.runId===runId&&item.itemId===q.id&&item.error.code===JUDGE_ITEM_PENDING)){
      batch.pendingItems=batch.pendingItems.filter(item=>item.runId!==runId||item.itemId!==q.id);
      await persist(batch);
    }
    return outcome.value;
  }
  async function deferOrStop(batch:BatchView,runId:string,itemId:string,error:TechnicalError,signal:AbortSignal,origin:'answer'|'judge'='answer'):Promise<void>{
    if(signal.aborted)return;
    const {upstream:_upstream,...summaryError}=error;
    if(isDeferredTimeout(batch.execution.failurePolicy,error)||isLocalDeadline(error)){
      await deferItem(batch,runId,itemId,summaryError);return;
    }
    if(origin==='answer'&&!options.calibration&&!localRegrading&&mayIsolate(error)&&currentRun?.id===runId){
      if(!batch.runControls?.[runId]){
        (batch.runControls??={})[runId]={state:'held',error:summaryError,itemId};
        currentRun.controller.abort();
        await persist(batch);
      }
      return;
    }
    batch.lastError??=summaryError;
    controller?.abort();
  }
  async function deferItem(batch:BatchView,runId:string,itemId:string,error:TechnicalError):Promise<void>{
    const pending=batch.pendingItems??=[];
    const index=pending.findIndex(item=>item.runId===runId&&item.itemId===itemId);
    const next={runId,itemId,error};
    if(index<0)pending.push(next);else pending[index]=next;
    const deferred=deferredThisExecution.get(runId)??new Set<string>();
    deferred.add(itemId);
    deferredThisExecution.set(runId,deferred);
    await persist(batch);
  }
  async function deferJudgeItem(batch:BatchView,runId:string,itemId:string):Promise<void>{
    await deferItem(batch,runId,itemId,{code:JUDGE_ITEM_PENDING,phase:'judge',retryable:false,
      message:'这道题已多次判分失败，答卷保留待补判。'});
  }
  function resetPending(batch:BatchView,runId:string):void {
    if(batch.pendingItems)batch.pendingItems=batch.pendingItems.filter(item=>item.runId!==runId||isLocalDeadline(item.error)||item.error.code===JUDGE_ITEM_PENDING);
  }
  function rememberFailure(batch:BatchView,error:unknown):void{
    const code=(error as {code?:string;message?:string})?.code??(error as Error)?.message;
    batch.lastError??=failure(typeof code==='string'&&localErrorCodes.has(code)?code:'QUEUE_STOPPED');
  }
  async function processItem(runId:string,q:Question,batch:BatchView,signal:AbortSignal,protocol:ResolvedProtocolSet,regrade?:LocalRegrade['items'][number],retryDeferredJudge=false,answerOnly=false):Promise<void> {
    let item=await store.getItem(runId,q.id);if(signal.aborted||item?.grade?.kind==='scored')return;
    if(regrade&&(!item||item.revision!==regrade.revision||!isSavedWall(item)||protocol.contestPolicy!=='wall-safety-v1'))fail('LOCAL_REGRADE_INPUT_CHANGED');
    if(q.datasetId==='bfcl-v4-multi-turn-selected'){
      if(!graders.tools){await deferOrStop(batch,runId,q.id,failure('TOOLS_NOT_SUPPORTED','config'),signal);return;}
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
    if(answerOnly)return;
    let grade:GradeResult|undefined,gradingObservation:PerformanceSample|undefined;
    if(q.track==='writing'){
      if(!graders.writing){await deferOrStop(batch,runId,q.id,failure('WRITING_GRADER_UNAVAILABLE','grader'),signal);return;}
      grade=graders.writing.local(q,answer);
      if(!grade){
        if(!retryDeferredJudge&&!options.calibration&&batch.judge&&hasRepeatedItemJudgeFailure(item,batch.judge)){
          await deferJudgeItem(batch,runId,q.id);return;
        }
        await call(runId,q,'judge',graders.writing.build(q,answer),signal,batch,retryDeferredJudge);
        if(!signal.aborted)await refresh(runId);
        return;
      }
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
    else if(grade.kind==='technical-missing'&&
       !(signal.aborted&&(savedWall||['ABORTED','CANCELLED'].includes(grade.error.code)))){
      batch.lastError??=grade.error;
      controller?.abort();
    }
    await refresh(runId);
  }
  async function sampleQuestion(runId:string,q:Question,batch:BatchView,signal:AbortSignal,protocol:ResolvedProtocolSet) {
    const start=performance.now();
    await processItem(runId,q,batch,signal,protocol,undefined,false,q.track==='writing');
    if(signal.aborted||batch.lastError)return;
    const saved=await store.getItem(runId,q.id);
    if(signal.aborted)return;
    if(saved?.answer?.complete&&(q.track==='writing'||saved.grade?.kind==='scored')){
      const observed=saved.answer.observations;
      const ms=saved.toolObservation?.durationMs??observed.timing?.totalMs??
        (Date.parse(observed.endedAt)-Date.parse(observed.startedAt));
      batch.etaSamples![runId]=Math.max(1,Number.isFinite(ms)&&ms>=0?ms:performance.now()-start);
      await persist(batch);
      return;
    }
    const pending=batch.pendingItems?.find(item=>item.runId===runId&&item.itemId===q.id);
    (batch.runControls??={})[runId]={state:'held',itemId:q.id,error:pending?.error??
      {code:'ESTIMATION_SAMPLE_UNAVAILABLE',phase:'answer',retryable:false,message:'首题未能取得完整作答。'}};
    await persist(batch);
  }
  async function validateResume(tx:HistoryTransaction,ids:readonly string[],admission:ProtocolAdmission):Promise<boolean> {
    let hasWork=false;
    for(const id of ids){
      const {summary,manifest}=await tx.getRun(id);
      if(completed(summary))continue;
      if(!summary.resumeAllowed||summary.details!=='available')fail('RUN_CANNOT_RESUME');
      await resolvedRun(manifest,summary,tx,false,admission);
      if(disposed)fail('QUEUE_DISPOSED');
      hasWork=true;
    }
    return hasWork;
  }
  function upgradeExecution(batch:BatchView,policy?:'output-idle-v1'):void {
    if(!policy||batch.execution.failurePolicy===policy)return;
    const before=structuredClone(batch.execution);
    batch.execution={...before,failurePolicy:policy};
    (batch.executionChanges??=[]).push({at:new Date().toISOString(),before,after:structuredClone(batch.execution),reason:'output-idle-upgrade-v1'});
  }
  async function settledBatchStatus(batch:BatchView,paused:boolean):Promise<BatchView['status']> {
    for(const id of batch.runIds){
      if(batch.runControls?.[id]?.state==='removed')continue;
      if(!completed((await store.getRun(id)).summary)){
        if(batch.lastError)return 'pending';
        if(paused)return 'paused';
        if(Object.values(batch.runControls??{}).some(control=>control.state==='held')||batch.pendingItems?.some(item=>!batch.runControls?.[item.runId]))return 'pending';
        return 'queued';
      }
    }
    return 'completed';
  }
  async function execute(batch:BatchView,local:LocalRegrade|undefined,admission:ProtocolAdmission):Promise<void> {
    const batchSignal=controller!.signal;
    const previouslyDeferred=new Set((batch.pendingItems??[]).filter(item=>item.error.code===JUDGE_ITEM_PENDING)
      .map(item=>JSON.stringify([item.runId,item.itemId])));
    batch.status='running';
    delete batch.lastError;
    const budgetAbort=()=>{batch.lastError??=failure('CALIBRATION_BUDGET_REACHED','config');controller?.abort();};
    options.calibration?.signal.addEventListener('abort',budgetAbort,{once:true});
    if(options.calibration?.signal.aborted)budgetAbort();
    try {
      await persist(batch);
      while(!batchSignal.aborted){
        await store.exclusive(async()=>{});
        if(batchSignal.aborted)break;
        const runnable=dispatchableRunIds(batch);
        const sampleRunId=!local&&batch.etaSamples?runnable.find(id=>batch.etaSamples![id]===undefined):undefined;
        const runId=sampleRunId??runnable.find(id=>!dispatched.has(id)&&(!local||local.items.some(item=>item.runId===id)));
        if(!runId)break;
        if(!sampleRunId)dispatched.add(runId);
        const {summary,manifest}=await store.getRun(runId);
        if(batchSignal.aborted||batch.runControls?.[runId]||(!sampleRunId&&completed(summary)))continue;
        if(!summary.resumeAllowed||summary.details!=='available')fail('RUN_CANNOT_RESUME');
        const protocol=await resolvedRun(manifest,summary,undefined,!!local,admission);
        if(batchSignal.aborted||batch.runControls?.[runId])continue;
        const runController=new AbortController();
        const signal=AbortSignal.any([batchSignal,runController.signal]);
        currentRun={id:runId,controller:runController};
        if(!local)resetPending(batch,runId);
        const selected=local?.items.filter(x=>x.runId===runId);
        const byId=new Map(protocol.items.map(q=>[q.id,q]));
        const dispatch=manifest.executionOrder?.itemIds.filter(id=>!selected||selected.some(entry=>entry.itemId===id))
          .map(id=>byId.get(id)??fail('PROTOCOL_ITEMS_CHANGED'))??protocol.items;
        await trackState(runId,'running',true);
        let runThrew=false;
        try {
          if(sampleRunId){
            const required=new Set(manifest.requiredItems.map(item=>item.id));
            const first=dispatch.find(question=>question.track==='general'&&required.has(question.id))??
              dispatch.find(question=>required.has(question.id));
            if(!first)fail('PROTOCOL_ITEMS_CHANGED');
            await sampleQuestion(runId,first!,batch,signal,protocol);
            continue;
          }
          for(const track of ['general','writing'] as const){
            if(signal.aborted||summary.tracks[track]?.status==='completed')continue;
            if(track==='writing'&&batch.judge&&graders.writing?.acceptsJudge?.(batch.judge)===false){
              batch.lastError??=failure('JUDGE_PROTOCOL_CHANGED','config');
              controller?.abort();
              break;
            }
            const required=new Set(manifest.requiredItems.filter(x=>x.track===track).map(x=>x.id));
            const questions=dispatch.filter(x=>required.has(x.id)&&(!selected||selected.some(entry=>entry.itemId===x.id)));
            let index=0;
            const workers=await Promise.allSettled(Array.from({length:batch.execution.concurrency},async()=>{
              try {
                while(!signal.aborted){
                  const question=questions[index++];
                  if(!question)break;
                  await processItem(runId,question,batch,signal,protocol,selected?.find(entry=>entry.itemId===question.id),
                    previouslyDeferred.has(JSON.stringify([runId,question.id])));
                }
              }catch(error){rememberFailure(batch,error);controller?.abort();throw error;}
            }));
            const rejected=workers.find(result=>result.status==='rejected');
            if(rejected?.status==='rejected')throw rejected.reason;
          }
        }catch(error){runThrew=true;throw error;}
        finally{
          const pendingItems=batch.pendingItems?.filter(item=>item.runId===runId)??[];
          const control=batch.runControls?.[runId];
          const reason:RunSettlement['reason']=runThrew||batch.lastError||control?.error?'technical-error':signal.aborted?'paused':'drained';
          try {
            await trackState(runId,reason==='technical-error'||pendingItems.length?'pending':'paused',false,true);
            await refresh(runId);
            if(batch.runControls?.[runId]?.state==='held'&&completed((await store.getRun(runId)).summary))
              delete batch.runControls[runId];
            await options.onTimingRunEnd?.(runId);
            if(!local&&(!sampleRunId||completed((await store.getRun(runId)).summary)))await options.onTimingRunSettled?.({runId,batchId:batch.batchId,memberRunIds:[...batch.runIds],reason,pendingItems:structuredClone(pendingItems)});
          }finally{currentRun=undefined;}
        }
      }
      dispatchClosed=true;
      if(!batch.lastError&&!batchSignal.aborted){
        const deferred=batch.pendingItems?.find(item=>!batch.runControls?.[item.runId]);
        if(deferred)batch.lastError=deferred.error;
      }
      batch.status=await settledBatchStatus(batch,batchSignal.aborted);
    }catch(error){dispatchClosed=true;batch.status='pending';rememberFailure(batch,error);controller?.abort();}
    finally{
      options.calibration?.signal.removeEventListener('abort',budgetAbort);
      try {
        await persist(batch).catch(error=>{rememberFailure(batch,error);batch.status='pending';});
        if(local)await writeRecord(operationPath(local.operationId),{...local,finishedAt:new Date().toISOString()}).catch(error=>{rememberFailure(batch,error);});
      }finally{currentRun=undefined;localRegrading=false;active=undefined;}
    }
  }
  function start(batch:BatchView,local?:LocalRegrade,admission=createProtocolAdmission(registry)):void {
    if(disposed)fail('QUEUE_DISPOSED');
    if(active)fail('QUEUE_BUSY');
    active=batch.batchId;
    dispatched=new Set();
    deferredThisExecution.clear();
    dispatchClosed=false;
    localRegrading=!!local;
    controller=new AbortController();
    running=execute(batch,local,admission);
  }
  const queue:EvaluationQueue={
    activeWork(batchId){
      if(active!==batchId||localRegrading||dispatchClosed||controller?.signal.aborted)return;
      const batch=batches.get(batchId)!;
      const runIds=dispatchableRunIds(batch);
      return {
        runIds,
        deferred:new Map([...deferredThisExecution].map(([id,items])=>[id,new Set(items)])),
        excludesDeferredWork:deferredThisExecution.size>0||Object.keys(batch.runControls??{}).length>0,
        ...(batch.etaSamples?{sampling:{ready:runIds.filter(id=>batch.etaSamples![id]!==undefined).length,
          total:runIds.length,answerMs:{...batch.etaSamples}}}:{}),
      };
    },
    async saveEstimate(id,estimate){const batch=batches.get(id);if(!batch)return;batch.estimate=structuredClone(estimate);await persist(batch);},
    snapshot(){
      const batchViews=structuredClone([...batches.values()]);
      for(const view of batchViews)for(const [runId,control] of Object.entries(view.runControls??{})){
        const legacy=legacyFailureCauses.get(runId);
        if(legacy&&control.state==='held'&&control.itemId===legacy.itemId&&control.error?.code==='UPSTREAM_ERROR'&&
          control.error.phase==='answer'&&!control.error.upstreamCause)control.error.upstreamCause=legacy.cause;
      }
      const current=batchViews.find(batch=>batch.batchId===active);
      if(current&&currentRun){
        current.activeRunId=currentRun.id;
        if(current.runControls?.[currentRun.id])current.settlingRunId=currentRun.id;
      }
      return {batches:batchViews,recoveryIssues:structuredClone(recoveryIssues),...(active?{activeBatchId:active}:{})};
    },
    async idle(){await ready;await admissionDone;await running;},
    async controlRun(id,runId,operation,startIfIdle,prepare,policy){
      await ready;
      if(disposed)fail('QUEUE_DISPOSED');
      if(!store.writable)fail('HISTORY_READ_ONLY');
      if(active&&active!==id||admitting||active&&(dispatchClosed||localRegrading||controller?.signal.aborted))fail('QUEUE_BUSY');
      const batch=batches.get(id);
      if(!batch||!batch.runIds.includes(runId))return fail('BATCH_RUN_NOT_FOUND');
      const lift=operation==='resume'||operation==='rejoin';
      // A paused batch requires a separate, explicit batch resume.
      const startAfter=lift&&startIfIdle&&!active&&batch.status!=='paused'&&
        (!batch.lastError||batch.pendingItems?.some(item=>item.error.code===batch.lastError?.code));
      const release=startAfter?reserveAdmission():undefined;
      try {
        const admission=createProtocolAdmission(registry);
        if(startAfter)await prepare?.([...new Set([...dispatchableRunIds(batch),runId])],admission);
        await store.exclusive(async tx=>{
          const {summary}=await tx.getRun(runId);
          if(completed(summary))fail('RUN_CONTROL_STALE');
          if(lift&&(!summary.resumeAllowed||summary.details!=='available'))fail('RUN_CANNOT_RESUME');
          if(active&&(dispatchClosed||controller?.signal.aborted))fail('QUEUE_BUSY');
          const previous=batch.runControls?.[runId];
          const matches=operation==='resume'?previous?.state==='held':
            operation==='rejoin'?previous?.state==='removed':
            operation==='remove'?previous?.state!=='removed':!previous;
          if(!matches||lift&&active&&currentRun?.id===runId)fail('RUN_CONTROL_STALE');

          const next=structuredClone(batch);
          if(lift){
            if(next.runControls)delete next.runControls[runId];
          }else{
            (next.runControls??={})[runId]={...previous,state:operation==='remove'?'removed':'held'};
          }
          delete next.estimate;
          if(startAfter){
            if(!await validateResume(tx,dispatchableRunIds(next),admission))fail('NO_RUN_TO_RESUME');
            upgradeExecution(next,policy);
          }else if(!active){
            const deferred=next.pendingItems?.find(item=>item.error.code===next.lastError?.code&&item.error.phase===next.lastError.phase);
            if(deferred&&next.runControls?.[deferred.runId]){
              const remaining=next.pendingItems?.find(item=>!next.runControls?.[item.runId]);
              if(remaining)next.lastError=remaining.error;
              else delete next.lastError;
            }
            next.status=await settledBatchStatus(next,next.status==='paused');
          }
          // Commit the intent before allowing the dispatcher to select it.
          // A working batch retains its object identity across this write.
          const interrupt=!lift&&currentRun?.id===runId?currentRun.controller:undefined;
          if(!lift&&active){
            (batch.runControls??={})[runId]=next.runControls![runId]!;
            interrupt?.abort();
          }
          try {
            await writeRecord(join(tx.maintenanceDirectory,'batch-'+id+'.json'),next);
          }catch(error){
            if(active){rememberFailure(batch,error);controller?.abort();}
            throw error;
          }
          if(lift)legacyFailureCauses.delete(runId);
          if(active){
            if(lift){
              if(batch.runControls)delete batch.runControls[runId];
              dispatched.delete(runId);
              deferredThisExecution.delete(runId);
            }
            delete batch.estimate;
          }else{
            Object.assign(batch,next);
            if(!next.lastError)delete batch.lastError;
            delete batch.estimate;
          }
          if(startAfter){
            await reconcileExecution(batch,tx);
            start(batch,undefined,admission);
          }
        });
      }finally{release?.();}
    },
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
    async enqueue(request,admission=createProtocolAdmission(registry)){await ready;if(disposed)fail('QUEUE_DISPOSED');if(active||admitting)fail('QUEUE_BUSY');if(!store.writable)fail('HISTORY_READ_ONLY');
      assertFailurePolicy(request.execution.failurePolicy);
      if(!request.targets.length||!request.tracks.length||new Set(request.tracks).size!==request.tracks.length||request.tracks.some(x=>!['general','writing'].includes(x)))fail('INVALID_BATCH');
      if(![1,2,3,4].includes(request.execution.concurrency)||!Number.isInteger(request.execution.callTimeoutMs)||request.execution.callTimeoutMs<1000||request.execution.callTimeoutMs>1800000)fail('INVALID_EXECUTION');
      const ids=request.targets.map(fingerprintTarget);if(new Set(ids).size!==ids.length)fail('DUPLICATE_TARGET');if(request.tracks.includes('writing')&&!request.judge)fail('JUDGE_REQUIRED');if(request.judge)fingerprintTarget(request.judge.target);
      const release=reserveAdmission();try{
        const generalId=request.generalId??registry.list().find(d=>d.general.tier==='legacy')?.refs.generalId;if(!generalId)fail('PROTOCOL_UNAVAILABLE');
        const protocols=await admission.forNewRun(generalId!,request.tracks);validateGeneralDefinition(protocols.descriptor.general,protocols.items);
        if(disposed)fail('QUEUE_DISPOSED');
        const batch:BatchView={batchId:randomUUID(),runIds:[],createdAt:new Date().toISOString(),status:'queued',execution:structuredClone(request.execution),...(request.judge?{judge:structuredClone(request.judge)}:{})};
        if(options.sampleMultiConfigEta&&request.targets.length>1)batch.etaSamples={};
        const executionOrder=buildExecutionOrder(protocols,request.tracks);
        for(const target of request.targets){const run=await store.createRun({...(executionOrder?{executionOrder}:{}),batchId:batch.batchId,target,protocols:{generalId:protocols.generalId,writingId:protocols.writingId,resourceVersion:protocols.resourceVersion},requiredItems:protocols.items.filter(x=>request.tracks.includes(x.track)).map(x=>({id:x.id,track:x.track,datasetId:x.datasetId})),...(request.tracks.includes('general')?{generalDefinition:protocols.descriptor.general}:{}),execution:request.execution,...(request.initialEstimates?.[fingerprintTarget(target)]?{initialEstimation:request.initialEstimates[fingerprintTarget(target)]!}:{}),...(request.judge?{judge:request.judge}:{})});batch.runIds.push(run.runId);}
        batches.set(batch.batchId,batch);await persist(batch);await store.exclusive(async()=>{start(batch,undefined,admission);});return structuredClone(batch);
      }finally{release();}
    },
    async pause(id){await ready;if(active!==id)fail('BATCH_NOT_ACTIVE');controller?.abort();await running;},
    async resume(id,judge,policy,admission=createProtocolAdmission(registry)){await ready;if(disposed)fail('QUEUE_DISPOSED');if(active||admitting)fail('QUEUE_BUSY');let batch=batches.get(id);if(!batch)return fail('BATCH_NOT_FOUND');
      const release=reserveAdmission();try{await store.exclusive(async tx=>{if(active)fail('QUEUE_BUSY');if(disposed)fail('QUEUE_DISPOSED');if(!await validateResume(tx,dispatchableRunIds(batch!),admission))fail('NO_RUN_TO_RESUME');
        if(judge){fingerprintTarget(judge.target);if(batch!.judge&&(judge.rubricId!==batch!.judge.rubricId||judge.promptId!==batch!.judge.promptId))fail('JUDGE_PROTOCOL_CHANGED');}
        const next=structuredClone(batch!);if(judge)next.judge=structuredClone(judge);
        upgradeExecution(next,policy);
        await writeRecord(join(tx.maintenanceDirectory,`batch-${next.batchId}.json`),next);batches.set(id,next);batch=next;
        await reconcileExecution(next,tx);start(next,undefined,admission);});}finally{release();}},
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
        for(const runId of dispatchableRunIds(batch)){
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

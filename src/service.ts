import {createProtocolAdmission,resolveProtocolForRead,type ProtocolAdmission} from './evaluation/protocol-resolution.ts';
import {isCurrentGeneralRelease} from './evaluation/current-edition.ts';
import {isFiveCapabilitySchema} from './evaluation/five-schema.ts';
import {createSpeedHistory,type SpeedHistory} from './history/speed.ts';
import {createSpeedCleanup} from './history/speed-cleanup.ts';
import {createSpeedRunner} from './speed/runner.ts';
import {probeCallLimit} from './speed/probe-scheduler.ts';
import {validSpeedBudget} from './speed/budget.ts';
import {createCalibrationExperiment} from './speed/calibration-experiment.ts';
import {speedClock,type SpeedClock} from './speed/clock.ts';
import {createLiveEstimator} from './estimation/live.ts';
import {estimateRoughRemaining} from './estimation/rough-remaining.ts';
import {JUDGE_ITEM_PENDING} from './contracts.ts';
import {previewEstimate,previewInputs,matchingPreviewConfig,runInput,addHistoryPriors} from './estimation/inputs.ts';
import {estimateBatch} from './estimation/engine.ts';
import type {EstimateSnapshot,EstimationRunInput,SpeedSession,RunEstimation,TimeAdvisorResult} from './estimation/contracts.ts';
import {readTimeAdvisorEvidence,timeAdvisorScope,timingTraceScope,usablePreviewEvidence} from './estimation/time-advisor.ts';
import {createActivityGate,type ActivityKind,type ActivityLease} from './jobs/activity.ts';
import {join} from 'node:path';import {readdir,readFile} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';
import type {HostAdapter,JudgeSnapshot,ParamValue,TargetSnapshot,Track,EvaluationRequest,UpgradeCheck,UpgradePreview,UpgradeCommit,ProtocolDescriptor,ProtocolCatalogItem} from './contracts.ts';
import {defaultRoot,switchRoot,prepareResources,prepareProtocolResources,type PreparedEnvironment} from './resources/prepare.ts';import {readResourceManifest,loadProtocolSet} from './evaluation/protocols.ts';
import {readRecord,writeRecord} from './history/atomic.ts';import {openHistory,type HistoryStore} from './history/store.ts';import {createCleanup,measureRunUsage} from './history/cleanup.ts';
import {createQueue,dispatchableRunIds,type BatchView,type EvaluationQueue} from './jobs/queue.ts';import {gradeGeneral} from './evaluation/grade-general.ts';import {createCodeRunner} from './runtime/runner.ts';import {createRuleGrader} from './runtime/rule-grader.ts';import {createWritingGrader,type WritingRubric} from './writing/judge.ts';
import {validateEnvelope,type Action} from './host/api.ts';import {fingerprintTarget} from './model/identity.ts';
import {selfcheckEnvironment,selfcheckFailure} from './resources/selfcheck.ts';
import {readComparisonMetadata} from './comparison/project.ts';
import {projectCommonItems} from './comparison/common-items.ts';
import {projectReferenceCommon} from './comparison/reference-common.ts';
import type {ReferenceItemEvidence} from './comparison/reference-evidence.ts';
import {resolveEditionMap,type EditionMap} from './evaluation/edition-map.ts';
import {readEditionDeclarations} from './evaluation/edition-catalog.ts';
import {readCommonEvidence} from './history/common-evidence.ts';
import {createProtocolRegistry} from './evaluation/registry.ts';
import type {ProtocolRegistry,ResolvedProtocolSet} from './evaluation/tier-contracts.ts';
import {identityHash,protocolKey} from './evaluation/protocol-identity.ts';
import {createContestDiagnosticRunner} from './runtime/contest-diagnostic-runner.ts';
import {createContestRunner} from './runtime/contest-runner.ts';
import {CONTEST_SCORING_LIMITS} from './evaluation/contest-budget.ts';
import {createReuseHistory,readUpgradeItems} from './history/reuse.ts';
import {createEditionReuseHistory} from './history/edition-reuse.ts';
import {checkUpgrade} from './evaluation/reuse-eligibility.ts';
import {checkEditionReuse} from './evaluation/edition-reuse.ts';
import type {EditionReuseCheck,EditionUpgradePreview} from './evaluation/tier-contracts.ts';
import {reuseTargetBinding} from './model/reuse-identity.ts';
import {createToolDispatcher} from './runtime/tool-dispatcher.ts';import {createToolSessionRunner,type ToolSessionInput} from './host/tool-session.ts';
import {OUTPUT_IDLE_POLICY} from './jobs/timeout-policy.ts';
import {restorePreparedEnvironments} from './resources/restore.ts';
import {hasMixedExecution,executionChangedEstimate} from './jobs/execution-conditions.ts';
import {createOrdinaryTiming} from './estimation/ordinary-timing.ts';
import {createTimingTraceHistory} from './history/timing-traces.ts';import {timingGroups,timingCleanupIds} from './estimation/timing-groups.ts';
import {createCodingDiagnostics,type CodingDiagnosticDependencies} from './diagnostics/coding.ts';
import {generalWritingRef,LEGACY_WRITING_ID} from './evaluation/writing-edition.ts';
import {readPreviousWritingQuestions} from './resources/legacy-writing-cache.ts';
const fail=(code:string):never=>{throw Object.assign(new Error(code),{code});};
const advisorOfferLifetimeMs=120000,advisorReadTimeoutMs=5000;
export interface ServiceDependencies {codingDiagnosticRunner?:CodingDiagnosticDependencies['runner'];estimationExperiment?:{enabled:true};adapter:HostAdapter;packageResources:string;scopeId:string;initialRoot?:string;controlRoot?:string;clock?:SpeedClock;registry?:ProtocolRegistry;editionMaps?:()=>Promise<readonly EditionMap[]>;referenceEvidence?:()=>Promise<readonly ReferenceItemEvidence[]>;prepareEnvironment?:(rootPath:string,descriptor?:ProtocolDescriptor)=>Promise<PreparedEnvironment>}
export async function createEvaluationService(deps:ServiceDependencies) {
  let experiment:ReturnType<typeof createCalibrationExperiment>|undefined;
  const manifest=await readResourceManifest(deps.packageResources),protocols=await loadProtocolSet(deps.packageResources),rubric=JSON.parse(await readFile(join(deps.packageResources,'protocols','rubric-writing-v1.json'),'utf8')) as WritingRubric;
  const legacyRefs={generalId:protocols.generalId,writingId:protocols.writingId,resourceVersion:protocols.resourceVersion};
  const refsKey=(p:{generalId:string;writingId:string;resourceVersion:string})=>protocolKey({generalId:p.generalId,writingId:p.writingId,resourceVersion:p.resourceVersion});
  const environmentKey=(p:Parameters<typeof refsKey>[0])=>refsKey({...p,writingId:generalWritingRef(p.writingId)});
  let store:HistoryStore;
  let registry:ProtocolRegistry,protocolError:string|undefined;
  try{registry=deps.registry??await createProtocolRegistry(join(deps.packageResources,'..'),async()=>store&&readPreviousWritingQuestions(store.root),()=>store?.root);}
  catch{protocolError='PROTOCOL_UNAVAILABLE';registry={list:()=>[],async resolve(){return fail('PROTOCOL_UNAVAILABLE');},async forNewRun(){return fail('PROTOCOL_UNAVAILABLE');}};}
  const environments=new Map<string,PreparedEnvironment>();
  const preparationErrors=new Map<string,string>();
  const control=(await switchRoot(deps.controlRoot??deps.initialRoot??defaultRoot(),{writing:false})).path;
  const preference=join(control,`selection-${createHash('sha256').update(deps.scopeId).digest('hex').slice(0,24)}.json`);
  let selected=deps.initialRoot??control;try{const old=await readRecord<{root:string}>(preference);if(typeof old.root==='string')selected=old.root;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')fail('SELECTION_CORRUPT');}
  let queue:EvaluationQueue,timing:ReturnType<typeof createOrdinaryTiming>,cleanup:ReturnType<typeof createCleanup>,preparing=false,disposed=false,rootEpoch=0;
  const clock=deps.clock??speedClock,activity=createActivityGate();let evaluationLease:ActivityLease|undefined,speedLease:ActivityLease|undefined,speedHistory:SpeedHistory,speedCleanup:ReturnType<typeof createSpeedCleanup>,speed:ReturnType<typeof createSpeedRunner>,live:ReturnType<typeof createLiveEstimator>|undefined,evaluationDone=Promise.resolve(),speedDone=Promise.resolve(),environmentRecovery=Promise.resolve();
  async function prepareEnvironment(descriptor:ProtocolDescriptor){
    const candidate=deps.prepareEnvironment?await deps.prepareEnvironment(store.root,descriptor):descriptor.general.tier==='legacy'?await prepareResources(store.root,manifest,deps.packageResources):await prepareProtocolResources(store.root,descriptor,join(deps.packageResources,'..'));
    if(candidate.resourceVersion!==descriptor.refs.resourceVersion||candidate.rootPath!==store.root)fail('PREPARED_VERSION_MISMATCH');
    if(!deps.prepareEnvironment){await selfcheckEnvironment(candidate.resourcesPath);if(descriptor.general.tier!=='legacy'){const result=await createContestRunner(join(candidate.resourcesPath,'runtime')).runContest({id:'tier-environment-selfcheck-v1',cases:[{stdin:'21\n',expected:'42\n'}],limits:CONTEST_SCORING_LIMITS},'print(int(input()) * 2)',new AbortController().signal);if(result.kind!=='passed')selfcheckFailure('contest',result);}}
    return candidate;
  }
  let mutations:Promise<unknown>=Promise.resolve();const handles=new Map<string,{snapshot:TargetSnapshot;overrides:Record<string,ParamValue>;deployment?:TargetSnapshot['deployment']}>();
  type AdvisorOffer=NonNullable<TimeAdvisorResult['offer']>&{rootId:string;epoch:number;expires:number;draftKey:string;scopeKey:string;evidenceKey:string};
  const advisorOffers=new Map<string,AdvisorOffer>();
  let advisorRead:{key:string;controller:AbortController;promise:Promise<TimeAdvisorResult>}|undefined;
  interface UpgradeToken {rootId:string;rootEpoch:number;handle:string;sourceRunId:string;deepGeneralId:string;execution:EvaluationRequest['execution'];check:UpgradeCheck;expiresAt:string;expiresMonotonic:number;result?:UpgradeCommit}
  const upgradeTokens=new Map<string,UpgradeToken>(),committing=new Map<string,Promise<unknown>>();
  interface EditionToken {confirmedAt?:string;rootId:string;rootEpoch:number;handle:string;sourceRunId:string;destinationGeneralId:string;execution:EvaluationRequest['execution'];check:EditionReuseCheck;expiresAt:string;expiresMonotonic:number;result?:UpgradeCommit}
  const editionTokens=new Map<string,EditionToken>();
  let commonRead:{key:string;promise:Promise<unknown>}|undefined;
  let coding:Awaited<ReturnType<typeof createCodingDiagnostics>>,codingLease:ActivityLease|undefined,codingDone=Promise.resolve();
  const safeCode=(error:unknown)=>{const value=(error as {code?:string;message?:string})?.code??(error as Error)?.message;return /^[A-Z][A-Z0-9_]{1,70}$/.test(value??'')?value!:'ENVIRONMENT_NOT_PREPARED';};
  function defaultPreparation() {
    const admitted = registry.list().filter(descriptor => descriptor.allowNewRuns);
    const current = admitted.filter(descriptor => isCurrentGeneralRelease(descriptor.refs));
    return current.length ? current : admitted;
  }
  async function prepareDescriptor(descriptor: ProtocolDescriptor, existing?: PreparedEnvironment) {
    const key = refsKey(descriptor.refs);
    try {
      const candidate = existing ?? await prepareEnvironment(descriptor);
      environments.set(key, candidate);
      preparationErrors.delete(key);
      return candidate;
    } catch (error) {
      environments.delete(key);
      preparationErrors.set(key, safeCode(error));
      throw error;
    }
  }
  async function ensurePrepared(protocol: ResolvedProtocolSet) {
    if (environments.has(environmentKey(protocol))) return;
    const descriptor=registry.list().find(d=>refsKey(d.refs)===environmentKey(protocol));
    if(!descriptor)return fail('UNKNOWN_PROTOCOL');
    const existing = [...environments.values()].find(candidate => candidate.resourceVersion === descriptor.refs.resourceVersion);
    preparing = true;
    try { await prepareDescriptor(descriptor, existing); }
    finally { preparing = false; }
  }
  function protocolCatalog():ProtocolCatalogItem[]{return registry.list().map(descriptor=>({descriptor,prepared:environments.has(refsKey(descriptor.refs)),...(preparationErrors.has(refsKey(descriptor.refs))?{errorCode:preparationErrors.get(refsKey(descriptor.refs))!}:!descriptor.allowNewRuns?{errorCode:'PROTOCOL_NOT_VERIFIED'}:{})}));}
  function requirePrepared(protocol:ResolvedProtocolSet){if(environments.get(environmentKey(protocol))?.resourceVersion!==protocol.resourceVersion)fail('ENVIRONMENT_NOT_PREPARED');}
  async function requestedProtocol(request:Pick<EvaluationRequest,'generalId'>&{tracks?:readonly Track[]},resolver:Pick<ProtocolAdmission,'forNewRun'>=registry){try{return await resolver.forNewRun(request.generalId??legacyRefs.generalId,request.tracks);}catch(error){return fail(safeCode(error));}}
  async function currentTarget(handle:unknown):Promise<TargetSnapshot>{
    const saved=target(handle),choice=(await deps.adapter.catalog()).find(c=>c.scopeId===saved.scopeId&&c.providerId===saved.providerId&&c.modelId===saved.modelId);if(!choice)fail('UPGRADE_TARGET_CHANGED');
    const current=await deps.adapter.snapshot(choice!,saved.controls);if(saved.deployment)current.deployment=structuredClone(saved.deployment);
    if(fingerprintTarget(saved)!==fingerprintTarget(current)||reuseTargetBinding(saved)?.hash!==reuseTargetBinding(current)?.hash)fail('UPGRADE_TARGET_CHANGED');return current;
  }
  async function upgradeCheck(sourceRunId:string,deep:ResolvedProtocolSet,current:TargetSnapshot):Promise<UpgradeCheck>{
    let source:Awaited<ReturnType<HistoryStore['getRun']>>;try{source=await store.getRun(sourceRunId);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return fail('UPGRADE_SOURCE_NOT_FOUND');throw error;}
    const sourceProtocol=await registry.resolve(source.manifest.protocols);
    return store.exclusive(async tx=>{const fresh=await tx.getRun(sourceRunId),items=await readUpgradeItems(tx,sourceRunId);return checkUpgrade({...fresh,items,protocol:sourceProtocol},deep,current);});
  }
  async function editionCheck(sourceRunId:string,destination:ResolvedProtocolSet,current:TargetSnapshot){
    let source:Awaited<ReturnType<HistoryStore['getRun']>>;
    try{source=await store.getRun(sourceRunId);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return fail('EDITION_SOURCE_NOT_FOUND');throw error;}
    const sourceProtocol=await registry.resolve(source.manifest.protocols),declarations=await (deps.editionMaps?.()??readEditionDeclarations(join(deps.packageResources,'..')));
    const map=resolveEditionMap(sourceProtocol,destination,declarations);if(!map)return fail('EDITION_MAPPING_UNAVAILABLE');
    const check=await store.exclusive(async tx=>{const fresh=await tx.getRun(sourceRunId),items=await readUpgradeItems(tx,sourceRunId);return checkEditionReuse({...fresh,items,protocol:sourceProtocol},destination,current,map!);});
    return {check,map:map!,sourceProtocol};
  }
  function usesCustomScheduling(batch:BatchView):boolean{
    return (batch.execution.parallelModels??1)>1||Object.keys(batch.runConcurrency??{}).length>0;
  }
  async function getInputs(batchId:string,includeDeferred=false){
    const view=queue.snapshot(),batch=view.batches.find(b=>b.batchId===batchId);if(!batch)fail('BATCH_NOT_FOUND');const result:EstimationRunInput[]=[],summaries=await store.listSummaries();
    const ids=includeDeferred?batch!.runIds:dispatchableRunIds(batch!);
    for(const id of ids){
      const {manifest:runManifest,summary}=await store.getRun(id);
      const complete=Object.values(summary.tracks).every(track=>track.status==='completed');
      const control=batch!.runControls?.[id];
      const status=complete?'completed':control||summary.details!=='available'?'pending':
        view.activeBatchId===batchId?((batch!.activeRunIds??[batch!.activeRunId]).includes(id)?'running':'queued'):batch!.status==='pending'?'pending':'paused';
      const items=summary.details==='available'&&!complete?await store.listItems(id):[];
      const input=addHistoryPriors(runInput(runManifest,summary,items,status,clock.now(),batch!.judge),summaries.filter(run=>run.runId!==id));
      input.runId=id;
      if(complete)input.jobs=[];
      const advanced=await timing.snapshot(id,status,clock.now());
      if(advanced)input.advancedEstimate=advanced;
      result.push(input);
    }
    const scope=includeDeferred?undefined:queue.activeWork(batchId);
    if(!scope||usesCustomScheduling(batch!)||scope.sampling&&scope.sampling.ready<scope.sampling.total)return {runs:result};
    const jobs=new Map(result.map(input=>[input.runId!,input.jobs]));
    const work=new Map(scope.runIds.map(id=>[id,(jobs.get(id)??[]).filter(job=>!scope.deferred.get(id)?.has(job.itemId))]));
    const byId=new Map(summaries.map(summary=>[summary.runId,summary]));
    const singleJudgeAttempts=new Map<string,Set<string>>();
    for(const pending of batch!.pendingItems??[])if(pending.error.code===JUDGE_ITEM_PENDING){
      const items=singleJudgeAttempts.get(pending.runId)??new Set<string>();
      items.add(pending.itemId);
      singleJudgeAttempts.set(pending.runId,items);
    }
    try{
      const rough=estimateRoughRemaining({runs:batch!.runIds.flatMap(id=>byId.get(id)??[]),work,
        execution:batch!.execution,singleJudgeAttempts,excludesDeferredWork:scope.excludesDeferredWork,
        ...(scope.sampling?{sampledAnswerMs:scope.sampling.answerMs}:{}),...(batch!.judge?{judge:batch!.judge}:{})});
      return {runs:result,rough};
    }catch{return {runs:result};} // Optional estimates must not affect evaluation or saved timing.
  }
  async function bind(path:string,backgroundEnvironment=false):Promise<void>{
    await coding?.dispose();
    await experiment?.dispose();experiment=undefined;
    environments.clear();preparationErrors.clear();upgradeTokens.clear();editionTokens.clear();handles.clear();advisorOffers.clear();
    const selection=await switchRoot(path,{writing:false});store=await openHistory(selection.path);rootEpoch++;live=undefined;
    try{
      coding=await createCodingDiagnostics({store,registry,driverRoot:join(deps.packageResources,'diagnostics','contest'),
        async runtimeFor(protocol){await ensurePrepared(protocol);return join(environments.get(environmentKey(protocol))!.resourcesPath,'runtime');},
        ...(deps.codingDiagnosticRunner?{runner:deps.codingDiagnosticRunner}:{})});
      cleanup=createCleanup(store,()=>queue?.snapshot().activeBatchId);speedHistory=createSpeedHistory(store);speedCleanup=createSpeedCleanup(store,speedHistory);
      if(store.writable){await store.recover();await createReuseHistory(store).recover();await createEditionReuseHistory(store).recover();await cleanup.recoverCleanup();await speedHistory.recoverInterrupted();await speedCleanup.recover();}
      const graders={general(q:Parameters<typeof gradeGeneral>[0],a:Parameters<typeof gradeGeneral>[1],signal:AbortSignal,protocol:ResolvedProtocolSet){const prepared=environments.get(environmentKey(protocol));if(!prepared||prepared.resourceVersion!==protocol.resourceVersion)return Promise.resolve({kind:'technical-missing' as const,track:'general' as const,itemId:q.id,error:{code:'ENVIRONMENT_NOT_PREPARED',phase:'resource' as const,retryable:false,message:'请准备本轮评测对应的环境。'},evidence:null});return gradeGeneral(q,a,{code:createCodeRunner(join(prepared.resourcesPath,'runtime')),rules:createRuleGrader(join(prepared.resourcesPath,'runtime','rules')),contest:protocol.contestPolicy?createContestDiagnosticRunner(join(prepared.resourcesPath,'runtime'),join(deps.packageResources,'diagnostics','contest'),{policy:protocol.contestPolicy}):createContestRunner(join(prepared.resourcesPath,'runtime')),...(protocol.contestPolicy?{contestPolicy:protocol.contestPolicy}:{}),signal});},writing:createWritingGrader(rubric)};
      const tools=async(q:import('./contracts.ts').Question,input:ToolSessionInput,protocol:ResolvedProtocolSet,execution:EvaluationRequest['execution'])=>{
        const prepared=environments.get(environmentKey(protocol));
        const missing=(code:string):import('./contracts.ts').GradeResult=>({kind:'technical-missing',track:'general',itemId:q.id,error:{code,phase:'resource',retryable:false,message:'工具任务环境或原生调用不可用。'},evidence:null});
        if(!prepared)return missing('ENVIRONMENT_NOT_PREPARED');if(!deps.adapter.generateTurn)return missing('TOOLS_NOT_SUPPORTED');
        try{const dispatcher=await createToolDispatcher(prepared.resourcesPath,q);return await createToolSessionRunner({generateTurn:deps.adapter.generateTurn.bind(deps.adapter)},q,dispatcher,{callTimeoutMs:execution.callTimeoutMs,...(execution.failurePolicy?{failurePolicy:execution.failurePolicy}:{})})(input);}catch{return missing('TOOL_ENVIRONMENT_UNAVAILABLE');}
      };
      const services={...graders,tools};
      if(deps.estimationExperiment?.enabled)experiment=createCalibrationExperiment({store,adapter:deps.adapter,registry,graders:services,activity,clock,assertPrepared:requirePrepared,
        localFixtures(p){const prepared=environments.get(environmentKey(p));if(!prepared)throw Error('ENVIRONMENT_NOT_PREPARED');const runner=createContestRunner(join(prepared.resourcesPath,'runtime'));
          const fixtures=[{stdin:'21\n',expected:'42\n',code:'print(int(input()) * 2)'},{stdin:'3 5\n',expected:'8\n',code:'print(sum(map(int, input().split())))'},{stdin:'abc\n',expected:'cba\n',code:'print(input()[::-1])'}];
          return fixtures.map((f,i)=>async(signal:AbortSignal)=>{const result=await runner.runContest({id:'local-speed-'+i,cases:[{stdin:f.stdin,expected:f.expected}],limits:CONTEST_SCORING_LIMITS},f.code,signal);if(result.kind!=='passed')throw Error('LOCAL_CALIBRATION_FAILED');});
        }});
      timing=createOrdinaryTiming({store,registry,now:()=>clock.now()});if(store.writable)await timing.recover();
      queue=createQueue(store,deps.adapter,registry,services,{...timing.hooks,sampleMultiConfigEta:true,prepareRegrade:ensurePrepared,onChange(runId){if(!live)return;const batch=queue.snapshot().batches.find(b=>b.runIds.includes(runId));if(batch)void live.invalidate(batch.batchId,'performance').catch(()=>{});}});
      await queue.idle();speed=createSpeedRunner({adapter:deps.adapter,registry,graders:services,history:speedHistory,timingHistory:timing.history,clock});
      live=createLiveEstimator({clock,getRuns:getInputs,getActiveBatchIds:()=>{const id=queue.snapshot().activeBatchId;return id?[id]:[];},publish(id,value){void queue.saveEstimate(id,value).catch(()=>{});}});
      const restoredSummaries=await store.listSummaries(),mixedBatches=new Set(restoredSummaries.filter(hasMixedExecution).map(s=>s.batchId));
      for(const batch of queue.snapshot().batches)if(batch.estimate){if(mixedBatches.has(batch.batchId)){live.restore(batch.batchId,executionChangedEstimate(clock.now(),0,batch.status==='completed'));continue;}const {remainingMs,totalMs,referenceRemainingMs,referenceTotalMs,observedRemainingMs,...base}=batch.estimate;live.restore(batch.batchId,batch.estimate.algorithm==='estimate-v3'&&batch.estimate.state==='completed'?batch.estimate:batch.status==='pending'?{...base,state:'pending'}:batch.status==='completed'?batch.estimate:{...batch.estimate,state:'paused'});}
      for(const summary of restoredSummaries)if(summary.estimation){if(hasMixedExecution(summary)){live.restoreRun(summary.runId,summary.batchId,executionChangedEstimate(clock.now(),Object.values(summary.tracks).reduce((n,t)=>n+t.required,0),Object.values(summary.tracks).every(t=>t.status==='completed')));continue;}const current=summary.estimation.final??summary.estimation.current,batch=queue.snapshot().batches.find(b=>b.batchId===summary.batchId);const {remainingMs,totalMs,referenceRemainingMs,referenceTotalMs,observedRemainingMs,...base}=current;live.restoreRun(summary.runId,summary.batchId,current.algorithm==='estimate-v3'&&current.state==='completed'?current:batch?.status==='pending'?{...base,state:'pending'}:batch?.status==='completed'?current:{...current,state:'paused'});}
      if(!deps.prepareEnvironment&&(await readdir(join(store.root,'resources'))).length){
        const restore=()=>restorePreparedEnvironments({root:store.root,packageRoot:join(deps.packageResources,'..'),manifest,descriptors:defaultPreparation(),prepare:prepareEnvironment,stopped:()=>disposed,
          onPrepared(descriptor,candidate){environments.set(refsKey(descriptor.refs),candidate);},onError(descriptor,error){preparationErrors.set(refsKey(descriptor.refs),safeCode(error));}});
        if(backgroundEnvironment){
          const lease=activity.claim('prepare','startup-environment-check');preparing=true;
          environmentRecovery=restore().catch(error=>{for(const d of defaultPreparation())preparationErrors.set(refsKey(d.refs),safeCode(error));}).finally(()=>{preparing=false;lease.release();});
        }else await restore();
      }
    }catch(error){live?.dispose();await speed?.dispose().catch(()=>{});await queue?.dispose().catch(()=>{});await store.close().catch(()=>{});throw error;}
  }
  await bind(selected,true);
  function mutate<T>(action:()=>Promise<T>):Promise<T>{if(disposed)return Promise.reject(Object.assign(new Error(),{code:'SERVICE_DISPOSED'}));const task=mutations.then(action);mutations=task.catch(()=>{});return task;}
  function writable(){if(!store.writable)fail('HISTORY_READ_ONLY');}
  function inactive(){if(queue.snapshot().activeBatchId||preparing)fail('ROOT_BUSY');}
  function target(handle:unknown):TargetSnapshot {if(typeof handle!=='string'||!handles.has(handle))return fail('CONFIGURATION_EXPIRED');return structuredClone(handles.get(handle)!.snapshot);}
  function judge(handle:unknown):JudgeSnapshot{return {target:target(handle),rubricId:rubric.id,promptId:rubric.promptId};}
  function compactOperation(op:ReturnType<typeof cleanup.operation>){if(!op)return null;const {files,...safe}=op;return {...safe,failedFiles:files.filter(x=>x.state==='failed').length};}
  function requestFrom(payload:Record<string,unknown>):EvaluationRequest{
    if(!Array.isArray(payload.handles)||!payload.handles.length||payload.handles.length>20||!Array.isArray(payload.tracks)||!payload.execution||typeof payload.execution!=='object')fail('INVALID_REQUEST');
    if(payload.generalId!==undefined&&(typeof payload.generalId!=='string'||!/^[a-zA-Z0-9._-]{1,128}$/.test(payload.generalId)))fail('INVALID_REQUEST');
    return {...(typeof payload.generalId==='string'?{generalId:payload.generalId}:{}),targets:(payload.handles as unknown[]).map(target),tracks:payload.tracks as Track[],execution:{...payload.execution as EvaluationRequest['execution'],failurePolicy:OUTPUT_IDLE_POLICY},...(payload.judgeHandle?{judge:judge(payload.judgeHandle)}:{})};
  }
  const advisorDraftKey=(payload:Record<string,unknown>)=>identityHash({
    generalId:payload.generalId,handles:payload.handles,tracks:payload.tracks,judgeHandle:payload.judgeHandle,execution:payload.execution,
  });
  async function resolveAdvisorDraft(payload:Record<string,unknown>,usage:'read'|'start',signal?:AbortSignal){
    const request=requestFrom(payload);
    if(!request.tracks.length||new Set(request.tracks).size!==request.tracks.length||request.tracks.includes('writing')!==!!request.judge||
      ![1,2,3,4].includes(request.execution.concurrency)||!Number.isInteger(request.execution.callTimeoutMs)||
      request.execution.callTimeoutMs<1000||request.execution.callTimeoutMs>1800000||
      new Set(request.targets.map(fingerprintTarget)).size!==request.targets.length)return fail('INVALID_BATCH');
    const protocol=usage==='read'&&registry.forTimeAdvisor
      ?await registry.forTimeAdvisor(request.generalId??legacyRefs.generalId,request.tracks):await requestedProtocol(request);
    signal?.throwIfAborted();
    if(!isFiveCapabilitySchema(protocol.descriptor.general.schema))return {request,protocol};
    const choices=await deps.adapter.catalog();
    signal?.throwIfAborted();
    const ids=[...new Set([...(payload.handles as string[]),...(payload.judgeHandle?[String(payload.judgeHandle)]:[])])];
    const current=new Map(await Promise.all(ids.map(async id=>{
      const saved=handles.get(id),choice=saved&&choices.find(c=>c.scopeId===saved.snapshot.scopeId&&c.providerId===saved.snapshot.providerId&&c.modelId===saved.snapshot.modelId);
      if(!saved||!choice)return [id,undefined] as const;
      try{
        const fresh=structuredClone(await deps.adapter.snapshot(choice,saved.overrides));
        if(saved.deployment)fresh.deployment=structuredClone(saved.deployment);
        if(fingerprintTarget(fresh)===fingerprintTarget(saved.snapshot)&&identityHash(fresh.origin??null)===identityHash(saved.snapshot.origin??null))return [id,fresh] as const;
      }catch{/* A draft with an unverified model cannot authorize paid calls. */}
      return [id,{...saved.snapshot,routeTarget:{state:'unknown'} as const}] as const;
    })));
    signal?.throwIfAborted();
    const unknown=(saved:TargetSnapshot):TargetSnapshot=>({...saved,routeTarget:{state:'unknown'}});
    request.targets=request.targets.map((saved,index)=>current.get((payload.handles as string[])[index]!)??unknown(saved));
    if(request.judge)request.judge={...request.judge,target:current.get(String(payload.judgeHandle))??unknown(request.judge.target)};
    const scope=timeAdvisorScope(protocol,request);
    return {request,protocol,scope,scopeKey:identityHash({
      program:scope.program.hash,workload:scope.workload.workloadHash,machine:scope.machineKey,conditions:scope.conditions,
    })};
  }
  function checkTimeAdvisor(payload:Record<string,unknown>):Promise<TimeAdvisorResult>{
    // Older clients omit the budget and expect a thirty-second offer.
    const budgetMinutes='budgetMinutes' in payload?payload.budgetMinutes:.5;
    if(!validSpeedBudget(budgetMinutes))return fail('INVALID_REQUEST');
    const captured=store,epoch=rootEpoch,draftKey=advisorDraftKey(payload),key=identityHash([captured.rootId,epoch,draftKey,budgetMinutes]);
    if(advisorRead?.key===key)return advisorRead.promise;
    advisorRead?.controller.abort();
    const controller=new AbortController(),stale=()=>controller.signal.aborted||disposed||captured!==store||epoch!==rootEpoch||activity.snapshot()?.kind==='root-change';
    const read=async():Promise<TimeAdvisorResult>=>{
      const empty=(payload.handles as string[]).map(()=>({hasBaseline:false}));
      if(stale())return fail('COMPARISON_STALE');
      let draft:Awaited<ReturnType<typeof resolveAdvisorDraft>>;
      try{draft=await resolveAdvisorDraft(payload,'read',controller.signal);}
      catch(error){if(stale())return fail('COMPARISON_STALE');return {configs:empty,unavailable:safeCode(error)==='UNKNOWN_PROTOCOL'?'unsupported':'conditions'};}
      if(stale())return fail('COMPARISON_STALE');
      const {scope,request,protocol,scopeKey}=draft;
      if(!scope||!scope.workload.jobs.length)return {configs:empty,unavailable:'unsupported'};
      if(!scope.conditions.some(c=>c.known))return {configs:empty,unavailable:'conditions'};
      if(!timing.available)return {configs:empty,unavailable:'timing'};
      let evidence:Awaited<ReturnType<typeof readTimeAdvisorEvidence>>;
      try{evidence=await readTimeAdvisorEvidence(captured,timing.history,scope,clock.now(),controller.signal);}
      catch{if(stale())return fail('COMPARISON_STALE');return {configs:empty,unavailable:'timing'};}
      if(stale())return fail('COMPARISON_STALE');
      const {configs,evidenceKey}=evidence;
      if(scope.conditions.some(c=>!c.known))return {configs,unavailable:'conditions'};
      if(request.tracks.includes('general')&&!deps.adapter.generateTurn)return {configs,unavailable:'unsupported'};
      const paired=configs.filter(c=>c.hasBaseline).length;
      if(!captured.writable||!environments.has(environmentKey(protocol))||paired>0&&paired!==configs.length)return {configs};
      const callsPerConfig=probeCallLimit(request.tracks),offer:NonNullable<TimeAdvisorResult['offer']>={
        id:randomUUID(),intent:paired?'estimate':'collect',budgetMinutes,callsPerConfig,totalCalls:callsPerConfig*configs.length,
      };
      const now=clock.monotonicMs();
      for(const [id,entry] of advisorOffers)if(entry.expires<=now)advisorOffers.delete(id);
      if(advisorOffers.size>=100)advisorOffers.delete(advisorOffers.keys().next().value!);
      advisorOffers.set(offer.id,{...offer,rootId:captured.rootId,epoch,expires:now+advisorOfferLifetimeMs,draftKey,scopeKey:scopeKey!,evidenceKey});
      return {configs,offer};
    };
    const aborted=new Promise<never>((_,reject)=>controller.signal.addEventListener('abort',()=>{
      reject(Object.assign(new Error(),{code:controller.signal.reason==='timeout'?'TIME_ADVISOR_READ_TIMEOUT':'COMPARISON_STALE'}));
    },{once:true}));
    const deadline=setTimeout(()=>controller.abort('timeout'),advisorReadTimeoutMs);
    const entry={key,controller,promise:Promise.race([read(),aborted])};advisorRead=entry;
    const clear=()=>{clearTimeout(deadline);if(advisorRead===entry)advisorRead=undefined;};
    void entry.promise.then(clear,clear);
    return entry.promise;
  }
  async function startAdvisedPreview(payload:Record<string,unknown>){
    const id=String(payload.offerId),offer=advisorOffers.get(id);
    if(!offer)return fail('TIME_ADVISOR_OFFER_INVALID');
    advisorOffers.delete(id);
    const stale=()=>disposed||offer.rootId!==store.rootId||offer.epoch!==rootEpoch||offer.expires<=clock.monotonicMs();
    if(stale()||offer.draftKey!==advisorDraftKey(payload)||offer.intent!==payload.intent||offer.budgetMinutes!==payload.budgetMinutes)return fail('TIME_ADVISOR_OFFER_STALE');
    const verified=await (async()=>{
      try{
        const {request,protocol,scope,scopeKey}=await resolveAdvisorDraft(payload,'start');
        if(!scope||scopeKey!==offer.scopeKey||!timing.available||!store.writable||!environments.has(environmentKey(protocol))||
          request.tracks.includes('general')&&!deps.adapter.generateTurn||stale())return;
        const {configs,profiles,evidenceKey}=await readTimeAdvisorEvidence(store,timing.history,scope,clock.now());
        if(stale()||evidenceKey!==offer.evidenceKey||!configs.every(c=>c.hasBaseline===(offer.intent==='estimate'))||
          probeCallLimit(request.tracks)!==offer.callsPerConfig||request.targets.length*offer.callsPerConfig!==offer.totalCalls)return;
        return {request,protocol,profiles};
      }catch{/* Optional verification failing leaves the offer unusable. */}
    })();
    if(!verified)return fail('TIME_ADVISOR_OFFER_STALE');
    return speed.start({...verified.request,generalId:verified.protocol.generalId,budgetMinutes:offer.budgetMinutes},
      {protocol:verified.protocol,profiles:verified.profiles});
  }
  async function linkPreview(id:string,request:EvaluationRequest,protocol:ResolvedProtocolSet){
    const row=await speedHistory.read(id);
    if(!row||row.status!=='completed'||row.rootId!==store.rootId)return;
    const advanced=row.probeMethod==='speed-probe-v4';
    if(advanced&&!timing.available)return;
    const scope=advanced?timeAdvisorScope(protocol,request):undefined;
    const estimates:Record<string,RunEstimation>={};
    for(const [index,target] of request.targets.entries()){
      const config=matchingPreviewConfig(row,target,protocol.descriptor.refs,request.execution,request.tracks,request.judge);
      if(!config||config.status!=='completed'&&(config.status!=='stopped'||config.errorCode!=='SPEED_BUDGET_REACHED'))continue;
      if(scope&&(!config.probe||!scope.conditions[index]!.known||!await usablePreviewEvidence(timing.history,
        timingTraceScope(store.rootId,scope,scope.conditions[index]!.key),config.probe)))continue;
      const origin={...structuredClone(row),configs:[structuredClone(config)]};
      origin.estimate=previewEstimate(origin,protocol.items,clock.now());
      estimates[fingerprintTarget(target)]={originPreview:origin,current:origin.estimate};
    }
    if(Object.keys(estimates).length)request.initialEstimates=estimates;
  }
  async function finishEvaluation(batchId:string){
    await queue.idle();
    await live?.invalidate(batchId,'finish');
    const {runs:inputs}=await getInputs(batchId,true),batch=queue.snapshot().batches.find(value=>value.batchId===batchId)!;
    await store.exclusive(async tx=>{
      for(const input of inputs){
        const id=input.runId!,{summary}=await tx.getRun(id);
        const computed=estimateBatch({runs:[input],now:clock.now()});
        const current=(!batch.runControls?.[id]&&live?.snapshotRun(id))||computed;
        await tx.updateSummary(id,summary.revision,next=>{
          next.estimation={...next.estimation,current,...(computed.state==='completed'&&!next.estimation?.final?{final:computed}:{})};
        });
      }
    });
  }
  function followEvaluation(id:string,lease:ActivityLease):void{
    lease.identify(id);
    evaluationLease=lease;
    evaluationDone=finishEvaluation(id).then(()=>{
      lease.release();
      if(evaluationLease===lease)evaluationLease=undefined;
    },()=>lease.fault('QUEUE_STORAGE_FAILED'));
  }
  async function prepareResumedRuns(ids:readonly string[],admission:ProtocolAdmission):Promise<void> {
    const protocols:ResolvedProtocolSet[]=[];
    for(const id of ids){
      const {manifest,summary}=await store.getRun(id);
      if(Object.values(summary.tracks).every(track=>track.status==='completed'))continue;
      if(!summary.resumeAllowed||summary.details!=='available')fail('RUN_CANNOT_RESUME');
      const key=refsKey(manifest.protocols);
      let protocol=protocols.find(value=>refsKey(value)===key);
      if(!protocol){protocol=await admission.resolve(manifest.protocols);protocols.push(protocol);}
      if(manifest.protocols.writingId===LEGACY_WRITING_ID&&summary.tracks.writing&&protocol.items.filter(q=>q.track==='writing').length!==summary.tracks.writing.required)fail('ARCHIVED_WRITING_UNAVAILABLE');
    }
    for(const protocol of protocols)await ensurePrepared(protocol);
  }
  async function refreshedPreview(row:import('./estimation/contracts.ts').SpeedSession){
    if(row.probeMethod==='speed-probe-v4')return row;
    if(['running','stopping'].includes(row.status))return row;
    try{return {...row,estimate:previewEstimate(row,(await registry.resolve(row.configs[0]!.protocols)).items,clock.now())};}
    catch{return {...row,estimate:undefined};} // retain unreadable-protocol history without a stale full estimate
  }
  async function finishSpeed(id:string,lease:ActivityLease){try{try{await speed.idle();}catch{/* failed session already holds its safe diagnostic */}const row=await speedHistory.read(id);if(row)await speedHistory.save({...row,estimate:previewEstimate(row,(await registry.resolve(row.configs[0]!.protocols)).items,clock.now())},row.revision);lease.release();}catch{lease.fault('SPEED_STORAGE_FAILED');}finally{if(speedLease===lease)speedLease=undefined;}}
  async function operate(action:Action,payload:Record<string,unknown>):Promise<unknown> {
    if(disposed)fail('SERVICE_DISPOSED');
    switch(action){
      case 'status':return {apiVersion:1,timeAdvisorVersion:1,ready:true,codingDiagnostics:coding.settings(),timingAvailable:timing.available,rootId:store.rootId,rootEpoch,prepared:environments.size>0,preparing,writable:store.writable,rootPath:store.root,resourceVersion:manifest.resourceVersion,generalId:manifest.generalId,writingId:manifest.writingId,packageBytes:manifest.files.reduce((n,x)=>n+x.size,0),hostVerification:'unverified',...(protocolError?{protocolError}:{}),activeActivity:activity.snapshot()};
      case 'setCodingDiagnostics':return mutate(()=>coding.setEnabled(payload.enabled as boolean));
      case 'startCodingDiagnostic':return mutate(async()=>{writable();inactive();return coding.start(String(payload.runId),String(payload.itemId));});
      case 'codingDiagnostic':return readBound(async()=>coding.read(String(payload.runId),String(payload.itemId)));
      case 'cancelCodingDiagnostic':{
        const result=coding.cancel(String(payload.diagnosticId));
        if(result.status==='stopping'&&activity.snapshot()?.kind==='coding-diagnostic'&&activity.snapshot()?.id===payload.diagnosticId)codingLease?.stopping();
        return result;
      }
      case 'comparisonMetadata':{
        const captured=store,epoch=rootEpoch,stale=()=>disposed||store!==captured||rootEpoch!==epoch||activity.snapshot()?.kind==='root-change';
        if(stale())return fail('COMPARISON_STALE');
        try{const result=await readComparisonMetadata(captured,epoch);if(stale())return fail('COMPARISON_STALE');return result;}
        catch(error){if(stale())return fail('COMPARISON_STALE');throw error;}
      }
      case 'protocolCatalog':return protocolCatalog();
      case 'catalog':return deps.adapter.catalog();
      case 'settings':return {rootPath:store.root,writable:store.writable,prepared:environments.size>0,preparing,bytes:[...new Map([...environments.values()].map(e=>[e.resourcesPath,e])).values()].reduce((n,e)=>n+e.bytes,0),execution:{concurrency:4,callTimeoutMs:300000},rubricId:rubric.id,judgePromptId:rubric.promptId};
      case 'snapshot':{
        const captured=store,epoch=rootEpoch;
        const choice=(await deps.adapter.catalog()).find(x=>x.providerId===payload.providerId&&x.modelId===payload.modelId);if(!choice)return fail('MODEL_NOT_CONFIGURED');
        const overrides=(payload.overrides??{}) as Record<string,ParamValue>;if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))return fail('INVALID_PARAMETER');
        for(const value of Object.values(overrides))if(!value||!['known','unset'].includes(value.state)||value.state==='known'&&value.source!=='override')return fail('INVALID_PARAMETER');
        const snapshot=structuredClone(await deps.adapter.snapshot(choice,overrides));
        let deployment:TargetSnapshot['deployment'];
        if(payload.deployment!==undefined){if(typeof payload.deployment!=='string'||payload.deployment.length>100)return fail('INVALID_PARAMETER');if(payload.deployment.trim())snapshot.deployment=deployment={value:payload.deployment.trim(),source:'user'};}
        if(disposed||captured!==store||epoch!==rootEpoch||activity.snapshot()?.kind==='root-change')return fail('COMPARISON_STALE');
        const fingerprint=fingerprintTarget(snapshot),handle=randomUUID();handles.set(handle,{snapshot:structuredClone(snapshot),overrides:structuredClone(overrides),...(deployment?{deployment}:{})});if(handles.size>1000)handles.delete(handles.keys().next().value!);
        return {handle,target:snapshot,fingerprint};
      }
      case 'prepare':return mutate(async()=>{
        writable();inactive();
        if(payload.expectedRootId!==undefined&&(payload.expectedRootId!==store.rootId||payload.expectedRootEpoch!==rootEpoch))fail('COMPARISON_STALE');
        const requested = payload.generalId === undefined ? undefined : await requestedProtocol({generalId:String(payload.generalId)});
        const descriptors = requested
          ? registry.list().filter(d => d.allowNewRuns && d.refs.resourceVersion === requested.resourceVersion)
          : defaultPreparation();
        if (!descriptors.length) fail('PROTOCOL_UNAVAILABLE');
        const prepared = new Map<string,PreparedEnvironment>();
        let firstError: string | undefined;
        preparing = true;
        try {
          for (const descriptor of descriptors) {
            const version = descriptor.refs.resourceVersion;
            try {
              if (requested?.generalId !== descriptor.refs.generalId) await registry.resolve(descriptor.refs);
              prepared.set(version, await prepareDescriptor(descriptor, prepared.get(version)));
            } catch (error) {
              const code = safeCode(error);
              environments.delete(refsKey(descriptor.refs));
              preparationErrors.set(refsKey(descriptor.refs), code);
              firstError ??= code;
            }
          }
          if (!prepared.size) fail(firstError ?? 'ENVIRONMENT_NOT_PREPARED');
          const values = [...prepared.values()];
          return {prepared:true,bytes:values.reduce((n,e)=>n+e.bytes,0),cached:values.every(e=>e.cached),protocols:protocolCatalog()};
        } finally { preparing = false; }
      });
      case 'setRoot':return mutate(async()=>{inactive();advisorRead?.controller.abort();if(typeof payload.path!=='string')return fail('INVALID_REQUEST');const selection=await switchRoot(payload.path,{writing:false});if(selection.path===store.root)return {rootPath:store.root};
        const oldRoot=store.root;await experiment?.dispose();experiment=undefined;live?.dispose();await speed.dispose();await queue.dispose();await store.close();
        try{await bind(selection.path);await writeRecord(preference,{root:store.root});}catch(error){await queue?.dispose().catch(()=>{});await store?.close().catch(()=>{});await bind(oldRoot);throw error;}return {rootPath:store.root,previousRoot:oldRoot,historyMoved:false};});
      case 'createBatch':return mutate(async()=>{writable();const request=requestFrom(payload);
        if(typeof payload.parallelModels==='number'&&payload.parallelModels>1)request.execution.parallelModels=payload.parallelModels;
        if(Array.isArray(payload.modelConcurrency))request.modelConcurrency=payload.modelConcurrency;const admission=createProtocolAdmission(registry),selected=await requestedProtocol(request,admission);
        if (request.tracks.length===1 && request.tracks[0]==='writing' && request.judge) await ensurePrepared(selected);
        else requirePrepared(selected);
        request.generalId=selected.generalId;
        if(payload.previewId&&!request.execution.parallelModels&&!request.modelConcurrency?.some(value=>value!==request.execution.concurrency))try{await linkPreview(String(payload.previewId),request,selected);}catch{/* Optional timing evidence cannot block a formal run. */}
        return queue.enqueue(request,admission);
      });
      case 'commitEditionUpgrade':return mutate(async()=>{
        writable();inactive();const token=String(payload.token),entry=editionTokens.get(token);if(!entry||entry.rootId!==store.rootId||entry.rootEpoch!==rootEpoch)fail('EDITION_TOKEN_INVALID');
        if(entry!.expiresMonotonic<=clock.monotonicMs())fail('EDITION_PREVIEW_EXPIRED');if(!entry!.check.eligible)fail(entry!.check.reasonCode??'EDITION_SOURCE_INCOMPLETE');
        const destination=await requestedProtocol({generalId:entry!.destinationGeneralId});requirePrepared(destination);const current=await currentTarget(entry!.handle),fresh=await editionCheck(entry!.sourceRunId,destination,current);
        if(!fresh.check.eligible||identityHash(fresh.check)!==identityHash(entry!.check))fail('EDITION_PREVIEW_STALE');
        entry!.confirmedAt??=clock.now();
        const result=await createEditionReuseHistory(store).import(fresh.check,{token,target:current,protocol:destination,sourceProtocol:fresh.sourceProtocol,map:fresh.map,confirmedAt:entry!.confirmedAt,execution:entry!.execution}),{manifest}=await store.getRun(result.runId);
        await queue.attachImported({batchId:result.batchId,runIds:[result.runId],createdAt:manifest.createdAt,status:'queued',execution:entry!.execution},result.runId,result.operationId);entry!.result=result;void live?.invalidate(result.batchId,'resume').catch(()=>{});return result;
      });
      case 'previewEditionUpgrade':return mutate(async()=>{
        writable();inactive();const destination=await requestedProtocol({generalId:String(payload.destinationGeneralId)});requirePrepared(destination);
        const current=await currentTarget(payload.handle),{check}=await editionCheck(String(payload.sourceRunId),destination,current),token=randomUUID(),expiresAt=new Date(Date.parse(clock.now())+300000).toISOString();
        editionTokens.set(token,{rootId:store.rootId,rootEpoch,handle:String(payload.handle),sourceRunId:String(payload.sourceRunId),destinationGeneralId:destination.generalId,execution:{...structuredClone(payload.execution as EvaluationRequest['execution']),failurePolicy:OUTPUT_IDLE_POLICY},check,expiresAt,expiresMonotonic:clock.monotonicMs()+300000});
        for(const [id,entry] of editionTokens)if(!entry.result&&entry.expiresMonotonic<=clock.monotonicMs())editionTokens.delete(id);
        return {token,expiresAt,check} satisfies EditionUpgradePreview;
      });
      case 'previewUpgrade':return mutate(async()=>{
        writable();inactive();const deep=await requestedProtocol({generalId:String(payload.deepGeneralId)});requirePrepared(deep);
        const current=await currentTarget(payload.handle),check=await upgradeCheck(String(payload.sourceRunId),deep,current),token=randomUUID(),expiresAt=new Date(Date.parse(clock.now())+300000).toISOString();
        upgradeTokens.set(token,{rootId:store.rootId,rootEpoch,handle:String(payload.handle),sourceRunId:String(payload.sourceRunId),deepGeneralId:deep.generalId,execution:{...structuredClone(payload.execution as EvaluationRequest['execution']),failurePolicy:OUTPUT_IDLE_POLICY},check,expiresAt,expiresMonotonic:clock.monotonicMs()+300000});
        for(const [id,entry] of upgradeTokens)if(!entry.result&&entry.expiresMonotonic<clock.monotonicMs())upgradeTokens.delete(id);
        return {token,expiresAt,check} satisfies UpgradePreview;
      });
      case 'commitUpgrade':return mutate(async()=>{
        writable();inactive();const token=String(payload.token),entry=upgradeTokens.get(token);if(!entry||entry.rootId!==store.rootId||entry.rootEpoch!==rootEpoch)fail('UPGRADE_TOKEN_INVALID');
        if(entry!.expiresMonotonic<=clock.monotonicMs())fail('UPGRADE_PREVIEW_EXPIRED');if(!entry!.check.eligible)fail(entry!.check.reasonCode??'UPGRADE_SOURCE_INCOMPLETE');
        const deep=await requestedProtocol({generalId:entry!.deepGeneralId});requirePrepared(deep);const current=await currentTarget(entry!.handle),check=await upgradeCheck(entry!.sourceRunId,deep,current);
        if(!check.eligible)fail(check.reasonCode==='UPGRADE_TARGET_CHANGED'?'UPGRADE_TARGET_CHANGED':'UPGRADE_PREVIEW_STALE');
        if(check.sourceRevision!==entry!.check.sourceRevision||check.sourceEvidenceHash!==entry!.check.sourceEvidenceHash||check.destinationEvidenceHash!==entry!.check.destinationEvidenceHash||check.targetBindingHash!==entry!.check.targetBindingHash)fail('UPGRADE_PREVIEW_STALE');
        const result=await createReuseHistory(store).import(check,{token,target:current,protocol:deep,execution:entry!.execution}),{manifest}=await store.getRun(result.runId);
        await queue.attachImported({batchId:result.batchId,runIds:[result.runId],createdAt:manifest.createdAt,status:'queued',execution:entry!.execution},result.runId,result.operationId);entry!.result=result;void live?.invalidate(result.batchId,'resume').catch(()=>{});return result;
      });
      case 'queue':{
        const view=queue.snapshot(),activeId=view.activeBatchId;
        const activeBatch=view.batches.find(batch=>batch.batchId===activeId);
        const scope=activeId&&activeBatch&&!usesCustomScheduling(activeBatch)?queue.activeWork(activeId):undefined;
        const rough=scope&&activeId?live?.roughSnapshot(activeId):undefined;
        return {...view,...(scope?{roughWork:{batchId:activeId!,excludesDeferredWork:scope.excludesDeferredWork,estimate:rough,
          ...(scope.sampling?{sampling:{ready:scope.sampling.ready,total:scope.sampling.total}}:{})}}:{}),
          estimates:Object.fromEntries(view.batches.flatMap(b=>{if(usesCustomScheduling(b))return [];const e=live?.snapshot(b.batchId)??b.estimate;return e?[[b.batchId,e]]:[];}))};
      }
      case 'pause':return mutate(async()=>{let estimate:Promise<void>|undefined;if(queue.snapshot().activeBatchId===payload.batchId){evaluationLease?.stopping();estimate=live?.invalidate(String(payload.batchId),'pause').catch(()=>{});}await queue.pause(String(payload.batchId));await estimate;await evaluationDone;return queue.snapshot();});
      case 'rejudge':return mutate(async()=>{
        writable();
        await queue.rejudge(String(payload.batchId),String(payload.operationId));
        return queue.snapshot();
      });
      case 'setRunConcurrency':return mutate(async()=>{
        writable();
        const batchId=String(payload.batchId),current=activity.snapshot();
        if(current&&(current.kind!=='evaluation'||current.state!=='running'||current.id!==batchId))fail('ACTIVITY_BUSY');
        await queue.setRunConcurrency(batchId,String(payload.runId),payload.concurrency as EvaluationRequest['execution']['concurrency']);
        void live?.invalidate(batchId,'scope').catch(()=>{});
        return queue.snapshot();
      });
      case 'controlRuns':return mutate(async()=>{
        writable();
        const batchId=String(payload.batchId),current=activity.snapshot();
        if(current&&(current.kind!=='evaluation'||current.state!=='running'||current.id!==batchId||
          queue.snapshot().activeBatchId!==batchId))fail('ACTIVITY_BUSY');
        const operation=payload.operation as 'hold'|'resume';
        const lease=!current&&operation==='resume'?activity.claim('evaluation',batchId):undefined;
        let following=false;
        try{
          await queue.controlRuns(batchId,payload.runIds as string[],operation,prepareResumedRuns,OUTPUT_IDLE_POLICY);
          if(lease){followEvaluation(batchId,lease);following=true;}
          void live?.invalidate(batchId,lease?'resume':'scope').catch(()=>{});
          return queue.snapshot();
        }finally{if(!following)lease?.release();}
      });
      case 'controlRun':return mutate(async()=>{
        writable();
        const batchId=String(payload.batchId),runId=String(payload.runId);
        const operation=payload.operation as import('./jobs/queue.ts').RunOperation;
        const current=activity.snapshot();
        if(current&&(current.kind!=='evaluation'||current.state!=='running'||current.id!==batchId||
          queue.snapshot().activeBatchId!==batchId))fail('ACTIVITY_BUSY');
        const lift=operation==='resume'||operation==='rejoin';
        const lease=!current&&lift?activity.claim('evaluation',batchId):undefined;
        let following=false;
        try{
          await queue.controlRun(batchId,runId,operation,!!lease,prepareResumedRuns,OUTPUT_IDLE_POLICY);
          if(lease&&queue.snapshot().activeBatchId===batchId){
            followEvaluation(batchId,lease);
            following=true;
          }
          void live?.invalidate(batchId,lease&&following?'resume':'scope').catch(()=>{});
          return queue.snapshot();
        }finally{if(!following)lease?.release();}
      });
      case 'resume':return mutate(async()=>{
        writable();
        const batchId=String(payload.batchId),batch=queue.snapshot().batches.find(value=>value.batchId===batchId);
        if(!batch)return fail('BATCH_NOT_FOUND');
        const admission=createProtocolAdmission(registry);
        await prepareResumedRuns(dispatchableRunIds(batch),admission);
        await queue.resume(batchId,payload.judgeHandle?judge(payload.judgeHandle):undefined,OUTPUT_IDLE_POLICY,admission);
        void live?.invalidate(batchId,'resume').catch(()=>{});
        return queue.snapshot();
      });
      case 'checkTimeAdvisor':return checkTimeAdvisor(payload);
      case 'startSpeedPreview':return mutate(()=>startAdvisedPreview(payload));
      case 'speedPreviewStatus':{const row=await speedHistory.read(String(payload.previewId));if(!row)fail('PREVIEW_NOT_FOUND');const current=activity.snapshot();if(current?.kind==='speed-preview'&&current.id===row!.previewId&&current.state==='stopping')row!.status='stopping';return refreshedPreview(row!);}
      case 'cancelSpeedPreview':{writable();const id=String(payload.previewId),current=activity.snapshot();if(current?.kind==='speed-preview'&&current.id===id){speedLease?.stopping();await speed.cancel(id);return {accepted:true,status:'stopping'};}const row=await speedHistory.read(id);if(!row)fail('PREVIEW_NOT_FOUND');return {accepted:true,status:row!.status};}
      case 'speedHistory':{const rows=await speedHistory.list();return Promise.all(rows.map(refreshedPreview));}
      case 'speedHistoryUsage':return readBound(async captured=>({previews:await createSpeedHistory(captured).measure()}));
      case 'timingHistory':if(!timing.available)fail('TIMING_UNAVAILABLE');return readBound(async captured=>{const read=async()=>{const h=createTimingTraceHistory(captured),rows=await h.list(),measurement=await h.measure();return {...measurement,groups:timingGroups(rows)};};return captured.writable?captured.exclusive(read):read();});
      case 'previewTimingCleanup':return mutate(async()=>{writable();inactive();if(!timing.available)fail('TIMING_UNAVAILABLE');return timing.history.previewCleanup(timingCleanupIds(timingGroups(await timing.history.list()),payload.groupIds as string[]),{protectReferences:true});});
      case 'commitTimingCleanup':return mutate(async()=>{writable();inactive();if(!timing.available)fail('TIMING_UNAVAILABLE');return timing.history.commitCleanup(String(payload.token));});
      case 'previewSpeedCleanup':return mutate(()=>speedCleanup.preview(payload.previewIds as string[]));
      case 'commitSpeedCleanup':return mutate(async()=>{const op=await speedCleanup.commit(String(payload.token));const {files,...safe}=op;return {...safe,failedFiles:files.filter(f=>f.state==='failed').length};});
      case 'speedCleanupStatus':{const op=await speedCleanup.status(String(payload.token));if(!op)return null;const {files,...safe}=op;return {...safe,failedFiles:files.filter(f=>f.state==='failed').length};}
      case 'history':return store.listSummaries();
      case 'comparisonCommon':return readBound(async captured=>{
        const runIds=payload.runIds as string[],referenceIds=(payload.referenceIds??[]) as string[];
        if(!captured.writable)return {runIds,reasonCode:'COMMON_HISTORY_READ_ONLY'};
        let references:readonly ReferenceItemEvidence[]=[];
        if(referenceIds.length){
          try{const bundled=await deps.referenceEvidence?.()??[];references=referenceIds.flatMap(id=>bundled.filter(r=>r.referenceId===id));if(references.length!==referenceIds.length)return {runIds,referenceIds,reasonCode:'COMMON_REFERENCE_UNAVAILABLE'};}
          catch{return {runIds,referenceIds,reasonCode:'COMMON_REFERENCE_UNAVAILABLE'};}
        }
        const records=await Promise.allSettled(runIds.map(id=>captured.getRun(id))),previous=[];
        for(const result of records){if(result.status==='rejected')throw result.reason;previous.push(result.value);}
        const unique=new Map([...previous.map(r=>[protocolKey(r.manifest.protocols),r.manifest.protocols] as const),...references.map(r=>[protocolKey(r.protocols),r.protocols] as const)]);
        if(unique.size!==2)return {runIds,reasonCode:unique.size===1?'COMMON_SAME_EDITION':'COMMON_VERSION_UNSUPPORTED'};
        let resolved:ResolvedProtocolSet[],versions:ResolvedProtocolSet[],declarations:readonly EditionMap[];
        try{
          const results=await Promise.allSettled([...unique].map(async([key,refs])=>[key,await registry.resolve(refs)] as const)),loaded=new Map<string,ResolvedProtocolSet>();
          for(const result of results){if(result.status==='rejected')throw result.reason;loaded.set(...result.value);}
          resolved=previous.map(r=>loaded.get(protocolKey(r.manifest.protocols))!);versions=[...loaded.values()];declarations=await (deps.editionMaps?.()??readEditionDeclarations(join(deps.packageResources,'..')));
        }
        catch{return {runIds,reasonCode:'COMMON_PROTOCOL_UNAVAILABLE'};}
        const first=versions[0]!,other=versions.find(p=>protocolKey(p.descriptor.refs)!==protocolKey(first.descriptor.refs));
        if(!other)return {runIds,reasonCode:'COMMON_SAME_EDITION'};
        let map:EditionMap|undefined;try{map=resolveEditionMap(first,other,declarations);}catch{return {runIds,reasonCode:'COMMON_MAP_INVALID'};}
        if(!map||resolved.some(p=>![protocolKey(map!.fromRefs),protocolKey(map!.toRefs)].includes(protocolKey(p.descriptor.refs))))return {runIds,reasonCode:'COMMON_VERSION_UNSUPPORTED'};
        return captured.exclusive(async tx=>{
          const errors=new Set<string>(),sources=[];
          for(const [index,runId] of runIds.entries()){
            const run=await tx.getRun(runId);let items:Awaited<ReturnType<typeof readCommonEvidence>>=[];
            try{items=await readCommonEvidence(tx,runId,map!.common);}catch{errors.add(runId);}
            sources.push({...run,items,protocol:resolved[index]!});
          }
          const projection=projectCommonItems(map!,sources);
          projection.runs=projection.runs.map(row=>errors.has(row.runId)?{runId:row.runId,available:false,reasonCode:'COMMON_SOURCE_CORRUPT'}:row);
          projection.runs.push(...references.map(r=>projectReferenceCommon(map!,r)));
          projection.comparable=projection.runs.length>=2&&projection.runs.every(r=>r.available)&&map!.domains.every(d=>d.itemIds.length>0);
          projection.atCeiling=projection.comparable&&projection.runs.every(r=>r.available&&r.domains.every(d=>d.passed===d.required));
          return {runIds,referenceIds,revisions:sources.map(s=>({runId:s.manifest.runId,revision:s.summary.revision})),projection};
        });
      });
      case 'report':return readBound(async captured=>{
        const run=await captured.getRun(String(payload.runId));
        const current=live?.snapshotRun(run.summary.runId);
        if(current)run.summary.estimation={...run.summary.estimation,current};
        const header={summary:run.summary,...(run.manifest.execution?{execution:run.manifest.execution}:{})};
        if(payload.includeQuestions===false)return header;
        const records=run.summary.details==='available'?await captured.listItems(run.summary.runId):[];
        const byId=new Map(records.map(item=>[item.itemId,item]));
        return {...header,questions:run.manifest.requiredItems.map(question=>{
          const item=byId.get(question.id);
          return {...question,answered:!!item?.answer?.complete,grade:item?.grade??null};
        })};
      });
      case 'item':return readBound(async captured=>{
        const runId=String(payload.runId),id=String(payload.itemId),{manifest:runManifest}=await captured.getRun(runId);
        if(!runManifest.requiredItems.some(x=>x.id===id))return fail('ITEM_NOT_IN_PROTOCOL');
        const item=await captured.getItem(runId,id);let question=item?.question;
        if(!question)try{question=(await resolveProtocolForRead(registry,runManifest.protocols)).items.find(x=>x.id===id);}catch{/* Historical records stay readable; unknown refs never borrow current questions. */}
        return {question:question?{id:question.id,track:question.track,datasetId:question.datasetId,sourceId:question.sourceId,sourceHash:question.sourceHash,prompt:question.prompt}:null,item:item??null};
      });
      case 'usage':return cleanup.measureHistory();
      case 'formalHistoryUsage':return readBound(async captured=>({runs:await measureRunUsage(captured)}));
      case 'previewCleanup':return mutate(()=>cleanup.previewCleanup(payload.batchIds as string[]));
      case 'commitCleanup':return mutate(async()=>compactOperation(await cleanup.commitCleanup(String(payload.token))));
      case 'cleanupStatus':return compactOperation(cleanup.operation(String(payload.token)));
    }
  }
  async function readBound<T extends object>(read:(captured:HistoryStore)=>Promise<T>){
    const captured=store,epoch=rootEpoch,stale=()=>disposed||store!==captured||rootEpoch!==epoch||activity.snapshot()?.kind==='root-change';
    if(stale())return fail('COMPARISON_STALE');
    try{const value=await read(captured);if(stale())return fail('COMPARISON_STALE');return {...value,rootId:captured.rootId,rootEpoch:epoch};}
    catch(error){if(stale())return fail('COMPARISON_STALE');throw error;}
  }
  const activityKinds:Partial<Record<Action,ActivityKind>>={startCodingDiagnostic:'coding-diagnostic',setCodingDiagnostics:'coding-diagnostic',prepare:'prepare',setRoot:'root-change',createBatch:'evaluation',resume:'evaluation',rejudge:'evaluation',previewUpgrade:'upgrade',commitUpgrade:'upgrade',previewEditionUpgrade:'upgrade',commitEditionUpgrade:'upgrade',previewCleanup:'cleanup',commitCleanup:'cleanup',startSpeedPreview:'speed-preview',previewSpeedCleanup:'cleanup',commitSpeedCleanup:'cleanup',previewTimingCleanup:'cleanup',commitTimingCleanup:'cleanup'};
  async function dispatchWithActivity(action:Action,payload:Record<string,unknown>):Promise<unknown>{
    if(disposed)fail('SERVICE_DISPOSED');const kind=activityKinds[action],lease=kind?activity.claim(kind,randomUUID()):undefined;let held=false;
    try{const result=await operate(action,payload);if(lease&&(kind==='evaluation'||action==='commitUpgrade'||action==='commitEditionUpgrade')){const id=action==='createBatch'||action==='commitUpgrade'||action==='commitEditionUpgrade'?(result as {batchId:string}).batchId:String(payload.batchId);held=true;followEvaluation(id,lease);}else if(lease&&kind==='speed-preview'){const id=(result as {previewId:string}).previewId;lease.identify(id);held=true;speedLease=lease;speedDone=finishSpeed(id,lease);}else if(lease&&action==='startCodingDiagnostic'){
      lease.identify((result as {diagnosticId:string}).diagnosticId);held=true;codingLease=lease;
      codingDone=coding.idle().finally(()=>{lease.release();if(codingLease===lease)codingLease=undefined;});
    }return result;}finally{if(!held)lease?.release();}
  }
  async function dispatch(action:Action,payload:Record<string,unknown>):Promise<unknown>{
    if(disposed)fail('SERVICE_DISPOSED');validateEnvelope({schemaVersion:1,requestId:'service',action,payload});
    if(action==='comparisonCommon'){
      const key=identityHash({rootId:store.rootId,rootEpoch,runIds:payload.runIds,referenceIds:payload.referenceIds??[]});
      if(commonRead)return commonRead.key===key?commonRead.promise:readBound(async()=>({runIds:payload.runIds,reasonCode:'COMMON_READ_BUSY'}));
      const entry={key,promise:dispatchWithActivity(action,payload)};commonRead=entry;
      const clear=()=>{if(commonRead===entry)commonRead=undefined;};void entry.promise.then(clear,clear);return entry.promise;
    }
    if(action==='commitEditionUpgrade'){
      if(activity.snapshot()?.kind==='root-change')fail('COMPARISON_STALE');writable();const token=String(payload.token),entry=editionTokens.get(token);
      if(entry?.result&&entry.rootId===store.rootId&&entry.rootEpoch===rootEpoch)return structuredClone(entry.result);
      const key='edition:'+token,pending=committing.get(key);if(pending)return pending;
      if(!entry){const bound=await readBound(async captured=>{const operation=await createEditionReuseHistory(captured).operation(token);if(operation?.state!=='ready')return fail('EDITION_TOKEN_INVALID');return {commit:{batchId:operation.destinationBatchId,runId:operation.destinationRunId,operationId:operation.operationId} satisfies UpgradeCommit};});return bound.commit;}
      const promise=dispatchWithActivity(action,payload).finally(()=>committing.delete(key));committing.set(key,promise);return promise;
    }
    if(action!=='commitUpgrade')return dispatchWithActivity(action,payload);
    if(activity.snapshot()?.kind==='root-change')fail('COMPARISON_STALE');
    writable();const token=String(payload.token),entry=upgradeTokens.get(token);if(entry?.result&&entry.rootId===store.rootId&&entry.rootEpoch===rootEpoch)return structuredClone(entry.result);
    const pending=committing.get(token);if(pending)return pending;
    if(!entry){const bound=await readBound(async captured=>{const operation=await createReuseHistory(captured).operation(token);if(operation?.state!=='ready')return fail('UPGRADE_TOKEN_INVALID');return {commit:{batchId:operation.destinationBatchId,runId:operation.destinationRunId,operationId:operation.operationId} satisfies UpgradeCommit};});return bound.commit;}
    const promise=dispatchWithActivity(action,payload).finally(()=>committing.delete(token));committing.set(token,promise);return promise;
  }
  return {get experiment(){return experiment;},dispatch,async dispose(){if(disposed)return;disposed=true;advisorRead?.controller.abort();advisorOffers.clear();await experiment?.dispose();live?.dispose();evaluationLease?.stopping();speedLease?.stopping();codingLease?.stopping();const stopping=Promise.all([queue.dispose(),speed.dispose(),coding.dispose()]);await mutations;await environmentRecovery;await commonRead?.promise.catch(()=>{});await stopping;await evaluationDone;await speedDone;await codingDone;await store.close();}};
}

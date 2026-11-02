import {createSpeedHistory,type SpeedHistory} from './history/speed.ts';
import {createSpeedCleanup} from './history/speed-cleanup.ts';
import {createSpeedRunner} from './speed/runner.ts';
import {speedClock,type SpeedClock} from './speed/clock.ts';
import {createLiveEstimator} from './estimation/live.ts';
import {previewEstimate,previewInputs,matchingPreviewConfig,runInput,addHistoryPriors} from './estimation/inputs.ts';
import {estimateBatch} from './estimation/engine.ts';
import type {EstimateSnapshot,EstimationRunInput,SpeedSession,RunEstimation} from './estimation/contracts.ts';
import {createActivityGate,type ActivityKind,type ActivityLease} from './jobs/activity.ts';
import {join} from 'node:path';import {access,readFile} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';
import type {HostAdapter,JudgeSnapshot,ParamValue,TargetSnapshot,Track,EvaluationRequest,UpgradeCheck,UpgradePreview,UpgradeCommit,ProtocolDescriptor,ProtocolCatalogItem} from './contracts.ts';
import {defaultRoot,switchRoot,prepareResources,prepareProtocolResources,type PreparedEnvironment} from './resources/prepare.ts';import {readResourceManifest,loadProtocolSet} from './evaluation/protocols.ts';
import {readRecord,writeRecord} from './history/atomic.ts';import {openHistory,type HistoryStore} from './history/store.ts';import {createCleanup} from './history/cleanup.ts';
import {createQueue,type EvaluationQueue} from './jobs/queue.ts';import {gradeGeneral} from './evaluation/grade-general.ts';import {createCodeRunner} from './runtime/runner.ts';import {createRuleGrader} from './runtime/rule-grader.ts';import {createWritingGrader,type WritingRubric} from './writing/judge.ts';
import {validateEnvelope,type Action} from './host/api.ts';import {fingerprintTarget} from './model/identity.ts';import {RESOURCE_MANIFEST_SHA256} from './resources/pins.ts';
import {selfcheckEnvironment} from './resources/selfcheck.ts';
import {readComparisonMetadata} from './comparison/project.ts';
import {createProtocolRegistry} from './evaluation/registry.ts';
import type {ProtocolRegistry,ResolvedProtocolSet} from './evaluation/tier-contracts.ts';
import {identityHash,protocolKey} from './evaluation/protocol-identity.ts';
import {createContestRunner} from './runtime/contest-runner.ts';
import {CONTEST_SCORING_LIMITS} from './evaluation/contest-budget.ts';
import {createReuseHistory,readUpgradeItems} from './history/reuse.ts';
import {checkUpgrade} from './evaluation/reuse-eligibility.ts';
import {reuseTargetBinding} from './model/reuse-identity.ts';
import {readProtocolCatalog} from './resources/catalog.ts';
import {createToolDispatcher} from './runtime/tool-dispatcher.ts';import {createToolSessionRunner,type ToolSessionInput} from './host/tool-session.ts';
const fail=(code:string):never=>{throw Object.assign(new Error(code),{code});};
export interface ServiceDependencies {adapter:HostAdapter;packageResources:string;scopeId:string;initialRoot?:string;controlRoot?:string;clock?:SpeedClock;registry?:ProtocolRegistry;prepareEnvironment?:(rootPath:string,descriptor?:ProtocolDescriptor)=>Promise<PreparedEnvironment>}
export async function createEvaluationService(deps:ServiceDependencies) {
  const manifest=await readResourceManifest(deps.packageResources),protocols=await loadProtocolSet(deps.packageResources),rubric=JSON.parse(await readFile(join(deps.packageResources,'protocols','rubric-writing-v1.json'),'utf8')) as WritingRubric;
  const legacyRefs={generalId:protocols.generalId,writingId:protocols.writingId,resourceVersion:protocols.resourceVersion};
  const refsKey=(p:{generalId:string;writingId:string;resourceVersion:string})=>protocolKey({generalId:p.generalId,writingId:p.writingId,resourceVersion:p.resourceVersion});
  let registry:ProtocolRegistry,protocolError:string|undefined;
  try{registry=deps.registry??await createProtocolRegistry(join(deps.packageResources,'..'));}
  catch{protocolError='PROTOCOL_UNAVAILABLE';registry={list:()=>[],async resolve(){return fail('PROTOCOL_UNAVAILABLE');},async forNewRun(){return fail('PROTOCOL_UNAVAILABLE');}};}
  const environments=new Map<string,PreparedEnvironment>();
  const preparationErrors=new Map<string,string>();
  const control=(await switchRoot(deps.controlRoot??deps.initialRoot??defaultRoot(),{writing:false})).path;
  const preference=join(control,`selection-${createHash('sha256').update(deps.scopeId).digest('hex').slice(0,24)}.json`);
  let selected=deps.initialRoot??control;try{const old=await readRecord<{root:string}>(preference);if(typeof old.root==='string')selected=old.root;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')fail('SELECTION_CORRUPT');}
  let store:HistoryStore,queue:EvaluationQueue,cleanup:ReturnType<typeof createCleanup>,environment:PreparedEnvironment|undefined,preparing=false,disposed=false,rootEpoch=0;
  const clock=deps.clock??speedClock,activity=createActivityGate();let evaluationLease:ActivityLease|undefined,speedLease:ActivityLease|undefined,speedHistory:SpeedHistory,speedCleanup:ReturnType<typeof createSpeedCleanup>,speed:ReturnType<typeof createSpeedRunner>,live:ReturnType<typeof createLiveEstimator>|undefined,evaluationDone=Promise.resolve(),speedDone=Promise.resolve();
  async function prepareEnvironment(descriptor:ProtocolDescriptor){
    const candidate=deps.prepareEnvironment?await deps.prepareEnvironment(store.root,descriptor):descriptor.general.tier==='legacy'?await prepareResources(store.root,manifest,deps.packageResources):await prepareProtocolResources(store.root,descriptor,join(deps.packageResources,'..'));
    if(candidate.resourceVersion!==descriptor.refs.resourceVersion||candidate.rootPath!==store.root)fail('PREPARED_VERSION_MISMATCH');
    if(!deps.prepareEnvironment){await selfcheckEnvironment(candidate.resourcesPath);if(descriptor.general.tier!=='legacy'){const result=await createContestRunner(join(candidate.resourcesPath,'runtime')).runContest({id:'tier-environment-selfcheck-v1',cases:[{stdin:'21\n',expected:'42\n'}],limits:CONTEST_SCORING_LIMITS},'print(int(input()) * 2)',new AbortController().signal);if(result.kind!=='passed')fail('ENVIRONMENT_SELFCHECK_FAILED');}}
    return candidate;
  }
  let mutations:Promise<unknown>=Promise.resolve();const handles=new Map<string,TargetSnapshot>();
  interface UpgradeToken {rootId:string;rootEpoch:number;handle:string;sourceRunId:string;deepGeneralId:string;execution:EvaluationRequest['execution'];check:UpgradeCheck;expiresAt:string;expiresMonotonic:number;result?:UpgradeCommit}
  const upgradeTokens=new Map<string,UpgradeToken>(),committing=new Map<string,Promise<unknown>>();
  const safeCode=(error:unknown)=>{const value=(error as {code?:string;message?:string})?.code??(error as Error)?.message;return /^[A-Z][A-Z0-9_]{1,70}$/.test(value??'')?value!:'ENVIRONMENT_NOT_PREPARED';};
  function protocolCatalog():ProtocolCatalogItem[]{return registry.list().map(descriptor=>({descriptor,prepared:environments.has(refsKey(descriptor.refs)),...(preparationErrors.has(refsKey(descriptor.refs))?{errorCode:preparationErrors.get(refsKey(descriptor.refs))!}:!descriptor.allowNewRuns?{errorCode:'PROTOCOL_NOT_VERIFIED'}:{})}));}
  function requirePrepared(protocol:ResolvedProtocolSet){if(environments.get(refsKey(protocol))?.resourceVersion!==protocol.resourceVersion)fail('ENVIRONMENT_NOT_PREPARED');}
  async function requestedProtocol(request:Pick<EvaluationRequest,'generalId'>){try{return await registry.forNewRun(request.generalId??legacyRefs.generalId);}catch(error){return fail(safeCode(error));}}
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
  async function getInputs(batchId:string):Promise<readonly EstimationRunInput[]>{
    const view=queue.snapshot(),batch=view.batches.find(b=>b.batchId===batchId);if(!batch)fail('BATCH_NOT_FOUND');const result:EstimationRunInput[]=[],summaries=await store.listSummaries();
    for(const id of batch!.runIds){const {manifest:runManifest,summary}=await store.getRun(id),complete=Object.values(summary.tracks).every(t=>t.status==='completed'),status=complete?'completed':summary.details!=='available'?'pending':view.activeBatchId===batchId?(Object.values(summary.tracks).some(t=>t.status==='running')?'running':'queued'):batch!.status==='pending'?'pending':'paused';const items=summary.details==='available'&&!complete?await store.listItems(id):[],input=addHistoryPriors(runInput(runManifest,summary,items,status,clock.now(),batch!.judge),summaries.filter(r=>r.runId!==id));input.runId=id;if(complete)input.jobs=[];result.push(input);}
    return result;
  }
  async function bind(path:string):Promise<void>{
    environments.clear();preparationErrors.clear();upgradeTokens.clear();handles.clear();environment=undefined;
    const selection=await switchRoot(path,{writing:false});store=await openHistory(selection.path);rootEpoch++;live=undefined;
    try{
      cleanup=createCleanup(store,()=>queue?.snapshot().activeBatchId);speedHistory=createSpeedHistory(store);speedCleanup=createSpeedCleanup(store,speedHistory);
      if(store.writable){await store.recover();await createReuseHistory(store).recover();await cleanup.recoverCleanup();await speedHistory.recoverInterrupted();await speedCleanup.recover();}
      const graders={general(q:Parameters<typeof gradeGeneral>[0],a:Parameters<typeof gradeGeneral>[1],signal:AbortSignal,protocol:ResolvedProtocolSet){const prepared=environments.get(refsKey(protocol));if(!prepared||prepared.resourceVersion!==protocol.resourceVersion)return Promise.resolve({kind:'technical-missing' as const,track:'general' as const,itemId:q.id,error:{code:'ENVIRONMENT_NOT_PREPARED',phase:'resource' as const,retryable:false,message:'请准备本轮评测对应的环境。'},evidence:null});return gradeGeneral(q,a,{code:createCodeRunner(join(prepared.resourcesPath,'runtime')),rules:createRuleGrader(join(prepared.resourcesPath,'runtime','rules')),contest:createContestRunner(join(prepared.resourcesPath,'runtime')),signal});},writing:createWritingGrader(rubric)};
      const tools=async(q:import('./contracts.ts').Question,input:ToolSessionInput,protocol:ResolvedProtocolSet,execution:EvaluationRequest['execution'])=>{
        const prepared=environments.get(refsKey(protocol));
        const missing=(code:string):import('./contracts.ts').GradeResult=>({kind:'technical-missing',track:'general',itemId:q.id,error:{code,phase:'resource',retryable:false,message:'工具任务环境或原生调用不可用。'},evidence:null});
        if(!prepared)return missing('ENVIRONMENT_NOT_PREPARED');if(!deps.adapter.generateTurn)return missing('TOOLS_NOT_SUPPORTED');
        try{const dispatcher=await createToolDispatcher(prepared.resourcesPath,q);return await createToolSessionRunner({generateTurn:deps.adapter.generateTurn.bind(deps.adapter)},q,dispatcher,{callTimeoutMs:execution.callTimeoutMs})(input);}catch{return missing('TOOL_ENVIRONMENT_UNAVAILABLE');}
      };
      const services={...graders,tools};
      queue=createQueue(store,deps.adapter,registry,services,{onChange(runId){if(!live)return;const batch=queue.snapshot().batches.find(b=>b.runIds.includes(runId));if(batch)void live.invalidate(batch.batchId,'performance').catch(()=>{});}});
      await queue.idle();speed=createSpeedRunner({adapter:deps.adapter,registry,graders:services,history:speedHistory,clock});
      live=createLiveEstimator({clock,getRuns:getInputs,getActiveBatchIds:()=>{const id=queue.snapshot().activeBatchId;return id?[id]:[];},publish(id,value){void queue.saveEstimate(id,value).catch(()=>{});}});
      for(const batch of queue.snapshot().batches)if(batch.estimate){const {remainingMs,totalMs,...base}=batch.estimate;live.restore(batch.batchId,batch.status==='pending'?{...base,state:'pending'}:batch.status==='completed'?batch.estimate:{...batch.estimate,state:'paused'});}
      for(const summary of await store.listSummaries())if(summary.estimation){const current=summary.estimation.final??summary.estimation.current,batch=queue.snapshot().batches.find(b=>b.batchId===summary.batchId);const {remainingMs,totalMs,...base}=current;live.restoreRun(summary.runId,summary.batchId,batch?.status==='pending'?{...base,state:'pending'}:batch?.status==='completed'?current:{...current,state:'paused'});}
      if(!deps.prepareEnvironment)for(const descriptor of registry.list().filter(d=>d.allowNewRuns)){
        try{
          let destination:string;
          if(descriptor.general.tier==='legacy')destination=join(store.root,'resources',`${manifest.resourceVersion}-${RESOURCE_MANIFEST_SHA256.slice(0,12)}`);
          else{const catalog=await readProtocolCatalog(join(deps.packageResources,'..')),entry=catalog.entries.find(e=>refsKey(e.refs)===refsKey(descriptor.refs)),bundle=catalog.bundles.find(b=>b.id===entry?.bundleId);if(!bundle)continue;destination=join(store.root,'resources',bundle.id+'-'+identityHash(bundle).slice(0,12));}
          await access(join(destination,'.ready.json'));const candidate=await prepareEnvironment(descriptor);environments.set(refsKey(descriptor.refs),candidate);if(descriptor.general.tier==='legacy')environment=candidate;
        }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')preparationErrors.set(refsKey(descriptor.refs),safeCode(error));}
      }
    }catch(error){live?.dispose();await speed?.dispose().catch(()=>{});await queue?.dispose().catch(()=>{});await store.close().catch(()=>{});throw error;}
  }
  await bind(selected);
  function mutate<T>(action:()=>Promise<T>):Promise<T>{if(disposed)return Promise.reject(Object.assign(new Error(),{code:'SERVICE_DISPOSED'}));const task=mutations.then(action);mutations=task.catch(()=>{});return task;}
  function writable(){if(!store.writable)fail('HISTORY_READ_ONLY');}
  function inactive(){if(queue.snapshot().activeBatchId||preparing)fail('ROOT_BUSY');}
  function target(handle:unknown):TargetSnapshot {if(typeof handle!=='string'||!handles.has(handle))return fail('CONFIGURATION_EXPIRED');return structuredClone(handles.get(handle)!);}
  function judge(handle:unknown):JudgeSnapshot{return {target:target(handle),rubricId:rubric.id,promptId:rubric.promptId};}
  function compactOperation(op:ReturnType<typeof cleanup.operation>){if(!op)return null;const {files,...safe}=op;return {...safe,failedFiles:files.filter(x=>x.state==='failed').length};}
  function requestFrom(payload:Record<string,unknown>):EvaluationRequest{
    if(!Array.isArray(payload.handles)||!payload.handles.length||payload.handles.length>20||!Array.isArray(payload.tracks)||!payload.execution||typeof payload.execution!=='object')fail('INVALID_REQUEST');
    if(payload.generalId!==undefined&&(typeof payload.generalId!=='string'||!/^[a-zA-Z0-9._-]{1,128}$/.test(payload.generalId)))fail('INVALID_REQUEST');
    return {...(typeof payload.generalId==='string'?{generalId:payload.generalId}:{}),targets:(payload.handles as unknown[]).map(target),tracks:payload.tracks as Track[],execution:payload.execution as EvaluationRequest['execution'],...(payload.judgeHandle?{judge:judge(payload.judgeHandle)}:{})};
  }
  async function finishEvaluation(batchId:string){await queue.idle();await live?.invalidate(batchId,'finish');const inputs=await getInputs(batchId),batch=queue.snapshot().batches.find(b=>b.batchId===batchId)!;
    await store.exclusive(async tx=>{for(let i=0;i<batch.runIds.length;i++){const id=batch.runIds[i]!,{summary}=await tx.getRun(id),input=inputs[i]!,computed=estimateBatch({runs:[input],now:clock.now(),allowApproximate:true}),current=live?.snapshotRun(id)??computed;await tx.updateSummary(id,summary.revision,next=>{next.estimation={...next.estimation,current,...(computed.state==='completed'?{final:computed}:{})};});}});
  }
  async function finishSpeed(id:string,lease:ActivityLease){try{try{await speed.idle();}catch{/* failed session already holds its safe diagnostic */}const row=await speedHistory.read(id);if(row)await speedHistory.save({...row,estimate:previewEstimate(row,(await registry.resolve(row.configs[0]!.protocols)).items,clock.now())},row.revision);lease.release();}catch{lease.fault('SPEED_STORAGE_FAILED');}finally{if(speedLease===lease)speedLease=undefined;}}
  async function operate(action:Action,payload:Record<string,unknown>):Promise<unknown> {
    if(disposed)fail('SERVICE_DISPOSED');
    switch(action){
      case 'status':return {apiVersion:1,ready:true,rootId:store.rootId,rootEpoch,prepared:environments.size>0,preparing,writable:store.writable,rootPath:store.root,resourceVersion:manifest.resourceVersion,generalId:manifest.generalId,writingId:manifest.writingId,packageBytes:manifest.files.reduce((n,x)=>n+x.size,0),hostVerification:'unverified',...(protocolError?{protocolError}:{}),activeActivity:activity.snapshot()};
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
        const choice=(await deps.adapter.catalog()).find(x=>x.providerId===payload.providerId&&x.modelId===payload.modelId);if(!choice)return fail('MODEL_NOT_CONFIGURED');
        const overrides=(payload.overrides??{}) as Record<string,ParamValue>;if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))return fail('INVALID_PARAMETER');
        for(const value of Object.values(overrides))if(!value||!['known','unset'].includes(value.state)||value.state==='known'&&value.source!=='override')return fail('INVALID_PARAMETER');
        const snapshot=await deps.adapter.snapshot(choice,overrides);if(payload.deployment!==undefined){if(typeof payload.deployment!=='string'||payload.deployment.length>100)return fail('INVALID_PARAMETER');if(payload.deployment.trim())snapshot.deployment={value:payload.deployment.trim(),source:'user'};}
        const fingerprint=fingerprintTarget(snapshot),handle=randomUUID();handles.set(handle,snapshot);if(handles.size>1000)handles.delete(handles.keys().next().value!);
        return {handle,target:snapshot,fingerprint};
      }
      case 'prepare':return mutate(async()=>{writable();inactive();preparing=true;let firstError:string|undefined;const prepared=new Map<string,PreparedEnvironment>();try{
        const supported=registry.list().filter(d=>d.allowNewRuns);if(!supported.length)fail('PROTOCOL_UNAVAILABLE');
        for(const descriptor of supported){const key=refsKey(descriptor.refs);try{await registry.resolve(descriptor.refs);const candidate=prepared.get(descriptor.refs.resourceVersion)??await prepareEnvironment(descriptor);prepared.set(descriptor.refs.resourceVersion,candidate);environments.set(key,candidate);preparationErrors.delete(key);if(descriptor.general.tier==='legacy')environment=candidate;}catch(error){const code=safeCode(error);firstError??=code;environments.delete(key);preparationErrors.set(key,code);if(descriptor.general.tier==='legacy')environment=undefined;}}
        if(!environments.size)fail(firstError??'ENVIRONMENT_NOT_PREPARED');const values=[...new Map([...environments.values()].map(e=>[e.resourcesPath,e])).values()];return {prepared:true,bytes:values.reduce((n,e)=>n+e.bytes,0),cached:values.every(e=>e.cached),protocols:protocolCatalog()};
      }finally{preparing=false;}});
      case 'setRoot':return mutate(async()=>{inactive();if(typeof payload.path!=='string')return fail('INVALID_REQUEST');const selection=await switchRoot(payload.path,{writing:false});if(selection.path===store.root)return {rootPath:store.root};
        const oldRoot=store.root;live?.dispose();await speed.dispose();await queue.dispose();await store.close();environment=undefined;
        try{await bind(selection.path);await writeRecord(preference,{root:store.root});}catch(error){await queue?.dispose().catch(()=>{});await store?.close().catch(()=>{});await bind(oldRoot);throw error;}return {rootPath:store.root,previousRoot:oldRoot,historyMoved:false};});
      case 'createBatch':return mutate(async()=>{writable();const request=requestFrom(payload),selected=await requestedProtocol(request);requirePrepared(selected);request.generalId=selected.generalId;
        if(payload.previewId){const row=await speedHistory.read(String(payload.previewId));if(!row)fail('PREVIEW_NOT_FOUND');const estimates:Record<string,RunEstimation>={};for(const t of request.targets){const config=matchingPreviewConfig(row!,t,selected.descriptor.refs,request.execution,request.tracks,request.judge);if(!config)fail('PREVIEW_MISMATCH');const origin={...structuredClone(row!),configs:[structuredClone(config!)]};origin.estimate=previewEstimate(origin,selected.items,clock.now());estimates[fingerprintTarget(t)]={originPreview:origin,current:origin.estimate};}request.initialEstimates=estimates;}return queue.enqueue(request);
      });
      case 'previewUpgrade':return mutate(async()=>{
        writable();inactive();const deep=await requestedProtocol({generalId:String(payload.deepGeneralId)});requirePrepared(deep);
        const current=await currentTarget(payload.handle),check=await upgradeCheck(String(payload.sourceRunId),deep,current),token=randomUUID(),expiresAt=new Date(Date.parse(clock.now())+300000).toISOString();
        upgradeTokens.set(token,{rootId:store.rootId,rootEpoch,handle:String(payload.handle),sourceRunId:String(payload.sourceRunId),deepGeneralId:deep.generalId,execution:structuredClone(payload.execution as EvaluationRequest['execution']),check,expiresAt,expiresMonotonic:clock.monotonicMs()+300000});
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
      case 'queue':{const view=queue.snapshot();return {...view,estimates:Object.fromEntries(view.batches.flatMap(b=>{const e=live?.snapshot(b.batchId)??b.estimate;return e?[[b.batchId,e]]:[];}))};}
      case 'pause':return mutate(async()=>{if(queue.snapshot().activeBatchId===payload.batchId){evaluationLease?.stopping();await live?.invalidate(String(payload.batchId),'pause');}await queue.pause(String(payload.batchId));await evaluationDone;return queue.snapshot();});
      case 'resume':return mutate(async()=>{writable();const batch=queue.snapshot().batches.find(b=>b.batchId===payload.batchId);if(!batch)fail('BATCH_NOT_FOUND');for(const id of batch!.runIds){const {manifest}=await store.getRun(id);requirePrepared(await registry.resolve(manifest.protocols));}await queue.resume(String(payload.batchId),payload.judgeHandle?judge(payload.judgeHandle):undefined);void live?.invalidate(String(payload.batchId),'resume').catch(()=>{});return queue.snapshot();});
      case 'startSpeedPreview':return mutate(async()=>{writable();const request=requestFrom(payload),selected=await requestedProtocol(request);requirePrepared(selected);return speed.start({...request,generalId:selected.generalId,budgetMinutes:Number(payload.budgetMinutes)});});
      case 'speedPreviewStatus':{const row=await speedHistory.read(String(payload.previewId));if(!row)fail('PREVIEW_NOT_FOUND');const current=activity.snapshot();if(current?.kind==='speed-preview'&&current.id===row!.previewId&&current.state==='stopping')row!.status='stopping';return row;}
      case 'cancelSpeedPreview':{writable();const id=String(payload.previewId),current=activity.snapshot();if(current?.kind==='speed-preview'&&current.id===id){speedLease?.stopping();await speed.cancel(id);return {accepted:true,status:'stopping'};}const row=await speedHistory.read(id);if(!row)fail('PREVIEW_NOT_FOUND');return {accepted:true,status:row!.status};}
      case 'speedHistory':return speedHistory.list();
      case 'previewSpeedCleanup':return mutate(()=>speedCleanup.preview(payload.previewIds as string[]));
      case 'commitSpeedCleanup':return mutate(async()=>{const op=await speedCleanup.commit(String(payload.token));const {files,...safe}=op;return {...safe,failedFiles:files.filter(f=>f.state==='failed').length};});
      case 'speedCleanupStatus':{const op=await speedCleanup.status(String(payload.token));if(!op)return null;const {files,...safe}=op;return {...safe,failedFiles:files.filter(f=>f.state==='failed').length};}
      case 'history':return store.listSummaries();
      case 'report':return readBound(async captured=>{
        const run=await captured.getRun(String(payload.runId));const records=run.summary.details==='available'?await captured.listItems(run.summary.runId):[];
        const current=live?.snapshotRun(run.summary.runId);if(current)run.summary.estimation={...run.summary.estimation,current};return {summary:run.summary,questions:run.manifest.requiredItems.map(q=>{const item=records.find(x=>x.itemId===q.id);return {...q,answered:!!item?.answer?.complete,grade:item?.grade??null};})};});
      case 'item':return readBound(async captured=>{
        const runId=String(payload.runId),id=String(payload.itemId),{manifest:runManifest}=await captured.getRun(runId);
        if(!runManifest.requiredItems.some(x=>x.id===id))return fail('ITEM_NOT_IN_PROTOCOL');
        const item=await captured.getItem(runId,id);let question=item?.question;
        if(!question)try{question=(await registry.resolve(runManifest.protocols)).items.find(x=>x.id===id);}catch{/* Historical records stay readable; unknown refs never borrow current questions. */}
        return {question:question?{id:question.id,track:question.track,datasetId:question.datasetId,sourceId:question.sourceId,sourceHash:question.sourceHash,prompt:question.prompt}:null,item:item??null};
      });
      case 'usage':return cleanup.measureHistory();
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
  const activityKinds:Partial<Record<Action,ActivityKind>>={prepare:'prepare',setRoot:'root-change',createBatch:'evaluation',resume:'evaluation',previewUpgrade:'upgrade',commitUpgrade:'upgrade',previewCleanup:'cleanup',commitCleanup:'cleanup',startSpeedPreview:'speed-preview',previewSpeedCleanup:'cleanup',commitSpeedCleanup:'cleanup'};
  async function dispatchWithActivity(action:Action,payload:Record<string,unknown>):Promise<unknown>{
    if(disposed)fail('SERVICE_DISPOSED');const kind=activityKinds[action],lease=kind?activity.claim(kind,randomUUID()):undefined;let held=false;
    try{const result=await operate(action,payload);if(lease&&(kind==='evaluation'||action==='commitUpgrade')){const id=action==='createBatch'||action==='commitUpgrade'?(result as {batchId:string}).batchId:String(payload.batchId);lease.identify(id);held=true;evaluationLease=lease;evaluationDone=finishEvaluation(id).then(()=>{lease.release();if(evaluationLease===lease)evaluationLease=undefined;},()=>lease.fault('QUEUE_STORAGE_FAILED'));}else if(lease&&kind==='speed-preview'){const id=(result as {previewId:string}).previewId;lease.identify(id);held=true;speedLease=lease;speedDone=finishSpeed(id,lease);}return result;}finally{if(!held)lease?.release();}
  }
  async function dispatch(action:Action,payload:Record<string,unknown>):Promise<unknown>{
    if(disposed)fail('SERVICE_DISPOSED');validateEnvelope({schemaVersion:1,requestId:'service',action,payload});
    if(action!=='commitUpgrade')return dispatchWithActivity(action,payload);
    if(activity.snapshot()?.kind==='root-change')fail('COMPARISON_STALE');
    writable();const token=String(payload.token),entry=upgradeTokens.get(token);if(entry?.result&&entry.rootId===store.rootId&&entry.rootEpoch===rootEpoch)return structuredClone(entry.result);
    const pending=committing.get(token);if(pending)return pending;
    if(!entry){const bound=await readBound(async captured=>{const operation=await createReuseHistory(captured).operation(token);if(operation?.state!=='ready')return fail('UPGRADE_TOKEN_INVALID');return {commit:{batchId:operation.destinationBatchId,runId:operation.destinationRunId,operationId:operation.operationId} satisfies UpgradeCommit};});return bound.commit;}
    const promise=dispatchWithActivity(action,payload).finally(()=>committing.delete(token));committing.set(token,promise);return promise;
  }
  return {dispatch,async dispose(){if(disposed)return;disposed=true;live?.dispose();evaluationLease?.stopping();speedLease?.stopping();const stopping=Promise.all([queue.dispose(),speed.dispose()]);await mutations;await stopping;await evaluationDone;await speedDone;await store.close();}};
}

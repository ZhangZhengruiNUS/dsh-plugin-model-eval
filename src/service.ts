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
import type {HostAdapter,JudgeSnapshot,ParamValue,TargetSnapshot,Track,EvaluationRequest} from './contracts.ts';
import {defaultRoot,switchRoot,prepareResources,type PreparedEnvironment} from './resources/prepare.ts';import {readResourceManifest,loadProtocolSet} from './evaluation/protocols.ts';
import {readRecord,writeRecord} from './history/atomic.ts';import {openHistory,type HistoryStore} from './history/store.ts';import {createCleanup} from './history/cleanup.ts';
import {createQueue,type EvaluationQueue} from './jobs/queue.ts';import {gradeGeneral} from './evaluation/grade-general.ts';import {createCodeRunner} from './runtime/runner.ts';import {createRuleGrader} from './runtime/rule-grader.ts';import {createWritingGrader,type WritingRubric} from './writing/judge.ts';
import type {Action} from './host/api.ts';import {fingerprintTarget} from './model/identity.ts';import {RESOURCE_MANIFEST_SHA256} from './resources/pins.ts';
import {selfcheckEnvironment} from './resources/selfcheck.ts';
const fail=(code:string):never=>{throw Object.assign(new Error(code),{code});};
export interface ServiceDependencies {adapter:HostAdapter;packageResources:string;scopeId:string;initialRoot?:string;controlRoot?:string;clock?:SpeedClock;prepareEnvironment?:(rootPath:string)=>Promise<PreparedEnvironment>}
export async function createEvaluationService(deps:ServiceDependencies) {
  const manifest=await readResourceManifest(deps.packageResources),protocols=await loadProtocolSet(deps.packageResources),rubric=JSON.parse(await readFile(join(deps.packageResources,'protocols','rubric-writing-v1.json'),'utf8')) as WritingRubric;
  const control=(await switchRoot(deps.controlRoot??deps.initialRoot??defaultRoot(),{writing:false})).path;
  const preference=join(control,`selection-${createHash('sha256').update(deps.scopeId).digest('hex').slice(0,24)}.json`);
  let selected=deps.initialRoot??control;try{const old=await readRecord<{root:string}>(preference);if(typeof old.root==='string')selected=old.root;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')fail('SELECTION_CORRUPT');}
  let store:HistoryStore,queue:EvaluationQueue,cleanup:ReturnType<typeof createCleanup>,environment:PreparedEnvironment|undefined,preparing=false,disposed=false;
  const clock=deps.clock??speedClock,activity=createActivityGate();let evaluationLease:ActivityLease|undefined,speedLease:ActivityLease|undefined,speedHistory:SpeedHistory,speedCleanup:ReturnType<typeof createSpeedCleanup>,speed:ReturnType<typeof createSpeedRunner>,live:ReturnType<typeof createLiveEstimator>|undefined,evaluationDone=Promise.resolve(),speedDone=Promise.resolve();const modelEstimates=new Map<string,EstimateSnapshot>();
  async function prepareEnvironment(){if(deps.prepareEnvironment)return deps.prepareEnvironment(store.root);const candidate=await prepareResources(store.root,manifest,deps.packageResources);await selfcheckEnvironment(candidate.resourcesPath);return candidate;}
  let mutations:Promise<unknown>=Promise.resolve();const handles=new Map<string,TargetSnapshot>();
  async function getInputs(batchId:string):Promise<readonly EstimationRunInput[]>{
    const view=queue.snapshot(),batch=view.batches.find(b=>b.batchId===batchId);if(!batch)fail('BATCH_NOT_FOUND');const result:EstimationRunInput[]=[],summaries=await store.listSummaries();
    for(const id of batch!.runIds){const {manifest:runManifest,summary}=await store.getRun(id),complete=Object.values(summary.tracks).every(t=>t.status==='completed'),status=complete?'completed':summary.details!=='available'?'pending':view.activeBatchId===batchId?(Object.values(summary.tracks).some(t=>t.status==='running')?'running':'queued'):batch!.status==='pending'?'pending':'paused';const items=summary.details==='available'&&!complete?await store.listItems(id):[],input=addHistoryPriors(runInput(runManifest,summary,items,status,clock.now(),batch!.judge),summaries.filter(r=>r.runId!==id));if(complete)input.jobs=[];result.push(input);const estimate=estimateBatch({runs:[input],now:clock.now()});if(status!=='paused'&&(estimate.state==='available'||estimate.state==='completed'))modelEstimates.set(id,estimate);}
    return result;
  }
  async function bind(path:string):Promise<void>{
    const selection=await switchRoot(path,{writing:false});store=await openHistory(selection.path);live=undefined;modelEstimates.clear();
    try{
      cleanup=createCleanup(store,()=>queue?.snapshot().activeBatchId);speedHistory=createSpeedHistory(store);speedCleanup=createSpeedCleanup(store,speedHistory);
      if(store.writable){await cleanup.recoverCleanup();await store.recover();await speedHistory.recoverInterrupted();await speedCleanup.recover();}
      const graders={general(q:Parameters<typeof gradeGeneral>[0],a:Parameters<typeof gradeGeneral>[1],signal:AbortSignal){if(!environment)return Promise.resolve({kind:'technical-missing' as const,track:'general' as const,itemId:q.id,error:{code:'ENVIRONMENT_NOT_PREPARED',phase:'resource' as const,retryable:false,message:'请准备环境。'},evidence:null});return gradeGeneral(q,a,{code:createCodeRunner(join(environment.resourcesPath,'runtime')),rules:createRuleGrader(join(environment.resourcesPath,'runtime','rules')),signal});},writing:createWritingGrader(rubric)};
      queue=createQueue(store,deps.adapter,protocols,graders,{onChange(runId){if(!live)return;const batch=queue.snapshot().batches.find(b=>b.runIds.includes(runId));if(batch)void live.invalidate(batch.batchId,'performance');}});
      await queue.idle();speed=createSpeedRunner({adapter:deps.adapter,protocols,graders,history:speedHistory,clock});
      live=createLiveEstimator({clock,getRuns:getInputs,getActiveBatchIds:()=>{const id=queue.snapshot().activeBatchId;return id?[id]:[];},publish(id,value){void queue.saveEstimate(id,value).catch(()=>{});}});
      for(const batch of queue.snapshot().batches)if(batch.estimate){const {remainingMs,totalMs,...base}=batch.estimate;live.restore(batch.batchId,batch.status==='pending'?{...base,state:'pending'}:batch.status==='completed'?batch.estimate:{...batch.estimate,state:'paused'});}
      const destination=join(store.root,'resources',`${manifest.resourceVersion}-${RESOURCE_MANIFEST_SHA256.slice(0,12)}`);
      try{await access(join(destination,'.ready.json'));const candidate=await prepareResources(store.root,manifest,deps.packageResources);await selfcheckEnvironment(candidate.resourcesPath);environment=candidate;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;environment=undefined;}
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
    return {targets:(payload.handles as unknown[]).map(target),tracks:payload.tracks as Track[],execution:payload.execution as EvaluationRequest['execution'],...(payload.judgeHandle?{judge:judge(payload.judgeHandle)}:{})};
  }
  async function finishEvaluation(batchId:string){await queue.idle();await live?.invalidate(batchId,'finish');const inputs=await getInputs(batchId),batch=queue.snapshot().batches.find(b=>b.batchId===batchId)!;
    await store.exclusive(async tx=>{for(let i=0;i<batch.runIds.length;i++){const id=batch.runIds[i]!,{summary}=await tx.getRun(id),input=inputs[i]!,computed=estimateBatch({runs:[input],now:clock.now()}),current=input.status==='paused'&&modelEstimates.has(id)?{...modelEstimates.get(id)!,state:'paused' as const}:computed;await tx.updateSummary(id,summary.revision,next=>{next.estimation={...next.estimation,current,...(computed.state==='completed'?{final:computed}:{})};});}});
  }
  async function finishSpeed(id:string,lease:ActivityLease){try{try{await speed.idle();}catch{/* failed session already holds its safe diagnostic */}const row=await speedHistory.read(id);if(row)await speedHistory.save({...row,estimate:previewEstimate(row,protocols.items,clock.now())},row.revision);lease.release();}catch{lease.fault('SPEED_STORAGE_FAILED');}finally{if(speedLease===lease)speedLease=undefined;}}
  async function operate(action:Action,payload:Record<string,unknown>):Promise<unknown> {
    if(disposed)fail('SERVICE_DISPOSED');
    switch(action){
      case 'status':return {apiVersion:1,ready:true,prepared:!!environment,preparing,writable:store.writable,rootPath:store.root,resourceVersion:manifest.resourceVersion,generalId:manifest.generalId,writingId:manifest.writingId,packageBytes:manifest.files.reduce((n,x)=>n+x.size,0),hostVerification:'unverified',activeActivity:activity.snapshot()};
      case 'catalog':return deps.adapter.catalog();
      case 'settings':return {rootPath:store.root,writable:store.writable,prepared:!!environment,preparing,bytes:environment?.bytes??0,execution:{concurrency:4,callTimeoutMs:300000},rubricId:rubric.id,judgePromptId:rubric.promptId};
      case 'snapshot':{
        const choice=(await deps.adapter.catalog()).find(x=>x.providerId===payload.providerId&&x.modelId===payload.modelId);if(!choice)return fail('MODEL_NOT_CONFIGURED');
        const overrides=(payload.overrides??{}) as Record<string,ParamValue>;if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))return fail('INVALID_PARAMETER');
        for(const value of Object.values(overrides))if(!value||!['known','unset'].includes(value.state)||value.state==='known'&&value.source!=='override')return fail('INVALID_PARAMETER');
        const snapshot=await deps.adapter.snapshot(choice,overrides);if(payload.deployment!==undefined){if(typeof payload.deployment!=='string'||payload.deployment.length>100)return fail('INVALID_PARAMETER');if(payload.deployment.trim())snapshot.deployment={value:payload.deployment.trim(),source:'user'};}
        const fingerprint=fingerprintTarget(snapshot),handle=randomUUID();handles.set(handle,snapshot);if(handles.size>1000)handles.delete(handles.keys().next().value!);
        return {handle,target:snapshot,fingerprint};
      }
      case 'prepare':return mutate(async()=>{writable();inactive();preparing=true;environment=undefined;try{environment=await prepareEnvironment();return {prepared:true,bytes:environment.bytes,cached:environment.cached};}finally{preparing=false;}});
      case 'setRoot':return mutate(async()=>{inactive();if(typeof payload.path!=='string')return fail('INVALID_REQUEST');const selection=await switchRoot(payload.path,{writing:false});if(selection.path===store.root)return {rootPath:store.root};
        const oldRoot=store.root;live?.dispose();await speed.dispose();await queue.dispose();await store.close();environment=undefined;
        try{await bind(selection.path);await writeRecord(preference,{root:store.root});}catch(error){await queue?.dispose().catch(()=>{});await store?.close().catch(()=>{});await bind(oldRoot);throw error;}return {rootPath:store.root,previousRoot:oldRoot,historyMoved:false};});
      case 'createBatch':return mutate(async()=>{writable();if(!environment)fail('ENVIRONMENT_NOT_PREPARED');const request=requestFrom(payload);if(payload.previewId){const row=await speedHistory.read(String(payload.previewId));if(!row)fail('PREVIEW_NOT_FOUND');const estimates:Record<string,RunEstimation>={};for(const t of request.targets){const config=matchingPreviewConfig(row!,t,{generalId:protocols.generalId,writingId:protocols.writingId,resourceVersion:protocols.resourceVersion},request.execution,request.tracks,request.judge);if(!config)fail('PREVIEW_MISMATCH');const origin={...structuredClone(row!),configs:[structuredClone(config!)]};estimates[fingerprintTarget(t)]={originPreview:origin,current:previewEstimate(origin,protocols.items,clock.now())};}request.initialEstimates=estimates;}return queue.enqueue(request);});
      case 'queue':{const view=queue.snapshot();return {...view,estimates:Object.fromEntries(view.batches.flatMap(b=>{const e=live?.snapshot(b.batchId)??b.estimate;return e?[[b.batchId,e]]:[];}))};}
      case 'pause':return mutate(async()=>{if(queue.snapshot().activeBatchId===payload.batchId){evaluationLease?.stopping();await live?.invalidate(String(payload.batchId),'pause');}await queue.pause(String(payload.batchId));await evaluationDone;return queue.snapshot();});
      case 'resume':return mutate(async()=>{writable();if(!environment)fail('ENVIRONMENT_NOT_PREPARED');await queue.resume(String(payload.batchId),payload.judgeHandle?judge(payload.judgeHandle):undefined);await live?.invalidate(String(payload.batchId),'resume');return queue.snapshot();});
      case 'startSpeedPreview':return mutate(async()=>{writable();if(!environment)fail('ENVIRONMENT_NOT_PREPARED');return speed.start({...requestFrom(payload),budgetMinutes:Number(payload.budgetMinutes)});});
      case 'speedPreviewStatus':{const row=await speedHistory.read(String(payload.previewId));if(!row)fail('PREVIEW_NOT_FOUND');const current=activity.snapshot();if(current?.kind==='speed-preview'&&current.id===row!.previewId&&current.state==='stopping')row!.status='stopping';return row;}
      case 'cancelSpeedPreview':{writable();const id=String(payload.previewId),current=activity.snapshot();if(current?.kind==='speed-preview'&&current.id===id){speedLease?.stopping();await speed.cancel(id);return {accepted:true,status:'stopping'};}const row=await speedHistory.read(id);if(!row)fail('PREVIEW_NOT_FOUND');return {accepted:true,status:row!.status};}
      case 'speedHistory':return speedHistory.list();
      case 'previewSpeedCleanup':return mutate(()=>speedCleanup.preview(payload.previewIds as string[]));
      case 'commitSpeedCleanup':return mutate(async()=>{const op=await speedCleanup.commit(String(payload.token));const {files,...safe}=op;return {...safe,failedFiles:files.filter(f=>f.state==='failed').length};});
      case 'speedCleanupStatus':{const op=await speedCleanup.status(String(payload.token));if(!op)return null;const {files,...safe}=op;return {...safe,failedFiles:files.filter(f=>f.state==='failed').length};}
      case 'history':return store.listSummaries();
      case 'report':{const run=await store.getRun(String(payload.runId));const records=run.summary.details==='available'?await store.listItems(run.summary.runId):[];
        return {summary:run.summary,questions:run.manifest.requiredItems.map(q=>{const item=records.find(x=>x.itemId===q.id);return {...q,answered:!!item?.answer?.complete,grade:item?.grade??null};})};}
      case 'item':{const runId=String(payload.runId),id=String(payload.itemId),{manifest:runManifest}=await store.getRun(runId);if(!runManifest.requiredItems.some(x=>x.id===id))return fail('ITEM_NOT_IN_PROTOCOL');const item=await store.getItem(runId,id);const question=item?.question??(runManifest.protocols.resourceVersion===protocols.resourceVersion?protocols.items.find(x=>x.id===id):undefined);return {question:question?{id:question.id,track:question.track,datasetId:question.datasetId,sourceId:question.sourceId,sourceHash:question.sourceHash,prompt:question.prompt}:null,item:item??null};}
      case 'usage':return cleanup.measureHistory();
      case 'previewCleanup':return mutate(()=>cleanup.previewCleanup(payload.batchIds as string[]));
      case 'commitCleanup':return mutate(async()=>compactOperation(await cleanup.commitCleanup(String(payload.token))));
      case 'cleanupStatus':return compactOperation(cleanup.operation(String(payload.token)));
    }
  }
  const activityKinds:Partial<Record<Action,ActivityKind>>={prepare:'prepare',setRoot:'root-change',createBatch:'evaluation',resume:'evaluation',previewCleanup:'cleanup',commitCleanup:'cleanup',startSpeedPreview:'speed-preview',previewSpeedCleanup:'cleanup',commitSpeedCleanup:'cleanup'};
  async function dispatch(action:Action,payload:Record<string,unknown>):Promise<unknown>{
    if(disposed)fail('SERVICE_DISPOSED');const kind=activityKinds[action],lease=kind?activity.claim(kind,randomUUID()):undefined;let held=false;
    try{const result=await operate(action,payload);if(lease&&kind==='evaluation'){const id=action==='createBatch'?(result as {batchId:string}).batchId:String(payload.batchId);lease.identify(id);held=true;evaluationLease=lease;evaluationDone=finishEvaluation(id).then(()=>{lease.release();if(evaluationLease===lease)evaluationLease=undefined;},()=>lease.fault('QUEUE_STORAGE_FAILED'));}else if(lease&&kind==='speed-preview'){const id=(result as {previewId:string}).previewId;lease.identify(id);held=true;speedLease=lease;speedDone=finishSpeed(id,lease);}return result;}finally{if(!held)lease?.release();}
  }
  return {dispatch,async dispose(){if(disposed)return;disposed=true;live?.dispose();evaluationLease?.stopping();speedLease?.stopping();const stopping=Promise.all([queue.dispose(),speed.dispose()]);await mutations;await stopping;await evaluationDone;await speedDone;await store.close();}};
}

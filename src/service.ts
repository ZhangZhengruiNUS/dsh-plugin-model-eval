import {join} from 'node:path';import {access,readFile} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';
import type {HostAdapter,JudgeSnapshot,ParamValue,TargetSnapshot,Track,EvaluationRequest} from './contracts.ts';
import {defaultRoot,switchRoot,prepareResources,type PreparedEnvironment} from './resources/prepare.ts';import {readResourceManifest,loadProtocolSet} from './evaluation/protocols.ts';
import {readRecord,writeRecord} from './history/atomic.ts';import {openHistory,type HistoryStore} from './history/store.ts';import {createCleanup} from './history/cleanup.ts';
import {createQueue,type EvaluationQueue} from './jobs/queue.ts';import {gradeGeneral} from './evaluation/grade-general.ts';import {createCodeRunner} from './runtime/runner.ts';import {createRuleGrader} from './runtime/rule-grader.ts';import {createWritingGrader,type WritingRubric} from './writing/judge.ts';
import type {Action} from './host/api.ts';import {fingerprintTarget} from './model/identity.ts';import {RESOURCE_MANIFEST_SHA256} from './resources/pins.ts';
import {selfcheckEnvironment} from './resources/selfcheck.ts';
const fail=(code:string):never=>{throw Object.assign(new Error(code),{code});};
export interface ServiceDependencies {adapter:HostAdapter;packageResources:string;scopeId:string;initialRoot?:string;controlRoot?:string}
export async function createEvaluationService(deps:ServiceDependencies) {
  const manifest=await readResourceManifest(deps.packageResources),protocols=await loadProtocolSet(deps.packageResources),rubric=JSON.parse(await readFile(join(deps.packageResources,'protocols','rubric-writing-v1.json'),'utf8')) as WritingRubric;
  const control=(await switchRoot(deps.controlRoot??deps.initialRoot??defaultRoot(),{writing:false})).path;
  const preference=join(control,`selection-${createHash('sha256').update(deps.scopeId).digest('hex').slice(0,24)}.json`);
  let selected=deps.initialRoot??control;try{const old=await readRecord<{root:string}>(preference);if(typeof old.root==='string')selected=old.root;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')fail('SELECTION_CORRUPT');}
  let store:HistoryStore,queue:EvaluationQueue,cleanup:ReturnType<typeof createCleanup>,environment:PreparedEnvironment|undefined,preparing=false,disposed=false;
  let mutations:Promise<unknown>=Promise.resolve();const handles=new Map<string,TargetSnapshot>();
  async function bind(path:string):Promise<void>{
    const selection=await switchRoot(path,{writing:false});store=await openHistory(selection.path);
    try {
    cleanup=createCleanup(store,()=>queue?.snapshot().activeBatchId);
    if(store.writable){await cleanup.recoverCleanup();await store.recover();}
    queue=createQueue(store,deps.adapter,protocols,{general(q,a,signal){if(!environment)return Promise.resolve({kind:'technical-missing',track:'general',itemId:q.id,error:{code:'ENVIRONMENT_NOT_PREPARED',phase:'resource',retryable:false,message:'请准备环境。'},evidence:null});return gradeGeneral(q,a,{code:createCodeRunner(join(environment.resourcesPath,'runtime')),rules:createRuleGrader(join(environment.resourcesPath,'runtime','rules')),signal});},writing:createWritingGrader(rubric)});
    await queue.idle();
    const destination=join(store.root,'resources',`${manifest.resourceVersion}-${RESOURCE_MANIFEST_SHA256.slice(0,12)}`);
    try{await access(join(destination,'.ready.json'));const candidate=await prepareResources(store.root,manifest,deps.packageResources);await selfcheckEnvironment(candidate.resourcesPath);environment=candidate;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;environment=undefined;}
    }catch(error){await queue?.dispose().catch(()=>{});await store.close().catch(()=>{});throw error;}
  }
  await bind(selected);
  function mutate<T>(action:()=>Promise<T>):Promise<T>{if(disposed)return Promise.reject(Object.assign(new Error(),{code:'SERVICE_DISPOSED'}));const task=mutations.then(action);mutations=task.catch(()=>{});return task;}
  function writable(){if(!store.writable)fail('HISTORY_READ_ONLY');}
  function inactive(){if(queue.snapshot().activeBatchId||preparing)fail('ROOT_BUSY');}
  function target(handle:unknown):TargetSnapshot {if(typeof handle!=='string'||!handles.has(handle))return fail('CONFIGURATION_EXPIRED');return structuredClone(handles.get(handle)!);}
  function judge(handle:unknown):JudgeSnapshot{return {target:target(handle),rubricId:rubric.id,promptId:rubric.promptId};}
  function compactOperation(op:ReturnType<typeof cleanup.operation>){if(!op)return null;const {files,...safe}=op;return {...safe,failedFiles:files.filter(x=>x.state==='failed').length};}
  async function dispatch(action:Action,payload:Record<string,unknown>):Promise<unknown> {
    if(disposed)fail('SERVICE_DISPOSED');
    switch(action){
      case 'status':return {apiVersion:1,ready:true,prepared:!!environment,preparing,writable:store.writable,rootPath:store.root,resourceVersion:manifest.resourceVersion,generalId:manifest.generalId,writingId:manifest.writingId,packageBytes:manifest.files.reduce((n,x)=>n+x.size,0),hostVerification:'unverified'};
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
      case 'prepare':return mutate(async()=>{writable();inactive();preparing=true;environment=undefined;try{const candidate=await prepareResources(store.root,manifest,deps.packageResources);await selfcheckEnvironment(candidate.resourcesPath);environment=candidate;return {prepared:true,bytes:environment.bytes,cached:environment.cached};}finally{preparing=false;}});
      case 'setRoot':return mutate(async()=>{inactive();if(typeof payload.path!=='string')return fail('INVALID_REQUEST');const selection=await switchRoot(payload.path,{writing:false});if(selection.path===store.root)return {rootPath:store.root};
        const oldRoot=store.root;await queue.dispose();await store.close();environment=undefined;
        try{await bind(selection.path);await writeRecord(preference,{root:store.root});}catch(error){await queue?.dispose().catch(()=>{});await store?.close().catch(()=>{});await bind(oldRoot);throw error;}return {rootPath:store.root,previousRoot:oldRoot,historyMoved:false};});
      case 'createBatch':return mutate(async()=>{writable();if(!environment)fail('ENVIRONMENT_NOT_PREPARED');const request:EvaluationRequest={targets:(payload.handles as unknown[]).map(target),tracks:payload.tracks as Track[],execution:payload.execution as EvaluationRequest['execution'],...(payload.judgeHandle?{judge:judge(payload.judgeHandle)}:{})};return queue.enqueue(request);});
      case 'queue':return queue.snapshot();
      case 'pause':return mutate(async()=>{await queue.pause(String(payload.batchId));return queue.snapshot();});
      case 'resume':return mutate(async()=>{writable();if(!environment)fail('ENVIRONMENT_NOT_PREPARED');await queue.resume(String(payload.batchId),payload.judgeHandle?judge(payload.judgeHandle):undefined);return queue.snapshot();});
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
  return {dispatch,async dispose(){if(disposed)return;disposed=true;await mutations;await queue.dispose();await store.close();}};
}

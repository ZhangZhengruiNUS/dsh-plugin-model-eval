import type {PerformanceSample,StageKey,ActiveStage,RunEstimation} from '../estimation/contracts.ts';
import type {GeneralDefinition,ReuseOrigin,ReuseEvidence} from '../evaluation/tier-contracts.ts';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, lstat, realpath, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { GeneratedAnswer, GradeResult, JudgeSnapshot, ProtocolRefs, RunSummary, TargetSnapshot, Track, TechnicalError,Question,ToolSessionCheckpoint } from '../contracts.ts';
import { fingerprintTarget } from '../model/identity.ts';
import {validateGeneralDefinition} from '../evaluation/definitions.ts';
import { inspectRoot } from '../resources/prepare.ts';
import { readRecord, writeRecord } from './atomic.ts';
import { acquireWriter } from './lock.ts';

export interface RequiredItem {id:string;track:Track;datasetId:string}
export interface RunManifestInput {batchId:string;target:TargetSnapshot;protocols:ProtocolRefs;requiredItems:RequiredItem[];judge?:JudgeSnapshot;initialEstimation?:RunEstimation;execution?:{concurrency:1|2|3|4;callTimeoutMs:number};generalDefinition?:GeneralDefinition;reuseOrigin?:ReuseOrigin}
export interface RunManifest extends RunManifestInput {schemaVersion:1;runId:string;createdAt:string}
export interface AttemptRecord {attemptId:string;phase:'answer'|'judge';status:'started'|'completed'|'failed'|'interrupted';startedAt:string;endedAt?:string;judge?:JudgeSnapshot;itemId?:string;track?:Track;
  observations?:GeneratedAnswer['observations'];error?:TechnicalError;rawText?:string;validationError?:TechnicalError;interruptedDetectedAt?:string;performance?:PerformanceSample;performanceKey?:StageKey;retryIndex?:number}
export interface ItemInput {toolCheckpoint?:ToolSessionCheckpoint;toolActiveMs?:number;toolObservation?:PerformanceSample;gradingActive?:ActiveStage;gradingObservation?:PerformanceSample;itemId:string;attempts:AttemptRecord[];answer?:GeneratedAnswer;grade?:GradeResult;question?:Omit<Question,'grading'>;reuse?:ReuseEvidence}
export interface ItemRecord extends ItemInput {schemaVersion:1;revision:number;sequence:number;updatedAt:string;answerCommittedAt?:string;gradeCommittedAt?:string}
export interface RecoveryDiagnostic {runId:string;itemId?:string;code:string}
export interface RecoveryReport {recoveredRunIds:string[];diagnostics:RecoveryDiagnostic[];temporaryFiles:number}
interface RunRecord {manifest:RunManifest;summary:RunSummary}
interface Cache extends RunRecord {items:Map<string,ItemRecord>;loaded:boolean}
export interface HistoryTransaction {
  createRun(input:RunManifestInput,identity?:{runId:string;createdAt:string}):Promise<RunSummary>;
  saveItem(runId:string,expectedRevision:number,item:ItemInput):Promise<void>;
  getItem(runId:string,itemId:string):Promise<ItemRecord|undefined>;listItems(runId:string):Promise<ItemRecord[]>;
  getRun(runId:string):Promise<RunRecord>;listSummaries():Promise<RunSummary[]>;
  updateSummary(runId:string,expectedRevision:number,change:(summary:RunSummary)=>void):Promise<RunSummary>;
  detailsDirectory(runId:string):Promise<string>;
  maintenanceDirectory:string;
}
export interface HistoryStore {
  readonly writable:boolean;readonly root:string;readonly rootId:string;
  createRun(input:RunManifestInput):Promise<RunSummary>;getRun(runId:string):Promise<RunRecord>;
  getItem(runId:string,itemId:string):Promise<ItemRecord|undefined>;listItems(runId:string):Promise<ItemRecord[]>;
  saveItem(runId:string,expectedRevision:number,item:ItemInput):Promise<void>;
  listSummaries():Promise<RunSummary[]>;updateSummary:HistoryTransaction['updateSummary'];
  exclusive<T>(action:(transaction:HistoryTransaction)=>Promise<T>):Promise<T>;
  recover():Promise<RecoveryReport>;close():Promise<void>;
}
const fail=(code:string):never=>{throw Object.assign(new Error(code),{code});};
const missing=(error:unknown)=>(error as NodeJS.ErrnoException).code==='ENOENT';
const clone=<T>(value:T):T=>structuredClone(value);
const hash=(id:string)=>createHash('sha256').update(id).digest('hex');
const validId=(id:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
async function directory(path:string):Promise<void> {
  try {await mkdir(path);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink()||await realpath(path)!==path)fail('HISTORY_PATH_REJECTED');
}
export async function openHistory(root:string):Promise<HistoryStore> {
  const inspection=await inspectRoot(root);if(inspection.kind!=='owned')return fail('ROOT_NOT_OWNED');root=inspection.path;
  const history=join(root,'history');await directory(history);
  const lease=await acquireWriter(history),runs=join(history,'runs'),maintenance=join(history,'maintenance');
  if(lease.writable){await directory(runs);await directory(maintenance);}
  const cache=new Map<string,Cache>();let tail:Promise<unknown>=Promise.resolve(),closed=false,closing=false,faulted=false;
  const runPath=(id:string)=>{if(!validId(id))return fail('INVALID_RUN_ID');return join(runs,id);};
  const assertOpen=()=>{if(closed)fail('HISTORY_CLOSED');};
  async function load(id:string):Promise<Cache> {
    assertOpen();if(lease.writable&&cache.has(id))return cache.get(id)!;
    const path=runPath(id),info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink())return fail('HISTORY_PATH_REJECTED');
    const manifest=await readRecord<RunManifest>(join(path,'run.json'));
    if(manifest.schemaVersion!==1||manifest.runId!==id)return fail('RUN_CORRUPT');fingerprintTarget(manifest.target);
    const copies=await Promise.allSettled(['summary.json','summary.backup.json'].map(file=>readRecord<RunSummary>(join(path,file))));
    const valid=copies.flatMap(x=>x.status==='fulfilled'&&x.value.runId===id&&x.value.batchId===manifest.batchId?[x.value]:[]);
    const summary=valid.sort((a,b)=>b.revision-a.revision)[0];if(!summary)return fail('RUN_CORRUPT');
    if(manifest.generalDefinition){validateGeneralDefinition(manifest.generalDefinition,manifest.requiredItems);if(!isDeepStrictEqual(manifest.generalDefinition,summary.generalDefinition))return fail('RUN_CORRUPT');}
    if(summary.runId!==id||summary.batchId!==manifest.batchId)return fail('RUN_CORRUPT');fingerprintTarget(summary.target);
    const entry={manifest,summary,items:new Map<string,ItemRecord>(),loaded:false};if(lease.writable)cache.set(id,entry);return entry;
  }
  function requireItem(run:Cache,id:string):void {if(!run.manifest.requiredItems.some(x=>x.id===id))fail('ITEM_NOT_IN_PROTOCOL');}
  async function readItem(run:Cache,id:string):Promise<ItemRecord|undefined> {
    requireItem(run,id);if(lease.writable&&run.items.has(id))return run.items.get(id);
    if(lease.writable&&run.loaded)return undefined;
    try {
      const path=join(runPath(run.manifest.runId),'details','items',hash(id)+'.json');
      if((await lstat(path)).isSymbolicLink())return fail('HISTORY_PATH_REJECTED');
      const record=await readRecord<ItemRecord>(path);
      if(record.schemaVersion!==1||record.itemId!==id||!Number.isSafeInteger(record.revision)||record.revision<1)return fail('ITEM_CORRUPT');
      if(lease.writable)run.items.set(id,record);return record;
    }catch(error){if(missing(error))return undefined;return fail('ITEM_CORRUPT');}
  }
  async function items(run:Cache):Promise<ItemRecord[]> {
    for(const required of run.manifest.requiredItems)await readItem(run,required.id);
    if(lease.writable){run.loaded=true;return [...run.items.values()];}
    return (await Promise.all(run.manifest.requiredItems.map(x=>readItem(run,x.id)))).filter((x):x is ItemRecord=>!!x);
  }
  async function persistSummary(run:Cache,next:RunSummary):Promise<void> {
    try {
      await writeRecord(join(runPath(next.runId),'summary.backup.json'),next);
      await writeRecord(join(runPath(next.runId),'summary.json'),next);run.summary=next;
    }catch(error){faulted=true;throw error;}
  }
  async function summaries():Promise<RunSummary[]> {
    assertOpen();let names:string[];try {names=await readdir(runs);}catch(error){if(missing(error))return [];throw error;}
    const result:RunSummary[]=[];
    for(const name of names)if(validId(name)){try {result.push(clone((await load(name)).summary));}catch{/* recovery exposes diagnostics; never fabricate a replacement score */}}
    return result;
  }
  async function update(id:string,expected:number,change:(summary:RunSummary)=>void):Promise<RunSummary> {
    const run=await load(id),before=run.summary;if(before.revision!==expected)return fail('REVISION_CONFLICT');
    const next=clone(before);change(next);
    if(next.runId!==before.runId||next.batchId!==before.batchId||!isDeepStrictEqual(next.target,before.target)||!isDeepStrictEqual(next.protocols,before.protocols)||!isDeepStrictEqual(next.generalDefinition,before.generalDefinition))return fail('IMMUTABLE_RUN');
    if(before.details==='cleared'&&next.details!=='cleared'||!before.resumeAllowed&&next.resumeAllowed)return fail('IMMUTABLE_CLEANUP');
    for(const track of ['general','writing'] as const) {
      const old=before.tracks[track],value=next.tracks[track];
      if(old&&(!value||value.required!==old.required||value.graded<0||value.graded>value.required||!Number.isInteger(value.graded)))return fail('INVALID_TRACK_SUMMARY');
      if(old?.completedAt&&value?.completedAt!==old.completedAt)return fail('IMMUTABLE_COMPLETION_TIME');
      if(old?.status==='completed'&&!isDeepStrictEqual(old,value))return fail('IMMUTABLE_COMPLETED_TRACK');
    }
    next.revision=before.revision+1;await persistSummary(run,next);return clone(next);
  }
  async function getItem(id:string,itemId:string):Promise<ItemRecord|undefined>{const run=await load(id);if(run.summary.details!=='available')return fail('DETAILS_UNAVAILABLE');const value=await readItem(run,itemId);return value?clone(value):undefined;}
  async function listItems(id:string):Promise<ItemRecord[]>{const run=await load(id);if(run.summary.details!=='available')return fail('DETAILS_UNAVAILABLE');return clone(await items(run));}
  async function createRun(input:RunManifestInput,identity?:{runId:string;createdAt:string}):Promise<RunSummary>{
      fingerprintTarget(input.target);
      if(!input.requiredItems.length||new Set(input.requiredItems.map(x=>x.id)).size!==input.requiredItems.length)return fail('INVALID_RUN_MANIFEST');
      if(input.generalDefinition)validateGeneralDefinition(input.generalDefinition,input.requiredItems);
      const id=identity?.runId??randomUUID(),createdAt=identity?.createdAt??new Date().toISOString(),path=runPath(id);
      const manifest:RunManifest={...clone(input),schemaVersion:1,runId:id,createdAt};
      if(identity){
        try{const existing=await load(id);if(!isDeepStrictEqual(existing.manifest,manifest))return fail('REUSE_DESTINATION_CHANGED');return clone(existing.summary);}
        catch(error){if(!missing(error)&&(error as Error).message!=='RUN_CORRUPT')throw error;}
        await directory(path);
      }else await mkdir(path);
      await directory(join(path,'details'));await directory(join(path,'details','items'));await directory(join(path,'details','attempts'));await directory(join(path,'diagnostics'));
      const summary:RunSummary={runId:id,batchId:input.batchId,target:clone(input.target),revision:0,createdAt,tracks:{},details:'available',resumeAllowed:true,protocols:clone(input.protocols),...(input.generalDefinition?{generalDefinition:clone(input.generalDefinition)}:{}),judges:[],metrics:{tracks:{},activeIntervals:[],incompleteTiming:false},...(input.initialEstimation?{estimation:clone(input.initialEstimation)}:{})};
      for(const track of ['general','writing'] as const){const required=input.requiredItems.filter(x=>x.track===track).length;if(required)summary.tracks[track]={status:'queued',required,graded:0,answered:0,measures:{}};}
      for(const [file,value] of [['run.json',manifest],['summary.json',summary],['summary.backup.json',summary]] as const){
        if(identity){try{const saved=await readRecord(join(path,file));if(!isDeepStrictEqual(saved,value))return fail('REUSE_DESTINATION_CHANGED');continue;}catch(error){if(!missing(error))throw error;}}
        await writeRecord(join(path,file),value);
      }
      cache.set(id,{manifest,summary,items:new Map(),loaded:true});return clone(summary);
  }
  async function saveItem(id:string,expected:number,input:ItemInput):Promise<void>{
      const run=await load(id);if(run.summary.details!=='available'||!run.summary.resumeAllowed)return fail('DETAILS_UNAVAILABLE');requireItem(run,input.itemId);
      const old=await readItem(run,input.itemId);if((old?.revision??0)!==expected)return fail('REVISION_CONFLICT');
      if(old?.answer?.complete&&!isDeepStrictEqual(old.answer,input.answer))return fail('IMMUTABLE_ANSWER');
      if(old?.grade?.kind==='scored'&&!isDeepStrictEqual(old.grade,input.grade))return fail('IMMUTABLE_GRADE');
      if(old?.grade?.kind==='scored'&&old.gradingObservation&&!isDeepStrictEqual(old.gradingObservation,input.gradingObservation))return fail('IMMUTABLE_GRADE');
      if(old?.question&&!isDeepStrictEqual(old.question,input.question))return fail('IMMUTABLE_QUESTION');
      if(old?.reuse&&!isDeepStrictEqual(old.reuse,input.reuse))return fail('IMMUTABLE_REUSE');
      if(input.toolCheckpoint){const cp=input.toolCheckpoint,previous=old?.toolCheckpoint;
        if(run.manifest.requiredItems.find(q=>q.id===input.itemId)?.datasetId!=='bfcl-v4-multi-turn-selected'||cp.actions!==cp.committedCallIds.length||cp.callsByTurn.flat().length!==cp.actions||cp.actions<0||cp.actions>32||cp.logicalRounds<0||cp.logicalRounds>24||new Set(cp.committedCallIds).size!==cp.actions)return fail('INVALID_TOOL_CHECKPOINT');
        if(previous&&(cp.scenarioHash!==previous.scenarioHash||cp.targetHash!==previous.targetHash||cp.scenarioId!==previous.scenarioId||cp.userTurn<previous.userTurn||cp.actions<previous.actions||cp.actions>previous.actions+1||cp.logicalRounds<previous.logicalRounds||!isDeepStrictEqual(cp.committedCallIds.slice(0,previous.actions),previous.committedCallIds)||!isDeepStrictEqual(cp.callsByTurn.flat().slice(0,previous.actions),previous.callsByTurn.flat())||cp.actions===previous.actions&&!isDeepStrictEqual(cp.stateSnapshot,previous.stateSnapshot)||previous.stage==='done'&&!isDeepStrictEqual(cp,previous)))return fail('IMMUTABLE_TOOL_CHECKPOINT');
      }else if(old?.toolCheckpoint)return fail('IMMUTABLE_TOOL_CHECKPOINT');
      if(new Set(input.attempts.map(x=>x.attemptId)).size!==input.attempts.length)return fail('DUPLICATE_ATTEMPT');
      for(const previous of old?.attempts??[]){const next=input.attempts.find(x=>x.attemptId===previous.attemptId);if(!next||next.phase!==previous.phase||next.startedAt!==previous.startedAt||!isDeepStrictEqual(previous.judge,next.judge)||previous.observations&&!isDeepStrictEqual(previous.observations,next.observations)||previous.performance&&!isDeepStrictEqual(previous.performance,next.performance)||previous.performanceKey&&!isDeepStrictEqual(previous.performanceKey,next.performanceKey)||previous.status!=='started'&&next.status!==previous.status)return fail('IMMUTABLE_ATTEMPT');}
      const now=new Date().toISOString(),record:ItemRecord={...clone(input),schemaVersion:1,revision:expected+1,sequence:run.summary.revision+1,updatedAt:now,
        ...(old?.answerCommittedAt?{answerCommittedAt:old.answerCommittedAt}:input.answer?.complete?{answerCommittedAt:now}:{}),
        ...(old?.gradeCommittedAt?{gradeCommittedAt:old.gradeCommittedAt}:input.grade?.kind==='scored'?{gradeCommittedAt:now}:{})};
      try {
        for(const attempt of record.attempts)await writeRecord(join(runPath(id),'details','attempts',hash(attempt.attemptId)+'.json'),{itemId:record.itemId,attempt});
        await writeRecord(join(runPath(id),'details','items',hash(input.itemId)+'.json'),record);run.items.set(record.itemId,record);
        const current=await items(run),next=clone(run.summary);next.revision++;
        for(const track of ['general','writing'] as const){const value=next.tracks[track];if(!value||value.status==='completed')continue;const allowed=new Set(run.manifest.requiredItems.filter(x=>x.track===track).map(x=>x.id));value.answered=current.filter(x=>allowed.has(x.itemId)&&x.answer?.complete).length;value.graded=current.filter(x=>allowed.has(x.itemId)&&x.grade?.kind==='scored').length;}
        await persistSummary(run,next);
      }catch(error){faulted=true;throw error;}
  }
  const transaction:HistoryTransaction={createRun,saveItem,getItem,listItems,async getRun(id){const run=await load(id);return {manifest:clone(run.manifest),summary:clone(run.summary)};},listSummaries:summaries,updateSummary:update,
    async detailsDirectory(id){const run=await load(id);const path=join(runPath(id),'details');const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path)return fail('HISTORY_PATH_REJECTED');return path;},maintenanceDirectory:maintenance};
  async function exclusive<T>(action:(tx:HistoryTransaction)=>Promise<T>):Promise<T> {
    assertOpen();if(closing)return fail('HISTORY_CLOSED');if(!lease.writable)return fail('HISTORY_READ_ONLY');if(faulted)return fail('HISTORY_NEEDS_RECOVERY');
    const result=tail.then(()=>{assertOpen();if(faulted)return fail('HISTORY_NEEDS_RECOVERY');return action(transaction);});tail=result.catch(()=>{});return result;
  }
  const store:HistoryStore={writable:lease.writable,root,rootId:inspection.marker.rootId,exclusive,
    getRun:transaction.getRun,listSummaries:summaries,
    getItem,listItems,
    createRun(input){return exclusive(tx=>tx.createRun(input));},
    saveItem(id,expected,input){return exclusive(tx=>tx.saveItem(id,expected,input));},
    updateSummary(id,revision,change){return exclusive(()=>update(id,revision,change));},
    async recover(){
      assertOpen();if(!lease.writable)return fail('HISTORY_READ_ONLY');await tail;faulted=false;
      return exclusive(async()=>{
        cache.clear();const report:RecoveryReport={recoveredRunIds:[],diagnostics:[],temporaryFiles:0};
        for(const name of await readdir(runs))if(validId(name)) {
          let run:Cache;try {run=await load(name);}catch{report.diagnostics.push({runId:name,code:'RUN_CORRUPT'});continue;}
          if(run.summary.details!=='available')continue;
          if(Object.values(run.summary.tracks).every(x=>x.status==='completed'))continue;
          const journal=new Map<string,AttemptRecord[]>(),durableTimes:string[]=[];
          for(const file of await readdir(join(runPath(name),'details','attempts')))if(file.endsWith('.json')) {
            try {const saved=await readRecord<{itemId:string;attempt:AttemptRecord}>(join(runPath(name),'details','attempts',file));requireItem(run,saved.itemId);const list=journal.get(saved.itemId)??[];list.push(saved.attempt);journal.set(saved.itemId,list);}
            catch{report.diagnostics.push({runId:name,code:'ATTEMPT_CORRUPT'});}
          }
          for(const required of run.manifest.requiredItems) {
            let item:ItemRecord|undefined;
            try {item=await readItem(run,required.id);}catch {
              report.diagnostics.push({runId:name,itemId:required.id,code:'ITEM_CORRUPT'});
              await rename(join(runPath(name),'details','items',hash(required.id)+'.json'),join(runPath(name),'diagnostics',`${hash(required.id)}-${randomUUID()}.corrupt.json`));
            }
            if(item)durableTimes.push(item.updatedAt);
            const attempts=journal.get(required.id)??item?.attempts??[];
            for(const attempt of attempts)if(attempt.status==='started'){attempt.status='interrupted';attempt.interruptedDetectedAt=new Date().toISOString();await writeRecord(join(runPath(name),'details','attempts',hash(attempt.attemptId)+'.json'),{itemId:required.id,attempt});}
            if((item||attempts.length)&&(!item||!isDeepStrictEqual(item.attempts,attempts))){const record:ItemRecord={...(item??{itemId:required.id}),attempts,schemaVersion:1,revision:(item?.revision??0)+1,sequence:Math.max(run.summary.revision,item?.sequence??0)+1,updatedAt:new Date().toISOString()};await writeRecord(join(runPath(name),'details','items',hash(required.id)+'.json'),record);run.items.set(required.id,record);}
          }
          report.temporaryFiles+=(await readdir(join(runPath(name),'details','items'))).filter(x=>x.endsWith('.tmp')).length;
          run.loaded=true;const next=clone(run.summary);next.revision=Math.max(next.revision,...[...run.items.values()].map(x=>x.sequence))+1;
          for(const track of ['general','writing'] as const){const value=next.tracks[track];if(!value||value.status==='completed')continue;const allowed=new Set(run.manifest.requiredItems.filter(x=>x.track===track).map(x=>x.id));value.status='paused';value.answered=[...run.items.values()].filter(x=>allowed.has(x.itemId)&&x.answer?.complete).length;value.graded=[...run.items.values()].filter(x=>allowed.has(x.itemId)&&x.grade?.kind==='scored').length;}
          for(const interval of next.metrics.activeIntervals)if(!interval.endedAt){next.metrics.incompleteTiming=true;const last=durableTimes.filter(x=>x>=interval.startedAt).sort().at(-1);interval.endedAt=last??interval.startedAt;}
          await persistSummary(run,next);report.recoveredRunIds.push(name);
        }
        return report;
      });
    },
    async close(){if(closed)return;closing=true;await tail;await lease.close();closed=true;cache.clear();},
  };
  return store;
}

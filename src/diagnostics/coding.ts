import {CONTEST_WALL_SAFETY_LIMITS} from '../evaluation/contest-budget.ts';
import {createHash,randomUUID} from 'node:crypto';
import {lstat,mkdir,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {HistoryStore,HistoryTransaction} from '../history/store.ts';
import {readRecord,writeRecord} from '../history/atomic.ts';
import {extractCode} from '../evaluation/grade-general.ts';
import {identityHash} from '../evaluation/protocol-identity.ts';
import type {ProtocolRegistry,ResolvedProtocolSet} from '../evaluation/tier-contracts.ts';
import {createContestDiagnosticRunner} from '../runtime/contest-diagnostic-runner.ts';
import type {ContestRunner,ContestTest} from '../runtime/contest-runner.ts';
import type {ContestDiagnostics} from '../runtime/contest-diagnostics.ts';
import type {CodingDiagnosticRecord,CodingDiagnosticSettings,CodingDiagnosticSource,CodingDiagnosticView} from './contracts.ts';

const fail=(code:string):never=>{throw Object.assign(new Error(code),{code});};
const missing=(error:unknown)=>(error as NodeJS.ErrnoException).code==='ENOENT';
const safeCode=(error:unknown)=>{
  const value=(error as {code?:string})?.code;
  return /^[A-Z][A-Z0-9_]{1,70}$/.test(value??'')?value!:'CODING_DIAGNOSTIC_FAILED';
};
export interface CodingDiagnosticDependencies {
  store:HistoryStore;
  registry:ProtocolRegistry;
  driverRoot:string;
  runtimeFor(protocol:ResolvedProtocolSet):string|Promise<string>;
  runner?:(runtime:string,driverRoot:string,observe:(trace:ContestDiagnostics)=>void)=>ContestRunner;
}

/** Saved answers are replayed locally. No adapter or score-writing API is available here. */
export async function createCodingDiagnostics(deps:CodingDiagnosticDependencies) {
  const {store}=deps;
  const settingsPath=join(store.root,'history','maintenance','coding-diagnostics-settings.json');
  let settings:CodingDiagnosticSettings={enabled:false};
  try {
    const saved=await readRecord<{version:number;enabled:boolean}>(settingsPath);
    if(saved.version!==1||typeof saved.enabled!=='boolean')throw Error('INVALID_SETTINGS');
    settings={enabled:saved.enabled};
  }catch(error){if(!missing(error))settings.errorCode='CODING_DIAGNOSTIC_SETTINGS_INVALID';}
  let current:CodingDiagnosticRecord|undefined,controller:AbortController|undefined;
  let done=Promise.resolve(),disposed=false;

  async function file(tx:Pick<HistoryTransaction,'detailsDirectory'>,runId:string,itemId:string,create=false) {
    const details=await tx.detailsDirectory(runId),folder=join(details,'coding-diagnostics');
    if(create){try{await mkdir(folder);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}}
    const info=await lstat(folder);
    if(!info.isDirectory()||info.isSymbolicLink()||await realpath(folder)!==resolve(folder))return fail('CODING_DIAGNOSTIC_PATH_REJECTED');
    const path=join(folder,createHash('sha256').update(itemId).digest('hex')+'.json');
    try{const entry=await lstat(path);if(!entry.isFile()||entry.isSymbolicLink()||await realpath(path)!==resolve(path))fail('CODING_DIAGNOSTIC_PATH_REJECTED');}
    catch(error){if(!missing(error))throw error;}
    return path;
  }

  async function source(tx:HistoryTransaction,runId:string,itemId:string) {
    const {manifest,summary}=await tx.getRun(runId);
    if(summary.details!=='available')return fail('DETAILS_UNAVAILABLE');
    const protocol=await deps.registry.resolve(manifest.protocols);
    const question=protocol.items.find(item=>item.id===itemId);
    const required=manifest.requiredItems.find(item=>item.id===itemId);
    if(!question||question.track!=='general'||question.datasetId!=='code-contests-selected'||required?.track!==question.track||required.datasetId!==question.datasetId) return fail('CODING_DIAGNOSTIC_UNSUPPORTED');
    const item=await tx.getItem(runId,itemId);
    if(!item?.answer?.complete||item.answer.truncated)return fail('CODING_DIAGNOSTIC_ANSWER_UNAVAILABLE');
    const {grading,...publicQuestion}=question;
    if(item.question&&identityHash(item.question)!==identityHash(publicQuestion))return fail('CODING_DIAGNOSTIC_SOURCE_CHANGED');
    const code=extractCode(item.answer.text);
    if(code===undefined)return fail('CODING_DIAGNOSTIC_CODE_UNAVAILABLE');
    const raw=grading as unknown as Pick<ContestTest,'cases'|'limits'>;
    if(!raw||!Array.isArray(raw.cases)||!raw.cases.length||!raw.limits)return fail('CODING_DIAGNOSTIC_UNSUPPORTED');
    const test={id:question.id,cases:raw.cases,limits:protocol.contestPolicy?CONTEST_WALL_SAFETY_LIMITS:raw.limits};
    const binding:CodingDiagnosticSource={protocols:manifest.protocols,itemRevision:item.revision,
      questionHash:identityHash(question),answerHash:identityHash(item.answer.text),gradeHash:identityHash(item.grade??null),
      limits:structuredClone(test.limits),cases:test.cases.length};
    return {code,test,binding,protocol};
  }

  async function persist(record:CodingDiagnosticRecord) {
    const snapshot=structuredClone(record);
    await store.exclusive(async tx=>{
      const fresh=await source(tx,snapshot.runId,snapshot.itemId);
      if(identityHash(fresh.binding)!==identityHash(snapshot.source))return fail('CODING_DIAGNOSTIC_SOURCE_CHANGED');
      await writeRecord(await file(tx,snapshot.runId,snapshot.itemId,true),snapshot);
    });
  }

  async function execute(record:CodingDiagnosticRecord,signal:AbortSignal) {
    try {
      const saved=await store.exclusive(tx=>source(tx,record.runId,record.itemId));
      record.source=saved.binding;
      await persist(record);
      if(signal.aborted){record.status='cancelled';}
      else {
        const runtime=await deps.runtimeFor(saved.protocol),observe=(trace:ContestDiagnostics)=>{record.trace=structuredClone(trace);};
        const runner=deps.runner?.(runtime,deps.driverRoot,observe)??createContestDiagnosticRunner(runtime,deps.driverRoot,{onDiagnostics:observe,...(saved.protocol.contestPolicy?{policy:saved.protocol.contestPolicy}:{})});
        record.outcome=await runner.runContest(saved.test,saved.code,signal);
        record.status=record.outcome.kind==='cancelled'?'cancelled':record.outcome.kind==='environment-error'?'error':'completed';
        if(record.outcome.kind==='environment-error')record.errorCode=/^[A-Z][A-Z0-9_]{1,70}$/.test(record.outcome.code)?record.outcome.code:'CODING_DIAGNOSTIC_FAILED';
      }
      record.endedAt=new Date().toISOString();
      await persist(record);
    }catch(error){
      record.status=signal.aborted?'cancelled':'error';record.errorCode=safeCode(error);record.endedAt=new Date().toISOString();
      if(record.source){try{await persist(record);}catch{record.errorCode='CODING_DIAGNOSTIC_STORAGE_FAILED';}}
    }
  }

  return {
    settings:():CodingDiagnosticSettings=>structuredClone(settings),
    active:()=>current&&['running','stopping'].includes(current.status)?structuredClone(current):undefined,
    async setEnabled(enabled:boolean) {
      if(disposed)return fail('SERVICE_DISPOSED');
      if(!store.writable)return fail('HISTORY_READ_ONLY');
      if(controller)return fail('ACTIVITY_BUSY');
      await store.exclusive(()=>writeRecord(settingsPath,{version:1,enabled}));
      settings={enabled};return structuredClone(settings);
    },
    start(runId:string,itemId:string) {
      if(disposed)return fail('SERVICE_DISPOSED');
      if(!store.writable)return fail('HISTORY_READ_ONLY');
      if(!settings.enabled)return fail('CODING_DIAGNOSTIC_DISABLED');
      if(controller)return fail('ACTIVITY_BUSY');
      controller=new AbortController();
      const record:CodingDiagnosticRecord={schemaVersion:1,diagnosticId:randomUUID(),runId,itemId,startedAt:new Date().toISOString(),status:'running'};
      current=record;const localController=controller;
      done=execute(record,localController.signal).finally(()=>{if(controller===localController)controller=undefined;});
      return {diagnosticId:record.diagnosticId};
    },
    cancel(diagnosticId:string) {
      if(!current||current.diagnosticId!==diagnosticId)return fail('CODING_DIAGNOSTIC_NOT_FOUND');
      if(controller&&current.status==='running'){current.status='stopping';controller.abort();}
      return {accepted:true,status:current.status};
    },
    async read(runId:string,itemId:string):Promise<CodingDiagnosticView> {
      const read=async(tx:Pick<HistoryTransaction,'getRun'|'detailsDirectory'>)=>{
        const {manifest,summary}=await tx.getRun(runId);
        if(summary.details!=='available'||!manifest.requiredItems.some(item=>item.id===itemId))return {...settings};
        if(current?.runId===runId&&current.itemId===itemId)return {...settings,record:structuredClone(current)};
        try{
          const record=await readRecord<CodingDiagnosticRecord>(await file(tx,runId,itemId));
          if(record.schemaVersion!==1||record.runId!==runId||record.itemId!==itemId||!['running','stopping','completed','cancelled','error','interrupted'].includes(record.status))return fail('CODING_DIAGNOSTIC_RECORD_INVALID');
          if(['running','stopping'].includes(record.status))return {...settings,record:{...record,status:store.writable?'interrupted' as const:'unknown' as const,errorCode:store.writable?'CODING_DIAGNOSTIC_INTERRUPTED':'CODING_DIAGNOSTIC_EXTERNAL_ACTIVITY'}};
          return {...settings,record};
        }catch(error){if(missing(error))return {...settings};return fail('CODING_DIAGNOSTIC_RECORD_INVALID');}
      };
      // detailsDirectory is a validated read operation. Readers never publish diagnostics.
      if(!store.writable)return read(store);
      return store.exclusive(read);
    },
    idle:()=>done,
    async dispose(){disposed=true;controller?.abort();await done;},
  };
}

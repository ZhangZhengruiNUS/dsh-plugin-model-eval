import {randomUUID,createHash} from 'node:crypto';import {readdir,lstat,realpath,readFile,unlink} from 'node:fs/promises';import {join,relative,resolve} from 'node:path';
import type {HistoryStore,HistoryTransaction} from './store.ts';import {readRecord,writeRecord} from './atomic.ts';
import {refreshRunSummary} from '../evaluation/aggregate-run.ts';
export interface RunUsage {runId:string;batchId:string;totalBytes:number;detailBytes:number;summaryBytes:number}
export interface HistoryUsage {historyBytes:number;resourceBytes:number;sharedBytes:number;runs:RunUsage[];measurement:'file-bytes'}
interface FileEntry {runId:string;path:string;size:number;sha256:string;state:'planned'|'deleting'|'deleted'|'missing'|'failed';error?:string}
export interface CleanupPreview {token:string;rootId:string;batchIds:string[];runs:{runId:string;revision:number;losesResume:boolean}[];bytes:number;expiresAt:string}
export interface CleanupOperation {operationId:string;rootId:string;batchIds:string[];runIds:string[];status:'running'|'partial'|'completed';plannedBytes:number;deletedBytes:number;unconfirmedBytes:number;remainingBytes:number;files:FileEntry[]}
const fail=(code:string):never=>{throw Object.assign(new Error(code),{code});};const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function walk(root:string,base=root,hashFiles=true):Promise<{path:string;size:number;sha256:string}[]> {
  let info;try{info=await lstat(root);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
  if(info.isSymbolicLink()||await realpath(root)!==resolve(root))return fail('CLEANUP_PATH_REJECTED');
  if(info.isFile())return [{path:relative(base,root).replaceAll('\\','/'),size:info.size,sha256:hashFiles?digest(await readFile(root)):''}];
  if(!info.isDirectory())return fail('CLEANUP_PATH_REJECTED');const files=[];
  for(const name of await readdir(root))files.push(...await walk(join(root,name),base,hashFiles));return files;
}
async function checkedFile(details:string,file:FileEntry):Promise<string> {
  if(!file.path||file.path.includes('\\')||file.path.split('/').some(x=>!x||x==='.'||x==='..'))return fail('CLEANUP_PATH_REJECTED');
  let path=details;for(const name of file.path.split('/')){path=join(path,name);const info=await lstat(path);if(info.isSymbolicLink()||await realpath(path)!==resolve(path))return fail('CLEANUP_PATH_REJECTED');}
  if(!(await lstat(path)).isFile())return fail('CLEANUP_PATH_REJECTED');return path;
}
export function createCleanup(store:HistoryStore,activeBatch:()=>string|undefined,options:{beforeDelete?:(file:Readonly<FileEntry>)=>Promise<void>}={}) {
  const previews=new Map<string,{preview:CleanupPreview;files:FileEntry[]}>(),operations=new Map<string,CleanupOperation>();
  const operationPath=(id:string)=>{if(!/^[a-f0-9-]{36}$/.test(id))return fail('CLEANUP_TOKEN_INVALID');return join(store.root,'history','maintenance',`cleanup-${id}.json`);};
  async function measureHistory():Promise<HistoryUsage>{
    const summaries=await store.listSummaries(),runs:RunUsage[]=[];
    for(const summary of summaries){const path=join(store.root,'history','runs',summary.runId),files=await walk(path,path,false),totalBytes=files.reduce((n,x)=>n+x.size,0),detailBytes=files.filter(x=>x.path.startsWith('details/')).reduce((n,x)=>n+x.size,0);runs.push({runId:summary.runId,batchId:summary.batchId,totalBytes,detailBytes,summaryBytes:totalBytes-detailBytes});}
    const historyRoot=join(store.root,'history'),resources=join(store.root,'resources');const historyBytes=(await walk(historyRoot,historyRoot,false)).reduce((n,x)=>n+x.size,0),resourceBytes=(await walk(resources,resources,false)).reduce((n,x)=>n+x.size,0);
    return {historyBytes,resourceBytes,sharedBytes:Math.max(0,historyBytes-runs.reduce((n,x)=>n+x.totalBytes,0)),runs,measurement:'file-bytes'};
  }
  async function previewCleanup(ids:string[]):Promise<CleanupPreview>{return store.exclusive(async tx=>{
    const batchIds=[...new Set(ids)];if(!batchIds.length)return fail('CLEANUP_EMPTY');if(batchIds.includes(activeBatch()??''))return fail('BATCH_ACTIVE');
    let selected=(await tx.listSummaries()).filter(x=>batchIds.includes(x.batchId));if(batchIds.some(id=>!selected.some(x=>x.batchId===id)))return fail('BATCH_NOT_FOUND');
    for(const run of selected)await refreshRunSummary(store,tx,run.runId);
    selected=(await tx.listSummaries()).filter(x=>batchIds.includes(x.batchId));
    const files:FileEntry[]=[];for(const run of selected)for(const file of await walk(await tx.detailsDirectory(run.runId)))files.push({...file,runId:run.runId,state:'planned'});
    const preview:CleanupPreview={token:randomUUID(),rootId:store.rootId,batchIds,runs:selected.map(x=>({runId:x.runId,revision:x.revision,losesResume:Object.values(x.tracks).some(t=>t.status!=='completed')&&x.resumeAllowed})),bytes:files.reduce((n,x)=>n+x.size,0),expiresAt:new Date(Date.now()+600000).toISOString()};
    previews.set(preview.token,{preview,files});return structuredClone(preview);
  });}
  async function persist(operation:CleanupOperation){await writeRecord(operationPath(operation.operationId),operation);}
  async function loadOperation(token:string):Promise<CleanupOperation|undefined>{if(operations.has(token))return operations.get(token);try{const op=await readRecord<CleanupOperation>(operationPath(token));if(op.rootId!==store.rootId)return fail('CLEANUP_ROOT_CHANGED');operations.set(token,op);return op;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}}
  async function apply(tx:HistoryTransaction,op:CleanupOperation):Promise<CleanupOperation> {
    if(op.status==='completed')return structuredClone(op);if(op.batchIds.includes(activeBatch()??''))return fail('BATCH_ACTIVE');
    op.status='running';await persist(op);
    for(const id of op.runIds){await refreshRunSummary(store,tx,id);const {summary}=await tx.getRun(id);if(summary.details==='available')await tx.updateSummary(id,summary.revision,next=>{next.details='cleanup-pending';next.resumeAllowed=false;});}
    for(const file of op.files){if(['deleted','missing'].includes(file.state))continue;
      try{
        const details=await tx.detailsDirectory(file.runId),path=await checkedFile(details,file),bytes=await readFile(path);if(bytes.length!==file.size||digest(bytes)!==file.sha256)throw new Error('FILE_CHANGED');
        file.state='deleting';delete file.error;await persist(op);await options.beforeDelete?.(file);
        await unlink(path);file.state='deleted';op.deletedBytes+=file.size;op.remainingBytes-=file.size;await persist(op);
      }catch(error){if(file.state==='deleted')throw error;file.state='failed';file.error=(error as NodeJS.ErrnoException).code==='ENOENT'?'FILE_MISSING':'DELETE_FAILED';await persist(op);}
    }
    op.status=op.files.every(x=>['deleted','missing'].includes(x.state))?'completed':'partial';
    for(const id of op.runIds){const {summary}=await tx.getRun(id);await tx.updateSummary(id,summary.revision,next=>{next.details=op.files.some(x=>x.runId===id&&!['deleted','missing'].includes(x.state))?'partial':'cleared';next.resumeAllowed=false;});}
    await persist(op);return structuredClone(op);
  }
  async function commitCleanup(token:string):Promise<CleanupOperation>{return store.exclusive(async tx=>{
    let op=await loadOperation(token);if(op)return apply(tx,op);
    const entry=previews.get(token);if(!entry)return fail('CLEANUP_TOKEN_INVALID');const {preview,files}=entry;
    if(preview.rootId!==store.rootId||Date.parse(preview.expiresAt)<Date.now())return fail('CLEANUP_PREVIEW_STALE');if(preview.batchIds.includes(activeBatch()??''))return fail('BATCH_ACTIVE');
    for(const expected of preview.runs){const {summary}=await tx.getRun(expected.runId);if(summary.revision!==expected.revision)return fail('CLEANUP_PREVIEW_STALE');}
    for(const file of files){const path=await checkedFile(await tx.detailsDirectory(file.runId),file),bytes=await readFile(path);if(bytes.length!==file.size||digest(bytes)!==file.sha256)return fail('CLEANUP_PREVIEW_STALE');}
    op={operationId:token,rootId:store.rootId,batchIds:preview.batchIds,runIds:preview.runs.map(x=>x.runId),status:'running',plannedBytes:preview.bytes,deletedBytes:0,unconfirmedBytes:0,remainingBytes:preview.bytes,files:structuredClone(files)};
    operations.set(token,op);await persist(op);
    // Both same-generation summary copies are durable before any detail unlink.
    for(const id of op.runIds){const {summary}=await tx.getRun(id);await tx.updateSummary(id,summary.revision,next=>{next.details='cleanup-pending';next.resumeAllowed=false;});}
    return apply(tx,op);
  });}
  async function recoverCleanup():Promise<void>{
    for(const file of await readdir(join(store.root,'history','maintenance')))if(/^cleanup-[a-f0-9-]{36}\.json$/.test(file)){
      const token=file.slice(8,-5),op=await loadOperation(token);if(!op||op.status==='completed')continue;
      await store.exclusive(async tx=>{for(const entry of op.files)if(entry.state==='deleting'){
        try{await checkedFile(await tx.detailsDirectory(entry.runId),entry);entry.state='planned';}
        catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){entry.state='missing';op.unconfirmedBytes+=entry.size;op.remainingBytes-=entry.size;}else {entry.state='failed';entry.error='RECOVERY_PATH_REJECTED';}}}
        // A process may have stopped between journal creation and summary publication.
        for(const id of op.runIds){await refreshRunSummary(store,tx,id);const {summary}=await tx.getRun(id);if(summary.details==='available')await tx.updateSummary(id,summary.revision,next=>{next.details='cleanup-pending';next.resumeAllowed=false;});}
        await persist(op);await apply(tx,op);
      });
    }
  }
  return {measureHistory,previewCleanup,commitCleanup,recoverCleanup,operation(token:string){const op=operations.get(token);return op?structuredClone(op):undefined;}};
}

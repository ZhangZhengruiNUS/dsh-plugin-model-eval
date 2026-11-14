import {createHash,randomUUID} from 'node:crypto';
import {mkdir,lstat,realpath,readdir,readFile,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import type {HistoryStore} from './store.ts';
import {readRecord,writeRecord} from './atomic.ts';
import {validateTimingTrace,traceIdValid,calibrationHash,type TimingTraceV1,type TimingTraceHistory,type TimingCleanupResult} from '../estimation/calibration-contracts.ts';

interface Entry {traceId:string;revision:number;size:number;sha256:string;state:'planned'|'deleting'|'deleted'|'missing'|'failed'}
interface Operation {version:1;rootId:string;token:string;status:'running'|'partial'|'completed';files:Entry[];deletedBytes:number;unconfirmedBytes:number;protectReferences?:true}
const fail=(code:string):never=>{throw Object.assign(Error(code),{code});};
const missing=(e:unknown)=>(e as NodeJS.ErrnoException).code==='ENOENT';
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
/** Count runs, not connected components: a preview may serve many runs. Keep
 * shared probe dependencies while any retained run still references them.
 * Unadopted preview groups have their own bounded recent-twenty allowance.
 */
function retentionEvictions(rows:TimingTraceV1[]):TimingTraceV1[]{
 const byId=new Map(rows.map(r=>[r.traceId,r])),runs=new Map<string,TimingTraceV1[]>();
 for(const row of rows)if(row.runId){const group=runs.get(row.runId)??[];group.push(row);runs.set(row.runId,group);}
 const order=(a:TimingTraceV1[],b:TimingTraceV1[])=>a.map(r=>r.startedAt).sort()[0]!.localeCompare(b.map(r=>r.startedAt).sort()[0]!)||a[0]!.traceId.localeCompare(b[0]!.traceId);
 const associated=new Set<string>(),keep=new Set<string>();
 const groups=[...runs.values()].sort(order);
 for(let i=0;i<groups.length;i++){
  const group=groups[i]!,runId=group[0]!.runId!,support=new Set(group.map(r=>r.traceId)),pending=[...group];
  for(let n=0;n<pending.length;n++)for(const id of [pending[n]!.pairedTraceId,pending[n]!.previewId,pending[n]!.predictionProbeId]){
   if(!id||support.has(id))continue;const row=byId.get(id);if(!row||row.runId&&row.runId!==runId)continue;
   support.add(id);pending.push(row);
  }
  for(const id of support){associated.add(id);if(i>=groups.length-20)keep.add(id);}
 }
 const orphan=rows.filter(r=>!r.runId&&!associated.has(r.traceId)),parent=new Map<string,string>(),orphanIds=new Set(orphan.map(r=>r.traceId));
 const find=(id:string):string=>{const p=parent.get(id);if(!p){parent.set(id,id);return id;}if(p===id)return id;const root=find(p);parent.set(id,root);return root;};
 for(const row of orphan)if(row.pairedTraceId&&orphanIds.has(row.pairedTraceId))parent.set(find(row.traceId),find(row.pairedTraceId));
 const previews=new Map<string,TimingTraceV1[]>();for(const row of orphan){const root=find(row.traceId),group=previews.get(root)??[];group.push(row);previews.set(root,group);}
 for(const group of [...previews.values()].sort(order).slice(-20))for(const row of group)keep.add(row.traceId);
 return rows.filter(r=>!keep.has(r.traceId));
}
export function createTimingTraceHistory(store:HistoryStore):TimingTraceHistory&{recoverCleanup():Promise<void>} {
  const previews=new Map<string,{expiresAt:string;entries:Entry[];protectReferences?:true}>();
  async function directory(path:string,create=false):Promise<boolean>{
    try {if(create)await mkdir(path);const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink()||await realpath(path)!==resolve(path))fail('TRACE_PATH_REJECTED');return true;}
    catch(e){if(create&&(e as NodeJS.ErrnoException).code==='EEXIST')return directory(path);if(!create&&missing(e))return false;throw e;}
  }
  async function checkedDir(create=false){
    if(!await directory(store.root)||!await directory(join(store.root,'history')))fail('TRACE_PATH_REJECTED');
    const path=join(store.root,'history','timing-traces');return await directory(path,create)?path:undefined;
  }
  async function checkedFile(id:string):Promise<string>{
    if(!traceIdValid(id))fail('TRACE_ID_INVALID');const dir=await checkedDir();if(!dir)throw Object.assign(Error('missing'),{code:'ENOENT'});
    const path=join(dir!,id+'.json'),info=await lstat(path);
    if(!info.isFile()||info.isSymbolicLink()||await realpath(path)!==resolve(path))fail('TRACE_PATH_REJECTED');return path;
  }
  async function read(id:string):Promise<TimingTraceV1|undefined>{
    if(!traceIdValid(id))fail('TRACE_ID_INVALID');
    try {const value=await readRecord<unknown>(await checkedFile(id));validateTimingTrace(value);if(value.traceId!==id||value.rootId!==store.rootId)fail('TRACE_ROOT_CHANGED');return value;}
    catch(e){if(missing(e))return undefined;throw e;}
  }
  async function list(signal?:AbortSignal){signal?.throwIfAborted();const dir=await checkedDir();if(!dir)return [];const rows:TimingTraceV1[]=[];
    for(const name of await readdir(dir))if(/^[a-f0-9-]{36}\.json$/.test(name)){signal?.throwIfAborted();const row=await read(name.slice(0,-5));if(row)rows.push(row);}
    return rows.sort((a,b)=>a.startedAt.localeCompare(b.startedAt)||a.traceId.localeCompare(b.traceId));
  }
  async function frozen(ids:readonly string[]){
    const entries:Entry[]=[];
    for(const id of [...new Set(ids)]){const row=await read(id);if(!row)fail('TRACE_NOT_FOUND');if(row!.status==='running')fail('TRACE_ACTIVE');
      const bytes=await readFile(await checkedFile(id));entries.push({traceId:id,revision:row!.revision,size:bytes.length,sha256:sha(bytes),state:'planned'});}
    return entries;
  }
  async function opPath(token:string){if(!traceIdValid(token))fail('TRACE_CLEANUP_TOKEN');
    const dir=join(store.root,'history','maintenance');if(!await checkedDir()||!await directory(dir))fail('TRACE_PATH_REJECTED');return join(dir,'timing-cleanup-'+token+'.json');}
  function validateOperation(x:Operation,token:string){
    if(!x||x.version!==1||x.rootId!==store.rootId||x.token!==token||!Array.isArray(x.files)||!['running','partial','completed'].includes(x.status)||
      x.protectReferences!==undefined&&x.protectReferences!==true||Object.keys(x).some(k=>!['version','rootId','token','status','files','deletedBytes','unconfirmedBytes','protectReferences'].includes(k)))fail('TRACE_OPERATION_INVALID');
    const ids=new Set<string>();
    for(const f of x.files){if(!f||!traceIdValid(f.traceId)||ids.has(f.traceId)||!Number.isSafeInteger(f.revision)||f.revision<1||!Number.isSafeInteger(f.size)||f.size<0||!calibrationHash(f.sha256)||
      !['planned','deleting','deleted','missing','failed'].includes(f.state)||Object.keys(f).some(k=>!['traceId','revision','size','sha256','state'].includes(k)))fail('TRACE_OPERATION_INVALID');ids.add(f.traceId);}
    if(x.deletedBytes!==x.files.filter(f=>f.state==='deleted').reduce((n,f)=>n+f.size,0)||x.unconfirmedBytes!==x.files.filter(f=>f.state==='missing').reduce((n,f)=>n+f.size,0))fail('TRACE_OPERATION_INVALID');
  }
  async function loadOperation(token:string){
    const path=await opPath(token);try{const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||await realpath(path)!==resolve(path))fail('TRACE_PATH_REJECTED');
      const x=await readRecord<Operation>(path);validateOperation(x,token);return x;}
    catch(e){if(missing(e))return undefined;throw e;}
  }
  async function persist(op:Operation){validateOperation(op,op.token);const path=await opPath(op.token);try{const i=await lstat(path);if(!i.isFile()||i.isSymbolicLink())fail('TRACE_PATH_REJECTED');}catch(e){if(!missing(e))throw e;}await writeRecord(path,op);}
  const result=(op:Operation):TimingCleanupResult=>({token:op.token,status:op.status==='completed'?'completed':'partial',deletedBytes:op.deletedBytes,unconfirmedBytes:op.unconfirmedBytes,
    remainingBytes:op.files.filter(f=>!['deleted','missing'].includes(f.state)).reduce((n,f)=>n+f.size,0)});
  async function apply(op:Operation){
    if(op.status==='completed')return result(op);
    if(op.protectReferences){const selected=new Set(op.files.map(f=>f.traceId));for(const row of await list())if(!selected.has(row.traceId)&&[row.previewId,row.pairedTraceId,row.predictionProbeId,row.firstPass?.sourceTraceId].some(id=>id&&selected.has(id)))fail('TRACE_CLEANUP_STALE');}
    for(const entry of op.files){if(['deleted','missing'].includes(entry.state))continue;
      try {
        const path=await checkedFile(entry.traceId),row=await read(entry.traceId),bytes=await readFile(path);
        if(row?.status==='running'||row?.revision!==entry.revision||bytes.length!==entry.size||sha(bytes)!==entry.sha256)fail('TRACE_CLEANUP_STALE');
        entry.state='deleting';await persist(op);await unlink(path);entry.state='deleted';op.deletedBytes+=entry.size;await persist(op);
      } catch(e){
        if(entry.state==='deleted')throw e;
        if(entry.state==='deleting'&&missing(e)){entry.state='missing';op.unconfirmedBytes+=entry.size;}else entry.state='failed';
        await persist(op);
      }
    }
    op.status=op.files.every(f=>['deleted','missing'].includes(f.state))?'completed':'partial';await persist(op);return result(op);
  }
  async function deleteEntries(entries:Entry[],token:string=randomUUID(),protectReferences?:true){
    const op:Operation={version:1,rootId:store.rootId,token,status:'running',files:structuredClone(entries),deletedBytes:0,unconfirmedBytes:0,...(protectReferences?{protectReferences}:{})};await persist(op);return apply(op);
  }
  return {
    read,list,
    async save(trace,expectedRevision){validateTimingTrace(trace);if(trace.rootId!==store.rootId)fail('TRACE_ROOT_CHANGED');
      return store.exclusive(async()=>{
        const old=await read(trace.traceId);if((old?.revision??0)!==expectedRevision||trace.revision!==expectedRevision)fail('TRACE_REVISION_CONFLICT');
        if(old&&(old.conditionKnown!==trace.conditionKnown||old.conditionKey!==trace.conditionKey||old.protocolHash!==trace.protocolHash||old.workloadHash!==trace.workloadHash||old.machineKey!==trace.machineKey||old.programHash!==trace.programHash||old.startedAt!==trace.startedAt))fail('TRACE_IDENTITY_CHANGED');
        if(old&&(['programId','algorithmId','concurrency','runId','previewId','pairedTraceId','predictionProbeId','prediction','observationCutoff','firstPass','durationScope'] as const).some(k=>!isDeepStrictEqual(old[k],trace[k])))fail('TRACE_IDENTITY_CHANGED');
        if(old&&(!isDeepStrictEqual(old.events,trace.events.slice(0,old.events.length))||old.status==='completed'&&!isDeepStrictEqual(old, {...trace,revision:old.revision,updatedAt:old.updatedAt})))fail('TRACE_FACTS_CHANGED');
        const next=structuredClone({...trace,revision:expectedRevision+1,updatedAt:new Date(Math.max(Date.now(),Date.parse(trace.updatedAt))).toISOString()});
        const rows=(await list()).filter(r=>r.traceId!==trace.traceId&&r.conditionKey===trace.conditionKey&&r.protocolHash===trace.protocolHash);
        const evict=retentionEvictions([...rows,next]);
        if(evict.some(r=>r.traceId===next.traceId))fail('TRACE_RETENTION_EXPIRED');
        if(evict.some(r=>r.status==='running'))fail('TRACE_RETENTION_ACTIVE');
        const dir=await checkedDir(true);await writeRecord(join(dir!,trace.traceId+'.json'),next);
        if(evict.length){const removed=await deleteEntries(await frozen(evict.map(r=>r.traceId)));if(removed.status!=='completed')fail('TRACE_RETENTION_INCOMPLETE');}
        return next;
      });
    },
    async measure(){const traces=[];for(const row of await list())traces.push({traceId:row.traceId,bytes:(await lstat(await checkedFile(row.traceId))).size});return {totalBytes:traces.reduce((n,x)=>n+x.bytes,0),traces};},
    async previewCleanup(ids,options){return store.exclusive(async()=>{
      if(!ids.length)fail('TRACE_CLEANUP_EMPTY');const entries=await frozen(ids),token=randomUUID(),expiresAt=new Date(Date.now()+600000).toISOString();previews.set(token,{entries,expiresAt,...(options?.protectReferences?{protectReferences:true as const}:{})});
      return {token,traceIds:entries.map(e=>e.traceId),bytes:entries.reduce((n,e)=>n+e.size,0),expiresAt};
    });},
    async commitCleanup(token){return store.exclusive(async()=>{
      const old=await loadOperation(token);if(old)return apply(old);
      const preview=previews.get(token);if(!preview||Date.parse(preview.expiresAt)<Date.now())fail('TRACE_CLEANUP_STALE');
      for(const entry of preview!.entries){const row=await read(entry.traceId),bytes=await readFile(await checkedFile(entry.traceId));if(row?.status==='running'||row?.revision!==entry.revision||sha(bytes)!==entry.sha256)fail('TRACE_CLEANUP_STALE');}
      return deleteEntries(preview!.entries,token,preview!.protectReferences);
    });},
    async recoverCleanup(){await store.exclusive(async()=>{
      if(!await checkedDir())return;
      const maintenance=join(store.root,'history','maintenance');if(!await directory(maintenance))return;
      for(const name of await readdir(maintenance))if(/^timing-cleanup-[a-f0-9-]{36}\.json$/.test(name)){const op=await loadOperation(name.slice(15,-5));if(op&&op.status!=='completed')try{await apply(op);}catch(error){if(op.protectReferences&&(error as {code?:string}).code==='TRACE_CLEANUP_STALE'){op.status='partial';await persist(op);}else throw error;}}
    });},
  };
}

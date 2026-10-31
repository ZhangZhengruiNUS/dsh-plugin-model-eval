import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { mkdir, readFile, rename, rm, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { readRecord, writeRecord } from './atomic.ts';
interface Owner {pid:number;host:string;nonce:string;createdAt:string}
export interface WriterLease {writable:boolean;close():Promise<void>}
function dead(owner:Owner):boolean {
  if(owner.host!==hostname()||!Number.isSafeInteger(owner.pid)||owner.pid<=0)return false;
  try {process.kill(owner.pid,0);return false;}catch(error){return (error as NodeJS.ErrnoException).code==='ESRCH';}
}
/** Nonempty directory renames provide one writer; never steal by elapsed time. */
export async function acquireWriter(history:string):Promise<WriterLease> {
  const owner:Owner={pid:process.pid,host:hostname(),nonce:randomUUID(),createdAt:new Date().toISOString()};
  const path=join(history,'.writer'),candidate=join(history,`.writer-candidate-${owner.nonce}`);
  await mkdir(candidate);await writeRecord(join(candidate,'owner.json'),owner);
  let writable=false;
  try {
    try {await rename(candidate,path);writable=true;}
    catch(error) {
      if((await lstat(path)).isSymbolicLink())throw new Error('HISTORY_LOCK_LINK');
      let previous:Owner;
      try {previous=await readRecord<Owner>(join(path,'owner.json'));}catch{return {writable:false,async close(){}};}
      if(!/^[a-f0-9-]{36}$/.test(previous.nonce)||!dead(previous))return {writable:false,async close(){}};
      const fresh=await readRecord<Owner>(join(path,'owner.json'));
      if(fresh.nonce!==previous.nonce||!dead(fresh))return {writable:false,async close(){}};
      // Keep a deterministic nonempty tombstone. A stale observer can never
      // rename a newly published owner into an already occupied old nonce.
      try {await rename(path,join(history,`.writer-retired-${previous.nonce}`));}
      catch{return {writable:false,async close(){}};}
      try {await rename(candidate,path);writable=true;}catch{return {writable:false,async close(){}};}
    }
  }finally{await rm(candidate,{recursive:true,force:true});}
  return {writable,async close(){
    if(!writable)return;
    const held=await readRecord<Owner>(join(path,'owner.json'));
    if(held.nonce===owner.nonce)await rename(path,join(history,`.writer-retired-${owner.nonce}`));
    writable=false;
  }};
}

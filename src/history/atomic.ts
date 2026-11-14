import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
export async function readRecord<T>(path:string):Promise<T> {
  const envelope=JSON.parse(await readFile(path,'utf8'));
  if(envelope.schemaVersion!==1||typeof envelope.sha256!=='string'||digest(JSON.stringify(envelope.value))!==envelope.sha256)throw new Error('RECORD_CORRUPT');
  return envelope.value as T;
}
/** Flush a complete same-directory file before atomically publishing it. */
export async function writeRecord<T>(path:string,value:T):Promise<void> {
  const text=JSON.stringify(value),data=JSON.stringify({schemaVersion:1,sha256:digest(text),value})+'\n';
  const temporary=join(dirname(path),`.${basename(path)}.${randomUUID()}.tmp`);
  const handle=await open(temporary,'wx');
  try {await handle.writeFile(data,'utf8');await handle.sync();}finally{await handle.close();}
  // Windows readers/indexers can briefly lock the destination. Retry publication
  // of this already-flushed file, without deleting the committed destination.
  const delays=[25,75,150,250,500];
  for(let attempt=0;;attempt++){
    try{await rename(temporary,path);return;}
    catch(cause){
      const raw=(cause as NodeJS.ErrnoException).code,code=typeof raw==='string'&&/^E[A-Z0-9_]{1,30}$/.test(raw)?raw:'UNKNOWN';
      if(['EPERM','EACCES','EBUSY'].includes(code)&&attempt<delays.length){await new Promise(resolve=>setTimeout(resolve,delays[attempt]));continue;}
      // Retain the unpublished temporary file and the in-process cause. Only a
      // safe operation/errno code is propagated to persisted/user diagnostics.
      throw Object.assign(new Error(`RECORD_PUBLISH_${code}`,{cause}),{code:`RECORD_PUBLISH_${code}`});
    }
  }
}

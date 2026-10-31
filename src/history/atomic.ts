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
  // Unpublished temporary files remain diagnosable after failed publication.
  await rename(temporary,path);
}

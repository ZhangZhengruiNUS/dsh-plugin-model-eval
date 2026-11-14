import {join,resolve} from 'node:path';
import {lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readRecord} from './atomic.ts';
import type {HistoryTransaction,ItemRecord} from './store.ts';
/** Bypass warm item caches, inside the store transaction shared with cleanup. */
export async function readCommonEvidence(tx:HistoryTransaction,runId:string,itemIds:readonly string[]):Promise<ItemRecord[]>{
 const {manifest,summary}=await tx.getRun(runId);if(summary.details!=='available')return [];
 const base=join(await tx.detailsDirectory(runId),'items');
 if((await lstat(base)).isSymbolicLink()||await realpath(base)!==resolve(base))throw Error('COMMON_SOURCE_CORRUPT');
 const items:ItemRecord[]=[];
 for(const itemId of itemIds){
  if(!manifest.requiredItems.some(q=>q.id===itemId&&q.track==='general'))throw Error('COMMON_SOURCE_CORRUPT');
  const file=join(base,createHash('sha256').update(itemId).digest('hex')+'.json');
  try{
   if((await lstat(file)).isSymbolicLink())throw Error('COMMON_SOURCE_CORRUPT');
   const item=await readRecord<ItemRecord>(file);if(item.schemaVersion!==1||item.itemId!==itemId)throw Error('COMMON_SOURCE_CORRUPT');items.push(item);
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw Error('COMMON_SOURCE_CORRUPT');}
 }
 return items;
}

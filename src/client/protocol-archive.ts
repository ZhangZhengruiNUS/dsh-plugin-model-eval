import type {ProtocolRefs} from '../contracts.ts';
import type {ViewData} from './ui.tsx';
import {isCurrentGeneralRelease} from '../evaluation/current-edition.ts';

export type ProtocolArchive = 'none' | 'current';

export const protocolArchiveOptions = [
  {value:'none',label:'显示全部协议'},
  {value:'current',label:'仅显示当前协议'},
] as const;

export function isArchivedProtocol(refs:ProtocolRefs, mode:ProtocolArchive):boolean {
  return mode==='current' && !isCurrentGeneralRelease(refs);
}

const storageKey=(rootId:string)=>`dsh-model-coordinates:protocol-archive:${rootId}`;

export function readProtocolArchive(rootId:string, fallback:ProtocolArchive):ProtocolArchive {
  try {
    const value=localStorage.getItem(storageKey(rootId));
    // alpha.68 stored the old cutoff explicitly. Keep that user's archive enabled.
    if(value==='before-r3'||value==='current')return 'current';
    if(value==='none')return 'none';
  } catch { /* Some hosts restrict local preferences. */ }
  return fallback;
}

export function saveProtocolArchive(rootId:string, mode:ProtocolArchive):void {
  localStorage.setItem(storageKey(rootId),mode);
}

/** Hide whole historical batches in the UI, preserving active and mixed batches for safe task actions. */
export function archiveEvaluationLists(data:ViewData, mode:ProtocolArchive):ViewData {
  if(mode==='none')return data;
  const candidates=new Set<string>();
  const visible=new Set<string>();
  const archivedRuns=new Set<string>();
  for(const run of data.runs){
    if(run.tracks.general&&!run.tracks.writing&&isArchivedProtocol(run.protocols,mode)){
      candidates.add(run.batchId);
      archivedRuns.add(run.runId);
    }else visible.add(run.batchId);
  }
  if(data.queue.activeBatchId)visible.add(data.queue.activeBatchId);
  for(const batch of data.queue.batches){
    if(batch.runIds.some(id=>!archivedRuns.has(id)))visible.add(batch.batchId);
  }
  const hide=(batchId:string)=>candidates.has(batchId)&&!visible.has(batchId);
  return {...data,runs:data.runs.filter(run=>!hide(run.batchId)),
    queue:{...data.queue,batches:data.queue.batches.filter(batch=>!hide(batch.batchId))}};
}

import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import type {ResolvedProtocolSet,RunMetrics} from '../contracts.ts';
import {identityHash,protocolKey} from '../evaluation/protocol-identity.ts';
import {readRecord} from './atomic.ts';
import type {HistoryTransaction} from './store.ts';

export const REPLACED_WRITING_ITEM='writing/ziya:13';
export const REPLACEMENT_WRITING_ITEM='writing/dsh-original:community-fund-report-01';

export interface WritingReplacementOrigin {
  sourceBatchId:string;
  fromItemId:typeof REPLACED_WRITING_ITEM;
  toItemId:typeof REPLACEMENT_WRITING_ITEM;
  sourceMetrics:RunMetrics;
}

export interface WritingReplacementReceipt {
  schemaVersion:1;
  rootId:string;
  operationId:string;
  sourceBatchId:string;
  destinationBatchId:string;
  runs:{runId:string;sourceRunId:string;manifestHash:string;copied:Record<string,string>}[];
}

export const writingReplacementPath=(maintenance:string,operationId:string)=>
  join(maintenance,'writing-replacement-'+operationId+'.json');

export async function verifyReadyWritingReplacement(tx:HistoryTransaction,rootId:string,operationId:string,runId:string,protocol:ResolvedProtocolSet) {
  if(!/^[0-9a-f-]{36}$/i.test(operationId))throw Error('REUSE_IMPORT_NOT_READY');
  const receipt=await readRecord<WritingReplacementReceipt>(writingReplacementPath(tx.maintenanceDirectory,operationId));
  const {manifest,summary}=await tx.getRun(runId);
  const origin=manifest.reuseOrigin;
  const replacement=origin?.writingReplacement;
  const pinned=receipt.runs.find(row=>row.runId===runId);
  if(receipt.schemaVersion!==1||receipt.rootId!==rootId||receipt.operationId!==operationId||!replacement||
    receipt.sourceBatchId!==replacement.sourceBatchId||receipt.destinationBatchId!==manifest.batchId||
    replacement.fromItemId!==REPLACED_WRITING_ITEM||replacement.toItemId!==REPLACEMENT_WRITING_ITEM||
    !pinned||pinned.sourceRunId!==origin.sourceRunId||pinned.manifestHash!==identityHash(manifest)||
    protocolKey(protocol.descriptor.refs)!==protocolKey(manifest.protocols)||!summary.resumeAllowed||summary.details!=='available'){
    throw Error('REUSE_IMPORT_NOT_READY');
  }
  const required=manifest.requiredItems.filter(q=>q.id!==REPLACEMENT_WRITING_ITEM);
  if(required.length!==Object.keys(pinned.copied).length||required.some(q=>q.id===REPLACED_WRITING_ITEM)||
    !manifest.requiredItems.some(q=>q.id===REPLACEMENT_WRITING_ITEM&&q.track==='writing'))throw Error('REUSE_COPY_CORRUPT');
  for(const q of required){
    const item=await tx.getItem(runId,q.id);
    if(item?.grade?.kind!=='scored'||!item.answer?.complete||item.reuse?.sourceRunId!==pinned.sourceRunId||
      !isDeepStrictEqual(item.reuse.compatibility,protocol.compatibility[q.id])||
      identityHash(item)!==pinned.copied[q.id])throw Error('REUSE_COPY_CORRUPT');
  }
  return {destinationBatchId:receipt.destinationBatchId};
}

import {buildExecutionOrder,validateExecutionOrder,type FrozenExecutionOrder} from '../jobs/execution-order.ts';
import {Buffer} from 'node:buffer';
import type {ResolvedProtocolSet, Track} from '../contracts.ts';
import {identityHash} from '../evaluation/protocol-identity.ts';
import {buildPrompt} from '../evaluation/grade-general.ts';
import type {WorkloadPlanV1,WorkloadJobV1} from './calibration-contracts.ts';

/** Median UTF-8 stored-prompt bytes of the pinned 50-question deep reading set. Not tokens. */
export const READING_SPLIT_BYTES=75715;
export function buildWorkloadPlan(p:ResolvedProtocolSet,tracks:readonly Track[],remainingIds?:ReadonlySet<string>,executionOrder?:FrozenExecutionOrder):WorkloadPlanV1 {
  if(!tracks.length||new Set(tracks).size!==tracks.length||tracks.some(t=>!['general','writing'].includes(t)))throw Error('INVALID_TRACKS');
  const required=p.items.filter(q=>tracks.includes(q.track));
  const expected=buildExecutionOrder(p,tracks);
  if(executionOrder){
    if(!expected)throw Error('INVALID_EXECUTION_ORDER');
    validateExecutionOrder(executionOrder,required,expected);
  }
  const order=executionOrder??expected;
  const orderIdentity=order?{executionOrderHash:order.hash}:{};
  const byId=new Map(required.map(q=>[q.id,q]));
  const selected=order?order.itemIds.map(id=>byId.get(id)!):required;
  if(new Set(p.items.map(q=>q.id)).size!==p.items.length)throw Error('WORKLOAD_DUPLICATE_ITEM');
  if(remainingIds&&[...remainingIds].some(id=>!selected.some(q=>q.id===id)))throw Error('UNKNOWN_REMAINING_ITEM');
  for(const q of selected){
    const c=p.compatibility[q.id];
    const contentHash=identityHash({datasetId:q.datasetId,sourceId:q.sourceId,sourceHash:q.sourceHash,prompt:q.prompt});
    if(!c||c.contentHash!==contentHash||c.promptHash!==identityHash(buildPrompt(q))||c.combinedHash!==identityHash({contentHash:c.contentHash,promptHash:c.promptHash,gradingHash:c.gradingHash,runtimeHash:c.runtimeHash}))throw Error('WORKLOAD_IDENTITY_CHANGED');
  }
  const refs={generalId:p.generalId,writingId:p.writingId,resourceVersion:p.resourceVersion};
  const protocolHash=identityHash({...orderIdentity,refs,definition:p.descriptor.general.definitionHash,items:selected.map(q=>[q.id,p.compatibility[q.id]])});
  const jobs:WorkloadJobV1[]=selected.filter(q=>!remainingIds||remainingIds.has(q.id)).map(q=>{
    const inputBytes=q.prompt.reduce((n,m)=>n+Buffer.byteLength(m.content,'utf8'),0);
    return {itemId:q.id,datasetId:q.datasetId,track:q.track,inputBytes,inputGroup:q.datasetId==='longbench-v2-selected'?(inputBytes<=READING_SPLIT_BYTES?'reading-short':'reading-long'):'ordinary',
      stages:q.datasetId==='bfcl-v4-multi-turn-selected'?['tool-scenario']:q.track==='writing'?['answer','judge']:['answer','local-grade']};
  });
  return {version:1,...orderIdentity,refs,protocolHash,readingSplitBytes:READING_SPLIT_BYTES,workloadHash:identityHash({...orderIdentity,protocolHash,readingSplitBytes:READING_SPLIT_BYTES,jobs}),jobs};
}

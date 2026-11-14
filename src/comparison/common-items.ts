import type {Ability} from '../evaluation/tier-contracts.ts';
import type {Question} from '../contracts.ts';
import type {ItemRecord} from '../history/store.ts';
import type {UpgradeSource} from '../evaluation/reuse-eligibility.ts';
import type {EditionMap} from '../evaluation/edition-map.ts';
import {assertEditionMapIntegrity} from '../evaluation/edition-map.ts';
import {validToolCheckpoint} from '../host/tool-checkpoint.ts';
import {identityHash,protocolKey} from '../evaluation/protocol-identity.ts';
import {fingerprintTarget} from '../model/identity.ts';
export interface CommonDomainResult {id:Ability;passed:number;required:number}
export type CommonRunResult={runId:string;available:true;domains:CommonDomainResult[]}|{runId:string;available:false;reasonCode:string};
export interface CommonItemsProjection {mapHash:string;commonCount:number;comparable:boolean;atCeiling:boolean;runs:CommonRunResult[]}
const fail=(reason:string):never=>{throw Error('COMMON_'+reason);};
const timestamp=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value));
/** Shared record-level evidence checks for local comparisons and offline public-reference projection. */
export function validateScoredItem(q:Question,item:ItemRecord|undefined,targetHash:string):void{
 const id=q.id,{grading,...question}=q,answer=item?.answer,grade=item?.grade;
 if(!item||item.itemId!==id||item.schemaVersion!==1||!Number.isSafeInteger(item.revision)||item.revision<1||!timestamp(item.answerCommittedAt)||!timestamp(item.gradeCommittedAt)||!answer?.complete||answer.error||answer.observations.itemId!==id||answer.observations.track!=='general'||answer.observations.phase!=='answer'||grade?.kind!=='scored'||grade.track!=='general'||grade.itemId!==id||typeof grade.passed!=='boolean'||!item.question||identityHash(item.question)!==identityHash(question))return fail('SOURCE_CORRUPT');
 if(q.datasetId==='bfcl-v4-multi-turn-selected'){
  const cp=item.toolCheckpoint,turns=(q.grading as {scenario?:{question?:unknown[]}})?.scenario?.question;
  if(!Array.isArray(turns)||!validToolCheckpoint(cp,q.sourceId,turns.length)||cp.stage!=='done'||cp.scenarioHash!==identityHash(q)||cp.targetHash!==targetHash||cp.passed!==grade.passed||cp.passed&&cp.pendingCalls.length)return fail('SOURCE_CORRUPT');
 }
}
function projectRun(map:EditionMap,source:UpgradeSource):CommonRunResult{
 const runId=source.manifest.runId;
 try{
  const {manifest,summary,items,protocol}=source,key=protocolKey(manifest.protocols);
  const expected=key===protocolKey(map.fromRefs)?map.fromDefinitionHash:key===protocolKey(map.toRefs)?map.toDefinitionHash:undefined;
  if(!expected||protocolKey(protocol.descriptor.refs)!==key||protocolKey(summary.protocols)!==key||manifest.batchId!==summary.batchId||runId!==summary.runId||identityHash(manifest.target)!==identityHash(summary.target)||identityHash(manifest.generalDefinition)!==identityHash(protocol.descriptor.general)||identityHash(summary.generalDefinition)!==identityHash(manifest.generalDefinition)||manifest.generalDefinition?.definitionHash!==expected)return fail('SOURCE_CORRUPT');
  const {definitionHash,...body}=protocol.descriptor.general;if(identityHash(body)!==expected)return fail('SOURCE_CORRUPT');
  const targetHash=fingerprintTarget(manifest.target);
  if(summary.details!=='available')return fail('DETAILS_UNAVAILABLE');
  const track=summary.tracks.general;
  if(track?.status!=='completed'||track.required!==protocol.descriptor.questionCount||track.graded!==track.required||!timestamp(track.completedAt))return fail('SOURCE_INCOMPLETE');
  const required=manifest.requiredItems.filter(q=>q.track==='general').map(q=>q.id),declared=protocol.descriptor.general.domains.flatMap(d=>d.itemIds);
  if(required.length!==declared.length||new Set(required).size!==required.length||required.some(id=>!declared.includes(id))||new Set(items.map(x=>x.itemId)).size!==items.length)return fail('SOURCE_CORRUPT');
  for(const id of map.common){
   const q=protocol.items.find(q=>q.id===id),item=items.find(x=>x.itemId===id);
   if(!q||identityHash(q)!==map.questionHashes[id]||!declared.includes(id)||!protocol.compatibility[id]||identityHash(protocol.compatibility[id])!==identityHash(map.compatibility[id]))return fail('PROTOCOL_CHANGED');
   if(!item)return fail('DETAILS_INCOMPLETE');
   validateScoredItem(q,item,targetHash);
   if(item.reuse&&identityHash(item.reuse.compatibility)!==identityHash(map.compatibility[id]))return fail('PROTOCOL_CHANGED');
  }
  return {runId,available:true,domains:map.domains.map(d=>({id:d.id,required:d.itemIds.length,passed:d.itemIds.filter(id=>{const g=items.find(x=>x.itemId===id)!.grade!;return g.kind==='scored'&&g.track==='general'&&g.passed;}).length}))};
 }catch(error){const code=(error as Error).message;return {runId,available:false,reasonCode:/^COMMON_[A-Z_]+$/.test(code)?code:'COMMON_SOURCE_CORRUPT'};}
}
/** Pure, read-only counts. No replacement overall score and no target-model equality requirement. */
export function projectCommonItems(map:EditionMap,sources:readonly UpgradeSource[]):CommonItemsProjection{
 try{assertEditionMapIntegrity(map);}catch{return {mapHash:map.mapHash,commonCount:0,comparable:false,atCeiling:false,runs:sources.map(s=>({runId:s.manifest.runId,available:false,reasonCode:'COMMON_MAP_INVALID'}))};}
 const runs=sources.map(source=>projectRun(map,source));
 const complete=runs.filter((r):r is Extract<CommonRunResult,{available:true}>=>r.available);
 const comparable=runs.length>=2&&complete.length===runs.length&&map.domains.every(d=>d.itemIds.length>0);
 return {mapHash:map.mapHash,commonCount:map.common.length,runs,comparable,atCeiling:comparable&&complete.every(r=>r.domains.every(d=>d.passed===d.required))};
}

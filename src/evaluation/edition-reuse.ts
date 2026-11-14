import type {TargetSnapshot,ResolvedProtocolSet,Track} from '../contracts.ts';
import type {EditionReuseCheck} from './tier-contracts.ts';
import type {UpgradeSource} from './reuse-eligibility.ts';
import {upgradeSourceEvidence,upgradeDestinationIdentity} from './reuse-eligibility.ts';
import {assertEditionMapIntegrity,createEditionMap,resolveEditionMap,type EditionMap} from './edition-map.ts';
import {projectCommonItems} from '../comparison/common-items.ts';
import {buildExecutionOrder,validateExecutionOrder} from '../jobs/execution-order.ts';
import {reuseTargetBinding} from '../model/reuse-identity.ts';
import {identityHash} from './protocol-identity.ts';
import {validateGeneralDefinition} from './definitions.ts';

/** Reuse requires a stable configuration binding; comparing scores does not. No I/O or model calls. */
export function checkEditionReuse(source:UpgradeSource,destination:ResolvedProtocolSet,current:TargetSnapshot,map:EditionMap):EditionReuseCheck{
 const {manifest,summary,items,protocol}=source;
 const result:EditionReuseCheck={eligible:false,sourceRunId:manifest.runId,sourceRevision:summary.revision,sourceEvidenceHash:'',destinationEvidenceHash:'',targetBindingHash:'',destinationGeneralId:destination.generalId,mapHash:map.mapHash,reusedItems:0,newItems:0,mixedPeriod:true};
 const reject=(reasonCode:string):EditionReuseCheck=>({...result,reasonCode});
 try{
  try{
   assertEditionMapIntegrity(map);
   const canonical=createEditionMap(map.reversed?destination:protocol,map.reversed?protocol:destination);
   const actual=resolveEditionMap(protocol,destination,[canonical]);
   if(!actual||identityHash(map)!==identityHash(actual))return reject('EDITION_PROTOCOL_CHANGED');
   validateGeneralDefinition(protocol.descriptor.general,protocol.items);validateGeneralDefinition(destination.descriptor.general,destination.items);
  }catch{return reject('EDITION_PROTOCOL_CHANGED');}
  if(summary.details!=='available')return reject('EDITION_DETAILS_UNAVAILABLE');
  const track=summary.tracks.general;
  if(track?.status!=='completed'||track.required!==64||track.graded!==64||track.score===undefined||!Number.isFinite(Date.parse(track.completedAt??'')))return reject('EDITION_SOURCE_INCOMPLETE');
  // Until a provenance-chain importer exists, reject rather than lose upstream calls/usage.
  if(manifest.reuseOrigin||summary.reuse||items.some(i=>i.reuse))return reject('EDITION_CHAIN_UNSUPPORTED');
  const oldBinding=reuseTargetBinding(manifest.target),binding=reuseTargetBinding(current);
  if(!oldBinding||!binding)return reject('EDITION_IDENTITY_UNVERIFIED');
  if(oldBinding.hash!==binding.hash)return reject('EDITION_TARGET_CHANGED');
  const expectedOrder=buildExecutionOrder(protocol,Object.keys(summary.tracks) as Track[]);
  if(!expectedOrder||!manifest.executionOrder)return reject('EDITION_SOURCE_CORRUPT');
  validateExecutionOrder(manifest.executionOrder,manifest.requiredItems,expectedOrder);
  const ids=protocol.descriptor.general.domains.flatMap(d=>d.itemIds);
  if(new Set(items.map(i=>i.itemId)).size!==items.length)return reject('EDITION_SOURCE_CORRUPT');
  if(ids.some(id=>!items.some(i=>i.itemId===id)))return reject('EDITION_DETAILS_INCOMPLETE');
  for(const id of ids){
 // A normal max-token finish may be complete and scored; preserve its original result.
   const item=items.find(i=>i.itemId===id)!,q=protocol.items.find(q=>q.id===id)!;
   const {grading,...publicQuestion}=q,answer=item.answer,grade=item.grade;
   if(item.schemaVersion!==1||!Number.isSafeInteger(item.revision)||item.revision<1||!Number.isFinite(Date.parse(item.answerCommittedAt??''))||!Number.isFinite(Date.parse(item.gradeCommittedAt??''))||!answer?.complete||answer.error||answer.observations.itemId!==id||answer.observations.phase!=='answer'||answer.observations.track!=='general'||grade?.kind!=='scored'||grade.track!=='general'||grade.itemId!==id||typeof grade.passed!=='boolean'||identityHash(item.question)!==identityHash(publicQuestion))return reject('EDITION_SOURCE_CORRUPT');
  }
  const projected=projectCommonItems(map,[source]).runs[0];
  if(!projected?.available)return reject('EDITION_SOURCE_CORRUPT');
  if(!map.common.length||!map.toOnly.length||map.common.length+map.toOnly.length!==64)return reject('EDITION_PROTOCOL_CHANGED');
  return {...result,eligible:true,sourceEvidenceHash:upgradeSourceEvidence(source),destinationEvidenceHash:upgradeDestinationIdentity(destination),targetBindingHash:binding.hash,reusedItems:map.common.length,newItems:map.toOnly.length,sourceCreatedAt:manifest.createdAt,sourceCompletedAt:track.completedAt!};
 }catch{return reject('EDITION_SOURCE_CORRUPT');}
}

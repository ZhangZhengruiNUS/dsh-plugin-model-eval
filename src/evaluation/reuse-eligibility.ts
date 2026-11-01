import type {TargetSnapshot,RunSummary,Question} from '../contracts.ts';
import type {RunManifest,ItemRecord} from '../history/store.ts';
import type {ResolvedProtocolSet,UpgradeCheck} from './tier-contracts.ts';
import {identityHash,protocolKey} from './protocol-identity.ts';
import {validateGeneralDefinition} from './definitions.ts';
import {reuseTargetBinding} from '../model/reuse-identity.ts';
export interface UpgradeSource {manifest:RunManifest;summary:RunSummary;items:readonly ItemRecord[];protocol:ResolvedProtocolSet}
const publicQuestion=(q:Question)=>{const {grading,...value}=q;return value;};
/** Pure and fail-closed; callers must re-read source records and current host configuration at commit. */
export function checkUpgrade(source:UpgradeSource,deep:ResolvedProtocolSet,current:TargetSnapshot):UpgradeCheck{
  const {manifest,summary,items,protocol}=source;
  const result:UpgradeCheck={eligible:false,sourceRunId:manifest.runId,sourceRevision:summary.revision,sourceEvidenceHash:'',targetBindingHash:'',deepGeneralId:deep.generalId,reusedItems:0,newItems:0};
  const reject=(reasonCode:string):UpgradeCheck=>({...result,reasonCode});
  try{
    if(protocol.descriptor.general.tier!=='light'||deep.descriptor.general.tier!=='deep'||deep.descriptor.general.parentGeneralId!==protocol.generalId)return reject('UPGRADE_TIER_MISMATCH');
    if(protocolKey(manifest.protocols)!==protocolKey(protocol.descriptor.refs)||identityHash(manifest.generalDefinition)!==identityHash(protocol.descriptor.general)||identityHash(summary.generalDefinition)!==identityHash(manifest.generalDefinition)||manifest.runId!==summary.runId||manifest.batchId!==summary.batchId||identityHash(manifest.target)!==identityHash(summary.target))return reject('UPGRADE_SOURCE_CORRUPT');
    validateGeneralDefinition(protocol.descriptor.general,manifest.requiredItems);validateGeneralDefinition(deep.descriptor.general,deep.items);
    if(summary.details!=='available')return reject('UPGRADE_DETAILS_UNAVAILABLE');
    const track=summary.tracks.general;
    if(track?.status!=='completed'||track.required!==120||track.graded!==120||track.score===undefined||!track.completedAt)return reject('UPGRADE_SOURCE_INCOMPLETE');
    const previous=reuseTargetBinding(manifest.target),next=reuseTargetBinding(current);
    if(!previous||!next)return reject('UPGRADE_IDENTITY_UNVERIFIED');
    if(previous.hash!==next.hash)return reject('UPGRADE_TARGET_CHANGED');
    result.targetBindingHash=next.hash;
    const ids=protocol.descriptor.general.domains.flatMap(d=>d.itemIds),deepIds=new Set(deep.descriptor.general.domains.flatMap(d=>d.itemIds));
    if(new Set(items.map(x=>x.itemId)).size!==items.length)return reject('UPGRADE_SOURCE_CORRUPT');
    const required=ids.map(id=>items.find(x=>x.itemId===id));
    if(required.some(x=>!x))return reject('UPGRADE_DETAILS_INCOMPLETE');
    for(const [index,id] of ids.entries()){
      const item=required[index]!,oldQuestion=protocol.items.find(q=>q.id===id),question=deep.items.find(q=>q.id===id);
      if(!deepIds.has(id)||!question||!oldQuestion||!protocol.compatibility[id]||!deep.compatibility[id]||identityHash(protocol.compatibility[id])!==identityHash(deep.compatibility[id])||identityHash(oldQuestion)!==identityHash(question))return reject('UPGRADE_PROTOCOL_CHANGED');
      if(!item.answer?.complete||item.answer.error||item.grade?.kind!=='scored'||item.grade.track!=='general'||item.grade.itemId!==id||!item.answerCommittedAt||!item.gradeCommittedAt||!item.question||identityHash(item.question)!==identityHash(publicQuestion(oldQuestion)))return reject('UPGRADE_SOURCE_CORRUPT');
    }
    result.sourceEvidenceHash=identityHash({manifest,revision:summary.revision,general:track,items:required});
    return {...result,eligible:true,reusedItems:ids.length,newItems:deepIds.size-ids.length};
  }catch{return reject('UPGRADE_SOURCE_CORRUPT');}
}

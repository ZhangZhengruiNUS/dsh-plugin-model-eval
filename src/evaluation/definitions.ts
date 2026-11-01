import type {ProtocolRefs,Track} from '../contracts.ts';
import type {GeneralDefinition,Ability} from './tier-contracts.ts';
import {identityHash,protocolKey} from './protocol-identity.ts';
export const LEGACY_PROTOCOL_REFS:ProtocolRefs=Object.freeze({generalId:'general-chat-root-stable-rule-tokenizer-v3',writingId:'work-writing-12-v1',resourceVersion:'suite-2026-10-31-v3'});
export const ABILITY_DATASETS:Record<Ability,string>=Object.freeze({knowledge:'tiny-mmlu',math:'tiny-gsm8k',instructions:'ifeval',coding:'humaneval-plus'});
const abilities=Object.keys(ABILITY_DATASETS) as Ability[];
type Item={id:string;track:Track;datasetId:string};
export function legacyGeneralDefinition(items:readonly Item[]):GeneralDefinition{
  const value={tier:'legacy' as const,label:'旧版基线',domains:abilities.map(id=>({id,weight:.25,itemIds:items.filter(q=>q.track==='general'&&q.datasetId===ABILITY_DATASETS[id]).map(q=>q.id)}))};
  return {...value,definitionHash:identityHash(value)};
}
export function validateGeneralDefinition(definition:GeneralDefinition,required?:readonly Item[]):void{
  const invalid=()=>{throw Error('INVALID_GENERAL_DEFINITION');};
  if(!definition||!['legacy','light','deep'].includes(definition.tier)||!Array.isArray(definition.domains)||definition.domains.length!==4)return invalid();
  const {definitionHash,...value}=definition;
  if(identityHash(value)!==definitionHash||new Set(definition.domains.map(d=>d.id)).size!==4||definition.domains.some(d=>!abilities.includes(d.id)||d.weight!==.25||!Array.isArray(d.itemIds)||d.itemIds.some((id:unknown)=>typeof id!=='string'||!id)))return invalid();
  const ids=definition.domains.flatMap(d=>d.itemIds);
  if(new Set(ids).size!==ids.length||definition.tier!=='legacy'&&definition.domains.some(d=>d.itemIds.length!==(definition.tier==='light'?30:100)))return invalid();
  if(required){const expected=required.filter(q=>q.track==='general').map(q=>q.id);if(new Set(expected).size!==expected.length||expected.length!==ids.length||expected.some(id=>!ids.includes(id)))return invalid();}
}
/** Old manifests are recognized by their complete frozen refs. Unknown versions stay readable without inventing a score. */
export function manifestGeneralDefinition(manifest:{protocols:ProtocolRefs;requiredItems:readonly Item[];generalDefinition?:GeneralDefinition}):GeneralDefinition|undefined{
  if(manifest.generalDefinition){validateGeneralDefinition(manifest.generalDefinition,manifest.requiredItems);return manifest.generalDefinition;}
  if(protocolKey(manifest.protocols)!==protocolKey(LEGACY_PROTOCOL_REFS))return undefined;
  const general=manifest.requiredItems.filter(q=>q.track==='general');
  if(general.some(q=>!Object.values(ABILITY_DATASETS).includes(q.datasetId)))return undefined;
  return legacyGeneralDefinition(general);
}

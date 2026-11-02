import type {ProtocolRefs,Track} from '../contracts.ts';
import type {GeneralDefinition,Ability} from './tier-contracts.ts';
import {identityHash,protocolKey} from './protocol-identity.ts';
export const LEGACY_PROTOCOL_REFS:ProtocolRefs=Object.freeze({generalId:'general-chat-root-stable-rule-tokenizer-v3',writingId:'work-writing-12-v1',resourceVersion:'suite-2026-10-31-v3'});
export const ABILITY_DATASETS:Partial<Record<Ability,string>>=Object.freeze({knowledge:'tiny-mmlu',math:'tiny-gsm8k',instructions:'ifeval',coding:'humaneval-plus'});
const abilities=Object.keys(ABILITY_DATASETS) as Ability[];
type Item={id:string;track:Track;datasetId:string};
export function legacyGeneralDefinition(items:readonly Item[]):GeneralDefinition{
  const value={tier:'legacy' as const,label:'旧版基线',domains:abilities.map(id=>({id,weight:.25,itemIds:items.filter(q=>q.track==='general'&&q.datasetId===ABILITY_DATASETS[id]).map(q=>q.id)}))};
  return {...value,definitionHash:identityHash(value)};
}
export function validateGeneralDefinition(definition:GeneralDefinition,required?:readonly Item[]):void{
  const invalid=()=>{throw Error('INVALID_GENERAL_DEFINITION');};
  if(!definition||!['legacy','light','deep'].includes(definition.tier)||!Array.isArray(definition.domains))return invalid();
  const five=definition.schema==='task-five-v1',expected=five?['knowledge','reading','instructions','coding','tools']:abilities;
  if(definition.schema!==undefined&&!five||five&&definition.tier==='legacy'||definition.domains.length!==expected.length)return invalid();
  const {definitionHash,...value}=definition;
  if(identityHash(value)!==definitionHash||new Set(definition.domains.map(d=>d.id)).size!==expected.length||definition.domains.some(d=>!expected.includes(d.id)||d.weight!==(five?.2:.25)||!Array.isArray(d.itemIds)||d.itemIds.some((id:unknown)=>typeof id!=='string'||!id)))return invalid();
  const ids=definition.domains.flatMap(d=>d.itemIds);
  const counts:Record<string,number>=definition.tier==='light'?{knowledge:30,reading:10,instructions:30,coding:20,tools:10}:{knowledge:100,reading:50,instructions:100,coding:70,tools:30};
  if(new Set(ids).size!==ids.length||definition.tier!=='legacy'&&definition.domains.some(d=>d.itemIds.length!==(five?counts[d.id]:definition.tier==='light'?30:100)))return invalid();
  if(five){
    for(const d of definition.domains)if(d.itemIds.some((id:string)=>d.id==='knowledge'?!id.startsWith('knowledge/mmlu-pro/')&&!id.startsWith('math/olympiad-text-math/'):!id.startsWith(d.id+'/')))return invalid();
    const knowledge=definition.domains.find(d=>d.id==='knowledge')!;
    if(knowledge.itemIds.filter((id:string)=>id.startsWith('knowledge/')).length!==(definition.tier==='light'?24:80))return invalid();
    if(required){const datasets:Record<string,string[]>={knowledge:['mmlu-pro-selected','olympiad-text-selected'],reading:['longbench-v2-selected'],instructions:['ifeval'],coding:['code-contests-selected'],tools:['bfcl-v4-multi-turn-selected']};for(const d of definition.domains)if(d.itemIds.some((id:string)=>!datasets[d.id]!.includes(required.find(q=>q.id===id)?.datasetId??'')))return invalid();}
  }
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

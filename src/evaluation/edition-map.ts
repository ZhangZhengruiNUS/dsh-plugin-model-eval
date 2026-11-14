import type {ProtocolRefs,Question,ResolvedProtocolSet} from '../contracts.ts';
import type {Ability,QuestionCompatibility} from './tier-contracts.ts';
import {identityHash,protocolKey,questionCompatibility} from './protocol-identity.ts';

export interface EditionMap {
  schemaVersion:1;id:string;mapHash:string;fromRefs:ProtocolRefs;toRefs:ProtocolRefs;
  fromDefinitionHash:string;toDefinitionHash:string;
  domains:{id:Ability;itemIds:string[]}[];common:string[];fromOnly:string[];toOnly:string[];
  compatibility:Record<string,QuestionCompatibility>;questionHashes:Record<string,string>;reversed?:true;
}
const fail=(code:string):never=>{throw Error('EDITION_'+code);};
const domains:Ability[]=['knowledge','reading','instructions','coding','tools'];
function inspect(protocol:ResolvedProtocolSet):Map<string,Question>{
  if(protocolKey(protocol.descriptor.refs)!==protocolKey({generalId:protocol.generalId,writingId:protocol.writingId,resourceVersion:protocol.resourceVersion}))return fail('REFS_MISMATCH');
  const general=protocol.descriptor.general,{definitionHash,...value}=general;
  if(identityHash(value)!==definitionHash||general.tier!=='light'||protocol.descriptor.questionCount!==64||general.domains.length!==5||new Set(general.domains.map(d=>d.id)).size!==5||domains.some(id=>!general.domains.some(d=>d.id===id&&d.weight===.2)))return fail('DEFINITION_MISMATCH');
  const ids=general.domains.flatMap(d=>d.itemIds),items=protocol.items.filter(q=>q.track==='general');
  if(ids.length!==64||new Set(ids).size!==64||items.length!==64||new Set(items.map(q=>q.id)).size!==64||ids.some(id=>!items.some(q=>q.id===id)))return fail('MEMBERSHIP_MISMATCH');
  for(const q of items){
    const compatibility=protocol.compatibility[q.id];if(!compatibility)return fail('COMPATIBILITY_MISSING');
    const {combinedHash,...parts}=compatibility,expected=questionCompatibility(q,null,null);
    if(identityHash(parts)!==combinedHash||parts.contentHash!==expected.contentHash||parts.promptHash!==expected.promptHash)return fail('COMPATIBILITY_CORRUPT');
  }
  return new Map(items.map(q=>[q.id,q]));
}
/** Developer construction only. The service must resolve from a pinned, reviewed declaration. */
export function createEditionMap(from:ResolvedProtocolSet,to:ResolvedProtocolSet):EditionMap{
  const left=inspect(from),right=inspect(to);
  if(from.generalId!=='general-task-five-v2-light'||from.resourceVersion!=='task-five-v2'||String(from.descriptor.general.schema)!=='task-five-v2'||to.generalId!=='general-task-five-v3-light'||to.resourceVersion!=='task-five-v3'||String(to.descriptor.general.schema)!=='task-five-v3'||from.writingId!==to.writingId)return fail('PAIR_NOT_SUPPORTED');
  const mapped=domains.map(id=>{
    const a=from.descriptor.general.domains.find(d=>d.id===id)!,b=to.descriptor.general.domains.find(d=>d.id===id)!;
    const itemIds=a.itemIds.filter(itemId=>b.itemIds.includes(itemId));
    for(const itemId of itemIds)if(identityHash(left.get(itemId))!==identityHash(right.get(itemId))||identityHash(from.compatibility[itemId])!==identityHash(to.compatibility[itemId]))return fail('QUESTION_INCOMPATIBLE');
    return {id,itemIds};
  });
  const common=mapped.flatMap(d=>d.itemIds);
  // A surviving ID cannot silently migrate into a different capability.
  if([...left.keys()].some(id=>right.has(id)&&!common.includes(id)))return fail('DOMAIN_CHANGED');
  const body={schemaVersion:1 as const,id:'task-five-v2-to-v3-light',fromRefs:structuredClone(from.descriptor.refs),toRefs:structuredClone(to.descriptor.refs),fromDefinitionHash:from.descriptor.general.definitionHash,toDefinitionHash:to.descriptor.general.definitionHash,
    domains:mapped,common,fromOnly:[...left.keys()].filter(id=>!right.has(id)),toOnly:[...right.keys()].filter(id=>!left.has(id)),compatibility:Object.fromEntries(common.map(id=>[id,structuredClone(from.compatibility[id]!)])),questionHashes:Object.fromEntries(common.map(id=>[id,identityHash(left.get(id))]))};
  return {...body,mapHash:identityHash(body)};
}
/** Nothing is compared until an exact declaration is supplied and revalidated. */
export function resolveEditionMap(from:ResolvedProtocolSet,to:ResolvedProtocolSet,declarations:readonly EditionMap[]):EditionMap|undefined{
  inspect(from);inspect(to);
  const key=protocolKey(from.descriptor.refs),other=protocolKey(to.descriptor.refs);
  const matches=declarations.filter(d=>protocolKey(d.fromRefs)===key&&protocolKey(d.toRefs)===other||protocolKey(d.fromRefs)===other&&protocolKey(d.toRefs)===key);
  if(!matches.length)return undefined;if(matches.length!==1)return fail('DECLARATION_AMBIGUOUS');
  const declared=matches[0]!,reverse=protocolKey(declared.toRefs)===key;
  const actual=createEditionMap(reverse?to:from,reverse?from:to);
  if(identityHash(declared)!==identityHash(actual))return fail('DECLARATION_CHANGED');
  return reverse?{...structuredClone(actual),reversed:true,fromRefs:structuredClone(actual.toRefs),toRefs:structuredClone(actual.fromRefs),fromDefinitionHash:actual.toDefinitionHash,toDefinitionHash:actual.fromDefinitionHash,fromOnly:[...actual.toOnly],toOnly:[...actual.fromOnly]}:actual;
}
/** Resolved maps remain mutable JS objects; recheck their canonical declaration before use. */
export function assertEditionMapIntegrity(map:EditionMap):void{
 const {mapHash,reversed,...view}=map;
 const body=reversed?{...view,fromRefs:view.toRefs,toRefs:view.fromRefs,fromDefinitionHash:view.toDefinitionHash,toDefinitionHash:view.fromDefinitionHash,fromOnly:view.toOnly,toOnly:view.fromOnly}:view;
 if(map.schemaVersion!==1||map.id!=='task-five-v2-to-v3-light'||identityHash(body)!==mapHash||map.domains.length!==domains.length||map.domains.some((d,i)=>d.id!==domains[i])||identityHash(map.domains.flatMap(d=>d.itemIds))!==identityHash(map.common)||new Set(map.common).size!==map.common.length||identityHash(Object.keys(map.compatibility).sort())!==identityHash([...map.common].sort())||identityHash(Object.keys(map.questionHashes).sort())!==identityHash([...map.common].sort())||Object.values(map.questionHashes).some(h=>!/^[a-f0-9]{64}$/.test(h)))fail('DECLARATION_CHANGED');
}

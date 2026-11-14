import type {ReferenceItemEvidence} from './reference-evidence.ts';
import type {EditionMap} from '../evaluation/edition-map.ts';
import {assertEditionMapIntegrity} from '../evaluation/edition-map.ts';
import type {CommonRunResult} from './common-items.ts';
import {identityHash,protocolKey} from '../evaluation/protocol-identity.ts';
import {validateGeneralDefinition} from '../evaluation/definitions.ts';

const invalid=():never=>{throw Error('REFERENCE_EVIDENCE_INVALID');};
const hash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
/** Integrity of a bundled reviewed projection, not a cryptographic claim about a remote provider. */
export function assertReferenceEvidence(reference:ReferenceItemEvidence):void{
 const {evidenceHash,...body}=reference,{definitionHash,...definition}=reference.definition;
 if(reference.schema!=='reference-items-v1'||!hash(evidenceHash)||identityHash(body)!==evidenceHash||!hash(definitionHash)||identityHash(definition)!==definitionHash||!Object.values(reference.sourceHashes).every(hash)||reference.conditions.channel!=='chatgpt-subscription-responses'||!Number.isFinite(Date.parse(reference.conditions.completedAt)))invalid();
 const attempts=reference.conditions.attempts;if(attempts&&(attempts.schema!=='reference-attempt-summary-v1'||Object.keys(attempts).sort().join(',')!=='cancelled,completed,failed,schema,validationErrors'||![attempts.completed,attempts.failed,attempts.cancelled,attempts.validationErrors].every(n=>Number.isSafeInteger(n)&&n>=0)||attempts.validationErrors>attempts.completed+attempts.failed+attempts.cancelled))invalid();
 const ids=reference.definition.domains.flatMap(d=>d.itemIds),bits=reference.items;
 const corrected=reference.protocols.generalId==='general-task-five-v3-r1-light'&&reference.definition.schema==='task-five-v3-r1'&&reference.protocols.resourceVersion==='task-five-v3-r1';
 const tier=reference.definition.tier,r2=reference.protocols.resourceVersion==='task-five-v3-r2'&&reference.definition.schema==='task-five-v3-r2'&&['light','deep'].includes(tier)&&reference.protocols.generalId==='general-task-five-v3-r2-'+tier;
 const deep=reference.protocols.resourceVersion==='task-five-v3-r1'&&reference.definition.schema==='task-five-v3-r1'&&tier==='deep'&&reference.protocols.generalId==='general-task-five-v3-r1-deep';
 if((reference.protocols.resourceVersion==='task-five-v3-r2'||reference.definition.schema==='task-five-v3-r2')&&!r2)invalid();
 if(r2||deep){try{validateGeneralDefinition(reference.definition);}catch{invalid();}}
 if(corrected){const r=reference.regrade;if(!r||r.schema!=='reference-offline-regrade-v1'||r.reusedItems!==57||r.newItems!==5||r.modelCalls!==0||!r.sourceReferenceId||![r.sourceEvidenceHash,r.rulesHash].every(hash)||reference.edition)invalid();}else if(reference.regrade)invalid();
 const count=r2?(tier==='light'?62:348):deep?348:corrected?62:64;
 if(r2){const c=reference.scoringCorrection;if(!c||c.schema!=='reference-tool-answer-correction-v1'||!c.sourceReferenceId||c.sourceReferenceId===reference.referenceId||![c.sourceEvidenceHash,c.rulesHash].every(hash)||c.modelCalls!==0||c.carriedItems!==count-1||identityHash(c.changedItems)!==identityHash(['tools/multi_turn_base_39'])||!Number.isFinite(c.sourceScore)||c.sourceScore<0||c.sourceScore>100||!Number.isFinite(Date.parse(c.sourceCompletedAt))||Date.parse(c.sourceCompletedAt)>Date.parse(reference.conditions.completedAt)||reference.edition||reference.regrade)invalid();}else if(reference.scoringCorrection)invalid();
 if(ids.length!==count||new Set(ids).size!==ids.length||bits.length!==ids.length||new Set(bits.map(i=>i.id)).size!==bits.length||ids.some(id=>!bits.some(i=>i.id===id)))invalid();
 for(const bit of bits){const {combinedHash,...parts}=bit.compatibility;if(typeof bit.passed!=='boolean'||!hash(bit.questionHash)||!Object.values(parts).every(hash)||identityHash(parts)!==combinedHash)invalid();}
 const score=reference.definition.domains.reduce((n,d)=>n+d.weight*100*d.itemIds.filter(id=>bits.find(i=>i.id===id)!.passed).length/d.itemIds.length,0);
 if(!Number.isFinite(score)||!Number.isFinite(reference.score)||Math.abs(score-reference.score)>1e-9)invalid();
 if(reference.edition){const e=reference.edition;if(e.schema!=='reference-edition-reuse-v1'||reference.protocols.generalId!=='general-task-five-v3-light'||!e.sourceReferenceId||e.sourceReferenceId===reference.referenceId||![e.sourceEvidenceHash,e.mapHash,e.newEvidenceHash].every(hash)||!Number.isInteger(e.reusedItems)||!Number.isInteger(e.newItems)||e.reusedItems<1||e.newItems<1||e.reusedItems+e.newItems!==64||!Number.isFinite(Date.parse(e.sourceCompletedAt))||Date.parse(e.sourceCompletedAt)>Date.parse(reference.conditions.completedAt))invalid();}
}

/** A scoring-only revision cannot change questions, conditions or any other verdict. */
export function assertReferenceScoringCorrection(source:ReferenceItemEvidence,next:ReferenceItemEvidence):void{
 assertReferenceEvidence(source);assertReferenceEvidence(next);
 const c=next.scoringCorrection,tier=source.definition.tier;
 if(source.protocols.resourceVersion!=='task-five-v3-r1'||source.protocols.generalId!=='general-task-five-v3-r1-'+tier||next.protocols.resourceVersion!=='task-five-v3-r2'||
   next.protocols.generalId!=='general-task-five-v3-r2-'+tier||source.protocols.writingId!==next.protocols.writingId||source.definition.tier!==next.definition.tier||
   identityHash(source.definition.domains)!==identityHash(next.definition.domains)||source.definition.executionPolicy!==next.definition.executionPolicy||
   identityHash(source.conditions)!==identityHash(next.conditions)||!c||c.sourceReferenceId!==source.referenceId||c.sourceEvidenceHash!==source.evidenceHash||
   c.sourceScore!==source.score||c.sourceCompletedAt!==source.conditions.completedAt||source.items.length!==next.items.length)throw Error('REFERENCE_SOURCE_CHANGED');
 for(const item of next.items){const prior=source.items.find(i=>i.id===item.id);
   if(!prior||item.compatibility.contentHash!==prior.compatibility.contentHash||item.compatibility.promptHash!==prior.compatibility.promptHash||item.compatibility.runtimeHash!==prior.compatibility.runtimeHash||
     (item.id==='tools/multi_turn_base_39'?item.questionHash===prior.questionHash:item.questionHash!==prior.questionHash||item.passed!==prior.passed))throw Error('REFERENCE_SOURCE_CHANGED');
 }
}
/** Per-domain common counts only. Missing new questions never become a new-version total. */
export function projectReferenceCommon(map:EditionMap,reference:ReferenceItemEvidence):CommonRunResult{
 try{
  assertEditionMapIntegrity(map);assertReferenceEvidence(reference);
  const key=protocolKey(reference.protocols),definition=key===protocolKey(map.fromRefs)?map.fromDefinitionHash:key===protocolKey(map.toRefs)?map.toDefinitionHash:undefined;
  if(!definition||reference.definition.definitionHash!==definition)invalid();
  for(const id of map.common){const bit=reference.items.find(i=>i.id===id);if(!bit||bit.questionHash!==map.questionHashes[id]||identityHash(bit.compatibility)!==identityHash(map.compatibility[id]))invalid();}
  return {runId:reference.referenceId,available:true,domains:map.domains.map(d=>({id:d.id,required:d.itemIds.length,passed:d.itemIds.filter(id=>reference.items.find(i=>i.id===id)!.passed).length}))};
 }catch{return {runId:reference.referenceId,available:false,reasonCode:'COMMON_REFERENCE_UNAVAILABLE'};}
}

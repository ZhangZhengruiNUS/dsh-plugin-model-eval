import {createHash} from 'node:crypto';
import type {JsonValue,Question,ProtocolRefs} from '../contracts.ts';
import type {QuestionCompatibility} from './tier-contracts.ts';
import {buildPrompt} from './grade-general.ts';
/** Stable JSON: insertion order must not become an implicit compatibility condition. */
export function canonical(value:unknown):string {
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  throw Error('NON_JSON_IDENTITY');
}
export const identityHash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
export const protocolKey=(refs:ProtocolRefs)=>canonical(refs);
export function questionCompatibility(question:Question,gradingDefinition:JsonValue,runtimeDefinition:JsonValue):QuestionCompatibility {
  const parts={contentHash:identityHash({datasetId:question.datasetId,sourceId:question.sourceId,sourceHash:question.sourceHash,prompt:question.prompt}),
    promptHash:identityHash(buildPrompt(question)),gradingHash:identityHash({definition:gradingDefinition,question:question.grading}),runtimeHash:identityHash(runtimeDefinition)};
  return {...parts,combinedHash:identityHash(parts)};
}

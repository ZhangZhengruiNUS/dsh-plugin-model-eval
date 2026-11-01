/** Full rejection and semantic assertion are separate evidence requirements. */
import {identityHash} from '../../src/evaluation/protocol-identity.ts';
import type {CodeOutcome} from '../../src/runtime/runner.ts';
import {KNOWN_LOGIC_GAPS} from './known-logic-gaps.ts';
type Case={stdin:string;expected:string};
export function logicGapBinding(sourceId:string,sourceRecordHash:string,codeHash:string){
  return KNOWN_LOGIC_GAPS.find(g=>g.sourceId===sourceId&&g.sourceRecordHash===sourceRecordHash&&g.codeHash===codeHash&&g.language==='PYTHON3');
}
export function selectLogicCoverage(cases:readonly Case[],hashes:readonly string[]):Case[]{
  if(!hashes.length||new Set(hashes).size!==hashes.length)throw Error('KNOWN_LOGIC_GAP_CASES_CHANGED');
  const wanted=new Set(hashes),selected=cases.filter(c=>wanted.has(identityHash(c)));
  if(selected.length!==hashes.length||new Set(selected.map(c=>identityHash(c))).size!==hashes.length)throw Error('KNOWN_LOGIC_GAP_CASES_CHANGED');
  return selected;
}
export function assertKnownLogicInventory(sourceId:string,sourceRecordHash:string,codeHashes:readonly string[],cases:readonly Case[]):void{
  for(const gap of KNOWN_LOGIC_GAPS.filter(g=>g.sourceId===sourceId)){
    if(gap.sourceRecordHash!==sourceRecordHash)throw Error('KNOWN_LOGIC_GAP_SOURCE_CHANGED');
    if(codeHashes.filter(hash=>hash===gap.codeHash).length!==1)throw Error('KNOWN_LOGIC_GAP_PROGRAM_CHANGED');
    selectLogicCoverage(cases,gap.oracleCaseHashes);
  }
}
export function isAssertionCoverage(outcome:CodeOutcome):boolean{return outcome.kind==='failed'&&outcome.reason==='assertion';}

import test from 'node:test';
import assert from 'node:assert/strict';
import {identityHash} from '../../src/evaluation/protocol-identity.ts';
import {selectLogicCoverage,isAssertionCoverage,assertKnownLogicInventory} from '../../scripts/support/logic-coverage.ts';
import {KNOWN_LOGIC_GAPS} from '../../scripts/support/known-logic-gaps.ts';
test('semantic_coverage_requires_canonical_cases_and_an_actual_assertion',()=>{
  const a={stdin:'a',expected:'1'},b={stdin:'b',expected:'2'},ha=identityHash(a),hb=identityHash(b);
  assert.deepEqual(selectLogicCoverage([b,a],[ha,hb]),[b,a],'extract canonical order, not metadata order');
  for(const [cases,hashes] of [[[a],[hb]],[[a],[ha,ha]],[[a,a],[ha]],[[a],[]]] as [{stdin:string;expected:string}[],string[]][] )assert.throws(()=>selectLogicCoverage(cases,hashes),/KNOWN_LOGIC_GAP_CASES_CHANGED/);
  assert.throws(()=>selectLogicCoverage([{...a,expected:'9'}],[ha]),/KNOWN_LOGIC_GAP_CASES_CHANGED/);
  assert.equal(isAssertionCoverage({kind:'failed',reason:'assertion',elapsedMs:1}),true);
  for(const outcome of [{kind:'failed',reason:'timeout',elapsedMs:1},{kind:'failed',reason:'resource',elapsedMs:1},{kind:'passed',elapsedMs:1},{kind:'environment-error',code:'x',elapsedMs:1},{kind:'cancelled',elapsedMs:1}] as const)assert.equal(isAssertionCoverage(outcome),false);
});

test('every_previously_discovered_logic_gap_must_remain_present_with_its_exact_canonical_proof',()=>{
  const first=KNOWN_LOGIC_GAPS[0]!,same=KNOWN_LOGIC_GAPS.filter(g=>g.sourceId===first.sourceId),hashes=same.map(g=>g.codeHash);
  // The inventory check runs independently of executing the supplied programs.
  assert.throws(()=>assertKnownLogicInventory(first.sourceId,first.sourceRecordHash,[],[]),/KNOWN_LOGIC_GAP_PROGRAM_CHANGED/);
  assert.throws(()=>assertKnownLogicInventory(first.sourceId,first.sourceRecordHash,hashes.map((h,i)=>i===0?'0'.repeat(64):h),[]),/KNOWN_LOGIC_GAP_PROGRAM_CHANGED/);
  assert.throws(()=>assertKnownLogicInventory(first.sourceId,'0'.repeat(64),hashes,[]),/KNOWN_LOGIC_GAP_SOURCE_CHANGED/);
  assert.throws(()=>assertKnownLogicInventory(first.sourceId,first.sourceRecordHash,[...hashes,hashes[0]!],[]),/KNOWN_LOGIC_GAP_PROGRAM_CHANGED/);
  assert.throws(()=>assertKnownLogicInventory(first.sourceId,first.sourceRecordHash,hashes,[]),/KNOWN_LOGIC_GAP_CASES_CHANGED/);
  assert.doesNotThrow(()=>assertKnownLogicInventory('no-known-gap','0'.repeat(64),[],[]));
});

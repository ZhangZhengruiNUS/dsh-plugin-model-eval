import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInput,adaptContest,coverageCases,sortingCases} from '../../scripts/support/contest-adaptation.ts';
import {identityHash} from '../../src/evaluation/protocol-identity.ts';

const row=(index:number,inputs:string[])=>({sourceId:String(index),sourceRecordHash:'a'.repeat(64),cases:inputs.map(stdin=>({stdin,expected:'1\n'})),raw:{
  public_tests:{input:inputs.slice(0,1),output:['1\n']},private_tests:{input:[],output:[]},generated_tests:{input:inputs.slice(1),output:inputs.slice(1).map(()=>'1\n')}
}});
test('exclude_only_proven_illegal_generated_inputs_and_preserve_every_legal_test',()=>{
  const source=row(0,['2 1\nA\nB\n','2 1\nAB\nCA\n','2 1\nB\nA\n']);
  const original=structuredClone(source),result=adaptContest(source);
  assert.deepEqual(source,original,'source is immutable');
  assert.deepEqual(result.cases.slice(0,result.kept.length),[source.cases[0],source.cases[2]]);
  assert.equal(result.excluded.length,1);assert.equal(result.excluded[0]!.sourceIndex,1);
  assert.equal(result.excluded[0]!.origin,'generated');
  assert.equal(result.excluded[0]!.originalHash,identityHash(source.cases[1]));
  assert.match(result.excluded[0]!.reason,/length/);
  assert.equal(result.status,'audited');
  assert.throws(()=>adaptContest(row(0,['2 1\nAB\nCA\n'])),/NON_GENERATED_INVALID/);
  assert.throws(()=>adaptContest({...source,cases:source.cases.slice(1)}),/SOURCE_CASE_MISMATCH/);
});
test('input_validation_covers_declared_shapes_ranges_uniqueness_and_aggregate_limits',()=>{
  for(const input of ['2 1\nA\nA\n','2 1\nA\n','1 1\na\n','1 1\nA\nB\n','0 1\n'])assert.equal(validateInput('0',input).status,'invalid');
  for(const input of ['1\n2\n1 1000\n','2\n1\n3\n2\n4 5\n'])assert.equal(validateInput('19',input).status,'valid');
  for(const input of ['1\n2\n1\n','1\n1\n1001\n','1\n1\n0\n','1\n1\n1\n8\n','1\n1\nNaN\n'])assert.equal(validateInput('19',input).status,'invalid');
  assert.equal(validateInput('91','1\n2\n1 100000\n').status,'valid');
  assert.equal(validateInput('91','1\n2\n1 100001\n').status,'invalid');
  assert.equal(validateInput('91','1\n2 1\n1\n').status,'invalid','equal total token count cannot hide malformed declared lines');
  assert.equal(validateInput('unreviewed','nonsense').status,'pending');
  const pending=adaptContest(row(999,['x','y']));assert.equal(pending.status,'pending');assert.equal(pending.cases.length,2);assert.equal(pending.excluded.length,0);
});
test('tree_query_contract_rejects_cycles_bad_indices_and_undeclared_queries',()=>{
  assert.equal(validateInput('8','2 2\n-3 4\n1 2\n1 1 7\n2 1 2\n').status,'valid');
  for(const input of [
    '2 1\n-3 4\n1 2\n2 1 2\n2 2 1\n',
    '3 1\n1 2 3\n1 2\n2 1\n2 1 3\n',
    '2 1\n-3 4\n1 2\n3 1 2\n',
    '2 1\n-3 4\n1 2\n2 1 3\n'
  ])assert.equal(validateInput('8',input).status,'invalid');
});
test('fixed_coverage_oracle_is_exhaustive_deterministic_and_bounded',()=>{
  const generated=coverageCases();assert.deepEqual(coverageCases(),generated);
  assert.equal(generated.proof.find(p=>p.values.join(',')==='919,262,337,976,347,18,805')!.minimum,1152);
  assert.ok(generated.proof.every(p=>p.arrangements===2**p.values.length));
  assert.equal(validateInput('19',generated.test.stdin).status,'valid');
  assert.equal(generated.test.expected.trim().split(/\s+/).length,generated.proof.length);
  const source=row(19,['1\n1\n1\n']),result=adaptContest(source);
  assert.equal(result.added.length,1);assert.equal(result.cases.length,2);
  assert.deepEqual(result.cases[0],source.cases[0]);
  assert.equal(result.added[0]!.caseHash,identityHash(generated.test));
  assert.notEqual(result.adaptedHash,result.originalHash);
});
test('sorting_boundaries_cover_odd_word_lengths_without_dropping_legal_tests',()=>{
  const added=sortingCases();
  assert.deepEqual(added[0]!.test,{stdin:'2 1\nZ\nA\n',expected:'2 1\n'});
  assert.ok(added.every(c=>validateInput('0',c.test.stdin).status==='valid'));
  const adapted=adaptContest(row(0,['2 1\nA\nB\n']));
  assert.equal(adapted.added.length,added.length);
  assert.deepEqual(adapted.cases[0],{stdin:'2 1\nA\nB\n',expected:'1\n'});
});

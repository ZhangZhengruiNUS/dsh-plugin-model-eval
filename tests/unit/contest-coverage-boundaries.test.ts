import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {adaptContest,validateInput} from '../../scripts/support/contest-adaptation.ts';
test('fixed_subsequence_and_domino_boundaries_keep_independently_proved_counterexamples',async()=>{
  const rows=JSON.parse(await readFile('.local/tier-candidates/sources/code-contests-test.json','utf8'));
  const permutation=Array.from({length:100},(_,i)=>i+1).join(' ');
  for(const [id,stdin,expected] of [['11','2\n1 1\n','1\n'],['109','1\nBB\n','0\n'],['142','1\n\n3 3\n3 2 1\n1 3 1\n1 1 3\n','2\n'],['145','1\n\n2 1\n0 2 1\n1 2 1\n','0\n'],['146',`100 2\n${permutation}\n1 1 2\n2 1 100\n`,'1\n']]){
    const result=adaptContest(rows[+id!]);
    assert.ok(result.cases.some(c=>c.stdin===stdin&&c.expected===expected),'missing independently proved counterexample '+id);
    assert.ok(result.added.length>0);assert.ok(result.added.every(c=>c.oracle&&c.proofHash));
    assert.equal(validateInput(id!,stdin!).status,'valid');
  }
});

test('tower_balancing_does_not_treat_a_flat_one_step_range_as_optimal',async()=>{
  const rows=JSON.parse(await readFile('.local/tier-candidates/sources/code-contests-test.json','utf8'));
  const result=adaptContest(rows[119]);
  assert.ok(result.cases.some(c=>c.stdin==='1\n4\n1 1 3 3\n'&&c.expected==='0\n'));
});

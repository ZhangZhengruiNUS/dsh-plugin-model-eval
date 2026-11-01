import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInput} from '../../scripts/support/contest-adaptation.ts';
const fixtures:[string,string,string][]=[
 ['87','1\n2\n1 1000000000\n','1\n2\n0 1\n'],
 ['93','1\n1000000000000000000 999999999999999999\n','1\n1000000000000000001 1\n'],
 ['60','1\n3\n0 1 2\n','1\n2\n1 2\n'],
 ['113','1\n1 0\n1000000 1000000\n','1\n0 0\n1 0\n'],
 ['115','1\n2 1000000000000000000\n1 1000000000\n','1\n2 1\n2 2\n'],
 ['147','1\nEN\n','1\nE\n'],['94','1\n2 1\n0 9\n','1\n2 1\n1 2\n'],
 ['59','1\n2\n1 0 0 0 0\n0 1 0 0 0\n','1\n2\n0 0 0 0 0\n1 1 1 1 1\n'],
 ['129','1\n1\n1000000000\n','1\n1\n0\n'],['28','1\n1 2 3\n','1\n0 2 3\n'],
 ['78','1\n2\n0 1073741823\n','1\n1\n1073741824\n'],
 ['127','1\nzabc\nbca\n','1\nabc\naab\n'],['120','1\n1 200000\n','1\n2 1\n'],
 ['162','1\n3\n1 2 3\n','1\n3\n0 2 3\n'],['160','1\n1 2 1 1 1 2\n','1\n1 2 2 1 1 2\n'],
 ['55','60\n','61\n'],['45','1\n2\n0 1\n','1\n2\n1 2\n'],
 ['30','1\n3\nabc\n','1\n3\nab\n'],['3','_X0\n','_Y0\n'],
 ['119','1\n2\n1 10000000\n','1\n2\n1 10000001\n'],
 ['100','1\n2\n-1000000000 1000000000\n','1\n1\n-1000000001\n'],
 ['121','1\n2\n01\n10\n','1\n2\n01\n2a\n'],['29','1\n1\n0\n','1\n1\n-1\n'],
 ['61','1\n3\n1 1\n1 2\n2 1\n','1\n3\n1 1\n1 1\n2 1\n'],
 ['26','2\n1\n99999\n','2\n1\n100000\n'],
 ['156','1\n1 1000000000000000\n1\n','1\n1 1000000000000001\n1\n'],
 ['99','1\n-100000000000000 100000000000000\n','1\n0 100000000000001\n'],
 ['33','2\n0 500\n','2\n0 501\n'],['140','1\n1000000000\n','1\n1000000001\n'],
 ['148','1\n3 3\n2 1 2\n2 1 2\n2 1 2\n2 1 2\n','1\n3 3\n2 1 3\n2 1 2\n2 1 2\n2 1 2\n']
];
test('pinned_input_contracts_accept_boundaries_and_reject_specific_violations',()=>{
  for(const [id,valid,invalid] of fixtures){assert.equal(validateInput(id,valid).status,'valid','valid source '+id);assert.equal(validateInput(id,invalid).status,'invalid','invalid source '+id);}
});
test('large_legal_array_lines_do_not_become_invalid_due_to_JS_argument_limits',()=>{
  const input='1\n200000\n'+Array(200000).fill('1').join(' ')+'\n';
  assert.equal(validateInput('78',input).status,'valid');
});

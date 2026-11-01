import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceVerdict} from '../../scripts/support/reference-verdict.ts';

test('reference_admission_requires_correct_witnesses_and_every_available_known_error_not_an_invented_negative_quota',()=>{
  const passed={kind:'passed',elapsedMs:1} as const,assertion={kind:'failed',reason:'assertion',elapsedMs:1} as const;
  assert.deepEqual(referenceVerdict([{outcome:passed}],[]),{status:'passed'});
  assert.deepEqual(referenceVerdict([{outcome:passed}],[{outcome:assertion}]),{status:'passed'});
  assert.equal(referenceVerdict([] ,[]).reason,'CORRECT_REFERENCE_NOT_PASSED');
  assert.equal(referenceVerdict([{outcome:assertion}],[]).status,'failed');
  assert.equal(referenceVerdict([{outcome:passed},{required:true,outcome:assertion}],[]).reason,'CORRECT_REFERENCE_NOT_PASSED');
  assert.equal(referenceVerdict([{outcome:passed}],[{outcome:passed}]).reason,'INCORRECT_REFERENCE_NOT_REJECTED');
  for(const outcome of [{kind:'failed',reason:'timeout',elapsedMs:1},{kind:'failed',reason:'resource',elapsedMs:1},passed,{kind:'environment-error',code:'x',elapsedMs:1}] as const){
    assert.equal(referenceVerdict([{outcome:passed}],[{outcome:assertion,logicGap:{},coverageOutcome:outcome}]).reason,'SEMANTIC_COUNTEREXAMPLE_NOT_REJECTED');
  }
  assert.deepEqual(referenceVerdict([{outcome:passed}],[{outcome:assertion,logicGap:{},coverageOutcome:assertion}]),{status:'passed'});
});

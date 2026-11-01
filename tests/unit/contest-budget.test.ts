import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTEST_SCORING_LIMITS,CONTEST_BUDGET_VERSION} from '../../src/evaluation/contest-budget.ts';
import {identityHash} from '../../src/evaluation/protocol-identity.ts';
test('approved_contest_budget_is_uniform_and_has_a_new_compatibility_identity',()=>{
  assert.deepEqual(CONTEST_SCORING_LIMITS,{wallMs:60000,memoryBytes:536870912,computeBudget:800000000000});
  assert.ok(Object.isFrozen(CONTEST_SCORING_LIMITS));
  assert.equal(CONTEST_BUDGET_VERSION,'contest-60s-512m-800b-v1');
  assert.notEqual(identityHash(CONTEST_SCORING_LIMITS),identityHash({wallMs:30000,memoryBytes:536870912,computeBudget:200000000000}));
});

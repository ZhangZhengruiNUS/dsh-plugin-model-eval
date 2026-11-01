import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createContestRunner} from '../../src/runtime/contest-runner.ts';
test('reject_first_wrong_case_before_later_infinite_case',{timeout:12000},async()=>{
  const runner=createContestRunner(resolve('resources/runtime'));
  const solution='import sys\ns=sys.stdin.read().strip()\nif s=="loop":\n while True:pass\nprint(2)';
  const result=await runner.runContest({id:'early-failure',cases:[{stdin:'first',expected:'3'},{stdin:'loop',expected:'3'}],limits:{wallMs:5000,memoryBytes:536870912,computeBudget:200000000000}},solution,new AbortController().signal);
  assert.equal(result.kind,'failed',JSON.stringify(result));if(result.kind==='failed')assert.equal(result.reason,'assertion','first proved mismatch determines failure before the later timeout');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {extractExactNumber,numericAnswerMatches} from '../../src/evaluation/numeric-answer.ts';
test('exact_numeric_grammar_and_host_owned_contest_verdict',()=>{
  assert.equal(numericAnswerMatches('Reasoning\nFinal answer: -3/2','-1.5'),true);
  assert.equal(numericAnswerMatches('Final answer: 9,007,199,254,740,993','9007199254740993'),true);
  assert.equal(numericAnswerMatches('Final answer: 9007199254740992','9007199254740993'),false);
  assert.equal(numericAnswerMatches('Final answer: +1.25e-2','1/80'),true);
  for(const body of ['1/0','0/0','2 or 3','sqrt(2)','1+1','__import__("os").system("bad")','1e1001','1e-1001','9'.repeat(501),'1,00','NaN','Infinity','1/2/3','3.'])assert.equal(extractExactNumber('Final answer: '+body),undefined,body.slice(0,80));
  assert.equal(extractExactNumber('Final answer: 42\nAnother line'),undefined);
  assert.equal(extractExactNumber('42'),undefined);
  assert.equal(numericAnswerMatches('Final answer: 42','bad'),false);
});

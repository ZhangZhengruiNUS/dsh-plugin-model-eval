import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRuleGrader } from '../../src/runtime/rule-grader.ts';

test('rule grading cancellation stops a trusted child without assigning a score',async()=>{
  const cancel=new AbortController();cancel.abort();
  const result=await createRuleGrader('resources/runtime/rules').gradeRules({itemId:'cancel',key:1,prompt:'alpha',instruction_id_list:['keywords:existence'],kwargs:[{keywords:['alpha']}],answer:'alpha'},cancel.signal);
  assert.equal(result.kind,'technical-missing');if(result.kind==='technical-missing')assert.equal(result.error.code,'CANCELLED');
});

test('offline strict rules execute constraints and treat answer text only as data', async () => {
  const grader = createRuleGrader(resolve('resources/runtime/rules'));
  const base = { itemId: 'fixture', key: 1, prompt: 'Include alpha and do not use commas.',
    instruction_id_list: ['keywords:existence', 'punctuation:no_comma'], kwargs: [{ keywords: ['alpha'] }, {}] };
  const good = await grader.gradeRules({ ...base, answer: 'alpha is here' });
  assert.equal(good.kind, 'scored', JSON.stringify(good));
  if (good.kind === 'scored' && good.track === 'general') assert.equal(good.passed, true);
  const unicode = await grader.gradeRules({ ...base, answer: 'alpha 你好' });
  assert.equal(unicode.kind, 'scored', JSON.stringify(unicode));
  const wrong = await grader.gradeRules({ ...base, answer: 'alpha, is here' });
  assert.equal(wrong.kind, 'scored');
  if (wrong.kind === 'scored' && wrong.track === 'general') assert.equal(wrong.passed, false);
  const codeAsData = await grader.gradeRules({ ...base, answer: "raise SystemExit('executed')" });
  assert.equal(codeAsData.kind, 'scored');
  const missing = await createRuleGrader(resolve('resources/absent')).gradeRules({ ...base, answer: 'alpha' });
  assert.equal(missing.kind, 'technical-missing');
});

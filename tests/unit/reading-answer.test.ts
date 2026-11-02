import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {GeneratedAnswer,Question} from '../../src/contracts.ts';
import {extractReadingAnswer} from '../../src/evaluation/reading-answer.ts';
import {gradeGeneral,buildPrompt,type PreparedEnvironment} from '../../src/evaluation/grade-general.ts';

const question:Question={id:'reading/fixture',track:'general',datasetId:'longbench-v2-selected',sourceId:'fixture',sourceHash:'0'.repeat(64),prompt:[{role:'user',content:'Read the material.\nThe amount was 12.\n(A) 12 (B) 13 (C) 14 (D) 15\nEnd with the correct answer on its own final line.'}],grading:{kind:'reading-choice',answer:'A'}};
const env={signal:new AbortController().signal} as PreparedEnvironment;
const answer=(text:unknown,complete=true)=>({text,complete,truncated:false} as GeneratedAnswer);
test('reading scores a valid explicit final answer without a judge',async()=>{
 const result=await gradeGeneral(question,answer('The amount is twelve.\nThe correct answer is (A)'),env);
 assert.equal(result.kind,'scored');if(result.kind==='scored'&&result.track==='general')assert.equal(result.passed,true);
});
test('frozen 50 reading prompts, choices and answers retain the audited hashes',async()=>{
 const rows:Question[]=JSON.parse(await readFile('resources/suites/task-five-v1/questions.json','utf8'));
 const selection=JSON.parse(await readFile('resources/suites/task-five-v1/selection.json','utf8'));
 const reads=rows.filter(q=>q.datasetId==='longbench-v2-selected');
 assert.equal(rows.length,350);assert.equal(reads.length,50);assert.equal(selection.light.length,100);
 assert.equal(selection.deep.length,350);assert.ok(selection.light.every((id:string)=>selection.deep.includes(id)));
 const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
 let positive=0,wrong=0,formats=0;
 for(const q of reads){
  const m=selection.reading.records.find((r:any)=>r.id===q.sourceId),gold=(q.grading as {answer:string}).answer;
  assert.equal(gold,m.gold);assert.equal(sha(q.prompt[0]!.content),m.promptSha256);
  assert.ok(q.prompt[0]!.content.endsWith('End your response with that answer on its own final line.'));
  assert.ok(!q.prompt[0]!.content.includes(m.rightsBasis));assert.ok(!q.prompt[0]!.content.includes(m.id));
  assert.equal(sha(q.prompt[0]!.content.split('<text>\n')[1]!.split('\n</text>')[0]!),m.contextSha256);
  const check=async(text:string,passed:boolean)=>{const r=await gradeGeneral(q,answer(text),env);assert.equal(r.kind,'scored');if(r.kind==='scored'&&r.track==='general')assert.equal(r.passed,passed);};
  await check(`The correct answer is (${gold})`,true);positive++;
  for(const k of 'ABCD')if(k!==gold){await check(`The correct answer is (${k})`,false);wrong++;}
  for(const s of [`**The correct answer is (${gold}).**`,`Reasoning mentions A B C D.\nThe correct answer is (${gold})`,`the correct answer is (${gold.toLowerCase()})`,`The correct answer is (${gold})\nThe correct answer is (${gold})`]){await check(s,true);formats++;}
 }
 assert.deepEqual([positive,wrong,formats],[50,150,200]);
 assert.equal(selection.reading.records.filter((r:any)=>r.light).length,10);
 assert.equal(new Set(selection.reading.records.map((r:any)=>r.contextSha256)).size,49);
});
test('all 19 audited adversarial carriers have no extractable reading answer',()=>{
 const bad:unknown[]=['A','Answer: A','A or B','The correct answer is (E)','The correct answer is (A or B)',
  '> The correct answer is (A)','"The correct answer is (A)"','```text\nThe correct answer is (A)\n```','~~~\nThe correct answer is (A)\n~~~',
  'The correct answer is (A)\nThe correct answer is (B)','Discuss A, B, C, D; do not choose A.','The correct answer is (A) is an example.',
  '<think>The correct answer is (A)</think>','<think>\nThe correct answer is (A)\n</think>',
  'The correct answer is (A)\nThis is only a format example.',null,42,{},[]];
 assert.equal(bad.length,19);for(const value of bad)assert.equal(extractReadingAnswer(value as string).answer,undefined);
});
test('an unclosed code fence cannot reuse an earlier top-level choice',()=>{
 for(const fence of ['```text','~~~'])for(const final of ['A','B'])assert.equal(extractReadingAnswer(`The correct answer is (A)\n${fence}\nThe correct answer is (${final})`).answer,undefined);
 for(const text of ['```text\nquoted example\n~~~\nThe correct answer is (A)','````text\nquoted example\n```\nThe correct answer is (A)','```text\nquoted example\n```wrong\nThe correct answer is (A)'])assert.equal(extractReadingAnswer(text).answer,undefined);
 assert.equal(extractReadingAnswer('```text\nquoted example\n```\nThe correct answer is (A)').answer,'A');
});
test('reading rejects wrong, quoted, fenced, conflicting and reasoning-only answers',async()=>{
 for(const text of ['The correct answer is (B)','A','Answer: A','The correct answer is (E)',
  '> The correct answer is (A)','"The correct answer is (A)"','```\nThe correct answer is (A)\n```',
  'The correct answer is (A)\nThe correct answer is (B)',
  '<think>\nThe correct answer is (A)\n</think>',
  'The correct answer is (A)\nOnly a format example.']){
  const result=await gradeGeneral(question,answer(text),env);
  assert.equal(result.kind,'scored',text);if(result.kind==='scored'&&result.track==='general')assert.equal(result.passed,false,text);
 }
});
test('reading treats bad carriers, bad keys and incomplete requests as technical missing',async()=>{
 for(const [q,a] of [[question,answer(null)],[{...question,grading:{kind:'reading-choice',answer:'E'}},answer('The correct answer is (A)')],[question,answer('The correct answer is (A)',false)]] as const){
  assert.equal((await gradeGeneral(q,a,env)).kind,'technical-missing');
 }
});
test('reading permits declared formatting variations and ignores hidden reasoning choices',async()=>{
 for(const text of ['**The correct answer is (A).**','the correct answer is (a)','The correct answer is (A)\nThe correct answer is (A)','<think>\nThe correct answer is (D)\n</think>\nThe correct answer is (A)']){
  const result=await gradeGeneral(question,answer(text),env);
  assert.equal(result.kind,'scored');if(result.kind==='scored'&&result.track==='general')assert.equal(result.passed,true,text);
 }
 assert.deepEqual(buildPrompt(question),question.prompt);
});

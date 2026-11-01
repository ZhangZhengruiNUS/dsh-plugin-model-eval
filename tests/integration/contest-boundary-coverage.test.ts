import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {identityHash} from '../../src/evaluation/protocol-identity.ts';
import {boundaryCases,adaptContest} from '../../scripts/support/contest-adaptation.ts';
import {classifyUpstreamReferences} from '../../scripts/support/reference-classification.ts';
import {createContestRunner} from '../../src/runtime/contest-runner.ts';
test('independent_boundaries_reject_fifteen_logic_gaps_and_explicitly_check_corrected_role',{timeout:180000},async()=>{
  const rows=JSON.parse(await readFile('.local/tier-candidates/sources/code-contests-test.json','utf8'));
  const negatives=JSON.parse(await readFile('.local/tier-candidates/artifacts/negative-references.json','utf8'));
  const report=JSON.parse(await readFile('docs/evidence/tiers/coding-adaptation-runtime-v2.json','utf8'));
  const runner=createContestRunner(resolve('resources/runtime')),limits={wallMs:30000,memoryBytes:536870912,computeBudget:200000000000};
  for(const id of ['11','109','142','145','146','20','33','47','56','59','77','78','87','9','94']){
    const evidence=report.items.find((x:any)=>x.sourceId===id),source=rows[+id],negative=negatives.find((x:any)=>x.index===+id);
    const run=(code:string,cases=boundaryCases(id).map(x=>x.test))=>runner.runContest({id:'independent-boundaries-'+id,cases,limits},code,new AbortController().signal);
    const classification=classifyUpstreamReferences(source,negative.incorrectPython3);
    let validPositive=false;
    for(const program of classification.positivePrograms){const outcome=await run(program.code);if(outcome.kind==='passed'){validPositive=true;break;}}
    assert.ok(validPositive,'a correct reference accepts independent boundary outputs '+id);
    for(const program of classification.positivePrograms.filter(x=>x.required))assert.equal((await run(program.code,adaptContest(source).cases)).kind,'passed','corrected-role reference explicitly passes every retained and new case');
    const gaps=evidence.negatives.filter((x:any)=>x.outcome.kind==='passed'&&!classification.corrected.some(c=>c.codeHash===x.codeHash));assert.ok(gaps.length>0);
    for(const gap of gaps){
      const code=negative.incorrectPython3[gap.referenceIndex];assert.equal(identityHash(code),gap.codeHash);
      const outcome=await run(code);assert.equal(outcome.kind,'failed',id+' '+JSON.stringify(outcome));if(outcome.kind==='failed')assert.equal(outcome.reason,'assertion','coverage rejects the answer instead of exhausting budget');
    }
  }
});

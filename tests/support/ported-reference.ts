/** Development references only. Programs always execute inside the real WASI runner. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createContestRunner} from '../../src/runtime/contest-runner.ts';
import {adaptContest} from '../../scripts/support/contest-adaptation.ts';
import {CONTEST_SCORING_LIMITS} from '../../src/evaluation/contest-budget.ts';
export type ReferenceExample={args:unknown[];answer:number|number[]|string;display?:'space-list'};
export async function verifyPort(id:string,path:string,examples:ReferenceExample[]){
  const limits=CONTEST_SCORING_LIMITS,runner=createContestRunner(resolve('resources/runtime'));
  const code=await readFile('scripts/references/'+path,'utf8'),prefix=code.split("if __name__ == '__main__':")[0]!;
  const calls=examples.map(e=>'print('+(e.display==='space-list'?'*':'')+'solve(*'+JSON.stringify(e.args)+'))').join('\n');
  const oracle=await runner.runContest({id:'independent-small-'+id,cases:[{stdin:'',expected:examples.map(e=>typeof e.answer==='string'?e.answer:JSON.stringify(e.answer).replaceAll(',',', ')).join('\n')}],limits},prefix+'\n'+calls+'\n',new AbortController().signal);
  assert.equal(oracle.kind,'passed',id+' independent oracle '+JSON.stringify(oracle));
  const rows=JSON.parse(await readFile('.local/tier-candidates/sources/code-contests-test.json','utf8'));
  const result=await runner.runContest({id:'independent-retained-'+id,cases:adaptContest(rows[+id]).cases,limits},code,new AbortController().signal);
  assert.equal(result.kind,'passed',id+' retained '+JSON.stringify(result));
}

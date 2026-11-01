/** Oracle harness for trusted developer programs only; canonical runs stay fresh-VM. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createContestRunner} from '../../src/runtime/contest-runner.ts';
import {adaptContest} from '../../scripts/support/contest-adaptation.ts';
import {CONTEST_SCORING_LIMITS} from '../../src/evaluation/contest-budget.ts';
export interface ReferenceSample {stdin:string;expected:string}
export async function verifyPlainPort(id:string,file:string,samples:ReferenceSample[]){
  const limits=CONTEST_SCORING_LIMITS,runner=createContestRunner(resolve('resources/runtime'));
  const code=await readFile('scripts/references/'+file,'utf8');
  for(let i=0;i<samples.length;i+=256){
    const batch=samples.slice(i,i+256);
    // Only independent input fixtures enter the guest; every expected stays Host.
    const harness='import io,sys,contextlib\ncompiled=compile('+JSON.stringify(code)+',"developer-reference.py","exec")\nfor text in '+JSON.stringify(batch.map(s=>s.stdin))+':\n sys.stdin=io.TextIOWrapper(io.BytesIO(text.encode()))\n with contextlib.redirect_stdout(io.StringIO()) as captured:\n  exec(compiled,{"__name__":"__main__"})\n print(captured.getvalue().strip())\n';
    const outcome=await runner.runContest({id:'oracle-'+id,cases:[{stdin:'',expected:batch.map(s=>s.expected.trim()).join('\n')}],limits},harness,new AbortController().signal);
    assert.equal(outcome.kind,'passed',id+' independent oracle batch'+i+' '+JSON.stringify(outcome));
  }
  const rows=JSON.parse(await readFile('.local/tier-candidates/sources/code-contests-test.json','utf8'));
  const outcome=await runner.runContest({id:'retained-'+id,cases:adaptContest(rows[+id]).cases,limits},code,new AbortController().signal);
  assert.equal(outcome.kind,'passed',id+' all retained '+JSON.stringify(outcome));
}

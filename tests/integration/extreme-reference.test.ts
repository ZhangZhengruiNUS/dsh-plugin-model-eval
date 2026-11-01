import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createContestRunner} from '../../src/runtime/contest-runner.ts';
import {adaptContest} from '../../scripts/support/contest-adaptation.ts';
function compositions(n:number):number[][]{
  if(n===0)return [[]];return Array.from({length:n},(_,i)=>compositions(n-i-1).map(tail=>[i+1,...tail])).flat();
}
/** Independent exhaustive oracle: enumerate every positive split, not the greedy recurrence. */
function minimumSplits(values:number[]):number{
  let best=Infinity;
  const visit=(i:number,last:number,extra:number)=>{
    if(i===values.length){best=Math.min(best,extra);return;}
    for(const parts of compositions(values[i]!)){
      if(parts[0]!<last||parts.some((v,j)=>j>0&&v<parts[j-1]!))continue;
      visit(i+1,parts.at(-1)!,extra+parts.length-1);
    }
  };
  visit(0,0,0);return best;
}
function sumOracle(values:number[]){let total=0;for(let l=0;l<values.length;l++)for(let r=l+1;r<=values.length;r++)total+=minimumSplits(values.slice(l,r));return total;}
test('independent_extreme_reference_matches_exhaustive_splits_and_retained_public_data',{timeout:60000},async()=>{
  assert.equal(sumOracle([5,4,3]),5);assert.equal(sumOracle([3,2,1,4]),9);
  const arrays:number[][]=[];
  const enumerate=(prefix:number[],n:number)=>{if(prefix.length===n){arrays.push(prefix);return;}for(let v=1;v<=4;v++)enumerate([...prefix,v],n);};
  for(let n=1;n<=3;n++)enumerate([],n);
  const cases=[{stdin:arrays.length+'\n'+arrays.map(a=>a.length+'\n'+a.join(' ')).join('\n')+'\n',expected:arrays.map(sumOracle).join('\n')+'\n'}];
  const rows=JSON.parse(await readFile('.local/tier-candidates/sources/code-contests-test.json','utf8'));
  cases.push(...adaptContest(rows[91]).cases);
  const code=await readFile('scripts/references/extreme-extension.py','utf8');
  const outcome=await createContestRunner(resolve('resources/runtime')).runContest({id:'independent-1604-E',cases,limits:{wallMs:30000,memoryBytes:536870912,computeBudget:200000000000}},code,new AbortController().signal);
  assert.equal(outcome.kind,'passed',JSON.stringify(outcome));
});

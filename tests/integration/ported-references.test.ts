import {CONTEST_SCORING_LIMITS} from '../../src/evaluation/contest-budget.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createContestRunner} from '../../src/runtime/contest-runner.ts';
import {adaptContest} from '../../scripts/support/contest-adaptation.ts';
const limits=CONTEST_SCORING_LIMITS;
const runner=createContestRunner(resolve('resources/runtime'));
const arrays=(n:number,values:number):number[][]=>n?arrays(n-1,values).flatMap(a=>Array.from({length:values},(_,v)=>[...a,v+1])):[[]];
function segments(a:number[]):number{
  // Enumerate all ordered disjoint segments directly, with no suffix DP.
  const possible=(start:number,k:number,last:number):boolean=>{
    if(!k)return true;
    for(let i=start;i+k<=a.length;i++){let sum=0;for(let j=i;j<i+k;j++)sum+=a[j]!;if(sum>last&&possible(i+k,k-1,sum))return true;}
    return false;
  };
  let best=0;for(let k=1;k*(k+1)/2<=a.length;k++)if(possible(0,k,-1))best=k;return best;
}
function insertion(a:number[],b:number[]):number{
  let best=Infinity;
  const visit=(prefix:number[],i:number,rest:number[])=>{
    if(i===a.length&&!rest.length){let v=0;for(let x=0;x<prefix.length;x++)for(let y=x+1;y<prefix.length;y++)if(prefix[x]!>prefix[y]!)v++;best=Math.min(best,v);return;}
    if(i<a.length)visit([...prefix,a[i]!],i+1,rest);
    const seen=new Set<number>();for(let j=0;j<rest.length;j++)if(!seen.has(rest[j]!)){seen.add(rest[j]!);visit([...prefix,rest[j]!],i,rest.filter((_,x)=>x!==j));}
  };
  visit([],0,b);return best;
}
async function check(id:string,path:string,extra:{stdin:string;expected:string}[]){
  const rows=JSON.parse(await readFile('.local/tier-candidates/sources/code-contests-test.json','utf8'));
  const source=rows.find((r:{sourceId:string})=>r.sourceId===id);
  const cases=[...extra,...adaptContest(source).cases];
  const result=await runner.runContest({id:'independent-'+id,cases,limits},await readFile('scripts/references/'+path,'utf8'),new AbortController().signal);
  assert.equal(result.kind,'passed',JSON.stringify(result));
}
test('segments_reference_matches_exhaustive_disjoint_segments_and_all_retained_tests',{timeout:180000},async()=>{
  const examples=Array.from({length:7},(_,i)=>arrays(i+1,3)).flat();
  await check('32','pchelyonok-segments.py',[{stdin:examples.length+'\n'+examples.map(a=>a.length+'\n'+a.join(' ')).join('\n')+'\n',expected:examples.map(segments).join('\n')}]);
});
test('insertion_reference_matches_all_small_permutations_interleavings_and_retained_tests',{timeout:180000},async()=>{
  const examples:{a:number[];b:number[]}[]=[];
  for(let n=1;n<=3;n++)for(let m=1;m<=3;m++)for(const a of arrays(n,3))for(const b of arrays(m,3))examples.push({a,b});
  await check('80','optimal-insertion.py',[{stdin:examples.length+'\n'+examples.map(({a,b})=>a.length+' '+b.length+'\n'+a.join(' ')+'\n'+b.join(' ')).join('\n')+'\n',expected:examples.map(({a,b})=>insertion(a,b)).join('\n')}]);
});
test('two_sorts_reference_matches_explicit_lexical_sort_and_retained_tests',{timeout:180000},async()=>{
  const ns=Array.from({length:1000},(_,i)=>i+1).concat([1999,2000,9999,10000]);
  const expected=ns.map(n=>{const sorted=Array.from({length:n},(_,i)=>i+1).sort((a,b)=>String(a)<String(b)?-1:String(a)>String(b)?1:0);let sum=0;for(let i=0;i<n;i++)sum=(sum+((i+1-sorted[i]!)%998244353+998244353)%998244353)%1000000007;return sum;});
  // Only trusted reference code is imported into this developer oracle harness.
  const code=(await readFile('scripts/references/two-sorts.py','utf8')).split("if __name__ == '__main__':")[0]!;
  const oracle=await runner.runContest({id:'two-sorts-exhaustive',cases:[{stdin:'',expected:expected.join('\n')}],limits},code+'\nfor n in '+JSON.stringify(ns)+': print(solve(n))\n',new AbortController().signal);
  assert.equal(oracle.kind,'passed',JSON.stringify(oracle));
  await check('83','two-sorts.py',[]);
});

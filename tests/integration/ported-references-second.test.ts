import {CONTEST_SCORING_LIMITS} from '../../src/evaluation/contest-budget.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createContestRunner} from '../../src/runtime/contest-runner.ts';
import {adaptContest} from '../../scripts/support/contest-adaptation.ts';
const limits=CONTEST_SCORING_LIMITS;
const runner=createContestRunner(resolve('resources/runtime'));
type Example={args:unknown[];answer:number|number[]};
const arrays=(n:number,values:number):number[][]=>n?arrays(n-1,values).flatMap(a=>Array.from({length:values},(_,v)=>[...a,v])):[[]];
async function check(id:string,path:string,examples:Example[]){
  const code=await readFile('scripts/references/'+path,'utf8');
  const prefix=code.split("if __name__ == '__main__':")[0]!;
  const calls=examples.map(e=>'print(solve(*'+JSON.stringify(e.args)+'))').join('\n');
  const oracle=await runner.runContest({id:'independent-small-'+id,cases:[{stdin:'',expected:examples.map(e=>JSON.stringify(e.answer).replaceAll(',',', ')).join('\n')}],limits},prefix+'\n'+calls+'\n',new AbortController().signal);
  assert.equal(oracle.kind,'passed',id+' independent oracle '+JSON.stringify(oracle));
  const rows=JSON.parse(await readFile('.local/tier-candidates/sources/code-contests-test.json','utf8'));
  const result=await runner.runContest({id:'independent-retained-'+id,cases:adaptContest(rows[+id]).cases,limits},code,new AbortController().signal);
  assert.equal(result.kind,'passed',id+' retained '+JSON.stringify(result));
}
test('cyclic_sum_matches_literal_cyclic_arcs_and_all_retained_tests',{timeout:180000},async()=>{
  const examples:Example[]=[];
  for(let n=1;n<=4;n++)for(const a of arrays(n,3))for(let m=1;m<=4;m++)for(const k of [1,2,3,5]){
    const b=Array.from({length:n*m},(_,i)=>a[i%n]!);let answer=0;
    for(let i=0;i<b.length;i++){let sum=0;for(let len=1;len<b.length;len++){sum+=b[(i+len-1)%b.length]!;if(sum%k===0)answer++;}}
    if(b.reduce((s,x)=>s+x,0)%k===0)answer++;
    examples.push({args:[a,m,k],answer});
  }
  await check('2','cyclic-sum.py',examples);
});
test('gcd_festival_matches_literal_all_pairs_and_all_retained_tests',{timeout:180000},async()=>{
  const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a,examples:Example[]=[];
  for(let n=2;n<=5;n++)for(const raw of arrays(n,4)){const a=raw.map(x=>x+1);let answer=0;for(let i=0;i<n;i++)for(let j=0;j<n;j++)answer+=gcd(i+1,j+1)*gcd(a[i]!,a[j]!);examples.push({args:[a],answer});}
  await check('6','gcd-festival.py',examples);
});
test('train_maintenance_matches_day_by_day_active_train_simulation',{timeout:180000},async()=>{
  const examples:Example[]=[];
  for(let seed=1;seed<=1000;seed++){
    const n=1+seed%3,m=1+seed%20,work=Array.from({length:n},(_,i)=>1+(seed+i*3)%5),period=work.map((x,i)=>x+1+(seed*7+i)%5);
    const active=new Map<number,number>(),operations:number[][]=[],answer:number[]=[];let state=seed;
    for(let day=0;day<m;day++){state=(Math.imul(state,1664525)+1013904223)>>>0;const model=state%n,op=active.has(model)?2:1;operations.push([op,model]);if(op===1)active.set(model,day);else active.delete(model);answer.push([...active].filter(([i,start])=>(day-start)%period[i]!>=work[i]!).length);}
    examples.push({args:[work,period,operations],answer});
  }
  await check('22','train-maintenance.py',examples);
});
test('mountain_matches_independent_subset_order_search',{timeout:180000},async()=>{
  const examples:Example[]=[];
  for(let seed=1;seed<=1000;seed++){
    const n=1+seed%7,d=seed%5;let state=seed;
    const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%8;};
    const people=Array.from({length:n},()=>[rand(),rand()]),best=Array(1<<n).fill(Infinity);best[0]=d;let answer=0;
    for(let mask=0;mask<best.length;mask++)if(Number.isFinite(best[mask])){answer=Math.max(answer,mask.toString(2).replaceAll('0','').length);for(let i=0;i<n;i++)if(!(mask&(1<<i))&&people[i]![0]!>=best[mask])best[mask|(1<<i)]=Math.min(best[mask|(1<<i)],Math.max(best[mask],people[i]![1]!));}
    examples.push({args:[d,people],answer});
  }
  await check('81','difficult-mountain.py',examples);
});
test('mex_counting_matches_exhaustive_prefix_mex_definition',{timeout:180000},async()=>{
  const examples:Example[]=[];
  for(let n=1;n<=3;n++)for(let k=0;k<=2;k++)for(const raw of arrays(n,n+2*k+1)){
    const b=raw.map(x=>x-k);let answer=0;
    for(const a of arrays(n,n+1)){const seen=new Set<number>();let mex=0,valid=true;for(let i=0;i<n;i++){seen.add(a[i]!);while(seen.has(mex))mex++;if(Math.abs(mex-b[i]!)>k){valid=false;break;}}if(valid)answer++;}
    examples.push({args:[n,k,b],answer});
  }
  await check('111','mex-counting.py',examples);
});
test('curriculum_packed_polynomial_matches_containing_interval_maxima_permutations',{timeout:180000},async()=>{
  const examples:Example[]=[];
  for(let n=1;n<=7;n++){
    const hist=Array.from({length:n+1},()=>Array(n+1).fill(0));
    const visit=(a:number[],rest:number[])=>{if(rest.length){for(let i=0;i<rest.length;i++)visit([...a,rest[i]!],rest.filter((_,j)=>j!==i));return;}
      const depths:number[]=[];for(let i=0;i<n;i++){const maxima=new Set<number>();for(let l=0;l<=i;l++){let max=0;for(let r=l;r<n;r++){max=Math.max(max,a[r]!);if(r>=i)maxima.add(max);}}depths.push(maxima.size);}
      for(let m=1;m<=n;m++){const k=depths.filter(x=>x===m).length;hist[m]![k]++;}
    };
    visit([],Array.from({length:n},(_,i)=>i+1));
    for(let m=1;m<=n;m++)for(let k=1;k<=n;k++)for(const p of [1,2,6,10007])examples.push({args:[n,m,k,p],answer:hist[m]![k]!%p});
  }
  await check('21','mathematics-curriculum.py',examples);
});

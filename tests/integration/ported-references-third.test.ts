import test from 'node:test';
import {verifyPort,type ReferenceExample} from '../support/ported-reference.ts';
test('telephone_distance_transform_matches_all_small_nonempty_grids',{timeout:60000},async()=>{
  const examples:ReferenceExample[]=[];
  for(const [h,w] of [[2,2],[2,3],[3,2],[3,3]])for(let mask=1;mask<2**(h!*w!);mask++){
    const rows=Array.from({length:h!},(_,r)=>Array.from({length:w!},(_,c)=>mask&(1<<(r*w!+c))?'1':'0').join(''));
    const poles=rows.flatMap((row,r)=>[...row].flatMap((x,c)=>x==='1'?[[r,c]]:[]));let answer=0;
    for(let r=0;r<h!;r++)for(let c=0;c<w!;c++)answer+=Math.min(...poles.map(([x,y])=>(x!-r)**2+(y!-c)**2));
    examples.push({args:[rows],answer});
  }
  await verifyPort('12','telephone-poles.py',examples);
});
test('cartesian_subsequence_matches_original_pair_interval_objective',{timeout:60000},async()=>{
  const examples:ReferenceExample[]=[];
  const add=(a:number[])=>{const n=a.length,best=Array(n+1).fill(-Infinity);for(let mask=1;mask<2**n;mask++){
    const selected=a.flatMap((_,i)=>mask&(1<<i)?[i]:[]);let sum=0;
    for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++){const x=selected[i]!,y=selected[j]!;sum+=a[x]!+a[y]!-2*Math.min(...a.slice(x,y+1));}best[selected.length]=Math.max(best[selected.length],sum);
  }for(let m=1;m<=n;m++)examples.push({args:[a,m],answer:best[m]});};
  const permutations=(a:number[],rest:number[])=>{if(!rest.length){add(a);return;}for(let i=0;i<rest.length;i++)permutations([...a,rest[i]!],rest.filter((_,j)=>j!==i));};
  for(let n=1;n<=5;n++)permutations([],Array.from({length:n},(_,i)=>i+1));
  for(let seed=1;seed<=100;seed++){const a=Array.from({length:6+seed%4},(_,i)=>(i*37+seed*11)%101);add(a);}
  await verifyPort('23','subsequence-tree.py',examples);
});
test('prime_lifo_matching_matches_exact_integer_valid_subsegments',{timeout:60000},async()=>{
  const examples:ReferenceExample[]=[];
  const add=(a:number[],ops:string)=>{let answer=0;for(let l=0;l<a.length;l++){let x=1n;for(let r=l;r<a.length;r++){const y=BigInt(a[r]!);if(ops[r]==='*')x*=y;else if(x%y===0n)x/=y;else break;answer++;}}examples.push({args:[a,ops],answer});};
  const enumerate=(a:number[],n:number)=>{if(a.length===n){for(let mask=0;mask<2**n;mask++)add(a,Array.from({length:n},(_,i)=>mask&(1<<i)?'*':'/').join(''));return;}for(const x of [1,2,4])enumerate([...a,x],n);};
  for(let n=1;n<=4;n++)enumerate([],n);
  for(let seed=1;seed<=300;seed++){const values=[1,2,3,4,6,8,9,12];let state=seed;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};const a=Array.from({length:8},()=>values[rand()%values.length]!);const ops=Array.from({length:8},()=>rand()%3?'*':'/').join('');add(a,ops);}
  await verifyPort('35','kuzya-homework.py',examples);
});
test('generating_function_matches_literal_transfer_matrix_trace',{timeout:60000},async()=>{
  const examples:ReferenceExample[]=[],mod=998244353n;
  for(let m=1;m<=8;m++){
    let matrix=Array.from({length:m},(_,i)=>Array.from({length:m},(_,j)=>BigInt(i===j)));
    for(let n=1;n<=100;n++){
      matrix=Array.from({length:m},(_,i)=>Array.from({length:m},(_,j)=>matrix[i]!.reduce((sum,v,k)=>sum+(k+j<m?v:0n),0n)%mod));
      if(n>=2)examples.push({args:[n,m],answer:Number(matrix.reduce((s,row,i)=>s+row[i]!,0n)%mod)});
    }
  }
  await verifyPort('25','problems-codeforces.py',examples);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPort,type ReferenceExample} from '../support/ported-reference.ts';
const M=1000000007n,mod=(x:bigint)=>(x%M+M)%M;
function pow(a:bigint,n:bigint):bigint{let x=1n;for(;n;n>>=1n,a=a*a%M)if(n&1n)x=x*a%M;return x;}
const arrays=(n:number,k:number):number[][]=>n?arrays(n-1,k).flatMap(a=>Array.from({length:k},(_,x)=>[...a,x])):[[]];
test('potential_expectation_matches_literal_absorbing_Markov_equations',{timeout:60000},async()=>{
  const examples:ReferenceExample[]=[];
  for(const [n,k] of [[1,2],[2,2],[3,2],[4,2],[2,3],[3,3]] as [number,number][]){
    const states=arrays(n,k),transient=states.filter(a=>a.some(x=>x!==a[0])),lookup=new Map(transient.map((a,i)=>[a.join(','),i])),size=transient.length;
    const matrix=transient.map((a,i)=>{const row=Array<bigint>(size+1).fill(0n);row[i]=BigInt(n*k);row[size]=BigInt(n*k);for(let at=0;at<n;at++)for(let color=0;color<k;color++){const b=[...a];b[at]=color;const j=lookup.get(b.join(','));if(j!==undefined)row[j]=mod(row[j]!-1n);}return row;});
    for(let col=0;col<size;col++){
      const pivot=matrix.findIndex((row,i)=>i>=col&&row[col]!==0n);assert.ok(pivot>=col);[matrix[col],matrix[pivot]]=[matrix[pivot]!,matrix[col]!];
      const inverse=pow(matrix[col]![col]!,M-2n);for(let j=col;j<=size;j++)matrix[col]![j]=matrix[col]![j]!*inverse%M;
      for(let i=0;i<size;i++)if(i!==col){const factor=matrix[i]![col]!;for(let j=col;j<=size;j++)matrix[i]![j]=mod(matrix[i]![j]!-factor*matrix[col]![j]!);}
    }
    for(const raw of arrays(n,k+1)){
      const known=raw.map(x=>x?x:-1),compatible=states.filter(a=>known.every((x,i)=>x===-1||x===a[i]!+1));
      const sum=compatible.reduce((s,a)=>{const j=lookup.get(a.join(','));return mod(s+(j===undefined?0n:matrix[j]![size]!));},0n);
      examples.push({args:[known,k],answer:Number(sum*pow(BigInt(compatible.length),M-2n)%M)});
    }
  }
  await verifyPort('5','finding-expected-value.py',examples);
});
test('ornament_bitsets_match_every_final_string_Hamming_distance',{timeout:60000},async()=>{
  const examples:ReferenceExample[]=[];
  for(let n=1;n<=6;n++)for(let m=1;m<=n;m++)for(const original of arrays(n,2).filter((_,i)=>i%Math.max(1,2**n/8)===0))for(const bits of arrays(m,2)){
    const pattern=bits.join(''),answer=Array(n-m+2).fill(-1),text=original.join('');
    for(const final of arrays(n,2)){const s=final.join('');let count=0;for(let at=0;at+m<=n;at++)if(s.slice(at,at+m)===pattern)count++;const cost=final.filter((x,i)=>x!==original[i]).length;answer[count]=answer[count]===-1?cost:Math.min(answer[count],cost);}
    examples.push({args:[text,pattern],answer});
  }
  await verifyPort('7','holiday-ornaments.py',examples);
});
test('centroid_path_sums_match_direct_BFS_paths',{timeout:60000},async()=>{
  const examples:ReferenceExample[]=[];
  for(let seed=1;seed<=400;seed++){
    const n=1+seed%10,happiness=Array.from({length:n},(_,i)=>(seed+i*13)%9),edges:number[][]=[];let state=seed;
    const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
    for(let i=1;i<n;i++)edges.push([rand()%i,i,rand()%2]);
    const graph=Array.from({length:n},()=>[] as [number,number][]);for(const [u,v,c] of edges){graph[u!]!.push([v!,c!]);graph[v!]!.push([u!,c!]);}
    for(const k of [0,1,n-1]){let answer=0;for(let u=0;u<n;u++){
      const queue:[number,number,number,number,number][]=[[u,-1,-1,0,happiness[u]!]];
      for(const [x,parent,color,turns,sum] of queue){if(x>=u&&turns<=k)answer+=sum;for(const [y,c] of graph[x]!)if(y!==parent)queue.push([y,x,c,turns+Number(color!==-1&&color!==c),sum+happiness[y]!]);}
    }examples.push({args:[happiness,k,edges],answer});}
  }
  await verifyPort('4','city-park-tour.py',examples);
});
test('robot_event_blocks_match_literal_second_by_second_survival_rewards',{timeout:60000},async()=>{
  const examples:ReferenceExample[]=[],inv100=pow(100n,M-2n),gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
  for(let n=2;n<=5;n++)for(let m=2;m<=5;m++)for(let rb=1;rb<=n;rb++)for(let cb=1;cb<=m;cb++)for(let rd=1;rd<=n;rd++)for(let cd=1;cd<=m;cd++)for(const p of [1,99]){
    const period=2*(n-1)*(m-1)/gcd(n-1,m-1),q=mod(1n-BigInt(p)*inv100);let row=rb,column=cb,dr=1,dc=1,survival=1n,reward=0n;
    for(let t=0;t<period;t++){if(row===rd||column===cd)survival=survival*q%M;reward=(reward+survival)%M;if(row+dr<1||row+dr>n)dr=-dr;if(column+dc<1||column+dc>m)dc=-dc;row+=dr;column+=dc;}
    examples.push({args:[n,m,rb,cb,rd,cd,p],answer:Number(reward*pow(mod(1n-survival),M-2n)%M)});
  }
  await verifyPort('163','robot-cleaner-events.py',examples);
});

import test from 'node:test';
import {verifyPlainPort,type ReferenceSample} from '../support/plain-reference.ts';
const MOD=998244353n,pow=(base:bigint,exponent:bigint)=>{let answer=1n;for(;exponent;exponent>>=1n,base=base*base%MOD)if(exponent&1n)answer=answer*base%MOD;return answer;};
const arrays=(n:number,k:number):number[][]=>n?arrays(n-1,k).flatMap(a=>Array.from({length:k},(_,x)=>[...a,x])):[[]];
test('alternating_bit_DP_matches_literal_adjacent_equal_pair_flip_BFS',{timeout:60000},async()=>{
  const samples:ReferenceSample[]=[];
  for(let n=2;n<=7;n++){
    const size=2**n,distance=Array.from({length:size},()=>Array(size).fill(-1));
    for(let start=0;start<size;start++){distance[start]![start]=0;const queue=[start];for(const at of queue)for(let bit=0;bit<n-1;bit++)if(((at>>bit)&1)===((at>>(bit+1))&1)){const to=at^(3<<bit);if(distance[start]![to]===-1){distance[start]![to]=distance[start]![at]!+1;queue.push(to);}}}
    const bits=(x:number)=>x.toString(2).padStart(n,'0');
    const add=(a:string,b:string)=>{let total=0;for(let x=0;x<size;x++)if([...a].every((c,i)=>c==='?'||c===bits(x)[i]))for(let y=0;y<size;y++)if([...b].every((c,i)=>c==='?'||c===bits(y)[i]))total+=Math.max(0,distance[x]![y]!);samples.push({stdin:`1\n${n}\n${a}\n${b}\n`,expected:String(total)});};
    if(n<=4)for(let a=0;a<size;a++)for(let b=0;b<size;b++)add(bits(a),bits(b));
    for(let seed=1;seed<=25;seed++){const a=Array.from({length:n},(_,i)=>'01?'[(seed+i*7)%3]).join(''),b=Array.from({length:n},(_,i)=>'01?'[(seed*11+i*5)%3]).join('');add(a,b);}
  }
  await verifyPlainPort('124','legondary-grandmaster.py',samples);
});
test('sqrt_XOR_avoidance_matches_all_sequences_and_independent_rank_DP',{timeout:90000},async()=>{
  const samples:ReferenceSample[]=[];
  for(let n=1;n<=4;n++)for(let k=0;k<=3;k++){
    const count=Array(2**k).fill(0);for(const sequence of arrays(n,2**k)){const reached=new Set<number>();for(let mask=1;mask<2**n;mask++)reached.add(sequence.filter((_,i)=>mask&(1<<i)).reduce((x,y)=>x^y,0));for(let x=0;x<count.length;x++)if(!reached.has(x))count[x]++;}
    for(let x=0;x<count.length;x++)samples.push({stdin:`1\n${n} ${k} ${x}\n`,expected:String(count[x])});
  }
  const rankOracle=(n:number,k:number)=>{let dp=Array<bigint>(Math.min(n,k)+1).fill(0n);dp[0]=1n;const total=pow(2n,BigInt(k)),powers=Array.from({length:dp.length+1},(_,r)=>pow(2n,BigInt(r)));
    for(let i=0;i<n;i++){const next=Array<bigint>(dp.length).fill(0n);for(let r=0;r<dp.length;r++)if(dp[r]){next[r]=(next[r]!+dp[r]!*powers[r]!)%MOD;if(r+1<dp.length&&r+1<k)next[r+1]=(next[r+1]!+dp[r]!*((total-powers[r+1]!+MOD)%MOD))%MOD;}dp=next;}return dp.reduce((a,b)=>(a+b)%MOD,0n);
  };
  for(const [n,k] of [[300,500],[500,300],[300,300],[511,280],[280,511],[100,400],[400,100],[500,501],[312,401],[401,312]])samples.push({stdin:`1\n${n} ${k} 1\n`,expected:String(rankOracle(n!,k!))});
  for(const [n,k] of [[300,500],[500,500],[500,300],[257,300]]){let value=1n,power=1n,total=pow(2n,BigInt(k!));for(let i=0;i<n!;i++){value=value*((total-power+MOD)%MOD)%MOD;power=power*2n%MOD;}if(n!>k!)value=0n;samples.push({stdin:`1\n${n} ${k} 0\n`,expected:String(value)});}
  await verifyPlainPort('86','october-2017.py',samples);
});
function parityXor(indices:number[],constant:bigint):bigint{
  const max=indices.reduce((a,b)=>a+b,0),dp=Array.from({length:indices.length+1},()=>new Uint8Array(max+1));dp[0]![0]=1;
  let count=0;for(const weight of indices){count++;for(let k=count;k>=1;k--)for(let sum=max;sum>=weight;sum--)dp[k]![sum]=dp[k]![sum]!^dp[k-1]![sum-weight]!;}
  let result=0n;for(let k=1;k<dp.length;k++)for(let sum=0;sum<=max;sum++)if(dp[k]![sum])result^=constant*BigInt(k)*BigInt(sum);return result;
}
test('packed_subsequence_union_matches_literal_sets_and_large_subset_parity',{timeout:90000},async()=>{
  const samples:ReferenceSample[]=[],vocabulary=['a','b','c','aa','ab','ac','bb','bc','aab','abc','abbc'];
  const subsequences=(text:string)=>{const out=new Set<string>();for(let mask=0;mask<2**text.length;mask++)out.add([...text].filter((_,i)=>mask&(1<<i)).join(''));return out;};
  for(let seed=1;seed<=120;seed++){
    const n=1+seed%6,texts=Array.from({length:n},(_,i)=>vocabulary[(seed*7+i*13)%vocabulary.length]!),sets=texts.map(subsequences);let answer=0n;
    for(let mask=1;mask<2**n;mask++){const selected=sets.flatMap((s,i)=>mask&(1<<i)?[s]:[]),union=new Set(selected.flatMap(s=>[...s])),sum=texts.reduce((v,_,i)=>v+(mask&(1<<i)?i+1:0),0);answer^=BigInt(union.size)*BigInt(selected.length)*BigInt(sum);}
    samples.push({stdin:n+'\n'+texts.join('\n')+'\n',expected:String(answer)});
  }
  const all=Array.from({length:21},(_,i)=>i+1),first=all.slice(0,10);
  for(const [texts,answer] of [[Array(21).fill('a'),parityXor(all,2n)],[Array(21).fill('aa'),parityXor(all,3n)],[Array(10).fill('a').concat(Array(11).fill('aa')),parityXor(all,3n)^parityXor(first,3n)^parityXor(first,2n)]] as [string[],bigint][])samples.push({stdin:'21\n'+texts.join('\n')+'\n',expected:String(answer)});
  const alphabet='abcdefghijklmnopqrstuvwxyz',long=[...alphabet].map(c=>c.repeat(3)).join(''),medium=[...alphabet].map(c=>c.repeat(2)).join(''),mixed=[...alphabet].map((c,i)=>c.repeat(i<13?5:1)).join(''),texts=[long,medium,mixed];let answer=0n;
  const frequencies=texts.map(s=>[...alphabet].map(c=>[...s].filter(x=>x===c).length));
  for(let mask=1;mask<8;mask++){
    let union=0n;for(let subset=mask;subset;subset=(subset-1)&mask){const ids=[0,1,2].filter(i=>subset&(1<<i));let common=1n;for(let c=0;c<26;c++)common=common*BigInt(1+Math.min(...ids.map(i=>frequencies[i]![c]!)))%MOD;union+=(ids.length%2?1n:-1n)*common;}
    const selected=[0,1,2].filter(i=>mask&(1<<i));union=(union%MOD+MOD)%MOD;answer^=union*BigInt(selected.length)*BigInt(selected.reduce((s,i)=>s+i+1,0));
  }
  samples.push({stdin:'3\n'+texts.join('\n')+'\n',expected:String(answer)});
  await verifyPlainPort('153','subsequences-galore.py',samples);
});

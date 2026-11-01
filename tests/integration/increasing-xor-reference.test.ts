import test from 'node:test';
import {verifyPort,type ReferenceExample} from '../support/ported-reference.ts';
test('Fenwick_XOR_permutation_matches_literal_all_subsequences',{timeout:60000},async()=>{
  const examples:ReferenceExample[]=[];
  const add=(a:number[])=>{const values=new Set([0]);for(let mask=1;mask<2**a.length;mask++){
    const selected=a.filter((_,i)=>mask&(1<<i));if(selected.some((x,i)=>i>0&&x<=selected[i-1]!))continue;values.add(selected.reduce((x,y)=>x^y,0));
  }examples.push({args:[a],answer:[...values].sort((a,b)=>a-b)});};
  const enumerate=(a:number[],n:number)=>{if(a.length===n){add(a);return;}for(let x=0;x<6;x++)enumerate([...a,x],n);};
  for(let n=1;n<=4;n++)enumerate([],n);
  add([4,7,3,5]);add(Array.from({length:12},(_,i)=>2**i));
  for(let seed=1;seed<=100;seed++){let state=seed;const a=Array.from({length:12},()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%5001;});add(a);}
  await verifyPort('34','increasing-xor-bitsets.py',examples);
});

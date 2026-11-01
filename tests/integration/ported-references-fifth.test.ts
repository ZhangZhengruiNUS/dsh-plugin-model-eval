import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPort,type ReferenceExample} from '../support/ported-reference.ts';
test('restaurant_endpoint_formula_matches_literal_card_removal_game',{timeout:60000},async()=>{
  const examples:ReferenceExample[]=[];
  for(let n=2;n<=8;n++)for(let alice=0;alice<n;alice++)for(let bob=0;bob<n;bob++)for(const da of [-1,1])for(const db of [-1,1]){
    let cards=Array.from({length:n},(_,i)=>i),positions=[alice,bob],directions=[da,db],marked=new Set<number>(),turn=0;
    if(alice===bob)marked.add(alice);
    while(cards.length>1){assert.ok(turn<10000,'literal game terminates');const player=turn%2,at=cards.indexOf(positions[player]!);let d=directions[player]!;if(at+d<0||at+d>=cards.length)d=-d;directions[player]=d;positions[player]=cards[at+d]!;if(positions[0]===positions[1])marked.add(positions[0]!);cards=cards.filter(card=>!marked.has(card)||positions.includes(card));turn++;}
    examples.push({args:[n,alice,bob,da===1?'right':'left',db===1?'right':'left'],answer:cards[0]!});
  }
  await verifyPort('66','restaurant-game.py',examples);
});
test('bubble_cross_scan_matches_independent_exact_rational_angle_sort',{timeout:60000},async()=>{
  const examples:ReferenceExample[]=[];
  for(let seed=1;seed<=200;seed++){
    let state=seed;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
    const n=2+seed%6,points:number[][]=[],seen=new Set<string>();while(points.length<n){const p=[rand()%21-10,rand()%21-10],key=p.join(',');if(!seen.has(key)){seen.add(key);points.push(p);}}
    const queries:number[][]=[],answer:number[]=[];
    for(let di=0;di<10;di++){
      const initial=[di-4,(di*7+seed)%13-6];if(initial[0]===0&&initial[1]===0)continue;
      let [dx,dy]=initial.map(BigInt) as [bigint,bigint];
      const supports=points.map(([x,y],i)=>({i,v:dx*BigInt(y!)-dy*BigInt(x!)})).sort((a,b)=>a.v<b.v?-1:a.v>b.v?1:0);
      if(supports[0]!.v===supports[1]!.v)continue;
      let current=supports[0]!.i;const removed=new Set([current]);queries.push([...initial,1]);answer.push(current+1);
      for(let k=2;k<=n;k++){
        const candidates=points.flatMap(([x,y],i)=>{
          if(removed.has(i))return [];
          let u=dx*BigInt(x!-points[current]![0]!)+dy*BigInt(y!-points[current]![1]!),v=dx*BigInt(y!-points[current]![1]!)-dy*BigInt(x!-points[current]![0]!);
          if(v<0n||(v===0n&&u<0n)){u=-u;v=-v;}
          return [{i,group:u>0n?0:u===0n?1:2,num:u>0n?v:u===0n?0n:-u,den:u>0n?u:u===0n?1n:v}];
        });
        const compare=(a:typeof candidates[number],b:typeof candidates[number])=>a.group-b.group||Number(a.num*b.den>b.num*a.den)-Number(a.num*b.den<b.num*a.den);
        candidates.sort(compare);if(candidates.length>1&&compare(candidates[0]!,candidates[1]!)===0)break;
        const next=candidates[0]!.i;dx=BigInt(points[next]![0]!-points[current]![0]!);dy=BigInt(points[next]![1]!-points[current]![1]!);current=next;removed.add(next);queries.push([...initial,k]);answer.push(current+1);
      }
    }
    if(queries.length)examples.push({args:[points,queries],answer});
  }
  await verifyPort('68','bubble-popping.py',examples);
});
test('two_array_updates_match_literal_fibonacci_table',{timeout:60000},async()=>{
  const examples:ReferenceExample[]=[],fib=[0,1];for(let i=2;i<=100;i++)fib.push((fib[i-1]!+fib[i-2]!)%1000000007);
  for(let seed=1;seed<=400;seed++){
    const n=1+seed%7,initial=[Array(n).fill(5),Array(n).fill(3)],a=initial.map(row=>[...row]),operations:number[][]=[],answer:number[]=[];
    for(let i=0;i<24;i++){
      const kind=1+(i+seed)%4,left=(i*7+seed)%n,right=left+(i+seed)%(n-left),which=(seed+i)%2;
      if(kind===4){operations.push([4,left+1,right+1]);answer.push(a[0]!.slice(left,right+1).reduce((s,x,j)=>(s+fib[x+a[1]![left+j]!]!)%1000000007,0));}
      else{const value=kind===3?-Math.min(2,...a[which]!.slice(left,right+1)):(seed+i)%11;operations.push([kind,which+1,left+1,right+1,value]);for(let j=left;j<=right;j++)a[which]![j]=kind===1?Math.min(a[which]![j]!,value):kind===2?Math.max(a[which]![j]!,value):a[which]![j]!+value;}
    }
    examples.push({args:[initial,operations],answer});
  }
  await verifyPort('69','two-arrays-fibonacci.py',examples);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPlainPort,type ReferenceSample} from '../support/plain-reference.ts';
test('railway_new_edges_match_global_path_pair_enumeration',{timeout:60000},async()=>{
  const samples:ReferenceSample[]=[];
  for(let seed=1;seed<=70;seed++){
    const n=2+seed%3,edges:number[][]=[],present=new Set<string>();
    const add=(u:number,v:number,w:number)=>{const key=[u,v].sort().join(',');if(!present.has(key)){present.add(key);edges.push([u,v,w]);}};
    for(let i=1;i<n;i++)add((i*13+seed)%i,i,1+(i+seed)%4);
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if((i+j+seed)%2===0)add(i,j,1+(i*7+j+seed)%5);
    const dist=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?0:Infinity));for(const [u,v,w] of edges)dist[u!]![v!]=dist[v!]![u!]=w!;
    for(let k=0;k<n;k++)for(let i=0;i<n;i++)for(let j=0;j<n;j++)dist[i]![j]=Math.min(dist[i]![j]!,dist[i]![k]!+dist[k]![j]!);
    const d=dist[0]!,base:number[][]=[],candidate:number[][]=[];
    for(const [u,v,w] of edges){if(d[u!]! + w! === d[v!])base.push([u!,v!]);if(d[v!]! + w! === d[u!])base.push([v!,u!]);}
    for(let u=0;u<n;u++)for(let v=0;v<n;v++)if(d[u]!<d[v]!)candidate.push([u,v]);
    const feasible:number[]=[];
    for(let mask=0;mask<2**candidate.length;mask++){
      const all=base.concat(candidate.filter((_,i)=>mask&(1<<i))),graph=Array.from({length:n},()=>[] as number[]);all.forEach(([u,v])=>graph[u!]!.push(v!));
      let valid=true;
      for(let target=1;target<n;target++){
        const paths:number[][]=[];const visit=(x:number,path:number[])=>{if(x===target){paths.push(path);return;}for(const next of graph[x]!)visit(next,[...path,next]);};visit(0,[0]);
        const internals=paths.map(p=>new Set(p.slice(1,-1)));if(!internals.some((a,i)=>internals.some((b,j)=>j>i&&![...a].some(v=>b.has(v))))){valid=false;break;}
      }
      if(valid)feasible.push(mask);
    }
    assert.ok(feasible.length>0);
    const original=Array.from({length:n},(_,i)=>1+(seed+i*11)%7),cost=[...original],updates=[[seed%n,2],[(seed+1)%n,3]],answers:number[]=[];
    const answer=()=>Math.min(...feasible.map(mask=>candidate.reduce((sum,[u],i)=>sum+(mask&(1<<i)?cost[u!]!:0),0)));
    answers.push(answer());for(const [u,increase] of updates){cost[u!]=cost[u!]!+increase!;answers.push(answer());}
    samples.push({stdin:`${n} ${edges.length} ${updates.length}\n${original.join(' ')}\n${edges.map(([u,v,w])=>`${u!+1} ${v!+1} ${w}`).join('\n')}\n${updates.map(([u,v])=>`${u!+1} ${v}`).join('\n')}\n`,expected:answers.join('\n')});
  }
  await verifyPlainPort('24','railway-construction.py',samples);
});
test('tree_deletion_queries_match_every_surviving_ancestor_reparenting',{timeout:60000},async()=>{
  const samples:ReferenceSample[]=[];
  for(let seed=1;seed<=80;seed++){
    const n=1+seed%8,parent=[-1],edges:string[]=[];for(let i=1;i<n;i++){parent[i]=(seed*7+i*11)%i;edges.push(`${parent[i]!+1} ${i+1}`);}
    const queries:number[][]=[],answers:number[]=[];
    for(let vertex=0;vertex<n;vertex++)for(const penalty of [0,1,2,200000]){
      let best=-Infinity;
      for(let deleted=0;deleted<2**n;deleted++)if(!(deleted&1)&&!(deleted&(1<<vertex))){
        let children=0;for(let x=1;x<n;x++)if(!(deleted&(1<<x))){let p=parent[x]!;while(deleted&(1<<p))p=parent[p]!;if(p===vertex)children++;}
        best=Math.max(best,children-penalty*deleted.toString(2).replaceAll('0','').length);
      }
      queries.push([vertex+1,penalty]);answers.push(best);
    }
    samples.push({stdin:n+'\n'+(edges.length?edges.join('\n')+'\n':'')+queries.length+'\n'+queries.map(q=>q.join(' ')).join('\n')+'\n',expected:answers.join('\n')});
  }
  await verifyPlainPort('97','tree-queries.py',samples);
});
test('tour_reimbursement_matches_independent_Floyd_semirings',{timeout:60000},async()=>{
  const samples:ReferenceSample[]=[];
  for(let seed=1;seed<=100;seed++){
    const n=2+seed%7,joy=Array.from({length:n},(_,i)=>1+(seed+i*7)%5),edges:number[][]=[];
    const capacity=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?Infinity:0)),toll=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?0:Infinity));
    for(let i=1;i<n;i++){const u=(seed+i*13)%i,c=1+(seed+i)%5,t=1+(seed*11+i)%9;edges.push([u+1,i+1,c,t]);capacity[u]![i]=capacity[i]![u]=c;toll[u]![i]=toll[i]![u]=t;}
    for(let k=0;k<n;k++)for(let i=0;i<n;i++)for(let j=0;j<n;j++){capacity[i]![j]=Math.max(capacity[i]![j]!,Math.min(capacity[i]![k]!,capacity[k]![j]!));toll[i]![j]=Math.min(toll[i]![j]!,Math.max(toll[i]![k]!,toll[k]![j]!));}
    const queries:number[][]=[],answers:string[]=[];
    for(let start=0;start<n;start++)for(const vehicles of [1,3,6]){const reachable=joy.flatMap((_,i)=>capacity[start]![i]!>=vehicles?[i]:[]),best=Math.max(...reachable.map(i=>joy[i]!)),paid=Math.max(...reachable.filter(i=>joy[i]===best).map(i=>toll[start]![i]!));queries.push([vehicles,start+1]);answers.push(best+' '+paid);}
    samples.push({stdin:`${n} ${queries.length}\n${joy.join(' ')}\n${edges.map(e=>e.join(' ')).join('\n')}\n${queries.map(q=>q.join(' ')).join('\n')}\n`,expected:answers.join('\n')});
  }
  await verifyPlainPort('43','omkar-tours.py',samples);
});
test('time_travel_frontier_matches_literal_chronological_undo',{timeout:60000},async()=>{
  const samples:ReferenceSample[]=[];
  const add=(tasks:number[][],selected:number)=>{
    const n=tasks.length;let done=0,time=0,travels=0,events=0;
    while((done&selected)!==selected){assert.ok(events++<20000);let next=-1,when=Infinity;tasks.forEach(([,b],i)=>{if(b!>time&&b!<when){when=b!;next=i;}});assert.ok(next>=0);time=when;if(done&(1<<next))continue;travels++;const to=tasks[next]![0]!;tasks.forEach(([a],i)=>{if(a!>to)done&=~(1<<i);});done|=1<<next;time=to;}
    const ids=tasks.flatMap((_,i)=>selected&(1<<i)?[i+1]:[]);
    samples.push({stdin:n+'\n'+tasks.map(t=>t.join(' ')).join('\n')+'\n'+ids.length+'\n'+ids.join(' ')+'\n',expected:String(travels)});
  };
  const matchings=(remaining:number[],tasks:number[][])=>{if(!remaining.length){for(let mask=1;mask<2**tasks.length;mask++)add(tasks,mask);return;}const a=remaining[0]!;for(let i=1;i<remaining.length;i++)matchings(remaining.filter((_,j)=>j!==0&&j!==i),[...tasks,[a,remaining[i]!]]);};
  for(let n=1;n<=3;n++)matchings(Array.from({length:2*n},(_,i)=>i+1),[]);
  for(let seed=1;seed<=100;seed++){const n=4+seed%5,times=Array.from({length:2*n},(_,i)=>i+1);let state=seed;for(let i=times.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[times[i],times[j]]=[times[j]!,times[i]!];}const tasks=Array.from({length:n},(_,i)=>[times[2*i]!,times[2*i+1]!].sort((a,b)=>a-b));for(const mask of [1,2**n-1,1+(seed%(2**n-1))])add(tasks,mask);}
  await verifyPlainPort('42','time-travel.py',samples);
});

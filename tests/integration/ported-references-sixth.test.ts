import test from 'node:test';
import {verifyPort,type ReferenceExample} from '../support/ported-reference.ts';
test('mars_connectivity_matches_explicit_city_order_enumeration',{timeout:60000},async()=>{
  const examples:ReferenceExample[]=[],P=1000000007;
  const enumerate=(prefix:number[],n:number)=>{if(prefix.length<n){for(const x of [0,1,2,P-1])enumerate([...prefix,x],n);return;}
    const unique=[...new Set(prefix)],queries:number[][]=[],answers:string[]=[];
    for(const d of [0,1,2,3,P-1]){
      const visit=(order:number[],remaining:number[]):boolean=>!remaining.length||remaining.some((x,i)=>{const last=order.at(-1),delta=last===undefined?0:(x-last+P)%P;return (last===undefined||delta===d||delta===(P-d)%P)&&visit([...order,x],remaining.filter((_,j)=>j!==i));});
      queries.push([1,n,d]);answers.push(visit([],unique)?'Yes':'No');
    }examples.push({args:[prefix,queries],answer:answers.join(' '),display:'space-list'});
  };
  for(let n=1;n<=4;n++)enumerate([],n);
  await verifyPort('70','mars-connectivity.py',examples);
});
function cactus(n:number,edges:number[][]):boolean{
  const graph=Array.from({length:n},()=>[] as [number,number][]);edges.forEach(([u,v],i)=>{graph[u!-1]!.push([v!-1,i]);graph[v!-1]!.push([u!-1,i]);});
  const cycles=new Set<string>();
  for(let root=0;root<n;root++){
    const visit=(x:number,vertices:Set<number>,used:number[])=>{for(const [y,id] of graph[x]!)if(!used.includes(id)){
      if(y===root&&used.length>=1)cycles.add([...used,id].sort((a,b)=>a-b).join(','));
      else if(!vertices.has(y))visit(y,new Set([...vertices,y]),[...used,id]);
    }};visit(root,new Set([root]),[]);
  }
  const memberships=Array(edges.length).fill(0);for(const cycle of cycles)for(const id of cycle.split(',').map(Number))if(++memberships[id]>1)return false;return true;
}
test('link_cut_cactus_window_matches_enumeration_of_every_simple_cycle',{timeout:60000},async()=>{
  const examples:ReferenceExample[]=[];
  const add=(n:number,edges:number[][])=>{let answer=0;for(let l=0;l<edges.length;l++)for(let r=l+1;r<=edges.length;r++)if(cactus(n,edges.slice(l,r)))answer++;examples.push({args:[n,edges],answer});};
  add(2,[[1,2],[1,2],[1,2]]);add(5,[[1,2],[2,3],[3,1],[1,4],[4,5],[5,1]]);
  for(let seed=1;seed<=400;seed++){
    const n=2+seed%4,m=1+seed%8,edges:number[][]=[];let state=seed;
    const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
    for(let i=0;i<m;i++){const u=1+rand()%n;let v=1+rand()%(n-1);if(v>=u)v++;edges.push([u,v]);}add(n,edges);
  }
  await verifyPort('73','desert-cactus.py',examples);
});

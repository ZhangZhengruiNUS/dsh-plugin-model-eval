import test from 'node:test';
import {verifyPlainPort,type ReferenceSample} from '../support/plain-reference.ts';
const arrays=(n:number,k:number):number[][]=>n?arrays(n-1,k).flatMap(a=>Array.from({length:k},(_,x)=>[...a,x])):[[]];
test('ticket_prefix_reference_matches_explicit_purchase_day_choices',{timeout:60000},async()=>{
  const samples:ReferenceSample[]=[];
  for(let seed=1;seed<=120;seed++){
    const n=1+seed%7,k=1+seed%n,prices=Array.from({length:n},(_,i)=>1+(seed*7+i*13)%9),queries=[[1,n],[n,n],[1,1]],answers:number[]=[];
    for(const [l,r] of queries){const deadlines=Array.from({length:Math.ceil((r!-l!+1)/k)},(_,i)=>l!-1+i*k);let best=Infinity;
      const visit=(i:number,cost:number)=>{if(i===deadlines.length){best=Math.min(best,cost);return;}for(let day=l!-1;day<=deadlines[i]!;day++)visit(i+1,cost+prices[day]!);};visit(0,0);answers.push(best);
    }
    samples.push({stdin:`${n} 3 ${k}\n${prices.join(' ')}\n${queries.map(q=>q.join(' ')).join('\n')}\n`,expected:answers.join('\n')});
  }
  await verifyPlainPort('82','phys-ed-online.py',samples);
});
test('partition_reference_matches_every_cut_combination_by_gcd_definition',{timeout:60000},async()=>{
  const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a,samples:ReferenceSample[]=[];
  for(let n=1;n<=11;n++)for(let k=1;k<=n;k++){
    let best=Infinity;
    for(let mask=0;mask<2**(n-1);mask++)if(mask.toString(2).replaceAll('0','').length===k-1){
      const ends=Array.from({length:n-1},(_,i)=>i+1).filter(i=>mask&(1<<(i-1))).concat(n);let left=1,cost=0;
      for(const right of ends){for(let a=left;a<=right;a++)for(let b=a;b<=right;b++)if(gcd(a,b)>=left)cost++;left=right+1;}best=Math.min(best,cost);
    }
    samples.push({stdin:`1\n${n} ${k}\n`,expected:String(best)});
  }
  await verifyPlainPort('84','artistic-partition.py',samples);
});
test('perfect_sequence_DP_matches_literal_subsets_of_all_small_multisets',{timeout:60000},async()=>{
  const samples:ReferenceSample[]=[],factorial=[1];for(let i=1;i<=8;i++)factorial.push(factorial[i-1]!*i);
  for(let n=1;n<=8;n++){
    let total=0;
    const visit=(counts:number[],remaining:number)=>{
      if(counts.length<n){for(let c=0;c<=remaining;c++)visit([...counts,c],remaining-c);return;}
      counts=[...counts,remaining];const values=counts.flatMap((c,i)=>Array(c).fill(i+1));
      for(let mask=1;mask<2**n;mask++){let min=Infinity,max=0,sum=0;for(let i=0;i<n;i++)if(mask&(1<<i)){min=Math.min(min,values[i]!);max=Math.max(max,values[i]!);sum+=values[i]!;}if(min*max<sum)return;}
      total+=factorial[n]!/counts.reduce((p,c)=>p*factorial[c]!,1);
    };visit([],n);
    for(const modulus of [100000007,998244353])samples.push({stdin:`${n} ${modulus}\n`,expected:String(total%modulus)});
  }
  await verifyPlainPort('85','perfect-problem.py',samples);
});
test('colored_rectangles_match_literal_unit_cell_set_intersections',{timeout:60000},async()=>{
  const samples:ReferenceSample[]=[];
  const combinations=(a:number[][],k:number,start=0,prefix:number[][]=[]):number[][][]=>prefix.length===k?[prefix]:a.flatMap((p,i)=>i<start?[]:combinations(a,k,i+1,[...prefix,p]));
  for(let seed=1;seed<=100;seed++){
    const count=1+seed%3,groups:number[][][]=[[],[],[]],seen=new Set<string>();let state=seed;
    const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
    for(let color=0;color<3;color++)while(groups[color]!.length<count){const p=[rand()%5-2,rand()%5-2];if(!seen.has(p.join(','))){seen.add(p.join(','));groups[color]!.push(p);}}
    let best=0;
    for(let k=1;k<=count;k++){
      const boxes=groups.map(group=>combinations(group,k).map(points=>{const cells=new Set<string>();for(let x=Math.min(...points.map(p=>p[0]!));x<=Math.max(...points.map(p=>p[0]!));x++)for(let y=Math.min(...points.map(p=>p[1]!));y<=Math.max(...points.map(p=>p[1]!));y++)cells.add(x+','+y);return cells;}));
      const disjoint=(a:Set<string>,b:Set<string>)=>![...a].some(x=>b.has(x));
      if(boxes[0]!.some(a=>boxes[1]!.some(b=>disjoint(a,b)&&boxes[2]!.some(c=>disjoint(a,c)&&disjoint(b,c)))))best=3*k;
    }
    samples.push({stdin:3*count+'\n'+groups.flatMap((g,i)=>g.map(p=>p.join(' ')+' '+(i+1))).join('\n')+'\n',expected:String(best)});
  }
  await verifyPlainPort('110','cells-on-paper.py',samples);
});
test('tree_word_matching_agrees_with_root_LCA_and_literal_overlapping_slices',{timeout:60000},async()=>{
  const samples:ReferenceSample[]=[];
  for(let seed=1;seed<=100;seed++){
    const n=2+seed%7,parent=[-1],labels=[''],edges:string[]=[];
    for(let i=1;i<n;i++){parent[i]=(seed*13+i*7)%i;labels[i]='abc'[(seed+i)%3]!;edges.push(`${parent[i]!+1} ${i+1} ${labels[i]}`);}
    const texts=['aaa','aaaa','ababa','abcabc','ccab'],queries:number[][]=[],answers:number[]=[];
    for(let u=0;u<n;u++)for(let v=0;v<n;v++)if(u!==v){
      const ancestors=new Set<number>();for(let x=u;x>=0;x=parent[x]!)ancestors.add(x);let lca=v;while(!ancestors.has(lca))lca=parent[lca]!;
      let pattern='',tail='';for(let x=u;x!==lca;x=parent[x]!)pattern+=labels[x];for(let x=v;x!==lca;x=parent[x]!)tail=labels[x]+tail;pattern+=tail;
      let count=0;for(const text of texts)for(let i=0;i+pattern.length<=text.length;i++)if(text.slice(i,i+pattern.length)===pattern)count++;
      queries.push([u+1,v+1,1,texts.length]);answers.push(count);
    }
    samples.push({stdin:`${n} ${texts.length} ${queries.length}\n${edges.join('\n')}\n${texts.join('\n')}\n${queries.map(q=>q.join(' ')).join('\n')}\n`,expected:answers.join('\n')});
  }
  await verifyPlainPort('112','alphabetic-tree.py',samples);
});
test('tree_coloring_IE_matches_actual_color_permutations',{timeout:60000},async()=>{
  const samples:ReferenceSample[]=[];
  for(let seed=1;seed<=40;seed++){
    const n=2+seed%7,parent=[-1],edges:string[]=[];for(let i=1;i<n;i++){parent[i]=(seed*17+i*13)%i;edges.push(`${parent[i]!+1} ${i+1}`);}let total=0;
    const visit=(colors:number[],remaining:number[])=>{if(remaining.length){for(let i=0;i<remaining.length;i++)visit([...colors,remaining[i]!],remaining.filter((_,j)=>j!==i));return;}if(parent.every((p,i)=>i===0||colors[i]!==colors[p]!-1))total++;};visit([],Array.from({length:n},(_,i)=>i+1));
    samples.push({stdin:n+'\n'+edges.join('\n')+'\n',expected:String(total)});
  }
  await verifyPlainPort('118','tree-coloring.py',samples);
});
test('grouped_RBS_counts_match_every_string_order_and_irreversible_negative_prefix',{timeout:60000},async()=>{
  const samples:ReferenceSample[]=[],vocabulary=['(',')','()','(()','())','()())','))('];
  for(let seed=1;seed<=80;seed++){
    const n=1+seed%7,strings=Array.from({length:n},(_,i)=>vocabulary[(seed*11+i*3)%vocabulary.length]!),best={value:0};
    const visit=(s:string,remaining:number[])=>{if(remaining.length){const seen=new Set<string>();for(const i of remaining)if(!seen.has(strings[i]!)){seen.add(strings[i]!);visit(s+strings[i],remaining.filter(x=>x!==i));}return;}let balance=0,score=0;for(const ch of s){balance+=ch==='('?1:-1;if(balance<0)break;if(balance===0)score++;}best.value=Math.max(best.value,score);};visit('',strings.map((_,i)=>i));
    samples.push({stdin:n+'\n'+strings.join('\n')+'\n',expected:String(best.value)});
  }
  samples.push({stdin:'20\n'+Array(10).fill('(').concat(Array(10).fill(')')).join('\n')+'\n',expected:'10'});
  await verifyPlainPort('63','rbs-grouped.py',samples);
});
test('arena_winner_complement_matches_simultaneous_combat_enumeration',{timeout:60000},async()=>{
  const samples:ReferenceSample[]=[];
  for(let n=2;n<=6;n++)for(let health=1;health<=5;health++){
    let count=0;for(const raw of arrays(n,health)){let alive=raw.map(x=>x+1);while(alive.length>1){const damage=alive.length-1;alive=alive.map(x=>x-damage).filter(x=>x>0);}if(!alive.length)count++;}
    samples.push({stdin:`${n} ${health}\n`,expected:String(count)});
  }
  await verifyPlainPort('96','arena-winners.py',samples);
});

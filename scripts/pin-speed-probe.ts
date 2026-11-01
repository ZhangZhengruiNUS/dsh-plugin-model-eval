import {resolve} from 'node:path';import {writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import type {ProtocolSet,ResolvedProtocolSet} from '../src/contracts.ts';import {loadProtocolSet} from '../src/evaluation/protocols.ts';import {createProtocolRegistry} from '../src/evaluation/registry.ts';import {identityHash} from '../src/evaluation/protocol-identity.ts';
function select(p:ProtocolSet,order:string[],id:string,tier?:ResolvedProtocolSet){
  const selected=new Map<string,typeof p.items>();
  for(const dataset of order){
    const rows=p.items.filter(q=>q.datasetId===dataset).sort((a,b)=>JSON.stringify(a.prompt).length-JSON.stringify(b.prompt).length||a.id.localeCompare(b.id)),lo=Math.floor((rows.length-1)*.25),hi=Math.floor((rows.length-1)*.75),first=rows[lo]!;let second=rows[hi]!;
    if(dataset==='writing'){const category=(q:typeof first)=>(q.grading as {category?:string})?.category;if(category(second)===category(first))second=[...rows].map((q,i)=>({q,i})).sort((a,b)=>Math.abs(a.i-hi)-Math.abs(b.i-hi)||a.i-b.i).find(x=>x.q.id!==first.id&&category(x.q)!==category(first))?.q??second;}
    selected.set(dataset,[first,second]);
  }
  const items=[0,1].flatMap(i=>order.map(dataset=>selected.get(dataset)![i]!)).map(q=>({id:q.id,datasetId:q.datasetId,sourceHash:q.sourceHash,promptHash:createHash('sha256').update(JSON.stringify(q.prompt)).digest('hex'),...(tier?{questionHash:identityHash(q),compatibilityHash:identityHash(tier.compatibility[q.id])}:{})}));
  return {id,generalId:p.generalId,writingId:p.writingId,resourceVersion:p.resourceVersion,items};
}
const legacy=select(await loadProtocolSet(resolve('resources')),['tiny-mmlu','writing','tiny-gsm8k','ifeval','humaneval-plus'],'speed-probe-v1'),registry=await createProtocolRegistry(resolve('.')),tiers=[];
for(const descriptor of registry.list().filter(d=>d.general.tier!=='legacy')){const protocol=await registry.resolve(descriptor.refs);tiers.push(select(protocol,['mmlu-pro-selected','writing','olympiad-text-selected','ifeval','code-contests-selected'],`speed-probe-${descriptor.general.tier}-v1`,protocol));}
await writeFile('src/speed/probe-manifest.ts','/** Fixed public task selection; generated offline, never a scoring protocol. */\nexport const PROBE_MANIFEST='+JSON.stringify(legacy,null,2)+' as const;\nexport const TIER_PROBE_MANIFESTS='+JSON.stringify(tiers,null,2)+' as const;\n');
process.stdout.write(JSON.stringify({legacy:legacy.items.length,tiers:tiers.map(t=>({id:t.id,items:t.items.length}))})+'\n');

import {register} from 'tsx/esm/api';register();
import {writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {createProtocolRegistry} from '../src/evaluation/registry.ts';import {identityHash} from '../src/evaluation/protocol-identity.ts';
const registry=await createProtocolRegistry(process.cwd()),manifests=[];
for(const descriptor of registry.list().filter(d=>d.general.schema==='task-five-v1')){
 const p=await registry.resolve(descriptor.refs),datasets=['longbench-v2-selected','bfcl-v4-multi-turn-selected','code-contests-selected','mmlu-pro-selected','olympiad-text-selected','ifeval','writing'];
 const selected=datasets.map(id=>{const rows=p.items.filter(q=>q.datasetId===id);if(id==='longbench-v2-selected')rows.sort((a,b)=>a.prompt[0].content.length-b.prompt[0].content.length);return rows[id==='longbench-v2-selected'?Math.floor(rows.length/2):0];});
 if(selected.some(q=>!q))throw Error('PROBE_SOURCE_MISSING');
 manifests.push({id:'speed-task-five-v1-'+descriptor.general.tier,...descriptor.refs,items:selected.map(q=>({id:q.id,datasetId:q.datasetId,sourceHash:q.sourceHash,promptHash:createHash('sha256').update(JSON.stringify(q.prompt)).digest('hex'),questionHash:identityHash(q),compatibilityHash:identityHash(p.compatibility[q.id])}))});
}
await writeFile('src/speed/five-probe-manifest.ts','/** Fixed reviewed probes. Never shortens material or changes scoring questions. */\nexport const FIVE_PROBE_MANIFESTS='+JSON.stringify(manifests,null,2)+' as const;\n');

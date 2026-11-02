/** Append an unverified protocol without modifying historical definitions. */
import {register} from 'tsx/esm/api';register();
import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {identityHash} from '../src/evaluation/protocol-identity.ts';
const path='resources/protocol-registry.json',catalog=JSON.parse(await readFile(path,'utf8'));
if(process.argv.includes('--refresh-unverified')){
 if(catalog.entries.some(e=>e.refs.resourceVersion==='task-five-v1'&&e.allowNewRuns)||catalog.bundles.some(b=>b.id==='task-five-v1'&&b.runtimePassed))throw Error('CANNOT_REFRESH_ADMITTED_PROTOCOL');
 catalog.entries=catalog.entries.filter(e=>e.refs.resourceVersion!=='task-five-v1');catalog.bundles=catalog.bundles.filter(b=>b.id!=='task-five-v1');
}
const {selection,allowNewRuns,provenance,...bundle}=JSON.parse(await readFile('resources/suites/task-five-v1/bundle.json','utf8'));
if(catalog.bundles.some(b=>b.id===bundle.id)||catalog.entries.some(e=>e.refs.resourceVersion==='task-five-v1'))throw Error('ALREADY_REGISTERED');
catalog.bundles.push(bundle);
for(const tier of ['light','deep']){
 const ids=selection[tier];const definition={schema:'task-five-v1',tier,label:tier==='light'?'轻量 · 100题':'深入 · 350题',domains:['knowledge','reading','instructions','coding','tools'].map(id=>({id,weight:.2,itemIds:ids.filter(q=>id==='knowledge'?q.startsWith('knowledge/')||q.startsWith('math/'):q.startsWith(id+'/'))})),...(tier==='deep'?{parentGeneralId:'general-task-five-v1-light'}:{})};
 catalog.entries.push({refs:{...catalog.legacyRefs,generalId:'general-task-five-v1-'+tier,resourceVersion:'task-five-v1'},general:{...definition,definitionHash:identityHash(definition)},questionCount:ids.length,allowNewRuns:false,bundleId:bundle.id});
}
const bytes=JSON.stringify(catalog,null,2)+'\n';await writeFile(path,bytes);
await writeFile('src/resources/catalog-pin.ts',`/** Frozen catalog; new five-capability protocols stay disabled until runtime acceptance. */\nexport const RESOURCE_CATALOG_SHA256 = '${createHash('sha256').update(bytes).digest('hex')}';\n`);

import {resolve,join} from 'node:path';
import type {ProtocolRefs,Question} from '../contracts.ts';
import type {ProtocolDescriptor,ProtocolRegistry,ResolvedProtocolSet} from './tier-contracts.ts';
import {readProtocolCatalog,readCatalogFile,verifyBundle} from '../resources/catalog.ts';
import {loadProtocolSet} from './protocols.ts';
import {protocolKey,questionCompatibility} from './protocol-identity.ts';
import {RUNTIME_PINS} from '../runtime/pins.ts';
export async function createProtocolRegistry(packageRoot:string):Promise<ProtocolRegistry> {
  packageRoot=resolve(packageRoot);
  const catalog=await readProtocolCatalog(packageRoot);
  const descriptor=(entry:typeof catalog.entries[number]):ProtocolDescriptor=>{
    const {bundleId,...value}=entry;return structuredClone(value);
  };
  const registry:ProtocolRegistry={list:()=>catalog.entries.map(descriptor),async resolve(refs:ProtocolRefs):Promise<ResolvedProtocolSet>{
    // Recheck the pinned catalog on every resolution rather than trust a mutable file cache.
    await readProtocolCatalog(packageRoot);
    const entry=catalog.entries.find(e=>protocolKey(e.refs)===protocolKey(refs));if(!entry)throw Error('UNKNOWN_PROTOCOL');
    const legacy=await loadProtocolSet(join(packageRoot,'resources'));
    let items:readonly Question[],grading,runtime;
    if(entry.bundleId==='legacy'){
      if(protocolKey(refs)!==protocolKey(catalog.legacyRefs))throw Error('UNKNOWN_PROTOCOL');
      items=legacy.items;grading={version:legacy.generalId};runtime={pins:RUNTIME_PINS,wallMs:30000,memoryBytes:536870912,computeBudget:200000000000};
    }else{
      const bundle=catalog.bundles.find(b=>b.id===entry.bundleId)!;await verifyBundle(packageRoot,bundle);
      if(bundle.resourceVersion!==refs.resourceVersion||entry.allowNewRuns&&!bundle.runtimePassed)throw Error('PROTOCOL_NOT_VERIFIED');
      const all=JSON.parse((await readCatalogFile(join(packageRoot,'resources'),bundle.questionPath)).toString('utf8')) as Question[];
      const required=new Set(entry.general.domains.flatMap(d=>d.itemIds));
      if(!Array.isArray(all)||new Set(all.map(q=>q.id)).size!==all.length||all.some(q=>q.track!=='general'||!q.prompt?.length)||[...required].some(id=>!all.some(q=>q.id===id)))throw Error('PROTOCOL_QUESTION_MISMATCH');
      items=[...all.filter(q=>required.has(q.id)),...legacy.items.filter(q=>q.track==='writing')];grading=bundle.grading;runtime=bundle.runtime;
    }
    if(items.filter(q=>q.track==='general').length!==entry.questionCount||items.filter(q=>q.track==='writing').length!==12)throw Error('PROTOCOL_QUESTION_MISMATCH');
    return {...refs,items,descriptor:descriptor(entry),compatibility:Object.fromEntries(items.map(q=>[q.id,questionCompatibility(q,grading,runtime)]))};
  },async forNewRun(generalId){
    const entry=catalog.entries.find(e=>e.refs.generalId===generalId);if(!entry)throw Error('UNKNOWN_PROTOCOL');
    if(!entry.allowNewRuns)throw Error('PROTOCOL_NOT_VERIFIED');return registry.resolve(entry.refs);
  }};
  return registry;
}

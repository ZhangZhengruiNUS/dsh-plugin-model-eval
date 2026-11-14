import {access} from 'node:fs/promises';import {join} from 'node:path';
import type {ProtocolDescriptor} from '../evaluation/tier-contracts.ts';import type {ResourceManifest} from '../evaluation/protocols.ts';import type {PreparedEnvironment} from './prepare.ts';
import {readProtocolCatalog} from './catalog.ts';import {identityHash,protocolKey} from '../evaluation/protocol-identity.ts';import {RESOURCE_MANIFEST_SHA256} from './pins.ts';
import {previousWritingCache} from './legacy-writing-cache.ts';
interface RestoreOptions {root:string;packageRoot:string;manifest:ResourceManifest;descriptors:readonly ProtocolDescriptor[];prepare:(d:ProtocolDescriptor)=>Promise<PreparedEnvironment>;onPrepared:(d:ProtocolDescriptor,environment:PreparedEnvironment)=>void;onError:(d:ProtocolDescriptor,error:unknown)=>void;stopped?:()=>boolean}
/** Restore only materialized bundles; integrity and fixtures remain in prepare. */
export async function restorePreparedEnvironments(options:RestoreOptions):Promise<void>{
 const {root,packageRoot,manifest}=options,catalog=await readProtocolCatalog(packageRoot),checks=new Map<string,Promise<PreparedEnvironment>>();
 for(const descriptor of options.descriptors.filter(d=>d.allowNewRuns)){
  if(options.stopped?.())return;
  try{
   const entry=catalog.entries.find(e=>protocolKey(e.refs)===protocolKey(descriptor.refs)),bundle=catalog.bundles.find(b=>b.id===entry?.bundleId);
   const destination=descriptor.general.tier==='legacy'?join(root,'resources',manifest.resourceVersion+'-'+RESOURCE_MANIFEST_SHA256.slice(0,12)):bundle?join(root,'resources',bundle.id+'-'+identityHash(bundle).slice(0,12)):undefined;
   if(!destination||!entry)continue;
   const {bundleId,...expected}=entry;if(identityHash(expected)!==identityHash(descriptor))throw Error('DESCRIPTOR_MISMATCH');
   try{await access(join(destination,'.ready.json'));}
   catch(error){if(descriptor.general.tier!=='legacy'||(error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await access(join(previousWritingCache(root),'.ready.json'));}
   let check=checks.get(destination);if(!check){check=options.prepare(descriptor);checks.set(destination,check);}
   const candidate=await check;
   if(candidate.rootPath!==root||candidate.resourceVersion!==descriptor.refs.resourceVersion)throw Error('PREPARED_VERSION_MISMATCH');
   if(!options.stopped?.())options.onPrepared(descriptor,candidate);
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')options.onError(descriptor,error);}
 }
}

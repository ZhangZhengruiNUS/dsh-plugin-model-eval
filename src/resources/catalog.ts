import {lstat,readFile,realpath} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import type {ProtocolRefs} from '../contracts.ts';
import type {ProtocolBundle,ProtocolDescriptor} from '../evaluation/tier-contracts.ts';
import {identityHash,protocolKey} from '../evaluation/protocol-identity.ts';
import {RESOURCE_CATALOG_SHA256} from './catalog-pin.ts';
import {validateGeneralDefinition} from '../evaluation/definitions.ts';
import {generalReleaseFor,generalSchemaFor} from '../evaluation/current-edition.ts';
export interface CatalogEntry extends ProtocolDescriptor {bundleId:string}
export interface ResourceCatalog {schemaVersion:1;legacyRefs:ProtocolRefs;bundles:ProtocolBundle[];entries:CatalogEntry[];localOnlyBundles?:string[]}
export const bytesHash=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex');
export async function readCatalogFile(resourceRoot:string,path:string):Promise<Buffer> {
  const root=resolve(resourceRoot);
  if(!path||isAbsolute(path)||path.includes('\\')||path.includes(':')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('INVALID_RESOURCE_PATH');
  let current=root;
  for(const part of ['',...path.split('/')]){
    current=part?join(current,part):current;
    if((await lstat(current)).isSymbolicLink()||await realpath(current)!==current)throw Error('RESOURCE_LINK_REJECTED');
  }
  return readFile(current);
}
export async function readProtocolCatalog(packageRoot:string):Promise<ResourceCatalog> {
  const root=join(resolve(packageRoot),'resources'),raw=await readCatalogFile(root,'protocol-registry.json');
  if(bytesHash(raw)!==RESOURCE_CATALOG_SHA256)throw Error('CATALOG_HASH_MISMATCH');
  const catalog=JSON.parse(raw.toString('utf8')) as ResourceCatalog;
  if(catalog.schemaVersion!==1||!Array.isArray(catalog.bundles)||!Array.isArray(catalog.entries))throw Error('INVALID_PROTOCOL_CATALOG');
  const refs=new Set<string>(),bundles=new Set<string>();
  for(const bundle of catalog.bundles){
    if(!/^[a-zA-Z0-9._-]{1,128}$/.test(bundle.id)||bundles.has(bundle.id))throw Error('INVALID_PROTOCOL_CATALOG');bundles.add(bundle.id);
    const paths=new Set<string>();
    for(const file of bundle.files){if(paths.has(file.path)||!/^([a-f0-9]{64})$/.test(file.sha256)||!Number.isSafeInteger(file.size)||file.size<0)throw Error('INVALID_PROTOCOL_CATALOG');paths.add(file.path);}
    if(!paths.has(bundle.questionPath))throw Error('INVALID_PROTOCOL_CATALOG');
  }
  for(const entry of catalog.entries){
    const key=protocolKey(entry.refs),{definitionHash,...definition}=entry.general;
    const release=generalReleaseFor(entry.refs);
    const schema=generalSchemaFor(entry.refs);
    validateGeneralDefinition(entry.general);
    if(refs.has(key)||identityHash(definition)!==definitionHash||entry.general.domains.reduce((n,d)=>n+d.itemIds.length,0)!==entry.questionCount||
      entry.general.schema!==schema||release&&entry.general.tier!==release.tier)throw Error('INVALID_PROTOCOL_DEFINITION');
    refs.add(key);
    if(entry.bundleId!=='legacy'&&!bundles.has(entry.bundleId))throw Error('INVALID_PROTOCOL_CATALOG');
  }
  if(catalog.localOnlyBundles!==undefined&&(!Array.isArray(catalog.localOnlyBundles)||
    new Set(catalog.localOnlyBundles).size!==catalog.localOnlyBundles.length||
    catalog.localOnlyBundles.some(id=>!bundles.has(id)||catalog.entries.some(entry=>entry.bundleId===id&&entry.allowNewRuns))))
    throw Error('INVALID_PROTOCOL_CATALOG');
  return catalog;
}
export async function verifyBundle(packageRoot:string,bundle:ProtocolBundle):Promise<void> {
  await verifyBundleFiles(join(resolve(packageRoot),'resources'),bundle);
}
export async function verifyBundleFiles(root:string,bundle:ProtocolBundle):Promise<void> {
  let next=0,failed=false;
  async function verifyFiles(){
    while(!failed){
      const file=bundle.files[next++];
      if(!file)return;
      try {
        const bytes=await readCatalogFile(root,file.path);
        if(bytes.length!==file.size||bytesHash(bytes)!==file.sha256)throw Error('RESOURCE_HASH_MISMATCH');
      } catch(error) {failed=true;throw error;}
    }
  }
  // Drain readers before callers clean up a failed staging directory.
  const settled=await Promise.allSettled(Array.from({length:Math.min(4,bundle.files.length)},verifyFiles));
  const rejection=settled.find(result=>result.status==='rejected');
  if(rejection)throw rejection.reason;
}
export function bundleCachePath(root:string,bundle:ProtocolBundle):string {
  return join(resolve(root),'resources',bundle.id+'-'+identityHash(bundle).slice(0,12));
}
export async function readBundleCache(root:string|undefined,bundle:ProtocolBundle) {
  if(!root)throw Error('ARCHIVED_GENERAL_UNAVAILABLE');
  const path=bundleCachePath(root,bundle);
  try {
    const ready=JSON.parse((await readCatalogFile(path,'.ready.json')).toString('utf8'));
    if(ready.manifestHash!==identityHash(bundle)||typeof ready.preparedAt!=='string')throw Error('PREPARED_VERSION_MISMATCH');
    return {path,preparedAt:ready.preparedAt as string};
  } catch(error) {
    if((error as NodeJS.ErrnoException).code==='ENOENT')throw Error('ARCHIVED_GENERAL_UNAVAILABLE');
    throw error;
  }
}

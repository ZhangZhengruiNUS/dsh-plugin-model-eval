import {lstat,readFile,realpath} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import type {ProtocolRefs} from '../contracts.ts';
import type {ProtocolBundle,ProtocolDescriptor} from '../evaluation/tier-contracts.ts';
import {identityHash,protocolKey} from '../evaluation/protocol-identity.ts';
import {RESOURCE_CATALOG_SHA256} from './catalog-pin.ts';
export interface CatalogEntry extends ProtocolDescriptor {bundleId:string}
export interface ResourceCatalog {schemaVersion:1;legacyRefs:ProtocolRefs;bundles:ProtocolBundle[];entries:CatalogEntry[]}
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
    if(refs.has(key)||identityHash(definition)!==definitionHash||entry.general.domains.length!==4||new Set(entry.general.domains.map(d=>d.id)).size!==4||entry.general.domains.some(d=>d.weight!==.25)||entry.general.domains.reduce((n,d)=>n+d.itemIds.length,0)!==entry.questionCount)throw Error('INVALID_PROTOCOL_DEFINITION');
    refs.add(key);
    if(entry.bundleId!=='legacy'&&!bundles.has(entry.bundleId))throw Error('INVALID_PROTOCOL_CATALOG');
  }
  return catalog;
}
export async function verifyBundle(packageRoot:string,bundle:ProtocolBundle):Promise<void> {
  for(const file of bundle.files){const bytes=await readCatalogFile(join(resolve(packageRoot),'resources'),file.path);if(bytes.length!==file.size||bytesHash(bytes)!==file.sha256)throw Error('RESOURCE_HASH_MISMATCH');}
}

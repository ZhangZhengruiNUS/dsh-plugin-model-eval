import {join} from 'node:path';
import type {ProtocolBundleFile} from './tier-contracts.ts';
import {readProtocolCatalog,readCatalogFile,bytesHash} from '../resources/catalog.ts';
import {assertEditionMapIntegrity,type EditionMap} from './edition-map.ts';
const fail=():never=>{throw Error('EDITION_CATALOG_INVALID');};
export function decodeEditionDeclarations(bytes:Buffer,pin:ProtocolBundleFile):readonly EditionMap[]{
 if(bytes.length!==pin.size||bytesHash(bytes)!==pin.sha256)return fail();
 try{
  const value=JSON.parse(bytes.toString('utf8')) as {schemaVersion:number;maps:EditionMap[]};
  if(value.schemaVersion!==1||!Array.isArray(value.maps)||value.maps.length!==1)return fail();
  for(const map of value.maps){if(map.reversed)return fail();assertEditionMapIntegrity(map);}
  return value.maps;
 }catch{return fail();}
}
/** The V3 bundle pins this public declaration; old packages have no approved pair. */
export async function readEditionDeclarations(packageRoot:string):Promise<readonly EditionMap[]>{
 const catalog=await readProtocolCatalog(packageRoot),bundle=catalog.bundles.find(b=>b.id==='task-five-v3');
 if(!bundle)return [];
 const pin=bundle.files.find(f=>f.path==='edition-maps.json');if(!pin)return fail();
 return decodeEditionDeclarations(await readCatalogFile(join(packageRoot,'resources'),pin.path),pin);
}

import {readFile,lstat,realpath} from 'node:fs/promises';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {assertBaselineProfile} from './baseline-validation.ts';import type {BaselineProfileV1} from './calibration-contracts.ts';
export async function readBaselineCatalog(root:string):Promise<BaselineProfileV1[]> {
 const dir=await lstat(root);if(!dir.isDirectory()||dir.isSymbolicLink()||await realpath(root)!==resolve(root))throw Error('BASELINE_PATH_REJECTED');
 const catalogPath=join(root,'catalog.json'),info=await lstat(catalogPath);if(!info.isFile()||info.isSymbolicLink())throw Error('BASELINE_PATH_REJECTED');
 const catalog=JSON.parse(await readFile(catalogPath,'utf8')) as {version:number;profiles:{id:string;path:string;sha256:string}[]};
 if(catalog.version!==1||!Array.isArray(catalog.profiles)||Object.keys(catalog).some(k=>!['version','profiles'].includes(k)))throw Error('BASELINE_CATALOG_INVALID');
 const profiles:BaselineProfileV1[]=[],ids=new Set<string>();
 for(const entry of catalog.profiles){if(!entry||!/^profile\.[a-f0-9]{64}\.json$/.test(entry.path)||entry.path!=='profile.'+entry.sha256+'.json')throw Error('BASELINE_PATH_REJECTED');
  if(ids.has(entry.id)||Object.keys(entry).some(k=>!['id','path','sha256'].includes(k)))throw Error('BASELINE_CATALOG_INVALID');ids.add(entry.id);
  const path=join(root,entry.path),file=await lstat(path);if(!file.isFile()||file.isSymbolicLink()||await realpath(path)!==resolve(path))throw Error('BASELINE_PATH_REJECTED');
  const bytes=await readFile(path);if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('BASELINE_HASH_CHANGED');
  const profile=JSON.parse(bytes.toString('utf8')) as BaselineProfileV1;assertBaselineProfile(profile);if(profile.id!==entry.id)throw Error('BASELINE_IDENTITY_CHANGED');profiles.push(profile);
 }
 return profiles;
}

import { createHash, randomUUID } from 'node:crypto';
import { copyFile, link, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, statfs, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { readResourceManifest, type ResourceManifest } from '../evaluation/protocols.ts';
import { RESOURCE_MANIFEST_SHA256 } from './pins.ts';

const APPLICATION='@aico/dsh-plugin-model-eval';
interface RootMarker {application:typeof APPLICATION;schemaVersion:1;rootId:string;createdAt:string}
export type RootInspection={kind:'empty';path:string;exists:boolean}|{kind:'owned';path:string;marker:RootMarker};
export interface ActivitySnapshot {writing:boolean;activeBatchId?:string}
export interface RootSelection {path:string;rootId:string;created:boolean}
export interface PreparedEnvironment {rootPath:string;resourcesPath:string;resourceVersion:string;manifestHash:string;bytes:number;preparedAt:string;preparationMs:number;cached:boolean}
export const defaultRoot=()=>join(homedir(),'.dsh-model-eval');
const fail=(code:string):never=>{throw Object.assign(new Error(code),{code});};
const missing=(error:unknown)=>(error as NodeJS.ErrnoException).code==='ENOENT';
const hash=(data:Buffer)=>createHash('sha256').update(data).digest('hex');

export async function inspectRoot(path:string):Promise<RootInspection> {
  if(!isAbsolute(path)||path.startsWith('\\\\'))return fail('ROOT_REQUIRES_LOCAL_ABSOLUTE_PATH');
  path=resolve(path);
  let info;
  try {info=await lstat(path);}catch(error){if(missing(error))return {kind:'empty',path,exists:false};throw error;}
    if(info.isSymbolicLink()||!info.isDirectory())return fail('ROOT_LINK_OR_FILE_REJECTED');
    path=await realpath(path);
    const names=await readdir(path);
    if(!names.length)return {kind:'empty',path,exists:true};
    if(!names.includes('root.json'))return fail('ROOT_NOT_EMPTY');
    const markerPath=join(path,'root.json');
    if((await lstat(markerPath)).isSymbolicLink())return fail('ROOT_LINK_OR_FILE_REJECTED');
    let marker:RootMarker;
    try {marker=JSON.parse(await readFile(markerPath,'utf8'));}catch{return fail('ROOT_MARKER_CORRUPT');}
    if(marker.application!==APPLICATION)return fail('ROOT_NOT_OWNED');
    if(marker.schemaVersion!==1)return fail('ROOT_VERSION_UNSUPPORTED');
    if(typeof marker.rootId!=='string'||!marker.rootId||typeof marker.createdAt!=='string')return fail('ROOT_MARKER_CORRUPT');
    return {kind:'owned',path,marker};
}
async function folder(path:string):Promise<void> {
  try {await mkdir(path);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  const stat=await lstat(path);
  if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path)fail('ROOT_LINK_OR_FILE_REJECTED');
}
async function durableNew(path:string,data:string):Promise<void> {
  const file=await open(path,'wx');
  try {await file.writeFile(data,'utf8');await file.sync();}finally{await file.close();}
}
export async function switchRoot(path:string,activity:ActivitySnapshot):Promise<RootSelection> {
  if(activity.writing||activity.activeBatchId)return fail('ROOT_BUSY');
  const inspection=await inspectRoot(path);let created=false;
  if(inspection.kind==='empty') {
    await mkdir(inspection.path,{recursive:true});
    const rootPath=await realpath(inspection.path);
    const temporary=join(rootPath,`.root-init-${randomUUID()}.tmp`);
    const marker:RootMarker={application:APPLICATION,schemaVersion:1,rootId:randomUUID(),createdAt:new Date().toISOString()};
    try {
      await durableNew(temporary,JSON.stringify(marker)+'\n');
      // An atomic hard-link publication cannot overwrite another initializer.
      try {await link(temporary,join(rootPath,'root.json'));created=true;}
      catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
    }finally{await unlink(temporary).catch(()=>{});}
  }
  const owned=await inspectRoot(inspection.path);
  if(owned.kind!=='owned')return fail('ROOT_NOT_OWNED');
  for(const name of ['resources','history','tmp'])await folder(join(owned.path,name));
  return {path:owned.path,rootId:owned.marker.rootId,created};
}
function resourcePath(root:string,relative:string):string {
  if(!relative||isAbsolute(relative)||relative.includes('\\')||relative.includes(':')||relative.split('/').some(x=>!x||x==='.'||x==='..'))return fail('INVALID_RESOURCE_PATH');
  return join(root,relative);
}
async function verifyFiles(root:string,manifest:ResourceManifest):Promise<void> {
  const unique=new Set<string>();
  for(const file of manifest.files) {
    if(unique.has(file.path))return fail('INVALID_RESOURCE_PATH');unique.add(file.path);
    const path=resourcePath(root,file.path),info=await lstat(path);
    if(!info.isFile()||info.isSymbolicLink()||await realpath(path)!==path)return fail('RESOURCE_LINK_REJECTED');
    const data=await readFile(path);
    if(data.length!==file.size||hash(data)!==file.sha256)return fail('RESOURCE_HASH_MISMATCH');
  }
}
export async function prepareResources(root:string,manifest:ResourceManifest,packageResources:string):Promise<PreparedEnvironment> {
  const started=performance.now();packageResources=await realpath(resolve(packageResources));
  const actual=await readResourceManifest(packageResources);
  if(JSON.stringify(actual)!==JSON.stringify(manifest))return fail('MANIFEST_MISMATCH');
  if(manifest.gates.runtime!=='passed')return fail('ENVIRONMENT_NOT_VERIFIED');
  if(!/^[a-zA-Z0-9._-]{1,128}$/.test(manifest.resourceVersion))return fail('INVALID_RESOURCE_VERSION');
  const inspection=await inspectRoot(root);
  if(inspection.kind!=='owned')return fail('ROOT_NOT_OWNED');
  root=inspection.path;
  for(const name of ['resources','history','tmp'])await folder(join(root,name));
  const destination=join(root,'resources',`${manifest.resourceVersion}-${RESOURCE_MANIFEST_SHA256.slice(0,12)}`);
  const bytes=manifest.files.reduce((n,file)=>n+file.size,0);
  try {
    const ready=JSON.parse(await readFile(join(destination,'.ready.json'),'utf8'));
    if(ready.manifestHash!==RESOURCE_MANIFEST_SHA256)return fail('PREPARED_VERSION_MISMATCH');
    await verifyFiles(destination,manifest);
    return {rootPath:root,resourcesPath:destination,resourceVersion:manifest.resourceVersion,manifestHash:RESOURCE_MANIFEST_SHA256,bytes,preparedAt:ready.preparedAt,cached:true,preparationMs:Math.round(performance.now()-started)};
  }catch(error){if(!missing(error))throw error;}
  // Validate all packaged bytes before allocating or activating a copied version.
  await verifyFiles(packageResources,manifest);
  const disk=await statfs(root);
  if(disk.bavail*disk.bsize<bytes+32*1024*1024)return fail('ROOT_INSUFFICIENT_SPACE');
  const staging=join(root,'tmp',`resources-${randomUUID()}`);await mkdir(staging);
  const preparedAt=new Date().toISOString();
  try {
    for(const file of manifest.files) {
      const target=resourcePath(staging,file.path);
      await mkdir(dirname(target),{recursive:true});await copyFile(resourcePath(packageResources,file.path),target);
    }
    await copyFile(join(packageResources,'manifest.json'),join(staging,'manifest.json'));
    await verifyFiles(staging,manifest);
    await durableNew(join(staging,'.ready.json'),JSON.stringify({manifestHash:RESOURCE_MANIFEST_SHA256,preparedAt})+'\n');
    try {await rename(staging,destination);}
    catch(error) {
      const code=(error as NodeJS.ErrnoException).code;
      if(!['EEXIST','ENOTEMPTY','EPERM'].includes(code??''))throw error;
      const ready=JSON.parse(await readFile(join(destination,'.ready.json'),'utf8'));
      if(ready.manifestHash!==RESOURCE_MANIFEST_SHA256)throw error;
      await verifyFiles(destination,manifest);
    }
    return {rootPath:root,resourcesPath:destination,resourceVersion:manifest.resourceVersion,manifestHash:RESOURCE_MANIFEST_SHA256,bytes,preparedAt,cached:false,preparationMs:Math.round(performance.now()-started)};
  }finally{await rm(staging,{recursive:true,force:true});}
}

import {lstat,realpath} from 'node:fs/promises';import {join,resolve} from 'node:path';import {readRecord} from '../history/atomic.ts';
/** Developer-only local selector; no public API and no start permission of its own. */
export async function selectCalibrationDirectory(root:string):Promise<string>{
 const fallback=join(root,'initial-light-2026-11-02'),selector=join(root,'active-session.json');
 let stat;try{stat=await lstat(selector);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return fallback;throw e;}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096||resolve(await realpath(selector))!==resolve(selector))throw Error('CALIBRATION_SESSION_UNSAFE');
 const value=await readRecord<{version:number;session:string}>(selector);
 if(!value||Object.keys(value).sort().join(',')!=='session,version'||value.version!==1||typeof value.session!=='string'||!/^estimate-v4-[a-z0-9][a-z0-9-]{0,79}$/.test(value.session))throw Error('CALIBRATION_SESSION_INVALID');
 return join(root,value.session);
}

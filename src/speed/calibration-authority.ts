import {lstat,realpath,mkdir,open,readFile} from 'node:fs/promises';import {join,resolve,dirname} from 'node:path';
import {identityHash} from '../evaluation/protocol-identity.ts';import {traceIdValid} from '../estimation/calibration-contracts.ts';
const missing=(e:unknown)=>(e as NodeJS.ErrnoException).code==='ENOENT';
async function safeDirectory(path:string){const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||resolve(await realpath(path))!==resolve(path))throw Error('CALIBRATION_AUTHORITY_UNSAFE');}
/** Parent-scoped receipts make a grant single-use even if its session files are copied. */
export async function calibrationAuthority(root:string,session:string){
 root=resolve(root);session=resolve(session);await safeDirectory(root);
 if(session!==root&&dirname(session)!==root)throw Error('CALIBRATION_AUTHORITY_SCOPE');
 const receipts=join(root,'.consumed-grants'),sessionKey=identityHash([root,session]);
 async function assertUnused(grantId:string){
  if(!traceIdValid(grantId))throw Error('CALIBRATION_GRANT_INVALID');
  try{await safeDirectory(receipts);try{await lstat(join(receipts,grantId+'.json'));throw Error('CALIBRATION_GRANT_CONSUMED');}catch(e){if(!missing(e))throw e;}}catch(e){if(!missing(e))throw e;}
  const legacy=join(root,'initial-light-2026-11-02'),marker=join(legacy,'started.json');
  try{await safeDirectory(legacy);const stat=await lstat(marker);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536||resolve(await realpath(marker))!==resolve(marker))throw Error('CALIBRATION_MARKER_UNSAFE');const value=JSON.parse(await readFile(marker,'utf8')) as {grantId?:unknown};if(!traceIdValid(value.grantId))throw Error('CALIBRATION_MARKER_UNSAFE');if(value.grantId===grantId)throw Error('CALIBRATION_GRANT_CONSUMED');}catch(e){if(!missing(e))throw e;}
 }
 async function consume(grantId:string,preparedHash:string){
  await assertUnused(grantId);try{await mkdir(receipts);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}await safeDirectory(receipts);
  let handle;try{handle=await open(join(receipts,grantId+'.json'),'wx');}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw Error('CALIBRATION_GRANT_CONSUMED');throw e;}
  try{await handle.writeFile(JSON.stringify({version:1,grantId,sessionKey,preparedHash,consumedAt:new Date().toISOString()}));await handle.sync();}finally{await handle.close();}
 }
 return {sessionKey,assertUnused,consume,isLegacySession:session===join(root,'initial-light-2026-11-02')};
}

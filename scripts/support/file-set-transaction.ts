/** Developer-only recoverable file publication. No model/history paths are accepted implicitly. */
import {open,readFile,lstat,realpath,rename,unlink} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const key=(path:string)=>resolve(path).toLowerCase();
interface Entry {path:string;temp:string;old:string|null;oldHash:string|null;next:string;nextHash:string}
interface Journal {schemaVersion:1;state:'prepared';files:Entry[]}
async function checked(root:string,path:string){
  root=resolve(root);path=resolve(path);const rel=relative(root,path);
  if(!rel||rel.startsWith('..')||isAbsolute(rel)||key(await realpath(root))!==key(root))throw Error('FILESET_PATH_REJECTED');
  let at=root;
  for(const part of rel.split(/[\\/]/)){at=join(at,part);try{if((await lstat(at)).isSymbolicLink())throw Error('FILESET_LINK_REJECTED');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
  return path;
}
async function bytesOrNull(path:string):Promise<Buffer|null>{try{return await readFile(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
const hashOrNull=(bytes:Buffer|null)=>bytes===null?null:sha(bytes);
async function durableNew(path:string,bytes:Uint8Array){const handle=await open(path,'wx');try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}}
async function assertCurrent(entry:Entry){const hash=hashOrNull(await bytesOrNull(entry.path));if(hash!==entry.oldHash&&hash!==entry.nextHash)throw Error('FILESET_UNEXPECTED_CONTENT:'+entry.path);return hash;}

export async function recoverFileSet(root:string,journalPath:string,allowedPaths:readonly string[]):Promise<void>{
  journalPath=await checked(root,journalPath);
  const journal=JSON.parse(await readFile(journalPath,'utf8')) as Journal,allowed=new Set(allowedPaths.map(key));
  if(journal.schemaVersion!==1||journal.state!=='prepared'||!Array.isArray(journal.files)||journal.files.length!==allowed.size||new Set(journal.files.map(f=>key(f.path))).size!==allowed.size)throw Error('FILESET_JOURNAL_INVALID');
  // Validate every payload/path/current digest before touching any output.
  for(const entry of journal.files){
    if(!allowed.has(key(entry.path)))throw Error('FILESET_JOURNAL_INVALID');
    await checked(root,entry.path);await checked(root,entry.temp);
    if(!entry.temp.startsWith(entry.path+'.fileset-')||!/^[-a-f0-9]{36}\.tmp$/.test(entry.temp.slice((entry.path+'.fileset-').length))||sha(Buffer.from(entry.next,'base64'))!==entry.nextHash||(entry.old===null?entry.oldHash!==null:sha(Buffer.from(entry.old,'base64'))!==entry.oldHash))throw Error('FILESET_JOURNAL_INVALID');
    await assertCurrent(entry);
  }
  for(const entry of journal.files){
    const current=await assertCurrent(entry);
    if(current===entry.nextHash&&current!==entry.oldHash){
      if(entry.old===null){await unlink(entry.path);}else{
        const temporary=entry.path+'.restore-'+randomUUID()+'.tmp';await checked(root,temporary);
        await durableNew(temporary,Buffer.from(entry.old,'base64'));await assertCurrent(entry);await rename(temporary,entry.path);
      }
    }
    const temporary=await bytesOrNull(entry.temp);
    if(temporary!==null){if(sha(temporary)!==entry.nextHash)throw Error('FILESET_UNEXPECTED_TEMP');await unlink(entry.temp);}
  }
  await rename(journalPath,journalPath+'.recovered-'+randomUUID()+'.json');
}

export async function commitFileSet(root:string,journalPath:string,changes:readonly {path:string;bytes:Uint8Array}[],hooks?:{afterStep?:(index:number)=>void|Promise<void>}):Promise<void>{
  journalPath=await checked(root,journalPath);
  if(!changes.length||changes.length>16||new Set(changes.map(c=>key(c.path))).size!==changes.length||changes.some(c=>key(c.path)===key(journalPath)))throw Error('FILESET_CHANGES_INVALID');
  if(await bytesOrNull(journalPath)!==null)throw Error('FILESET_RECOVERY_REQUIRED');
  const journal:Journal={schemaVersion:1,state:'prepared',files:[]};
  // All bytes are prepared and fsynced before existing registry/pin files can change.
  for(const change of changes){
    const path=await checked(root,change.path),old=await bytesOrNull(path),temp=path+'.fileset-'+randomUUID()+'.tmp';await checked(root,temp);
    journal.files.push({path,temp,old:old?.toString('base64')??null,oldHash:hashOrNull(old),next:Buffer.from(change.bytes).toString('base64'),nextHash:sha(change.bytes)});
    await durableNew(temp,change.bytes);
  }
  await durableNew(journalPath,Buffer.from(JSON.stringify(journal)+'\n'));
  try{
    for(let index=0;index<journal.files.length;index++){
      const entry=journal.files[index]!;
      if(hashOrNull(await bytesOrNull(entry.path))!==entry.oldHash)throw Error('FILESET_UNEXPECTED_CONTENT:'+entry.path);
      await checked(root,entry.path);await rename(entry.temp,entry.path);await hooks?.afterStep?.(index);
    }
    await rename(journalPath,journalPath+'.committed-'+randomUUID()+'.json');
  }catch(error){
    try{await recoverFileSet(root,journalPath,changes.map(c=>c.path));}catch(recoveryError){throw new AggregateError([error,recoveryError],'FILESET_RECOVERY_REQUIRED');}
    throw error;
  }
}

import {lstat,mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname,join,basename,parse} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
type Kind='audit'|'staging'|'runtime';
const key=(p:string)=>resolve(p).toLowerCase();
const inside=(base:string,path:string)=>{const rel=relative(resolve(base),path);return rel!==''&&!rel.startsWith('..')&&!isAbsolute(rel);};
/** Output namespaces are owned/generated; source/archive paths are never destinations. */
export async function assertArtifactDestination(path:string,kind:Kind,inputs:string[]=[]){
  const absolute=resolve(path);
  if(inputs.some(input=>key(input)===key(absolute)))throw Error('OUTPUT_COLLISION');
  const temporary=relative(resolve(tmpdir()),absolute).split(/[\\/]/);
  const testOutput=temporary.length>=2&&/^dsh-model-eval-test-[A-Za-z0-9]+$/.test(temporary[0]??'')&&!temporary.includes('..');
  const localOutput=inside('.local/contest-adaptation',absolute);
  const evidenceOutput=kind!=='staging'&&key(dirname(absolute))===key('docs/evidence/tiers')&&new RegExp('^coding-adaptation-'+kind+'(?:-[a-z0-9-]+)?\\.json$').test(basename(absolute));
  if(!testOutput&&!localOutput&&!evidenceOutput)throw Error('OUTPUT_NOT_OWNED');
  // Reject symlinks/junctions at every existing component, including the leaf.
  let current=parse(absolute).root;
  for(const part of relative(current,absolute).split(/[\\/]/)){
    current=join(current,part);
    try{if((await lstat(current)).isSymbolicLink())throw Error('OUTPUT_LINK_REJECTED');}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
}
export async function writeArtifact(path:string,kind:Kind,data:unknown,inputs:string[]=[]){
  await assertArtifactDestination(path,kind,inputs);
  await mkdir(dirname(resolve(path)),{recursive:true});
  const temporary=resolve(path)+'.'+randomUUID()+'.tmp';
  try{
    await writeFile(temporary,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
    await assertArtifactDestination(path,kind,inputs);await rename(temporary,resolve(path));
  }finally{await rm(temporary,{force:true});}
}

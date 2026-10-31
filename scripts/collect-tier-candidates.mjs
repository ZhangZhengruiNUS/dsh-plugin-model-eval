/** Pinned public sources, developer-only. No model calls and no changes to packaged resources. */
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const specs=[
 {id:'mmlu-pro',domain:'knowledge',repo:'TIGER-Lab/MMLU-Pro',revision:'b189ec765aa7ed75c8acfea42df31fdae71f97be',file:'data/test-00000-of-00001.parquet',license:'MIT'},
 {id:'olympiad-text-math',domain:'math',repo:'Hothan/OlympiadBench',revision:'91184b52131e7fc9455fef848035173aea8cc01a',file:'OlympiadBench/OE_TO_maths_en_COMP/OE_TO_maths_en_COMP.parquet',license:'Apache-2.0'},
 {id:'code-contests-test',domain:'coding',repo:'deepmind/code_contests',revision:'802411c3010cb00d1b05bad57ca77365a3c699d6',file:'data/test-00000-of-00001-9c49eeff30aacaa8.parquet',license:'CC-BY-4.0'}
];
async function exists(path){try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function artifact(root,name,url){
 const path=join(root,'artifacts',name),metaPath=path+'.meta.json';await mkdir(dirname(path),{recursive:true});
 if(await exists(path)){
  if((await lstat(path)).isSymbolicLink()||!await exists(metaPath))throw Error('UNVERIFIED_EXISTING_ARTIFACT:'+name);
  const meta=JSON.parse(await readFile(metaPath,'utf8')),bytes=await readFile(path);if(meta.url!==url||meta.sha256!==hash(bytes))throw Error('CACHED_ARTIFACT_MISMATCH:'+name);
  return {bytes,path,relative:'artifacts/'+name,sha256:meta.sha256,url};
 }
 const response=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error('SOURCE_HTTP_'+response.status+':'+name);
 const bytes=Buffer.from(await response.arrayBuffer());await writeFile(path,bytes,{flag:'wx'});const sha256=hash(bytes);await writeFile(metaPath,JSON.stringify({url,sha256,bytes:bytes.length},null,2)+'\n',{flag:'wx'});
 return {bytes,path,relative:'artifacts/'+name,sha256,url};
}
function expectedNumber(raw){
 let value=String(raw??'').trim().replace(/^\$+|\$+$/g,'').trim();
 if(/^\\boxed\{[\s\S]*\}$/.test(value))value=value.slice(7,-1).trim();
 value=value.replace(/\\(?:d?frac)\{([+-]?\d+)\}\{([+-]?\d+)\}/g,'$1/$2');
 return value.replace(/\s+/g,'');
}
function pairs(test){
 if(!test)return [];
 if(!Array.isArray(test.input)||!Array.isArray(test.output)||test.input.length!==test.output.length)throw Error('SOURCE_CASE_SHAPE');
 return test.input.map((stdin,i)=>({stdin,expected:test.output[i]}));
}
function normalize(spec,raw,index,audits){
 const common={id:spec.id+'/'+String(raw.question_id??raw.id??index),sourceId:String(raw.question_id??raw.id??index),sourceRecordHash:raw._source_record_sha256,raw,
  review:{status:'eligible',reason:'Published structured fields; runtime correctness still requires gate 3.',textOnly:true,singleAnswer:true,uniqueOutput:true}};
 if(spec.domain==='knowledge')return {...common,question:raw.question,options:raw.options,answer:raw.answer,category:raw.category};
 if(spec.domain==='math'){
  const answers=Array.isArray(raw.final_answer)?raw.final_answer:[raw.final_answer];
  return {...common,question:[raw.context,raw.question].filter(x=>typeof x==='string'&&x.trim()).join('\n\n'),answer:expectedNumber(answers[0]),category:raw.subfield??raw.subject??'math',
    review:{...common.review,singleAnswer:answers.length===1&&raw.is_multiple_answer===false,textOnly:!String(raw.modality??'').toLowerCase().includes('multi')}};
 }
 const cases=[...pairs(raw.public_tests),...pairs(raw.private_tests),...pairs(raw.generated_tests)],audit=audits?.[String(index)];
 if(audit&&audit.sourceRecordHash!==raw._source_record_sha256)throw Error('REVIEW_SOURCE_MISMATCH:'+index);
 return {...common,question:raw.description,answer:'',category:raw.cf_rating?String(Math.floor(raw.cf_rating/400)*400):'unrated',cases,
  review:audit?{...common.review,...audit}:{...common.review,status:'pending',reason:'Requires review of unique output, interaction and special checker. Reference execution is a separate runtime gate.',uniqueOutput:null},
  referenceCount:raw.python3_references.length};
}
export async function collectCandidates({output,python}){
 const cwd=resolve('.'),root=resolve(output),rel=relative(join(cwd,'.local'),root);
 if(rel.startsWith('..')||isAbsolute(rel)||root===join(cwd,'.local'))throw Error('OUTPUT_MUST_BE_OWNED_LOCAL_SUBDIRECTORY');
 await mkdir(root,{recursive:true});if((await lstat(root)).isSymbolicLink())throw Error('OUTPUT_LINK_REJECTED');
 const marker=join(root,'.tier-candidates.json');
 if(await exists(marker)){if(JSON.parse(await readFile(marker,'utf8')).application!=='model-eval-tier-candidates-v1')throw Error('OUTPUT_OWNER_MISMATCH');}
 else{const {readdir}=await import('node:fs/promises');if((await readdir(root)).length)throw Error('OUTPUT_NOT_EMPTY');await writeFile(marker,JSON.stringify({application:'model-eval-tier-candidates-v1'}),{flag:'wx'});}
 await mkdir(join(root,'sources'),{recursive:true});await mkdir(join(root,'reviews'),{recursive:true});
 const auditPath=join(root,'reviews','code-contests.json'),publishedAudit=resolve('docs/evidence/tiers/code-contests-review.json');
 const audits=await exists(auditPath)?JSON.parse(await readFile(auditPath,'utf8')):await exists(publishedAudit)?JSON.parse(await readFile(publishedAudit,'utf8')):undefined;
 const sources=[],converters=[];
 for(const spec of specs){
  const base=`https://huggingface.co/datasets/${spec.repo}`,data=await artifact(root,spec.id+'.parquet',`${base}/resolve/${spec.revision}/${spec.file}`),card=await artifact(root,spec.id+'.README.md',`${base}/raw/${spec.revision}/README.md`);
  const projectionPath=join(root,'artifacts',spec.id+'.projection.json'),run=spawnSync(python,[resolve('scripts/tier-parquet.py'),data.path,projectionPath,spec.domain],{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
  if(run.status!==0)throw Error('PARQUET_CONVERSION_FAILED:'+spec.id+':'+run.stderr.slice(-1000));
  converters.push(JSON.parse(run.stdout));const original=JSON.parse(await readFile(projectionPath,'utf8')),rows=original.map((row,i)=>normalize(spec,row,i,audits));
  const relativePath='sources/'+spec.id+'.json',encoded=JSON.stringify(rows);await writeFile(join(root,relativePath),encoded);
  const licenseText=card.bytes.toString(),licenseMatch=new RegExp('license:[\\s\\S]{0,50}'+spec.license.toLowerCase().replaceAll('.','\\.'),'i').test(licenseText);
  sources.push({id:spec.id,domain:spec.domain,revision:spec.revision,url:base,rows:rows.length,
   data:{path:relativePath,sha256:hash(encoded)},artifact:{path:data.relative,sha256:data.sha256,url:data.url},
   license:{spdx:spec.license,path:card.relative,sha256:card.sha256,status:licenseMatch?'verified':'pending',basis:'Pinned publisher dataset card; attribution and full license texts must be retained before runtime packaging.'}});
  if(spec.domain==='coding'){
   const review=original.map((row,i)=>({index:i,name:row.name,rating:row.cf_rating,description:row.description,
    testCases:rows[i].cases.length,python3References:row.python3_references.length,sourceRecordHash:row._source_record_sha256}));
   await writeFile(join(root,'reviews','code-contests-input.json'),JSON.stringify(review,null,2)+'\n');
  }
  process.stdout.write(JSON.stringify({source:spec.id,rows:rows.length,license:licenseMatch?'verified':'pending',bytes:data.bytes.length})+'\n');
 }
 const resources=JSON.parse(await readFile('resources/manifest.json','utf8')),entry=resources.files.find(f=>f.path==='protocols/ifeval.jsonl'),licenseEntry=resources.files.find(f=>f.path==='licenses/IFEval-Apache-2.0.txt');
 const originalBytes=await readFile('resources/'+entry.path),license=await readFile('resources/'+licenseEntry.path);
 if(hash(originalBytes)!==entry.sha256||hash(license)!==licenseEntry.sha256)throw Error('LEGACY_IFEVAL_HASH_MISMATCH');
 const original=originalBytes.toString().trim().split('\n').map(l=>JSON.parse(l));
 const rows=original.map(row=>({id:'ifeval/'+row.key,sourceId:String(row.key),sourceRecordHash:hash(JSON.stringify(row)),raw:row,question:row.prompt,answer:'',constraints:row.instruction_id_list,
  category:row.instruction_id_list.map(id=>id.split(':')[0]).sort().join('+'),review:{status:'eligible',reason:'Original declared constraints and approved tokenizer adaptation.',textOnly:true,singleAnswer:true,uniqueOutput:true}}));
 const encoded=JSON.stringify(rows);await writeFile(join(root,'sources','ifeval.json'),encoded);await writeFile(join(root,'sources','ifeval.LICENSE'),license);
 sources.push({id:'ifeval',domain:'instructions',revision:entry.revision,data:{path:'sources/ifeval.json',sha256:hash(encoded)},
  license:{spdx:'Apache-2.0',path:'sources/ifeval.LICENSE',sha256:hash(license),status:'verified'},url:entry.source});
 const lock={schemaVersion:1,sources,converter:{scriptSha256:hash(await readFile('scripts/tier-parquet.py')),versions:converters},auditPolicy:'Pending code reviews are never eligible. No model or judge calls.'};
 await writeFile(join(root,'source-lock.json'),JSON.stringify(lock,null,2)+'\n');return {root,sources:sources.map(({id,rows,license})=>({id,rows,license:license.status}))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),output=args[args.indexOf('--out')+1],python=args[args.indexOf('--python')+1];
 if(!args.includes('--out')||!args.includes('--python')||!output||!python){process.stderr.write('Usage: collect-tier-candidates.mjs --out .local/<owned-directory> --python <development-python-with-pyarrow>\n');process.exitCode=2;}
 else try{await collectCandidates({output,python});}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}

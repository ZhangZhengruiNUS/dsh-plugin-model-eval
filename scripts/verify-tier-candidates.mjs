/** Developer admission gate. Does not call models, modify runtime resources or execute answers. */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,join,isAbsolute,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

export const DOMAINS=['knowledge','math','instructions','coding'];
const hash=data=>createHash('sha256').update(data).digest('hex');
const sort=(a,b)=>a<b?-1:a>b?1:0;
async function checkedRead(root,path){
  if(typeof path!=='string'||!path||isAbsolute(path)||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('UNSAFE_SOURCE_PATH:'+String(path));
  const full=resolve(root,path),rel=relative(root,full);
  if(rel.startsWith('..')||isAbsolute(rel))throw Error('UNSAFE_SOURCE_PATH:'+path);
  let current=root;
  for(const part of path.split('/')){current=join(current,part);if((await lstat(current)).isSymbolicLink())throw Error('UNSAFE_SOURCE_PATH:'+path);}
  if(await realpath(full)!==full)throw Error('UNSAFE_SOURCE_PATH:'+path);
  return readFile(full);
}
export function isExactNumeric(value){
  if(typeof value!=='string'||value.length>500)return false;
  const text=value.trim();
  if(!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d{1,3})?(?:\/[+-]?\d+)?$/.test(text))return false;
  const [left,denominator]=text.replaceAll(',','').split('/');
  if(denominator!==undefined&&BigInt(denominator)===0n)return false;
  return Math.abs(Number(left.split(/[eE]/)[1]??'0'))<=1000;
}
function exclusion(row,domain){
  const review=row.review;
  if(typeof row.question!=='string'||!row.question.trim())return 'EMPTY_PROMPT';
  if(/(?:^|\n)\s*(?:solution|canonical_solution|reference_solution|ground_truth|correct answer|final answer)\s*:/i.test(row.question))return 'PROMPT_ANSWER_LEAKAGE';
  if(review?.textOnly!==true)return 'NON_TEXT';
  if(review?.singleAnswer!==true)return 'MULTIPLE_ANSWERS';
  if(review?.status==='pending')return 'REVIEW_PENDING';
  if(domain==='math'&&!isExactNumeric(row.answer))return 'NON_EXACT_NUMERIC';
  if(domain==='knowledge'&&(!Array.isArray(row.options)||row.options.length<2||row.options.length>10||!/^[A-J]$/.test(row.answer)||row.answer.charCodeAt(0)-65>=row.options.length))return 'INVALID_CHOICE';
  if(domain==='instructions'&&(!Array.isArray(row.constraints)||row.constraints.length<2||row.constraints.length>3))return 'NOT_MULTI_CONSTRAINT';
  if(domain==='coding'){
    if(review?.interactive===true)return 'INTERACTIVE';
    if(review?.uniqueOutput!==true)return 'NON_UNIQUE_OUTPUT';
    if(!Array.isArray(row.cases)||!row.cases.length||row.cases.some(c=>typeof c.stdin!=='string'||typeof c.expected!=='string'))return 'MISSING_TESTS';
  }
  if(review?.status!=='eligible'||typeof review.reason!=='string'||!review.reason.trim())return review?.status==='excluded'?'REVIEW_EXCLUDED':'REVIEW_PENDING';
  return undefined;
}
function select(rows){
  const groups=new Map();
  for(const row of rows){const category=String(row.category??'uncategorized');let list=groups.get(category);if(!list)groups.set(category,list=[]);list.push(row);}
  const keys=[...groups.keys()].sort(sort);
  // Subject round-robin preserves coverage even when there are >30 length/subject pairs.
  // Within each subject rotate length tertiles; all ordering uses public metadata only.
  for(const [key,list] of groups){
    list.sort((a,b)=>a.question.length-b.question.length||sort(a.id,b.id));
    const bins=[[],[],[]],labels=['short','medium','long'];
    for(let i=0;i<list.length;i++){const bin=Math.min(2,Math.floor(i*3/list.length));list[i].lengthStratum=labels[bin];bins[bin].push(list[i]);}
    for(const bin of bins)bin.sort((a,b)=>sort(hash('two-tier-v1:'+a.id),hash('two-tier-v1:'+b.id)));
    const start=parseInt(hash(key).slice(0,8),16)%3,ordered=[];
    for(let round=0;ordered.length<list.length;round++)for(let i=0;i<3;i++){const row=bins[(start+i)%3][round];if(row)ordered.push(row);}
    groups.set(key,ordered);
  }
  const selected=[];
  for(let round=0;selected.length<100;round++){
    let found=false;for(const key of keys){const row=groups.get(key)[round];if(row){selected.push(row);found=true;if(selected.length===100)break;}}
    if(!found)break;
  }
  return selected;
}
export async function verifyCandidates(directory){
  const root=await realpath(resolve(directory));
  const report={schemaVersion:1,status:'failed',errors:[],domains:{},lightIds:[],deepIds:[],selectionRule:'category-length-tertiles-round-robin-sha256-v1',scope:'static admission; runtime and model calibration not verified'};
  let lock;
  try{lock=JSON.parse(await checkedRead(root,'source-lock.json'));}catch(error){report.errors.push(error.message);return report;}
  if(lock.schemaVersion!==1||!Array.isArray(lock.sources)){report.errors.push('INVALID_SOURCE_LOCK');return report;}
  const rowsByDomain=Object.fromEntries(DOMAINS.map(d=>[d,[]])),seen=new Set(),seenSources=new Set();
  for(const source of lock.sources){
    const {id,domain}=source;
    if(typeof id!=='string'||seenSources.has(id)||!DOMAINS.includes(domain)){report.errors.push('INVALID_SOURCE:'+String(id));continue;}seenSources.add(id);
    if(typeof source.revision!=='string'||!/^[a-f0-9]{40,64}$/.test(source.revision))report.errors.push('UNPINNED_SOURCE:'+id);
    if(!['MIT','Apache-2.0','CC-BY-4.0'].includes(source.license?.spdx)||source.license?.status!=='verified')report.errors.push('LICENSE_UNVERIFIED:'+id);
    for(const [kind,file] of [['data',source.data],['license',source.license]]){
      try{const data=await checkedRead(root,file?.path);if(!/^[a-f0-9]{64}$/.test(file?.sha256??'')||hash(data)!==file.sha256){report.errors.push((kind==='data'?'SOURCE_HASH_MISMATCH:':'LICENSE_HASH_MISMATCH:')+id);continue;}
        if(kind==='data'){
          const rows=JSON.parse(data);if(!Array.isArray(rows))throw Error('INVALID_SOURCE_ROWS:'+id);
          for(const row of rows){
            if(typeof row.id!=='string'||!row.id||row.id.length>300){report.errors.push('INVALID_SOURCE_ID:'+id);continue;}
            const key=id+':'+row.id;if(seen.has(key)){report.errors.push('DUPLICATE_SOURCE_ID:'+key);continue;}seen.add(key);
            rowsByDomain[domain].push({...row,id:domain+'/'+row.id,source:id});
          }
        }
      }catch(error){report.errors.push(error.message);}
    }
    if(source.artifact){try{if(hash(await checkedRead(root,source.artifact.path))!==source.artifact.sha256)report.errors.push('ARTIFACT_HASH_MISMATCH:'+id);}catch(error){report.errors.push(error.message);}}
  }
  for(const domain of DOMAINS){
    const eligible=[],excluded=[];
    for(const row of rowsByDomain[domain]){const reason=exclusion(row,domain);if(reason)excluded.push({id:row.id,reason,reviewReason:row.review?.reason});else eligible.push(row);}
    const selected=select(eligible),lengths=eligible.map(r=>r.question.length).sort((a,b)=>a-b);
    report.domains[domain]={total:rowsByDomain[domain].length,eligible:eligible.length,excluded,lengthUnit:'characters',
      promptLength:lengths.length?{median:lengths[Math.floor(lengths.length/2)],p95:lengths[Math.min(lengths.length-1,Math.floor(lengths.length*.95))],max:lengths.at(-1)}:null,
      selectedCategories:[...new Set(selected.map(r=>r.category??'uncategorized'))].sort(sort),
      lightCategories:[...new Set(selected.slice(0,30).map(r=>r.category??'uncategorized'))].sort(sort),
      lightLengthStrata:Object.fromEntries(['short','medium','long'].map(key=>[key,selected.slice(0,30).filter(r=>r.lengthStratum===key).length])),
      selectionEvidence:'source metadata only; no model outcomes',
      selected:selected.map(r=>({id:r.id,sourceId:r.sourceId,sourceRecordHash:r.sourceRecordHash,category:r.category,lengthCharacters:r.question.length,lengthStratum:r.lengthStratum,reviewReason:r.review.reason,referenceCount:r.referenceCount})),
      deepIds:selected.map(r=>r.id),lightIds:selected.slice(0,30).map(r=>r.id)};
    if(eligible.length<100)report.errors.push('INSUFFICIENT_ELIGIBLE:'+domain);
  }
  if(!report.errors.length){report.status='passed';report.deepIds=DOMAINS.flatMap(d=>report.domains[d].deepIds);report.lightIds=DOMAINS.flatMap(d=>report.domains[d].lightIds);}
  else for(const value of Object.values(report.domains)){value.deepIds=[];value.lightIds=[];value.selected=[];}
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),input=args[args.indexOf('--input')+1],output=args[args.indexOf('--report')+1];
  if(!args.includes('--input')||!args.includes('--report')||!input||!output){process.stderr.write('Usage: verify-tier-candidates.mjs --input <directory> --report <json>\n');process.exitCode=2;}
  else try{const report=await verifyCandidates(input);await mkdir(dirname(resolve(output)),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify({status:report.status,errors:report.errors,counts:Object.fromEntries(Object.entries(report.domains).map(([d,v])=>[d,v.eligible]))})+'\n');process.exitCode=report.status==='passed'?0:1;}
  catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}

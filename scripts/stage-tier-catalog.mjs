/** Developer-only, deterministic candidate catalog. Cannot release unverified runtime. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {loadProtocolSet} from '../src/evaluation/protocols.ts';
import {identityHash} from '../src/evaluation/protocol-identity.ts';
import {RUNTIME_PINS} from '../src/runtime/pins.ts';
import {CONTEST_RUNTIME_SHA256} from '../src/runtime/contest-pin.ts';
import {CONTEST_CACHE_SHA256} from '../src/runtime/contest-cache-pin.ts';
import {verifyRuntime} from '../src/runtime/integrity.ts';
const sha=b=>createHash('sha256').update(b).digest('hex'),root='resources',dir='suites/two-tier-v1';
const admission=JSON.parse(await readFile('docs/evidence/tiers/admission.json','utf8'));
if(admission.status!=='passed'||admission.deepIds.length!==400)throw Error('ADMISSION_REQUIRED');
const sources=JSON.parse(await readFile('.local/tier-candidates/source-lock.json','utf8'));
const rows=(await Promise.all(sources.sources.map(async source=>JSON.parse(await readFile(join('.local/tier-candidates',source.data.path),'utf8')).map(row=>({...row,id:source.domain+'/'+row.id,domain:source.domain}))))).flat();
const limits={wallMs:30000,memoryBytes:536870912,computeBudget:200000000000},selected=new Set(admission.deepIds);
const questions=rows.filter(r=>selected.has(r.id)).sort((a,b)=>a.id.localeCompare(b.id)).map(row=>{
 let prompt=row.question,grading,datasetId;
 if(row.domain==='knowledge'){
  prompt+='\n\n'+row.options.map((option,i)=>String.fromCharCode(65+i)+'. '+option).join('\n');
  prompt+='\n\nGive your final answer as a single option letter on the last line, in the form Final answer: A.';
  datasetId='mmlu-pro-selected';grading={kind:'multiple-choice',answer:row.answer,choiceCount:row.options.length};
 }else if(row.domain==='math'){
  prompt+='\n\nGive one exact integer, finite decimal or rational number on the last line, in the form Final answer: -3/2. Do not put an expression or multiple answers on that line.';
  datasetId='olympiad-text-selected';grading={kind:'exact-numeric',answer:row.answer};
 }else if(row.domain==='instructions'){datasetId='ifeval';grading=row.raw;}
 else{datasetId='code-contests-selected';prompt+='\n\nReturn one complete Python 3 program that reads standard input and writes standard output. Use a single code block. Do not include tests.';grading={kind:'stdio',cases:row.cases,limits};}
 return {id:row.id,track:'general',datasetId,sourceId:row.sourceId,sourceHash:row.sourceRecordHash,prompt:[{role:'user',content:prompt}],grading};
});
const legacy=await loadProtocolSet(root),legacyRefs={generalId:legacy.generalId,writingId:legacy.writingId,resourceVersion:legacy.resourceVersion};
const abilityDatasets={'tiny-mmlu':'knowledge','tiny-gsm8k':'math',ifeval:'instructions','humaneval-plus':'coding'};
const abilities=['knowledge','math','instructions','coding'];
function definition(tier,label,items,parentGeneralId){
 const definition={tier,label,domains:abilities.map(id=>({id,weight:.25,itemIds:items.filter(q=>tier==='legacy'?abilityDatasets[q.datasetId]===id:q.id.startsWith(id+'/')).map(q=>q.id)})),...(parentGeneralId?{parentGeneralId}:{})};
 return {...definition,definitionHash:identityHash(definition)};
}
await mkdir(join(root,dir),{recursive:true});
await writeFile(join(root,dir,'questions.json'),JSON.stringify(questions)+'\n');
const files=[];
const additional=[];
for(const [kind,pin] of [['contest',CONTEST_RUNTIME_SHA256],['contest-cache',CONTEST_CACHE_SHA256]]){
 await verifyRuntime(join(root,'runtime',kind),kind,pin);
 const manifest=JSON.parse(await readFile(join(root,'runtime',kind,'runtime.json'),'utf8'));
 additional.push('runtime/'+kind+'/runtime.json',...manifest.files.map(f=>'runtime/'+kind+'/'+f.path));
}
for(const path of [dir+'/questions.json',...JSON.parse(await readFile(root+'/manifest.json','utf8')).files.filter(f=>f.kind==='runtime').map(f=>f.path),...additional]){
 const bytes=await readFile(join(root,path));files.push({path,size:bytes.length,sha256:sha(bytes)});
}
const newRefs=generalId=>({generalId,writingId:legacy.writingId,resourceVersion:'two-tier-v1'}),deepId='general-two-tier-v1-deep',lightId='general-two-tier-v1-light';
const catalog={schemaVersion:1,legacyRefs,bundles:[{id:'two-tier-v1',resourceVersion:'two-tier-v1',files,questionPath:dir+'/questions.json',runtimePassed:false,
 grading:{choice:'last-letter-v1',numeric:'exact-final-number-v1',instructions:'ifeval-rule-adaptation-v1',coding:'all-tests-whitespace-tokens-v1'},runtime:{limits,pins:RUNTIME_PINS,contest:CONTEST_RUNTIME_SHA256,stdlibCache:CONTEST_CACHE_SHA256,mode:'checked-stdlib-bytecode-v1'}}],
 entries:[
 {refs:legacyRefs,general:definition('legacy','旧版基线',legacy.items),questionCount:905,allowNewRuns:true,bundleId:'legacy'},
 {refs:newRefs(lightId),general:definition('light','轻量',questions.filter(q=>admission.lightIds.includes(q.id))),questionCount:120,allowNewRuns:false,bundleId:'two-tier-v1'},
 {refs:newRefs(deepId),general:definition('deep','深入',questions,lightId),questionCount:400,allowNewRuns:false,bundleId:'two-tier-v1'}]};
const bytes=JSON.stringify(catalog,null,2)+'\n';await writeFile(root+'/protocol-registry.json',bytes);
await writeFile('src/resources/catalog-pin.ts',`/** Candidate catalog; runtime release remains disabled until verification. */\nexport const RESOURCE_CATALOG_SHA256 = '${sha(bytes)}';\n`);
console.log(JSON.stringify({questions:questions.length,catalogHash:sha(bytes),runtimePassed:false}));

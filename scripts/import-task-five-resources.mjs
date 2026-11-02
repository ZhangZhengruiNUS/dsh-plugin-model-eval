/** Developer-only import of the frozen, reviewed selection. No sampling or network. */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {assertFrozenCatalog,legacyExecutionBytes} from './support/five-lineage.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2),research=args[args.indexOf('--research')+1];
if(!args.includes('--research')||!research)throw Error('REVIEWED_RESEARCH_PATH_REQUIRED');
const root=resolve(research),reading=join(root,'reading-reselection'),bfcl=join(root,'bfcl-v4');
const dir='suites/task-five-v1',out=join('resources',dir);
async function pinned(path,hash){const b=await readFile(path);if(sha(b)!==hash)throw Error('AUDITED_SOURCE_HASH_MISMATCH: '+basename(path));return JSON.parse(b);}
const manifest=await pinned(join(reading,'formal-suite-manifest.json'),'b3dd923b5e160669cbce3596698c5c59dd1cacd9a1806bd74024c1899edca249');
const rm=await pinned(join(reading,'formal-reading-manifest.json'),manifest.readingManifestSha256);
const oldBytes=await readFile('resources/suites/two-tier-v1/adapted-questions.json');
if(sha(oldBytes)!==manifest.questionFileSha256)throw Error('EXISTING_QUESTIONS_CHANGED');
const old=JSON.parse(oldBytes),catalog=JSON.parse(await readFile('resources/protocol-registry.json','utf8'));
assertFrozenCatalog(catalog,JSON.parse(await readFile('docs/evidence/tiers/adapted-runtime-gate-v4.json','utf8')).catalogSha256);
const execution=await pinned('docs/evidence/tiers/runtime-execution-identities-v4.json','be1d62215b9d175e92e7cb41a62e66087dfb08e8341d98d878232b30ff3f6719');
if(execution.files.length!==22)throw Error('EXECUTION_LINEAGE_INCOMPLETE');
for(const file of execution.files)if(sha(legacyExecutionBytes(file.path,await readFile(file.path)))!==file.sha256)throw Error('EXECUTION_LINEAGE_CHANGED: '+file.path);
const oldBundle=catalog.bundles.find(b=>b.id==='two-tier-v1');
if(oldBundle.files.length!==manifest.resourceFilesVerified)throw Error('OLD_RESOURCE_COUNT_CHANGED');
for(const f of oldBundle.files){const b=await readFile(join('resources',f.path));if(b.length!==f.size||sha(b)!==f.sha256)throw Error('OLD_RESOURCE_HASH_MISMATCH: '+f.path);}
// Match the original Python audit serialization (sorted keys, UTF-8, default separators).
const pythonJson=v=>Array.isArray(v)?'['+v.map(pythonJson).join(', ')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+': '+pythonJson(v[k])).join(', ')+'}':JSON.stringify(v);
const previous=Object.keys(manifest.selectedExistingQuestionHashes).map(id=>{
 const q=old.find(q=>q.id===id);if(!q||sha(pythonJson(q))!==manifest.selectedExistingQuestionHashes[id])throw Error('QUESTION_LINEAGE_MISMATCH: '+id);return q;
});
if(previous.length!==270||Object.keys(manifest.mmluCategories).length!==14)throw Error('FORMAL_QUOTA_MISMATCH');
const rows=JSON.parse(await readFile(join(reading,'formal-reading-questions.json'),'utf8'));
const prompt=r=>'Please read the following text and answer the question below.\n\n<text>\n'+r.context.trim()+'\n</text>\n\nWhat is the correct answer to this question: '+r.question.trim()+'\nChoices:\n'+[...'ABCD'].map(k=>'('+k+') '+r['choice_'+k].trim()).join('\n')+'\n\nFormat your response as follows: "The correct answer is (insert answer here)".\nEnd your response with that answer on its own final line.';
const reads=rm.records.map(m=>{
 const r=rows.find(r=>r._id===m.id);if(!r||r.answer!==m.gold||sha(r.context)!==m.contextSha256||sha(pythonJson(Object.fromEntries(['question','choice_A','choice_B','choice_C','choice_D','answer'].map(k=>[k,r[k]]))))!==m.questionSha256||sha(prompt(r))!==m.promptSha256||!m.rightsBasis.startsWith('publisher dataset Apache-2.0'))throw Error('READING_ADMISSION_MISMATCH: '+m.id);
 return {id:'reading/'+r._id,track:'general',datasetId:'longbench-v2-selected',sourceId:r._id,sourceHash:sha(pythonJson(r)),prompt:[{role:'user',content:prompt(r)}],grading:{kind:'reading-choice',answer:r.answer}};
});
if(reads.length!==50||new Set(rm.records.map(r=>r.contextSha256)).size!==49||rm.records.filter(r=>r.light).length!==10)throw Error('READING_QUOTA_MISMATCH');
const sources=await pinned(join(bfcl,'source-manifest-extended.json'),'50ed743a0d7df11567a5b0cf2e40285449c2291cb8db925eb2312025da7ef165');
if(sources.revision!=='6ea57973c7a6097fd7c5915698c54c17c5b1b6c8')throw Error('BFCL_REVISION_MISMATCH');
const verified=[];
for(const f of sources.manifest){const local=f.path.replace('berkeley-function-call-leaderboard/bfcl_eval/','').replaceAll('/','__');const path=join(bfcl,local);const b=await readFile(path);if(b.length!==f.bytes||sha(b)!==f.sha256)throw Error('BFCL_SOURCE_CHANGED: '+local);verified.push({...f,local});}
const jsonl=async name=>(await readFile(join(bfcl,name),'utf8')).split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
const scenarios=await jsonl('data__BFCL_v4_multi_turn_base.json'),answers=await jsonl('data__possible_answer__BFCL_v4_multi_turn_base.json');
const tools=manifest.deep.tools.map(id=>{
 const scenario=scenarios.find(r=>r.id===id),reference=answers.find(r=>r.id===id);
 if(!scenario||!reference||scenario.involved_classes.includes('MathAPI'))throw Error('TOOL_ADMISSION_MISMATCH: '+id);
 return {id:'tools/'+id,track:'general',datasetId:'bfcl-v4-multi-turn-selected',sourceId:id,sourceHash:sha(pythonJson(scenario)),prompt:scenario.question[0],grading:{kind:'tool-scenario',scenario,reference:reference.ground_truth}};
});
const questions=[...previous,...reads,...tools];
const ids=tier=>Object.entries(manifest[tier]).flatMap(([domain,ids])=>ids.map(id=>domain==='tools'?'tools/'+id:domain==='reading'&&!id.startsWith('reading/')?'reading/'+id:id));
const light=ids('light'),deep=ids('deep');
if(questions.length!==350||new Set(questions.map(q=>q.id)).size!==350||light.length!==100||deep.length!==350||light.some(id=>!deep.includes(id))||deep.some(id=>!questions.some(q=>q.id===id)))throw Error('SUITE_MEMBERSHIP_MISMATCH');
await mkdir(join(out,'bfcl'),{recursive:true});
await writeFile(join(out,'questions.json'),JSON.stringify(questions)+'\n');
await writeFile(join(out,'selection.json'),JSON.stringify({light,deep,reading:rm,weights:manifest.weights,mmluCategories:manifest.mmluCategories},null,2)+'\n');
const newPaths=[dir+'/questions.json',dir+'/selection.json'];
for(const f of verified){await copyFile(join(bfcl,f.local),join(out,'bfcl',f.local));newPaths.push(dir+'/bfcl/'+f.local);}
// Keep source terms and attribution beside the selected text; do not ship the full corpus.
const card=await readFile(join(reading,'dataset-card.md'));
if(sha(card)!=='4bcf87ecfbbb8e07a01b21415a970c8b53a5283bf6872b657040d3f45c9241f7'||!card.toString().includes('license: apache-2.0'))throw Error('DATASET_LICENSE_CHANGED');
await writeFile(join(out,'LongBench-v2-dataset-card.md'),card);newPaths.push(dir+'/LongBench-v2-dataset-card.md');
await copyFile('resources/licenses/IFEval-Apache-2.0.txt',join(out,'LongBench-v2-Apache-2.0.txt'));newPaths.push(dir+'/LongBench-v2-Apache-2.0.txt');
const notice='LongBench v2 selected dataset: zai-org/LongBench-v2, revision ac35867b9c9436dc81c4c7535fe640ba7cf47877, Apache-2.0 dataset declaration. Original text and attribution retained. 50 questions / 49 materials; fixed subset with explicit-final-line adaptation, not official full benchmark scores.\nBFCL v4: ShishirPatil/gorilla, revision '+sources.revision+', Apache-2.0 (repository LICENSE); fixed 30 multi-turn base scenarios. Simulator only; bundled account-like strings are upstream fictional scenario data.\nOther 270 items retain their existing two-tier-v1 source attribution and adapted grading. See resources/licenses and docs/evidence/tiers.\n';
await writeFile(join(out,'NOTICE.txt'),notice);newPaths.push(dir+'/NOTICE.txt');
const files=[];for(const path of newPaths){const b=await readFile(join('resources',path));files.push({path,size:b.length,sha256:sha(b)});}
const bundle={id:'task-five-v1',resourceVersion:'task-five-v1',questionPath:dir+'/questions.json',files:[...files,...oldBundle.files.filter(f=>!f.path.startsWith('suites/'))],runtimePassed:false,
 grading:{...oldBundle.grading,reading:{version:'explicit-final-choice-v1',implementationSha256:sha(await readFile('src/evaluation/reading-answer.ts')),gradeSha256:sha(await readFile('src/evaluation/grade-reading.ts'))},tools:'bfcl-state-and-response-v1'},runtime:{...oldBundle.runtime,tools:{logicalRounds:24,actions:32,mode:'sealed-simulation-v1'}},
 selection:{light,deep},allowNewRuns:false,provenance:{readingRevision:'ac35867b9c9436dc81c4c7535fe640ba7cf47877',bfclRevision:sources.revision,formalManifestSha256:'b3dd923b5e160669cbce3596698c5c59dd1cacd9a1806bd74024c1899edca249'}};
await writeFile(join(out,'bundle.json'),JSON.stringify(bundle,null,2)+'\n');
console.log(JSON.stringify({questions:questions.length,light:light.length,deep:deep.length,files:files.length,allowNewRuns:false}));

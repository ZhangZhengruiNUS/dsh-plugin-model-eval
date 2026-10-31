/** Developer verification. No host model, no network, no arbitrary native solution execution. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
// tsx is a build-time dependency, never used by the installed plugin.
const {register}=await import('tsx/esm/api');register();
const {createContestRunner}=await import('../src/runtime/contest-runner.ts');
const {numericAnswerMatches}=await import('../src/evaluation/numeric-answer.ts');
const {extractFinalLetter}=await import('../src/evaluation/grade-general.ts');
const {createRuleGrader}=await import('../src/runtime/rule-grader.ts');
const {identityHash}=await import('../src/evaluation/protocol-identity.ts');
const args=process.argv.slice(2),reportPath=args[args.indexOf('--report')+1];
if(!args.includes('--report')||!reportPath)throw Error('Usage: verify-tier-runtime.mjs --report <json> [--coding-only] [--ids 0,1]');
const selectedIds=args.includes('--ids')?new Set(args[args.indexOf('--ids')+1].split(',').map(Number)):undefined;
const codingOnly=args.includes('--coding-only'),runtimeRoot=resolve('resources/runtime'),runner=createContestRunner(runtimeRoot),rules=createRuleGrader(join(runtimeRoot,'rules'));
const questions=JSON.parse(await readFile('resources/suites/two-tier-v1/questions.json','utf8'));
const rows=JSON.parse(await readFile('.local/tier-candidates/sources/code-contests-test.json','utf8'));
const codeMap=new Map(rows.map(r=>[r.sourceId,r]));
const report={schemaVersion:1,status:'pending',scope:'local reference verification, no models or calibration',limits:{wallMs:30000,memoryBytes:536870912,computeBudget:200000000000},catalogHash:identityHash(JSON.parse(await readFile('resources/protocol-registry.json','utf8'))),items:[],counts:{passed:0,failed:0,pending:0},legacyChecks:'not-run',startedAt:new Date().toISOString()};
async function save(){await mkdir(dirname(resolve(reportPath)),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');}
// Diagnostic subsets can investigate failures; none can override the release gate.
if(!args.includes('--diagnostic')){
 let quality;try{quality=JSON.parse(await readFile('docs/evidence/tiers/coding-quality-gate.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(quality?.status==='failed'){
  report.status='failed';report.releaseAllowed=false;report.qualityGate={code:'UPSTREAM_INCORRECT_PROGRAM_ACCEPTED',report:'docs/evidence/tiers/coding-quality-gate.json',evidenceHash:identityHash(quality)};
  report.remainingGates=['Protocol amendment required. Existing fixed tests accept a proven incorrect program. No release or benchmark modification.'];
  report.endedAt=new Date().toISOString();await save();process.stdout.write(JSON.stringify({status:report.status,releaseAllowed:false,qualityGate:report.qualityGate})+'\n');process.exit(1);
 }
}
for(const question of questions){
 const raw=question.grading;
 if(codingOnly&&question.datasetId!=='code-contests-selected')continue;
 if(selectedIds&&(question.datasetId!=='code-contests-selected'||!selectedIds.has(Number(question.sourceId))))continue;
 const evidence={id:question.id,status:'pending',inputBytes:Buffer.byteLength(JSON.stringify(question.prompt)),attempts:[]};
 if(question.datasetId==='mmlu-pro-selected'){
  evidence.status=extractFinalLetter('Final answer: '+raw.answer)===raw.answer&&extractFinalLetter('Final answer: not a letter')===undefined?'passed':'failed';
 }else if(question.datasetId==='olympiad-text-selected'){
  evidence.status=numericAnswerMatches('Final answer: '+raw.answer,raw.answer)&&!numericAnswerMatches('Final answer: 1/0',raw.answer)?'passed':'failed';
 }else if(question.datasetId==='ifeval'){
  // Known source responses are sampled evidence, not canonical perfect answers.
  const result=await rules.gradeRules({...raw,itemId:question.id,answer:''},new AbortController().signal);
  evidence.status=result.kind==='scored'?'passed':'failed';evidence.scope='rule execution sanity, not a correct-answer reference';
 }else{
  const references=codeMap.get(question.sourceId)?.raw.python3_references??[];
  evidence.testCount=raw.cases.length;evidence.testBytes=Buffer.byteLength(JSON.stringify(raw.cases));
  if(!references.length){evidence.reason='TRUSTED_REFERENCE_PENDING';}
  for(let index=0;index<references.length;index++){
   const result=await runner.runContest({id:question.id,cases:raw.cases,limits:raw.limits},references[index],new AbortController().signal);
   evidence.attempts.push({referenceIndex:index,referenceHash:identityHash(references[index]),outcome:result});
   if(result.kind==='passed'){evidence.status='passed';break;}
   evidence.status='failed';
  }
 }
 report.items.push(evidence);report.counts[evidence.status]++;
 await save();process.stdout.write(JSON.stringify({id:question.id,status:evidence.status,reason:evidence.reason,last:evidence.attempts.at(-1)?.outcome})+'\n');
}
report.endedAt=new Date().toISOString();report.status=report.counts.failed?'failed':'pending';
report.releaseAllowed=false;
report.remainingGates=['All selected correct references must pass; missing references are not valid passes.','Legacy 164-code and 541-rule checks must pass.','Full dataset attribution and package verification required.'];
await save();process.stdout.write(JSON.stringify({status:report.status,counts:report.counts,releaseAllowed:false})+'\n');process.exitCode=report.status==='failed'?1:2;

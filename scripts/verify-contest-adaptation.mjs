/** Developer WASI verification. Partial evidence can never release the staged suite. */
import {register} from 'tsx/esm/api';register();
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {identityHash} from '../src/evaluation/protocol-identity.ts';
import {createContestRunner} from '../src/runtime/contest-runner.ts';
import {CONTEST_RUNTIME_SHA256} from '../src/runtime/contest-pin.ts';
import {CONTEST_CACHE_SHA256} from '../src/runtime/contest-cache-pin.ts';
import {CONTEST_SCORING_LIMITS,CONTEST_BUDGET_VERSION} from '../src/evaluation/contest-budget.ts';
import {adaptContest} from './support/contest-adaptation.ts';
import {classifyUpstreamReferences} from './support/reference-classification.ts';
import {logicGapBinding,selectLogicCoverage,assertKnownLogicInventory} from './support/logic-coverage.ts';
import {referenceVerdict} from './support/reference-verdict.ts';
import {assertArtifactDestination,writeArtifact} from './support/adaptation-artifacts.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2),arg=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
const auditPath=arg('--audit'),stagingPath=arg('--staging'),reportPath=arg('--report');
if(!auditPath||!stagingPath||!reportPath)throw Error('Usage: verify-contest-adaptation.mjs --audit <input-audit.json> --staging <staged.json> --report <runtime.json> [--ids 0,8,19,91]');
await assertArtifactDestination(reportPath,'runtime',[auditPath,stagingPath]);
const audit=JSON.parse(await readFile(auditPath,'utf8')),staged=JSON.parse(await readFile(stagingPath,'utf8'));
if(identityHash(staged)!==audit.stagingHash)throw Error('ADAPTATION_STAGING_MISMATCH');
if(staged.budgetVersion!==CONTEST_BUDGET_VERSION||audit.budgetVersion!==CONTEST_BUDGET_VERSION||identityHash(staged.limits)!==identityHash(CONTEST_SCORING_LIMITS)||identityHash(audit.limits)!==identityHash(CONTEST_SCORING_LIMITS))throw Error('ADAPTATION_BUDGET_MISMATCH');
const sourceBytes=await readFile('.local/tier-candidates/sources/code-contests-test.json');
if(staged.validatorSha256!==sha(await readFile('scripts/support/contest-adaptation.ts'))||staged.source.sourceDataSha256!==sha(sourceBytes)||staged.source.frozenQuestionsSha256!==sha(await readFile('resources/suites/two-tier-v1/questions.json')))throw Error('ADAPTATION_SOURCE_OR_VALIDATOR_CHANGED');
const ids=arg('--ids')?.split(','),selected=ids?new Set(ids):undefined;
if(ids&&(new Set(ids).size!==ids.length||ids.some(id=>!staged.questions.some(q=>q.sourceId===id))))throw Error('UNKNOWN_OR_DUPLICATE_SOURCE_ID');
const rows=JSON.parse(sourceBytes),negativeBytes=await readFile('.local/tier-candidates/artifacts/negative-references.json'),negatives=JSON.parse(negativeBytes);
const catalogBytes=await readFile('scripts/references/catalog.json'),catalog=JSON.parse(catalogBytes);
if(catalog.schemaVersion!==1||sha(negativeBytes)!==catalog.negativeReferencesSha256)throw Error('NEGATIVE_REFERENCE_INVENTORY_CHANGED');
if(catalog.references.length!==39||new Set(catalog.references.map(r=>r.sourceId)).size!==39)throw Error('INDEPENDENT_REFERENCE_CATALOG_CHANGED');
// Resolve and hash every trusted witness before running even a diagnostic subset.
const portPrograms=new Map();
for(const entry of catalog.references){
 if(!/^scripts\/references\/[a-z0-9-]+\.py$/.test(entry.file)||rows.find(r=>r.sourceId===entry.sourceId)?.sourceRecordHash!==entry.sourceRecordHash)throw Error('INDEPENDENT_REFERENCE_SOURCE_CHANGED');
 const bytes=await readFile(entry.file);if(sha(bytes)!==entry.codeSha256)throw Error('INDEPENDENT_REFERENCE_CODE_CHANGED');
 portPrograms.set(entry.sourceId,{code:bytes.toString('utf8'),referenceIndex:0,origin:'independent-reference',proof:entry.oracleTest,codeSha256:entry.codeSha256});
}
const lock=JSON.parse(await readFile('.local/tier-candidates/source-lock.json','utf8'));
if(lock.sources.find(s=>s.id==='code-contests-test')?.data.sha256!==sha(sourceBytes))throw Error('SOURCE_LOCK_MISMATCH');
const frozen=JSON.parse(await readFile('resources/suites/two-tier-v1/questions.json','utf8')).filter(q=>q.datasetId==='code-contests-selected');
if(staged.releaseAllowed!==false||staged.questions.length!==100||audit.items.length!==100||new Set(staged.questions.map(q=>q.id)).size!==100||new Set(audit.items.map(i=>i.id)).size!==100)throw Error('ADAPTATION_AUDIT_MISMATCH');
// Validate the entire audit, even when execution is restricted to a diagnostic subset.
for(const question of staged.questions){
 const source=rows.find(r=>r.sourceId===question.sourceId),original=frozen.find(q=>q.id===question.id);
 if(!source||!original||source.sourceRecordHash!==original.sourceHash||identityHash(original.grading.cases)!==identityHash(source.cases))throw Error('ADAPTATION_AUDIT_MISMATCH');
 const {cases,...evidence}=adaptContest(source);
 const expectedAudit={...evidence,id:question.id,name:source.raw.name,referenceCount:source.raw.python3_references.length};
 const expectedQuestion={...original,grading:{...original.grading,cases,limits:CONTEST_SCORING_LIMITS},adaptation:{version:evidence.policy,originalHash:evidence.originalHash,adaptedHash:evidence.adaptedHash}};
 if(identityHash(audit.items.find(i=>i.id===question.id))!==identityHash(expectedAudit)||identityHash(question)!==identityHash(expectedQuestion))throw Error('ADAPTATION_AUDIT_MISMATCH');
}
const limits=CONTEST_SCORING_LIMITS;
const runner=createContestRunner(resolve('resources/runtime'));
const independent={
 '8':{sourceHash:'ed406a029ff7dbbb517d44afcddafbc0b296ef569d567aa5b18c8b9161f6630e',negative:'scripts/references/desert-ignore-update-incorrect.py',negativeProof:'Published legal example requires39,32,0; ignoring the update gives39,39,0.'},
 '91':{sourceHash:'a555cf838fd7d50b2cd85a2ad7fc26ae457c78fa016069b73a040a78df480539',negative:'scripts/references/extreme-whole-array-incorrect.py',negativeProof:'Published legal array[5,4,3] has total5; whole-array-only extreme is3.'}
};
const report={schemaVersion:1,status:'pending',releaseAllowed:false,scope:'Reference execution on audited staged inputs only; incomplete suite remains disabled.',
 startedAt:new Date().toISOString(),stagingHash:audit.stagingHash,validatorSha256:staged.validatorSha256,contestRuntimeManifest:CONTEST_RUNTIME_SHA256,stdlibCacheManifest:CONTEST_CACHE_SHA256,
 negativeReferencesSha256:sha(negativeBytes),referenceCatalogSha256:sha(catalogBytes),verifierSha256:sha(await readFile('scripts/verify-contest-adaptation.mjs')),contestHostRunnerSha256:sha(await readFile('src/runtime/contest-runner.ts')),logicCoveragePolicySha256:sha(await readFile('scripts/support/known-logic-gaps.ts')),
 referenceVerdictSha256:sha(await readFile('scripts/support/reference-verdict.ts')),logicCoverageImplementationSha256:sha(await readFile('scripts/support/logic-coverage.ts')),referenceClassificationSha256:sha(await readFile('scripts/support/reference-classification.ts')),
 budgetVersion:CONTEST_BUDGET_VERSION,limits,selectedIds:ids??null,items:[],counts:{passed:0,failed:0,pending:0},remainingGates:audit.remainingGates};
async function save(){await writeArtifact(reportPath,'runtime',report,[auditPath,stagingPath]);}
for(const question of staged.questions){
 if(selected&&!selected.has(question.sourceId))continue;
 const inputAudit=audit.items.find(item=>item.id===question.id),source=rows.find(row=>row.sourceId===question.sourceId),negative=negatives.find(row=>String(row.index)===question.sourceId);
 if(!source||inputAudit?.sourceRecordHash!==source.sourceRecordHash||question.sourceHash!==source.sourceRecordHash||inputAudit.adaptedHash!==identityHash(question.grading.cases)||identityHash(question.grading.limits)!==identityHash(limits))throw Error('REFERENCE_REQUEST_MISMATCH');
 if(negative&&negative._source_record_sha256!==source.sourceRecordHash)throw Error('NEGATIVE_SOURCE_MISMATCH');
 const evidence={id:question.id,sourceId:question.sourceId,status:'pending',inputAudit:inputAudit.status,testCount:question.grading.cases.length,testBytes:Buffer.byteLength(JSON.stringify(question.grading.cases)),adaptedHash:inputAudit.adaptedHash,positives:[],negatives:[]};
 const run=code=>runner.runContest({id:question.id,cases:question.grading.cases,limits},code,new AbortController().signal);
 const local=independent[question.sourceId];if(local&&local.sourceHash!==source.sourceRecordHash)throw Error('INDEPENDENT_REFERENCE_SOURCE_CHANGED');
 const {positivePrograms,negativePrograms,corrected}=classifyUpstreamReferences(source,negative?.incorrectPython3??[]);
 evidence.referenceClassifications=corrected;
 if(portPrograms.has(question.sourceId))positivePrograms.unshift(portPrograms.get(question.sourceId));
 if(local?.negative)negativePrograms.push({code:await readFile(local.negative,'utf8'),referenceIndex:0,origin:'independent-known-logic-error',proof:local.negativeProof});
 assertKnownLogicInventory(source.sourceId,source.sourceRecordHash,negativePrograms.map(p=>identityHash(p.code)),question.grading.cases);
 evidence.availableNegativeCount=negativePrograms.length;
 evidence.negativeCoverage=negativePrograms.length?'all-available-known-errors':'no-upstream-python3-negative-available';
 if(inputAudit.status!=='audited')evidence.reason='INPUT_AUDIT_PENDING';
 else if(!positivePrograms.length)evidence.reason='TRUSTED_REFERENCE_PENDING';
 else{
   for(const {code,...provenance} of positivePrograms.filter(p=>!p.required)){
     const outcome=await run(code);evidence.positives.push({...provenance,codeHash:identityHash(code),outcome});
     if(outcome.kind==='passed')break;
   }
   for(const {code,...provenance} of positivePrograms.filter(p=>p.required)){
     const outcome=await run(code);evidence.positives.push({...provenance,codeHash:identityHash(code),outcome});
   }
   for(const {code,...provenance} of negativePrograms){
     const codeHash=identityHash(code),binding=logicGapBinding(source.sourceId,source.sourceRecordHash,codeHash);
     const outcome=await run(code);
     const entry={...provenance,codeHash,outcome};
     if(binding){
       const coverageCases=selectLogicCoverage(question.grading.cases,binding.oracleCaseHashes);
       entry.logicGap=binding;entry.coverageCasesHash=identityHash(coverageCases);
       entry.coverageOutcome=await runner.runContest({id:question.id+'/coverage',cases:coverageCases,limits},code,new AbortController().signal);
     }
     evidence.negatives.push(entry);
   }
   Object.assign(evidence,referenceVerdict(evidence.positives,evidence.negatives));
 }
 report.items.push(evidence);report.counts[evidence.status]++;await save();
 process.stdout.write(JSON.stringify({id:question.id,status:evidence.status,reason:evidence.reason,positives:evidence.positives.length,negatives:evidence.negatives.length})+'\n');
}
report.endedAt=new Date().toISOString();report.status=report.counts.failed?'failed':'pending';
await save();process.stdout.write(JSON.stringify({status:report.status,counts:report.counts,releaseAllowed:false})+'\n');process.exitCode=report.counts.failed?1:2;

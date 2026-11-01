/** Developer WASI verification. Partial evidence can never release the staged suite. */
import {register} from 'tsx/esm/api';register();
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {identityHash} from '../src/evaluation/protocol-identity.ts';
import {createContestRunner} from '../src/runtime/contest-runner.ts';
import {CONTEST_RUNTIME_SHA256} from '../src/runtime/contest-pin.ts';
import {adaptContest} from './support/contest-adaptation.ts';
import {assertArtifactDestination,writeArtifact} from './support/adaptation-artifacts.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2),arg=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
const auditPath=arg('--audit'),stagingPath=arg('--staging'),reportPath=arg('--report');
if(!auditPath||!stagingPath||!reportPath)throw Error('Usage: verify-contest-adaptation.mjs --audit <input-audit.json> --staging <staged.json> --report <runtime.json> [--ids 0,8,19,91]');
await assertArtifactDestination(reportPath,'runtime',[auditPath,stagingPath]);
const audit=JSON.parse(await readFile(auditPath,'utf8')),staged=JSON.parse(await readFile(stagingPath,'utf8'));
if(identityHash(staged)!==audit.stagingHash)throw Error('ADAPTATION_STAGING_MISMATCH');
const sourceBytes=await readFile('.local/tier-candidates/sources/code-contests-test.json');
if(staged.validatorSha256!==sha(await readFile('scripts/support/contest-adaptation.ts'))||staged.source.sourceDataSha256!==sha(sourceBytes)||staged.source.frozenQuestionsSha256!==sha(await readFile('resources/suites/two-tier-v1/questions.json')))throw Error('ADAPTATION_SOURCE_OR_VALIDATOR_CHANGED');
const ids=arg('--ids')?.split(','),selected=ids?new Set(ids):undefined;
if(ids&&(new Set(ids).size!==ids.length||ids.some(id=>!staged.questions.some(q=>q.sourceId===id))))throw Error('UNKNOWN_OR_DUPLICATE_SOURCE_ID');
const rows=JSON.parse(sourceBytes),negatives=JSON.parse(await readFile('.local/tier-candidates/artifacts/negative-references.json','utf8'));
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
 const expectedQuestion={...original,grading:{...original.grading,cases},adaptation:{version:evidence.policy,originalHash:evidence.originalHash,adaptedHash:evidence.adaptedHash}};
 if(identityHash(audit.items.find(i=>i.id===question.id))!==identityHash(expectedAudit)||identityHash(question)!==identityHash(expectedQuestion))throw Error('ADAPTATION_AUDIT_MISMATCH');
}
const limits={wallMs:30000,memoryBytes:536870912,computeBudget:200000000000};
const runner=createContestRunner(resolve('resources/runtime'));
const independent={
 '8':{sourceHash:'ed406a029ff7dbbb517d44afcddafbc0b296ef569d567aa5b18c8b9161f6630e',negative:'scripts/references/desert-ignore-update-incorrect.py',negativeProof:'Published legal example requires39,32,0; ignoring the update gives39,39,0.'},
 '91':{sourceHash:'a555cf838fd7d50b2cd85a2ad7fc26ae457c78fa016069b73a040a78df480539',positive:'scripts/references/extreme-extension.py',positiveProof:'Greedy balanced-split invariant, independently checked against every positive composition for84 small arrays and retained tests; tests/integration/extreme-reference.test.ts.',negative:'scripts/references/extreme-whole-array-incorrect.py',negativeProof:'Published legal array[5,4,3] has total5; whole-array-only extreme is3.'}
};
const report={schemaVersion:1,status:'pending',releaseAllowed:false,scope:'Reference execution on audited staged inputs only; incomplete suite remains disabled.',
 startedAt:new Date().toISOString(),stagingHash:audit.stagingHash,validatorSha256:staged.validatorSha256,contestRuntimeManifest:CONTEST_RUNTIME_SHA256,
 limits,selectedIds:ids??null,items:[],counts:{passed:0,failed:0,pending:0},remainingGates:audit.remainingGates};
async function save(){await writeArtifact(reportPath,'runtime',report,[auditPath,stagingPath]);}
for(const question of staged.questions){
 if(selected&&!selected.has(question.sourceId))continue;
 const inputAudit=audit.items.find(item=>item.id===question.id),source=rows.find(row=>row.sourceId===question.sourceId),negative=negatives.find(row=>String(row.index)===question.sourceId);
 if(!source||inputAudit?.sourceRecordHash!==source.sourceRecordHash||question.sourceHash!==source.sourceRecordHash||inputAudit.adaptedHash!==identityHash(question.grading.cases)||identityHash(question.grading.limits)!==identityHash(limits))throw Error('REFERENCE_REQUEST_MISMATCH');
 if(negative&&negative._source_record_sha256!==source.sourceRecordHash)throw Error('NEGATIVE_SOURCE_MISMATCH');
 const evidence={id:question.id,sourceId:question.sourceId,status:'pending',inputAudit:inputAudit.status,testCount:question.grading.cases.length,testBytes:Buffer.byteLength(JSON.stringify(question.grading.cases)),adaptedHash:inputAudit.adaptedHash,positives:[],negatives:[]};
 const run=code=>runner.runContest({id:question.id,cases:question.grading.cases,limits},code,new AbortController().signal);
 const local=independent[question.sourceId];if(local&&local.sourceHash!==source.sourceRecordHash)throw Error('INDEPENDENT_REFERENCE_SOURCE_CHANGED');
 const positivePrograms=source.raw.python3_references.map((code,referenceIndex)=>({code,referenceIndex,origin:'upstream-python3'}));
 const negativePrograms=(negative?.incorrectPython3??[]).map((code,referenceIndex)=>({code,referenceIndex,origin:'upstream-incorrect-python3'}));
 if(local?.positive)positivePrograms.push({code:await readFile(local.positive,'utf8'),referenceIndex:0,origin:'independent-reference',proof:local.positiveProof});
 if(local?.negative)negativePrograms.push({code:await readFile(local.negative,'utf8'),referenceIndex:0,origin:'independent-known-logic-error',proof:local.negativeProof});
 if(inputAudit.status!=='audited')evidence.reason='INPUT_AUDIT_PENDING';
 else if(!positivePrograms.length)evidence.reason='TRUSTED_REFERENCE_PENDING';
 else{
   for(const {code,...provenance} of positivePrograms){
     const outcome=await run(code);evidence.positives.push({...provenance,codeHash:identityHash(code),outcome});
     if(outcome.kind==='passed')break;
   }
   const positive=evidence.positives.some(p=>p.outcome.kind==='passed');
   for(const {code,...provenance} of negativePrograms){
     const outcome=await run(code);evidence.negatives.push({...provenance,codeHash:identityHash(code),outcome});
   }
   if(!positive){evidence.status='failed';evidence.reason='CORRECT_REFERENCE_NOT_PASSED';}
   else if(evidence.negatives.some(n=>n.outcome.kind!=='failed')){evidence.status='failed';evidence.reason='INCORRECT_REFERENCE_NOT_REJECTED';}
   else if(!evidence.negatives.length)evidence.reason='NEGATIVE_REFERENCE_PENDING';
   else evidence.status='passed';
 }
 report.items.push(evidence);report.counts[evidence.status]++;await save();
 process.stdout.write(JSON.stringify({id:question.id,status:evidence.status,reason:evidence.reason,positives:evidence.positives.length,negatives:evidence.negatives.length})+'\n');
}
report.endedAt=new Date().toISOString();report.status=report.counts.failed?'failed':'pending';
await save();process.stdout.write(JSON.stringify({status:report.status,counts:report.counts,releaseAllowed:false})+'\n');process.exitCode=report.counts.failed?1:2;

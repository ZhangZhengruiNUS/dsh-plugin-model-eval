/** Development-only: immutable upstream -> auditable staging, never release/installation. */
import {register} from 'tsx/esm/api';register();
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {adaptContest,ADAPTATION_VERSION,REVIEWED_SOURCE_HASHES} from './support/contest-adaptation.ts';
import {identityHash} from '../src/evaluation/protocol-identity.ts';
import {assertArtifactDestination,writeArtifact} from './support/adaptation-artifacts.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2),arg=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
const reportPath=arg('--report'),outPath=arg('--out');
if(!reportPath||!outPath||resolve(reportPath)===resolve(outPath))throw Error('Usage: audit-contest-adaptation.mjs --report <new-report.json> --out <development-staging.json>');
await assertArtifactDestination(reportPath,'audit',[outPath]);await assertArtifactDestination(outPath,'staging',[reportPath]);
const sourceRoot='.local/tier-candidates';
const lock=JSON.parse(await readFile(join(sourceRoot,'source-lock.json'),'utf8'));
const entry=lock.sources.find(s=>s.id==='code-contests-test');
if(entry?.revision!=='802411c3010cb00d1b05bad57ca77365a3c699d6')throw Error('SOURCE_REVISION_MISMATCH');
const sourceBytes=await readFile(join(sourceRoot,entry.data.path));if(sha(sourceBytes)!==entry.data.sha256)throw Error('SOURCE_LOCK_MISMATCH');
const rows=JSON.parse(sourceBytes),admission=JSON.parse(await readFile('docs/evidence/tiers/admission.json','utf8'));
if(admission.status!=='passed'||admission.domains.coding.deepIds.length!==100)throw Error('FROZEN_SELECTION_REQUIRED');
const questionBytes=await readFile('resources/suites/two-tier-v1/questions.json');
const questions=JSON.parse(questionBytes).filter(q=>q.datasetId==='code-contests-selected');
if(questions.length!==100||new Set(questions.map(q=>q.id)).size!==100||questions.some(q=>!admission.domains.coding.deepIds.includes(q.id)))throw Error('FROZEN_SELECTION_MISMATCH');
// A validator is approved only for the exact statement whose contract was read.
const reviewed=REVIEWED_SOURCE_HASHES;
const report={schemaVersion:1,policy:ADAPTATION_VERSION,status:'pending',releaseAllowed:false,
 scope:'Input legality and fixed independent oracle staging only; not all-reference validation, model calibration or release.',
 source:{revision:entry.revision,sourceDataSha256:sha(sourceBytes),frozenQuestionsSha256:sha(questionBytes),originalQualityEvidenceSha256:sha(await readFile('docs/evidence/tiers/coding-quality-gate.json'))},
 validatorSha256:sha(await readFile('scripts/support/contest-adaptation.ts')),items:[],counts:{selected:questions.length,inputAudited:0,inputPending:0,missingReferences:0,excluded:0,added:0},remainingGates:[]};
const adapted=[];
for(const question of questions){
 const source=rows.find(r=>r.sourceId===question.sourceId);
 if(!source||source.sourceRecordHash!==question.sourceHash||identityHash(question.grading.cases)!==identityHash(source.cases))throw Error('FROZEN_SOURCE_MISMATCH:'+question.id);
 if(reviewed[source.sourceId]&&reviewed[source.sourceId]!==source.sourceRecordHash)throw Error('VALIDATOR_STATEMENT_CHANGED:'+source.sourceId);
 const audit=adaptContest(source),{cases,...evidence}=audit;
 const referenceCount=source.raw.python3_references.length;
 report.items.push({...evidence,id:question.id,name:source.raw.name,referenceCount});
 report.counts[audit.status==='audited'?'inputAudited':'inputPending']++;
 report.counts.missingReferences+=referenceCount===0?1:0;
 report.counts.excluded+=audit.excluded.length;report.counts.added+=audit.added.length;
 adapted.push({...question,grading:{...question.grading,cases},adaptation:{version:ADAPTATION_VERSION,originalHash:audit.originalHash,adaptedHash:audit.adaptedHash}});
}
report.remainingGates=['Complete statement-specific input audits for all selected questions.','All100 correct references and known incorrect/invalid outputs must satisfy the unchanged runtime limits.','Full400 reference paths, legacy164/541 selfchecks, attribution, compatibility hashes and package validation.'];
const staged={schemaVersion:1,releaseAllowed:false,policy:ADAPTATION_VERSION,validatorSha256:report.validatorSha256,source:report.source,questions:adapted};
report.stagingHash=identityHash(staged);
await writeArtifact(outPath,'staging',staged,[reportPath]);await writeArtifact(reportPath,'audit',report,[outPath]);
process.stdout.write(JSON.stringify({status:report.status,releaseAllowed:false,counts:report.counts,stagingHash:report.stagingHash})+'\n');
process.exitCode=2;

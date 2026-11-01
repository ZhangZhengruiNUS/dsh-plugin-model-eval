/** Developer-only admission finalizer. Default is read-only; --write freezes verified resources. */
import {register} from 'tsx/esm/api';register();
import {readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {identityHash} from '../src/evaluation/protocol-identity.ts';
import {CONTEST_SCORING_LIMITS,CONTEST_BUDGET_VERSION} from '../src/evaluation/contest-budget.ts';
import {CONTEST_RUNTIME_SHA256} from '../src/runtime/contest-pin.ts';
import {CONTEST_CACHE_SHA256} from '../src/runtime/contest-cache-pin.ts';
import {RUNTIME_PINS} from '../src/runtime/pins.ts';
import {readProtocolCatalog,verifyBundle} from '../src/resources/catalog.ts';
import {adaptContest} from './support/contest-adaptation.ts';
import {classifyUpstreamReferences} from './support/reference-classification.ts';
import {assertKnownLogicInventory,logicGapBinding,selectLogicCoverage} from './support/logic-coverage.ts';
import {assertCompleteRuntimeGate} from './support/tier-runtime-gate.ts';
import {assertExecutionIdentities,REQUIRED_EXECUTION_FILES} from './support/execution-identities.ts';
import {EXECUTION_SNAPSHOT_SHA256} from './support/execution-snapshot-pin.ts';
import {commitFileSet,recoverFileSet} from './support/file-set-transaction.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2),arg=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const transactionPath=resolve('.local/contest-adaptation/finalize-v4-transaction.json');
const destinations=['resources/suites/two-tier-v1/adapted-questions.json','resources/protocol-registry.json','src/resources/catalog-pin.ts','docs/evidence/tiers/adapted-runtime-gate-v4.json'].map(path=>resolve(path));
let pendingTransaction=false;try{await lstat(transactionPath);pendingTransaction=true;}catch(error){if(error.code!=='ENOENT')throw error;}
if(pendingTransaction){if(!args.includes('--write'))throw Error('FINALIZATION_RECOVERY_REQUIRED');await recoverFileSet(resolve('.'),transactionPath,destinations);}
const snapshotBytes=await readFile('docs/evidence/tiers/runtime-execution-identities-v4.json');
if(sha(snapshotBytes)!==EXECUTION_SNAPSHOT_SHA256)throw Error('EXECUTION_SNAPSHOT_CHANGED');
const executionSnapshot=JSON.parse(snapshotBytes),executionFiles={};for(const path of REQUIRED_EXECUTION_FILES)executionFiles[path]=sha(await readFile(path));
assertExecutionIdentities(executionSnapshot,executionFiles);
const paths={audit:arg('--audit','docs/evidence/tiers/coding-adaptation-audit-v4.json'),staged:arg('--staging','.local/contest-adaptation/staging-v4.json'),runtime:arg('--runtime','docs/evidence/tiers/coding-adaptation-runtime-v4.json'),noncoding:arg('--noncoding','docs/evidence/tiers/noncoding-runtime-v3.json'),legacy:arg('--legacy','docs/evidence/tiers/legacy-runtime-regression-v3.json')};
const data={},evidenceHashes={executionSnapshot:sha(snapshotBytes)};for(const [key,path] of Object.entries(paths)){const bytes=await readFile(path);data[key]=JSON.parse(bytes);evidenceHashes[key]=sha(bytes);}
const {audit,staged,runtime,noncoding,legacy}=data;
if(legacy.platform!==process.platform||legacy.arch!==process.arch||legacy.node!==process.version)throw Error('GATE_HOST_CHANGED');
const originalBytes=await readFile('resources/suites/two-tier-v1/questions.json'),original=JSON.parse(originalBytes),other=original.filter(q=>q.datasetId!=='code-contests-selected');
assertCompleteRuntimeGate({...data,noncodingIds:other.map(q=>q.id)});
if(audit.budgetVersion!==CONTEST_BUDGET_VERSION||staged.budgetVersion!==CONTEST_BUDGET_VERSION||runtime.budgetVersion!==CONTEST_BUDGET_VERSION||sha(originalBytes)!==audit.source.frozenQuestionsSha256||runtime.validatorSha256!==sha(await readFile('scripts/support/contest-adaptation.ts'))||staged.validatorSha256!==runtime.validatorSha256)throw Error('GATE_PROVENANCE_MISMATCH');
for(const [field,file] of [['verifierSha256','scripts/verify-contest-adaptation.mjs'],['contestHostRunnerSha256','src/runtime/contest-runner.ts'],['logicCoveragePolicySha256','scripts/support/known-logic-gaps.ts'],['referenceVerdictSha256','scripts/support/reference-verdict.ts'],['logicCoverageImplementationSha256','scripts/support/logic-coverage.ts'],['referenceClassificationSha256','scripts/support/reference-classification.ts'],['referenceCatalogSha256','scripts/references/catalog.json']])if(runtime[field]!==sha(await readFile(file)))throw Error('GATE_IMPLEMENTATION_CHANGED:'+field);
if(runtime.contestRuntimeManifest!==CONTEST_RUNTIME_SHA256||runtime.stdlibCacheManifest!==CONTEST_CACHE_SHA256||identityHash(legacy.runtimePins)!==identityHash(RUNTIME_PINS)||legacy.sourceReleaseSha256!==JSON.parse(await readFile('resources/protocols/humaneval-plus.json','utf8')).releaseSha256)throw Error('GATE_RUNTIME_CHANGED');
const sourceBytes=await readFile('.local/tier-candidates/sources/code-contests-test.json'),rows=JSON.parse(sourceBytes),negativeBytes=await readFile('.local/tier-candidates/artifacts/negative-references.json'),negatives=JSON.parse(negativeBytes),ports=JSON.parse(await readFile('scripts/references/catalog.json','utf8'));
if(sha(sourceBytes)!==audit.source.sourceDataSha256||runtime.negativeReferencesSha256!==sha(negativeBytes)||ports.negativeReferencesSha256!==sha(negativeBytes))throw Error('GATE_SOURCE_CHANGED');
for(const question of staged.questions){
 const source=rows.find(r=>r.sourceId===question.sourceId),base=original.find(q=>q.id===question.id),item=runtime.items.find(x=>x.id===question.id),adapted=adaptContest(source);
 if(adapted.status!=='audited'||item.inputAudit!=='audited'||audit.items.find(x=>x.id===question.id)?.status!=='audited')throw Error('GATE_INPUT_AUDIT_INCOMPLETE');
 const expected={...base,grading:{...base.grading,cases:adapted.cases,limits:CONTEST_SCORING_LIMITS},adaptation:{version:adapted.policy,originalHash:adapted.originalHash,adaptedHash:adapted.adaptedHash}};
 if(identityHash(expected)!==identityHash(question)||item.adaptedHash!==adapted.adaptedHash||item.testCount!==adapted.cases.length)throw Error('GATE_CANONICAL_CHANGED');
 const classification=classifyUpstreamReferences(source,negatives.find(n=>String(n.index)===source.sourceId)?.incorrectPython3??[]);
 const expectedNegatives=classification.negativePrograms.map(p=>identityHash(p.code));
 if(source.sourceId==='8')expectedNegatives.push(identityHash(await readFile('scripts/references/desert-ignore-update-incorrect.py','utf8')));
 if(source.sourceId==='91')expectedNegatives.push(identityHash(await readFile('scripts/references/extreme-whole-array-incorrect.py','utf8')));
 if(identityHash([...expectedNegatives].sort())!==identityHash(item.negatives.map(n=>n.codeHash).sort()))throw Error('GATE_KNOWN_ERRORS_CHANGED');
 assertKnownLogicInventory(source.sourceId,source.sourceRecordHash,expectedNegatives,question.grading.cases);
 for(const entry of item.negatives){const binding=logicGapBinding(source.sourceId,source.sourceRecordHash,entry.codeHash);if(binding&&(identityHash(entry.logicGap)!==identityHash(binding)||entry.coverageCasesHash!==identityHash(selectLogicCoverage(question.grading.cases,binding.oracleCaseHashes))))throw Error('GATE_COUNTEREXAMPLE_CHANGED');}
 const positiveHashes=classification.positivePrograms.map(p=>identityHash(p.code)),port=ports.references.find(p=>p.sourceId===source.sourceId);
 if(port){const bytes=await readFile(port.file);if(sha(bytes)!==port.codeSha256)throw Error('GATE_REFERENCE_CHANGED');positiveHashes.push(identityHash(bytes.toString('utf8')));}
 if(item.positives.some(p=>!positiveHashes.includes(p.codeHash)))throw Error('GATE_REFERENCE_CHANGED');
 for(const required of classification.positivePrograms.filter(p=>p.required))if(!item.positives.some(p=>p.codeHash===identityHash(required.code)&&p.required&&p.outcome.kind==='passed'))throw Error('GATE_REQUIRED_REFERENCE_MISSING');
}
const catalog=await readProtocolCatalog(resolve('.'));for(const bundle of catalog.bundles)await verifyBundle(resolve('.'),bundle);
if(noncoding.catalogHash!==identityHash(catalog))throw Error('GATE_NONCODING_CATALOG_CHANGED');
const byId=new Map(staged.questions.map(q=>[q.id,q])),questions=original.map(q=>byId.get(q.id)??q),questionPath='suites/two-tier-v1/adapted-questions.json',questionBytes=Buffer.from(JSON.stringify(questions)+'\n');
const bundle=catalog.bundles.find(b=>b.id==='two-tier-v1');
bundle.questionPath=questionPath;bundle.files.push({path:questionPath,size:questionBytes.length,sha256:sha(questionBytes)});bundle.runtimePassed=true;
bundle.grading={...bundle.grading,coding:'adapted-stdio-all-tests-v4',inputAdaptation:staged.policy};
bundle.runtime={...bundle.runtime,limits:CONTEST_SCORING_LIMITS,budgetVersion:CONTEST_BUDGET_VERSION};
// Product entry remains closed until queue, upgrade, service and UI consumers are integrated.
for(const entry of catalog.entries)if(entry.bundleId==='two-tier-v1')entry.allowNewRuns=false;
const catalogBytes=Buffer.from(JSON.stringify(catalog,null,2)+'\n');
const result={schemaVersion:1,status:'passed',scope:'Local resource reference admission only; no model calibration or product release.',coding:100,noncoding:300,legacyCoding:164,legacyRules:541,evidenceHashes,budgetVersion:CONTEST_BUDGET_VERSION,limits:CONTEST_SCORING_LIMITS,questionSha256:sha(questionBytes),catalogSha256:sha(catalogBytes),runtimePassed:true,allowNewRuns:false,releaseAllowed:false};
if(args.includes('--write')){
 for(const path of ['resources/'+questionPath,'docs/evidence/tiers/adapted-runtime-gate-v4.json']){try{await lstat(path);throw Error('FINAL_ARTIFACT_EXISTS:'+path);}catch(e){if(e.code!=='ENOENT')throw e;}}
 await commitFileSet(resolve('.'),transactionPath,[
  {path:destinations[0],bytes:questionBytes},{path:destinations[1],bytes:catalogBytes},
  {path:destinations[2],bytes:Buffer.from(`/** Verified resource catalog; product entry remains disabled until consumer integration. */\nexport const RESOURCE_CATALOG_SHA256 = '${sha(catalogBytes)}';\n`)},
  {path:destinations[3],bytes:Buffer.from(JSON.stringify(result,null,2)+'\n')}
 ]);
}
console.log(JSON.stringify({...result,written:args.includes('--write')}));

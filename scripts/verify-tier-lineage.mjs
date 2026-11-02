/** Recheck frozen reference evidence after product admission; never rewrites the Task3 reports. */
import {register} from 'tsx/esm/api';register();
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {assertExecutionIdentities,REQUIRED_EXECUTION_FILES} from './support/execution-identities.ts';
import {EXECUTION_SNAPSHOT_SHA256} from './support/execution-snapshot-pin.ts';
import {legacyExecutionBytes,assertFrozenCatalog} from './support/five-lineage.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),json=async p=>JSON.parse(await readFile(p,'utf8'));
const gate=await json('docs/evidence/tiers/adapted-runtime-gate-v4.json');assert.equal(gate.status,'passed');assert.equal(gate.allowNewRuns,false);
const paths={audit:'docs/evidence/tiers/coding-adaptation-audit-v4.json',runtime:'docs/evidence/tiers/coding-adaptation-runtime-v4.json',noncoding:'docs/evidence/tiers/noncoding-runtime-v3.json',legacy:'docs/evidence/tiers/legacy-runtime-regression-v3.json',executionSnapshot:'docs/evidence/tiers/runtime-execution-identities-v4.json'};
for(const [key,path]of Object.entries(paths))assert.equal(sha(await readFile(path)),gate.evidenceHashes[key],`frozen ${key}`);
const snapshot=await json(paths.executionSnapshot);assert.equal(sha(await readFile(paths.executionSnapshot)),EXECUTION_SNAPSHOT_SHA256);const actual={};for(const path of REQUIRED_EXECUTION_FILES)actual[path]=sha(legacyExecutionBytes(path,await readFile(path)));assertExecutionIdentities(snapshot,actual);
const current=await json('resources/protocol-registry.json'),admission=await json('resources/task-five-admission.json').catch(e=>{if(e.code==='ENOENT')return undefined;throw e;});assertFrozenCatalog(current,gate.catalogSha256,admission);
assert.equal(sha(await readFile('resources/suites/two-tier-v1/adapted-questions.json')),gate.questionSha256);
const audit=await json(paths.audit);assert.equal(sha(await readFile('resources/suites/two-tier-v1/questions.json')),audit.source.frozenQuestionsSha256);
console.log(JSON.stringify({status:'passed',scope:'frozen legacy reference proof with exact reading-only dispatch extension; no fresh regrading or real-model calibration',executionFiles:REQUIRED_EXECUTION_FILES.length,frozenCatalogSha256:gate.catalogSha256,currentCatalogSha256:sha(await readFile('resources/protocol-registry.json')),questionSha256:gate.questionSha256,permittedDifference:'old admission flags; exactly two task-five definitions and one independently bound bundle; exact isolated reading dispatch',fiveAdmission:admission?'recorded runtime acceptance':'disabled'}));

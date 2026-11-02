/** Explicit local admission after recorded runtime acceptance. Never alters historical evidence. */
import {readFile,writeFile,readdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {assertFrozenCatalog,fiveAdmissionHash} from './support/five-lineage.mjs';
import {register} from 'tsx/esm/api';register();
import {assertExecutionIdentities,REQUIRED_EXECUTION_FILES} from './support/execution-identities.ts';
import {EXECUTION_SNAPSHOT_SHA256} from './support/execution-snapshot-pin.ts';
import {RESOURCE_MANIFEST_SHA256} from '../src/resources/pins.ts';
import {legacyExecutionBytes} from './support/five-lineage.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),json=async p=>JSON.parse(await readFile(p,'utf8'));
const evidencePath='docs/evidence/five/runtime-acceptance.json',evidence=await json(evidencePath),catalog=await json('resources/protocol-registry.json');
assert.equal(evidence.status,'passed');assert.equal(evidence.scope,'task-five-v1-product-runtime');assert.equal(evidence.newProtocolSha256,fiveAdmissionHash(catalog));
assert.deepEqual(evidence.evidence.map(x=>x.role).sort(),['cordis','regression','ui']);assert.equal(new Set(evidence.evidence.map(x=>x.path)).size,3);
for(const item of evidence.evidence){const bytes=await readFile(item.path);assert.equal(sha(bytes),item.sha256,'acceptance evidence must stay exact');assert.equal(JSON.parse(bytes).status,'passed',item.role+' must have passed');}
assert.equal(evidence.realModelCalls,0);
const hostFiles=(await readdir('src',{recursive:true})).map(p=>'src/'+p.replaceAll('\\','/')).filter(p=>p.endsWith('.ts')&&!p.startsWith('src/client/')&&p!=='src/resources/catalog-pin.ts').sort();
assert.deepEqual(evidence.executionFiles.map(x=>x.path).sort(),hostFiles);for(const file of evidence.executionFiles)assert.equal(sha(await readFile(file.path)),file.sha256,'runtime source changed after acceptance: '+file.path);
const gate=await json('docs/evidence/tiers/adapted-runtime-gate-v4.json');assertFrozenCatalog(catalog,gate.catalogSha256);
const snapshotBytes=await readFile('docs/evidence/tiers/runtime-execution-identities-v4.json');assert.equal(sha(snapshotBytes),EXECUTION_SNAPSHOT_SHA256);
const actual={};for(const path of REQUIRED_EXECUTION_FILES)actual[path]=sha(legacyExecutionBytes(path,await readFile(path)));assertExecutionIdentities(JSON.parse(snapshotBytes),actual);
const manifestBytes=await readFile('resources/manifest.json');assert.equal(sha(manifestBytes),RESOURCE_MANIFEST_SHA256);
for(const file of [...JSON.parse(manifestBytes).files,...catalog.bundles.flatMap(b=>b.files)]){const bytes=await readFile('resources/'+file.path);assert.equal(bytes.length,file.size,file.path);assert.equal(sha(bytes),file.sha256,file.path);}
const admission={schemaVersion:1,status:'passed',scope:evidence.scope,newProtocolSha256:evidence.newProtocolSha256,runtimeAcceptanceSha256:sha(await readFile(evidencePath)),realModelCalibration:'not-performed'};
catalog.bundles.find(b=>b.id==='task-five-v1').runtimePassed=true;for(const e of catalog.entries.filter(e=>e.refs.resourceVersion==='task-five-v1'))e.allowNewRuns=true;
assertFrozenCatalog(catalog,gate.catalogSha256,admission);
const bytes=JSON.stringify(catalog,null,2)+'\n';await writeFile('resources/task-five-admission.json',JSON.stringify(admission,null,2)+'\n',{flag:'wx'});
const bundle=await json('resources/suites/task-five-v1/bundle.json');bundle.runtimePassed=true;bundle.allowNewRuns=true;await writeFile('resources/suites/task-five-v1/bundle.json',JSON.stringify(bundle,null,2)+'\n');
await writeFile('resources/protocol-registry.json',bytes);await writeFile('src/resources/catalog-pin.ts',`/** Frozen catalog; five-capability runtime acceptance is separately recorded. */\nexport const RESOURCE_CATALOG_SHA256 = '${sha(bytes)}';\n`);
console.log(JSON.stringify({status:'admitted',protocols:['general-task-five-v1-light','general-task-five-v1-deep'],catalogSha256:sha(bytes),newProtocolSha256:admission.newProtocolSha256,realModelCalls:0}));

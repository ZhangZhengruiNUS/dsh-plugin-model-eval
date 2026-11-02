import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
// @ts-expect-error Developer-only verifier has no runtime type package.
import {legacyExecutionBytes,assertFrozenCatalog,fiveAdmissionHash} from '../../scripts/support/five-lineage.mjs';
test('legacy projection rejects changed old bytes, extra deltas and altered old catalog',async()=>{
 const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 const file='src/evaluation/grade-general.ts',bytes=await readFile(file),snapshot=JSON.parse(await readFile('docs/evidence/tiers/runtime-execution-identities-v4.json','utf8'));
 const expected=snapshot.files.find((f:any)=>f.path===file).sha256;
 assert.equal(sha(legacyExecutionBytes(file,bytes)),expected);
 assert.notEqual(sha(legacyExecutionBytes(file,Buffer.from(bytes.toString().replace("'UNKNOWN_DATASET'","'ALTERED'")))),expected);
 assert.throws(()=>legacyExecutionBytes(file,Buffer.concat([bytes,Buffer.from("import {gradeReading} from './grade-reading.ts';\n")])));
 const catalog=JSON.parse(await readFile('resources/protocol-registry.json','utf8')),gate=JSON.parse(await readFile('docs/evidence/tiers/adapted-runtime-gate-v4.json','utf8'));
 const admission=await readFile('resources/task-five-admission.json','utf8').then(JSON.parse).catch((e:any)=>{if(e.code==='ENOENT')return undefined;throw e;});assert.doesNotThrow(()=>assertFrozenCatalog(catalog,gate.catalogSha256,admission));
 const oldChanged=structuredClone(catalog);oldChanged.entries[0].general.label='changed';assert.throws(()=>assertFrozenCatalog(oldChanged,gate.catalogSha256,admission));
 const extra=structuredClone(catalog);extra.entries.push(structuredClone(extra.entries.at(-1)));assert.throws(()=>assertFrozenCatalog(extra,gate.catalogSha256,admission));
 const enabled=structuredClone(catalog);enabled.entries.at(-1).allowNewRuns=!enabled.entries.at(-1).allowNewRuns;assert.throws(()=>assertFrozenCatalog(enabled,gate.catalogSha256,admission));
});

test('new admission is explicit and bound to exact resource and definition bytes',async()=>{
 const catalog=JSON.parse(await readFile('resources/protocol-registry.json','utf8')),gate=JSON.parse(await readFile('docs/evidence/tiers/adapted-runtime-gate-v4.json','utf8'));
 const proof={schemaVersion:1,status:'passed',scope:'task-five-v1-product-runtime',newProtocolSha256:fiveAdmissionHash(catalog)};
 catalog.bundles.find((b:any)=>b.id==='task-five-v1').runtimePassed=true;for(const e of catalog.entries.filter((e:any)=>e.refs.resourceVersion==='task-five-v1'))e.allowNewRuns=true;
 assert.throws(()=>assertFrozenCatalog(catalog,gate.catalogSha256));assert.doesNotThrow(()=>assertFrozenCatalog(catalog,gate.catalogSha256,proof));
 const changed=structuredClone(catalog);changed.bundles.at(-1).files[0].sha256='0'.repeat(64);assert.throws(()=>assertFrozenCatalog(changed,gate.catalogSha256,proof));
 const relabelled=structuredClone(catalog);relabelled.entries.at(-1).general.label='changed';assert.throws(()=>assertFrozenCatalog(relabelled,gate.catalogSha256,proof));
});

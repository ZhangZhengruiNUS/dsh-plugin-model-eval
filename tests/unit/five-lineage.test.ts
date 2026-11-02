import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
// @ts-expect-error Developer-only verifier has no runtime type package.
import {legacyExecutionBytes,assertFrozenCatalog} from '../../scripts/support/five-lineage.mjs';
test('legacy projection rejects changed old bytes, extra deltas and altered old catalog',async()=>{
 const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 const file='src/evaluation/grade-general.ts',bytes=await readFile(file),snapshot=JSON.parse(await readFile('docs/evidence/tiers/runtime-execution-identities-v4.json','utf8'));
 const expected=snapshot.files.find((f:any)=>f.path===file).sha256;
 assert.equal(sha(legacyExecutionBytes(file,bytes)),expected);
 assert.notEqual(sha(legacyExecutionBytes(file,Buffer.from(bytes.toString().replace("'UNKNOWN_DATASET'","'ALTERED'")))),expected);
 assert.throws(()=>legacyExecutionBytes(file,Buffer.concat([bytes,Buffer.from("import {gradeReading} from './grade-reading.ts';\n")])));
 const catalog=JSON.parse(await readFile('resources/protocol-registry.json','utf8')),gate=JSON.parse(await readFile('docs/evidence/tiers/adapted-runtime-gate-v4.json','utf8'));
 assert.doesNotThrow(()=>assertFrozenCatalog(catalog,gate.catalogSha256));
 const oldChanged=structuredClone(catalog);oldChanged.entries[0].general.label='changed';assert.throws(()=>assertFrozenCatalog(oldChanged,gate.catalogSha256));
 const extra=structuredClone(catalog);extra.entries.push(structuredClone(extra.entries.at(-1)));assert.throws(()=>assertFrozenCatalog(extra,gate.catalogSha256));
 const enabled=structuredClone(catalog);enabled.entries.at(-1).allowNewRuns=true;assert.throws(()=>assertFrozenCatalog(enabled,gate.catalogSha256));
});

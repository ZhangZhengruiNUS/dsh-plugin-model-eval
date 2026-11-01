import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
test('all_developer_witnesses_pin_source_code_and_independent_oracle_without_claiming_admission',async()=>{
  const catalog=JSON.parse(await readFile('scripts/references/catalog.json','utf8'));
  const sources=JSON.parse(await readFile('.local/tier-candidates/sources/code-contests-test.json','utf8'));
  assert.equal(catalog.schemaVersion,1);assert.equal(catalog.references.length,39);
  assert.equal(new Set(catalog.references.map((r:any)=>r.sourceId)).size,39);
  assert.equal(sha(await readFile('.local/tier-candidates/artifacts/negative-references.json')),catalog.negativeReferencesSha256);
  for(const entry of catalog.references){
    assert.match(entry.file,/^scripts\/references\/[a-z0-9-]+\.py$/);
    assert.match(entry.oracleTest,/^tests\/integration\/[a-z-]+\.test\.ts$/);
    assert.equal(sources.find((r:any)=>r.sourceId===entry.sourceId).sourceRecordHash,entry.sourceRecordHash);
    assert.equal(sha(await readFile(entry.file)),entry.codeSha256);
    assert.ok((await readFile(entry.oracleTest,'utf8')).includes(entry.file.split('/').at(-1)),entry.sourceId+' oracle names the exact witness');
  }
});

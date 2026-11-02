import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
// @ts-expect-error Developer-only ESM verifier.
import {verifyTierResources} from '../../scripts/verify-package.mjs';

test('package_identity_and_entries', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.name, '@aico/dsh-plugin-model-eval');
  assert.equal(pkg.type, 'module');
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
  assert.equal(typeof pkg.dsh?.bundle?.patch, 'string', 'a real Cordis patch is required');
  const patch = await readFile(pkg.dsh.bundle.patch, 'utf8');
  assert.match(patch, /name:\s*'@aico\/dsh-plugin-model-eval'/);
  const locale = JSON.parse(await readFile('locale/zh-CN.json', 'utf8'));
  assert.ok(locale.meta.title && locale.meta.description);
  assert.equal(pkg.exports['./client'], './lib/client.js');
  await access(resolve('lib/index.js'));
  const client = await readFile('lib/client.js', 'utf8');
  assert.match(client, /__ModuleLoader__\.load/);
  assert.ok(client.includes(pkg.name));
  assert.ok(!client.includes('createRoot('), 'use the host React root');
});

test('packaged_tier_catalog_and_runtime_bytes_are_bound_to_the_host',()=>{
  const get=(path:string)=>readFileSync(path),raw=get('resources/protocol-registry.json'),manifest=JSON.parse(get('resources/manifest.json').toString()),sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
  const checked=verifyTierResources(get,sha(raw),manifest);assert.equal(checked.protocols.length,5);
  assert.throws(()=>verifyTierResources(get,'wrong pin',manifest),/CATALOG_PIN/);
  const catalog=JSON.parse(raw.toString());catalog.entries.find((e:any)=>e.general.tier==='light').allowNewRuns=false;const altered=Buffer.from(JSON.stringify(catalog));
  assert.throws(()=>verifyTierResources((p:string)=>p==='resources/protocol-registry.json'?altered:get(p),sha(altered),manifest),/TIER_ADMISSION_CONTRACT/);
  const runtime=catalog.bundles[0].files.find((f:any)=>f.path.endsWith('wasmtime/_bindings.py')).path;
  assert.throws(()=>verifyTierResources((p:string)=>p==='resources/'+runtime?Buffer.from('tampered'):get(p),sha(raw),manifest),/TIER_RESOURCE_PACKAGE_MISMATCH/);
});

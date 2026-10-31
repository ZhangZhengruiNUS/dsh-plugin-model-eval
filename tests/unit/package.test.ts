import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

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

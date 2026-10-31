import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { withTempRoot } from '../support/temp.ts';
import { verifyRuntime } from '../../src/runtime/integrity.ts';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
test('runtime integrity rejects extras, modified manifests and modified binaries', async () => {
  await withTempRoot(async root => {
    const raw = JSON.stringify({ schemaVersion: 1, kind: 'fixture', files: [{ path: 'app.py', sha256: hash('trusted') }] });
    await writeFile(join(root, 'runtime.json'), raw);
    await writeFile(join(root, 'app.py'), 'trusted');
    await verifyRuntime(root, 'fixture', hash(raw));
    await writeFile(join(root, 'extra.py'), 'untrusted');
    await assert.rejects(verifyRuntime(root, 'fixture', hash(raw)), /RUNTIME_INVENTORY_MISMATCH/);
  });
  await withTempRoot(async root => {
    const raw = JSON.stringify({ schemaVersion: 1, kind: 'fixture', files: [{ path: 'app.py', sha256: hash('trusted') }] });
    await writeFile(join(root, 'runtime.json'), raw);
    await writeFile(join(root, 'app.py'), 'modified');
    await assert.rejects(verifyRuntime(root, 'fixture', hash(raw)), /RUNTIME_HASH_MISMATCH/);
    await assert.rejects(verifyRuntime(root, 'fixture', hash('different manifest')), /RUNTIME_MANIFEST_MISMATCH/);
  });
});

import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Manifest SHA is compiled into the plugin, never supplied by its Client. */
export async function verifyRuntime(root: string, kind: string, expectedHash: string): Promise<void> {
  root = resolve(root);
  const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');
  const raw = await readFile(join(root, 'runtime.json'));
  if (digest(raw) !== expectedHash) throw new Error('RUNTIME_MANIFEST_MISMATCH');
  const manifest = JSON.parse(raw.toString('utf8'));
  if (manifest.schemaVersion !== 1 || manifest.kind !== kind || !Array.isArray(manifest.files)) throw new Error('INVALID_RUNTIME_MANIFEST');
  const expected = new Map<string, string>();
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || !file.path || isAbsolute(file.path) || file.path.includes('\\')
      || file.path.split('/').some((x: string) => !x || x === '.' || x === '..') || expected.has(file.path)
      || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('INVALID_RUNTIME_MANIFEST');
    expected.set(file.path, file.sha256);
  }
  const actual: string[] = [];
  async function walk(path: string): Promise<void> {
    if (await realpath(path) !== path) throw new Error('RUNTIME_LINK_REJECTED');
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error('RUNTIME_LINK_REJECTED');
    if (info.isDirectory()) for (const entry of await readdir(path)) await walk(join(path, entry));
    else if (info.isFile()) actual.push(relative(root, path).split(sep).join('/'));
    else throw new Error('RUNTIME_SPECIAL_FILE_REJECTED');
  }
  await walk(root);
  const files = actual.filter(path => path !== 'runtime.json');
  if (files.length !== expected.size || files.some(path => !expected.has(path))) throw new Error('RUNTIME_INVENTORY_MISMATCH');
  for (const path of files) if (digest(await readFile(join(root, path))) !== expected.get(path)) throw new Error('RUNTIME_HASH_MISMATCH');
}

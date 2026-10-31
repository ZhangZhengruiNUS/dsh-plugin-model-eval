import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-model-eval-test-'));
  try { return await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

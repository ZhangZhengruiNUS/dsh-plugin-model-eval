import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { JsonValue, ProtocolSet, Question } from '../contracts.ts';
import { RESOURCE_MANIFEST_SHA256 } from '../resources/pins.ts';
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export interface ResourceFile { path: string; size: number; sha256: string; kind: 'dataset' | 'license' | 'protocol' | 'runtime'; source: string; revision: string; license: string }
export interface ResourceManifest {
  schemaVersion: 1; resourceVersion: string; generalId: string; writingId: string;
  datasets: { id: string; path: string; count: number }[]; files: ResourceFile[];
  gates: { resources: 'passed' | 'pending'; runtime: 'passed' | 'pending' | 'failed' };
}
export async function readResourceManifest(root: string): Promise<ResourceManifest> {
  const raw = await readFile(join(root, 'manifest.json'));
  if (hash(raw) !== RESOURCE_MANIFEST_SHA256) throw new Error('RESOURCE_MANIFEST_MISMATCH');
  const manifest = JSON.parse(raw.toString('utf8')) as ResourceManifest;
  if (manifest.schemaVersion !== 1 || manifest.gates.resources !== 'passed') throw new Error('RESOURCES_NOT_READY');
  return manifest;
}
export async function loadProtocolSet(resourceRoot: string): Promise<ProtocolSet> {
  const root = resolve(resourceRoot), manifest = await readResourceManifest(root);
  const seen = new Set<string>();
  for (const file of manifest.files.filter(x => x.kind !== 'runtime')) {
    if (isAbsolute(file.path) || file.path.includes('\\') || file.path.split('/').some(x => !x || x === '..' || x === '.') || seen.has(file.path)) throw new Error('INVALID_RESOURCE_PATH');
    seen.add(file.path);
    const path = join(root, file.path);
    if (!(await lstat(path)).isFile() || await realpath(path) !== path) throw new Error('RESOURCE_LINK_REJECTED');
    const bytes = await readFile(path);
    if (bytes.length !== file.size || hash(bytes) !== file.sha256) throw new Error('RESOURCE_HASH_MISMATCH');
  }
  const items: Question[] = [];
  for (const dataset of manifest.datasets) {
    const text = await readFile(join(root, dataset.path), 'utf8');
    const rows = dataset.id === 'ifeval' ? text.trim().split('\n').map(x => JSON.parse(x))
      : dataset.id === 'humaneval-plus' ? JSON.parse(text).tasks : JSON.parse(text);
    if (rows.length !== dataset.count) throw new Error('RESOURCE_COUNT_MISMATCH');
    for (const row of rows) {
      let sourceId: string, prompt: string, sourceHash: string, grading: JsonValue;
      if (dataset.id === 'tiny-mmlu' || dataset.id === 'tiny-gsm8k') {
        sourceId = `${dataset.id}:${row.tiny_row_index}`; prompt = row.tiny_raw.input_formatted;
        sourceHash = row.tiny_raw_item_sha256; grading = row.tiny_raw;
      } else if (dataset.id === 'ifeval') {
        sourceId = `ifeval:${row.key}`; prompt = row.prompt; sourceHash = hash(JSON.stringify(row)); grading = row;
      } else if (dataset.id === 'humaneval-plus') {
        sourceId = row.id; prompt = row.prompt; sourceHash = hash(prompt); grading = row;
      } else {
        sourceId = row.sourceId; prompt = row.query; sourceHash = row.querySha256;
        if (hash(prompt) !== sourceHash) throw new Error('WRITING_SOURCE_HASH_MISMATCH');
        grading = { category: row.category, checklist: row.checklist ?? [] };
      }
      items.push({ id: `${dataset.id}/${sourceId}`, track: dataset.id === 'writing' ? 'writing' : 'general',
        datasetId: dataset.id, sourceId, sourceHash, prompt: [{ role: 'user', content: prompt }], grading });
    }
  }
  const expected = new Map([['tiny-mmlu',100],['tiny-gsm8k',100],['ifeval',541],['humaneval-plus',164],['writing',12]]);
  if (items.length !== 917 || new Set(items.map(x => x.id)).size !== 917 || [...expected].some(([id, n]) => items.filter(x => x.datasetId === id).length !== n)) throw new Error('FIXED_SUITE_MISMATCH');
  return { generalId: manifest.generalId, writingId: manifest.writingId, resourceVersion: manifest.resourceVersion, items };
}

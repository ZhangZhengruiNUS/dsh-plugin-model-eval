import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { withTempRoot } from '../support/temp.ts';
import { loadProtocolSet } from '../../src/evaluation/protocols.ts';

test('fixed_counts_and_tamper_detection', async () => {
  const resources = resolve('resources');
  const suite = await loadProtocolSet(resources);
  const ids = ['tiny-mmlu', 'tiny-gsm8k', 'ifeval', 'humaneval-plus', 'writing'];
  assert.deepEqual(ids.map(id => suite.items.filter(x => x.datasetId === id).length), [100,100,541,164,12]);
  assert.equal(new Set(suite.items.map(x => x.id)).size, 917);
  const writing = suite.items.filter(x => x.track === 'writing');
  assert.deepEqual(writing.map(x => x.sourceId), ['ziya:3','ziya:4','ziya:5','ziya:13','ziya:31','ziya:40','ziya:50','ziya:94','ziya:115','ziya:129','writingbench:59','writingbench:287']);
  assert.equal(writing[10]!.sourceHash, '41db743700236d77eae093c4587886a89003746fbeabf4b9d8f63aa641535f2b');
  assert.equal(writing[11]!.sourceHash, 'bbfbdc2fa046f485d7e49a3b5db3898becfa9cca1e8d306e7757010715e04104');
  await withTempRoot(async root => {
    await cp(join(resources, 'manifest.json'), join(root, 'manifest.json'));
    await cp(join(resources, 'protocols'), join(root, 'protocols'), { recursive: true });
    await cp(join(resources, 'licenses'), join(root, 'licenses'), { recursive: true });
    const path = join(root, 'protocols', 'writing.json');
    await writeFile(path, (await readFile(path, 'utf8')).replace('周六', '周日'));
    await assert.rejects(loadProtocolSet(root), /RESOURCE_HASH_MISMATCH/);
  });
});

test('resource hashes survive a Git checkout without newline conversion', async () => {
  const manifest=JSON.parse(await readFile('resources/manifest.json','utf8'));
  const files=['resources/manifest.json',...manifest.files.filter((x:{kind:string})=>x.kind!=='runtime').map((x:{path:string})=>'resources/'+x.path)];
  for (const file of files) {
    const raw=await readFile(file);
    const rawId=createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex');
    const filteredId=execFileSync('git',['hash-object','--stdin',`--path=${file}`],{input:raw,encoding:'utf8',maxBuffer:1024}).trim();
    assert.equal(filteredId,rawId,file);
  }
});

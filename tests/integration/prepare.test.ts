import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, cp, access, readdir, symlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { withTempRoot } from '../support/temp.ts';
import { readResourceManifest } from '../../src/evaluation/protocols.ts';
import { inspectRoot, switchRoot, prepareResources } from '../../src/resources/prepare.ts';
import { createCodeRunner } from '../../src/runtime/runner.ts';
import { createRuleGrader } from '../../src/runtime/rule-grader.ts';

test('root_switch_and_preparation_are_non_destructive', {timeout:120000}, async () => {
  await withTempRoot(async parent => {
    const original=join(parent,'原有评测'),next=join(parent,'新的目录');
    await switchRoot(original,{writing:false});
    await writeFile(join(original,'keep.txt'),'original history sentinel');
    await assert.rejects(switchRoot(next,{writing:true,activeBatchId:'batch-1'}),{code:'ROOT_BUSY'});
    const unrelated=join(parent,'unrelated');await mkdir(unrelated);await writeFile(join(unrelated,'work.txt'),'do not touch');
    await assert.rejects(switchRoot(unrelated,{writing:false}),{code:'ROOT_NOT_EMPTY'});
    assert.equal(await readFile(join(unrelated,'work.txt'),'utf8'),'do not touch');
    const selection=await switchRoot(next,{writing:false});
    assert.equal((await inspectRoot(selection.path)).kind,'owned');
    assert.equal(await readFile(join(original,'keep.txt'),'utf8'),'original history sentinel');
    const source=resolve('resources'),manifest=await readResourceManifest(source);
    const prepared=await prepareResources(selection.path,manifest,source);
    assert.equal(prepared.resourceVersion,manifest.resourceVersion);
    await access(join(prepared.resourcesPath,'runtime','wasi','python.wasm'));
    const smoke=await createCodeRunner(join(prepared.resourcesPath,'runtime')).runCode({id:'relocated',entryPoint:'f',cases:[{args:[],expected:{t:'int',v:'1'}}]},'def f(): return 1',
      {wallMs:5000,memoryBytes:268435456,computeBudget:8_000_000_000},new AbortController().signal);
    assert.equal(smoke.kind,'passed',JSON.stringify(smoke));
    const rule=await createRuleGrader(join(prepared.resourcesPath,'runtime','rules')).gradeRules({itemId:'unicode',key:1,prompt:'包含alpha',instruction_id_list:['keywords:existence'],kwargs:[{keywords:['alpha']}],answer:'alpha 你好'});
    assert.equal(rule.kind,'scored',JSON.stringify(rule));
    const again=await prepareResources(selection.path,manifest,source);
    assert.equal(again.resourcesPath,prepared.resourcesPath);
    const badSource=join(parent,'tampered-package');await mkdir(badSource);
    await cp(join(source,'manifest.json'),join(badSource,'manifest.json'));
    const first=manifest.files[0]!;
    await mkdir(dirname(join(badSource,first.path)),{recursive:true});
    await writeFile(join(badSource,first.path),'tampered');
    const failedRoot=await switchRoot(join(parent,'failed'),{writing:false});
    await assert.rejects(prepareResources(failedRoot.path,manifest,badSource),/RESOURCE_HASH_MISMATCH/);
    assert.deepEqual(await readdir(join(failedRoot.path,'resources')),[]);
  });
});
test('resource directories cannot be redirected through a junction',async()=>{
  await withTempRoot(async parent=>{
    const source=resolve('resources'),manifest=await readResourceManifest(source);
    const redirected=join(parent,'redirected');await mkdir(redirected);
    await cp(join(source,'manifest.json'),join(redirected,'manifest.json'));
    await symlink(join(source,'protocols'),join(redirected,'protocols'),'junction');
    const root=await switchRoot(join(parent,'root'),{writing:false});
    await assert.rejects(prepareResources(root.path,manifest,redirected),/RESOURCE_LINK_REJECTED/);
  });
});
test('unknown storage versions and unsafe resource paths are never rewritten', async () => {
  await withTempRoot(async root => {
    const bad=join(root,'old');await mkdir(bad);
    const marker=JSON.stringify({application:'@aico/dsh-plugin-model-eval',schemaVersion:999,rootId:'old'});
    await writeFile(join(bad,'root.json'),marker);
    await assert.rejects(switchRoot(bad,{writing:false}),{code:'ROOT_VERSION_UNSUPPORTED'});
    assert.equal(await readFile(join(bad,'root.json'),'utf8'),marker);
    const source=resolve('resources'),manifest=await readResourceManifest(source);
    const target=await switchRoot(join(root,'valid'),{writing:false});
    const modified=structuredClone(manifest);modified.files[0]!.path='../outside';
    await assert.rejects(prepareResources(target.path,modified,source),/MANIFEST_MISMATCH/);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,readFile,writeFile,symlink,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {withTempRoot} from '../support/temp.ts';
import {createProtocolRegistry} from '../../src/evaluation/registry.ts';
import {prepareProtocolResources,switchRoot} from '../../src/resources/prepare.ts';

test('versioned_preparation_failure_preserves_ready_legacy_bytes', {timeout:120000},async()=>{
  await withTempRoot(async parent=>{
    const registry=await createProtocolRegistry(resolve('.')),legacy=registry.list().find(d=>d.general.tier==='legacy')!,light=registry.list().find(d=>d.general.tier==='light')!;
    const root=await switchRoot(join(parent,'root'),{writing:false});
    const ready=await prepareProtocolResources(root.path,legacy,resolve('.'));
    const before=await readFile(join(ready.resourcesPath,'.ready.json'));
    await assert.rejects(prepareProtocolResources(root.path,{...light,refs:{...light.refs,resourceVersion:'unknown'}},resolve('.')),/UNKNOWN_PROTOCOL/);
    await assert.rejects(prepareProtocolResources(root.path,{...light,allowNewRuns:false},resolve('.')),/DESCRIPTOR_MISMATCH/);
    assert.deepEqual(await readFile(join(ready.resourcesPath,'.ready.json')),before);
    assert.deepEqual(await readdir(join(root.path,'resources')),[ready.resourcesPath.split(/[\\/]/).at(-1)]);
    assert.equal((await prepareProtocolResources(root.path,legacy,resolve('.'))).cached,true);
  });
});

test('catalog_hash_path_links_and_resource_tampering_are_rejected',async()=>{
  await withTempRoot(async parent=>{
    const pkg=join(parent,'package');await mkdir(pkg);await cp('resources',join(pkg,'resources'),{recursive:true});
    const catalogPath=join(pkg,'resources','protocol-registry.json');
    const catalog=JSON.parse(await readFile(catalogPath,'utf8'));catalog.bundles[0].files[0].path='../escape';
    await writeFile(catalogPath,JSON.stringify(catalog));
    await assert.rejects(createProtocolRegistry(pkg),/CATALOG_HASH_MISMATCH/);
    await cp('resources/protocol-registry.json',catalogPath);
    const questions=join(pkg,'resources','suites','two-tier-v1','questions.json');
    await writeFile(questions,'[]');
    const altered=await createProtocolRegistry(pkg),light=altered.list().find(d=>d.general.tier==='light')!;
    await assert.rejects(altered.resolve(light.refs),/RESOURCE_HASH_MISMATCH/);
    const linked=join(parent,'linked');await mkdir(linked);await symlink(resolve('resources'),join(linked,'resources'),'junction');
    await assert.rejects(createProtocolRegistry(linked),/RESOURCE_LINK_REJECTED/);
  });
});

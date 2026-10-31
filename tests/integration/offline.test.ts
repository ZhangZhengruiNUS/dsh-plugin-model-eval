import test from 'node:test';import assert from 'node:assert/strict';import {join,dirname,resolve} from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {withTempRoot} from '../support/temp.ts';
// @ts-expect-error Developer-only ESM package validator, deliberately no runtime dependency.
import {verifyPackage} from '../../scripts/verify-package.mjs';
test('packed_offline_bundle_is_self_contained',{timeout:120000},async()=>withTempRoot(async parent=>{
  const npmCli=process.env.npm_execpath;if(!npmCli)throw new Error('Run via npm for a pinned npm CLI path');
  const output=execFileSync(process.execPath,[npmCli,'pack','--json','--ignore-scripts','--pack-destination',parent],{encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024});
  const info=JSON.parse(output)[0],{entries,report}=verifyPackage(join(parent,info.filename));assert.equal(report.runtimeDependencies,0);assert.ok(report.resourceBytes>150000000);
  const expanded=join(parent,'expanded');await mkdir(expanded);
  for(const [name,bytes] of entries as Map<string,Buffer>){const path=join(expanded,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes,{flag:'wx'});}
  const smoke=execFileSync(process.execPath,[resolve('tests/support/packed-host-smoke.mjs'),join(expanded,'package'),join(parent,'离线 用户')],{encoding:'utf8',cwd:expanded,windowsHide:true,timeout:100000,maxBuffer:1024*1024,env:{...process.env,PATH:''}});
  const fixture=JSON.parse(smoke.trim());assert.equal(fixture.restore,'passed');assert.equal(fixture.disposal,'passed');assert.ok(fixture.deletedBytes>0);
  await writeFile('docs/evidence/package.json',JSON.stringify({...report,offlineFixture:fixture,actualHost:'unverified',realModel:'not-performed'},null,2)+'\n');
}));

/** Developer-only actual tarball verification; fixture owns its isolated home. */
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';import {join,dirname,resolve} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createHash} from 'node:crypto';import {verifyPackage} from './verify-package.mjs';
import assert from 'node:assert/strict';
const run=promisify(execFile),pkg=resolve(process.argv[2]),{entries,report}=verifyPackage(pkg),expanded=await mkdtemp(resolve('.local/five-release-expanded-'));
for(const [name,bytes] of entries){const target=join(expanded,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});}
const {stdout}=await run(process.execPath,[resolve('tests/support/packed-five-smoke.mjs'),join(expanded,'package')],{timeout:900000,maxBuffer:1024*1024,windowsHide:true,env:{...process.env,PATH:''}});
const fixture=JSON.parse(stdout.trim());if(fixture.status!=='passed')throw Error('PACKAGED_FIVE_FAILED');
const sha=b=>createHash('sha256').update(b).digest('hex'),result={...report,offlineFiveFixture:fixture,hostBundleSha256:sha(await readFile('lib/index.js')),clientBundleSha256:sha(await readFile('lib/client.js')),realModel:'not-performed',desktop:'separate verification'};
assert.equal(result.hostBundleSha256,sha(entries.get('package/lib/index.js')));assert.equal(result.clientBundleSha256,sha(entries.get('package/lib/client.js')));
await mkdir('docs/evidence/five',{recursive:true});await writeFile('docs/evidence/five/package.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

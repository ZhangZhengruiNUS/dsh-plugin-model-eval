/** Combine independently verified scopes and run the real safety regressions. */
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async path => JSON.parse(await readFile(path,'utf8'));
const code = await read('docs/evidence/runtime-code-corrected.json');
const rules = await read('docs/evidence/runtime-rules-v3.json');
const ruleHash = hash(await readFile('resources/runtime/rules/runtime.json'));
if (code.status!=='passed'||code.tasks.length!==164||code.tasks.some(x=>x.kind!=='passed')||rules.status!=='passed'||rules.rules?.executed!==541||rules.rules.technicalFailures.length
  ||rules.runtimePins['trusted-ifeval']!==ruleHash
  ||code.runtimePins['code-host']!==hash(await readFile('resources/runtime/code-host/runtime.json'))
  ||code.runtimePins.wasi!==hash(await readFile('resources/runtime/wasi/runtime.json'))
  ||hash(await readFile('resources/protocols/ifeval.jsonl'))!=='67ffeee0fcb87c317c5b08a2de85557b4a7e96ada6178aa645b4954fe4b53d49') throw new Error('CONFORMANCE_NOT_COMPLETE');
const tests=['tests/integration/runtime.test.ts','tests/integration/rule-runtime.test.ts','tests/integration/runtime-integrity.test.ts','tests/unit/runtime-values.test.ts'];
const command=['--import','tsx','--test',...tests];
const check=spawnSync(process.execPath,command,{encoding:'utf8',maxBuffer:1024*1024,windowsHide:true});
await writeFile('.superpowers/sdd/2026-10-31-model-evaluation/task-3-safety.log',check.stdout+check.stderr);
process.stdout.write((check.stdout+check.stderr).split('\n').slice(-12).join('\n'));
if(check.status!==0)throw new Error('SAFETY_TESTS_FAILED');
const manifest=await read('resources/manifest.json');
manifest.files=manifest.files.filter(x=>x.kind!=='runtime');
for(const folder of ['code-host','wasi','rules']) {
  const root=join('resources/runtime',folder);
  async function walk(path) {
    const stat=await lstat(path);
    if(stat.isSymbolicLink())throw new Error('RUNTIME_LINK');
    if(stat.isDirectory())for(const name of (await readdir(path)).sort())await walk(join(path,name));
    else if(stat.isFile()) {
      const bytes=await readFile(path);
      manifest.files.push({path:relative('resources',path).replaceAll('\\','/'),size:bytes.length,sha256:hash(bytes),kind:'runtime',
        source:folder==='rules'?'Pinned official CPython + dependency wheels + Google Research source':'Pinned CPython + official Wasmtime wheel; see component notices',
        revision:folder==='wasi'?'CPython-WASI-3.13.15-sdk24':folder==='code-host'?'CPython-3.13.11-Wasmtime-50.0.1':'IFEval-e6890f8',license:'See bundled licenses and component notices'});
    }
  }
  await walk(root);
}
manifest.gates.runtime='passed';
const raw=JSON.stringify(manifest,null,2)+'\n';await writeFile('resources/manifest.json',raw);
await writeFile('src/resources/pins.ts',`/** Fixed offline resource manifest. */\nexport const RESOURCE_MANIFEST_SHA256 = '${hash(raw)}';\n`);
const report={schemaVersion:3,status:'passed',platform:process.platform,arch:process.arch,node:process.version,
  coding:{report:'runtime-code-corrected.json',sha256:hash(await readFile('docs/evidence/runtime-code-corrected.json')),tasks:164,
    baseInputs:code.tasks.reduce((n,x)=>n+x.baseInputs,0),plusInputs:code.tasks.reduce((n,x)=>n+x.plusInputs,0),limits:code.limits,runtimePins:code.runtimePins,
    adaptation:'find-zero-stable-v1; all original test inputs retained; one named conformance reference replaces defective canonical only in self-test'},
  rules:{report:'runtime-rules-v3.json',sha256:hash(await readFile('docs/evidence/runtime-rules-v3.json')),required:541,executed:541,technicalFailures:0,
    runtimeManifestSha256:ruleHash,dataSha256:'67ffeee0fcb87c317c5b08a2de85557b4a7e96ada6178aa645b4954fe4b53d49',
    adaptation:'ifeval-code-tokenizer-v1; no pretrained Punkt data; full 541 prompts executed with the fixed code-only splitter/tokenizer'},
  safety:{command:[process.execPath,...command],exitCode:check.status,log:'task-3-safety.log',checks:['no host file access','read-only guest filesystem','reachable-local-server network denied','no host subprocess','fuel/memory/wall/cancellation/output limits','Host compares outputs','forged errors cannot become technical missing','manifest inventory and hashes','enhanced failures cannot be ignored']},
  bytes:manifest.files.reduce((n,x)=>n+x.size,0),resourceManifestSha256:hash(raw),actualDshHost:'unverified',realModelRun:'not-performed'};
// Avoid a machine-specific absolute executable path in published evidence.
report.safety.command[0]='node';
await writeFile('docs/evidence/runtime.json',JSON.stringify(report,null,2)+'\n');
process.stdout.write(`Runtime gate passed:164 code tasks,541 rule prompts; resource bytes ${report.bytes}\n`);

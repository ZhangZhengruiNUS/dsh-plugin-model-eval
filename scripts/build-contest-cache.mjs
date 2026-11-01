/** Deterministic developer build. Fresh output only; no native model compilation. */
import {register} from 'tsx/esm/api';register();
import {readFile,writeFile,readdir,lstat,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {dirname,resolve,join,relative,isAbsolute} from 'node:path';
import {verifyRuntime} from '../src/runtime/integrity.ts';
import {RUNTIME_PINS} from '../src/runtime/pins.ts';
const args=process.argv.slice(2),outArg=args.includes('--out')?args[args.indexOf('--out')+1]:undefined;
if(!outArg)throw Error('Usage: build-contest-cache.mjs --out <fresh .local directory|resources/runtime/contest-cache> [--write-pin]');
const out=resolve(outArg),rel=relative(resolve('.local'),out);
if(out!==resolve('resources/runtime/contest-cache')&&(rel.startsWith('..')||isAbsolute(rel)||!rel))throw Error('CACHE_OUTPUT_NOT_OWNED');
try{await lstat(out);throw Error('CACHE_OUTPUT_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
let ancestor=dirname(out);while(ancestor!==dirname(ancestor)){try{if((await lstat(ancestor)).isSymbolicLink())throw Error('CACHE_OUTPUT_LINK');}catch(e){if(e.code!=='ENOENT')throw e;}ancestor=dirname(ancestor);}
const runtime=resolve('resources/runtime');
for(const kind of ['code-host','wasi'])await verifyRuntime(join(runtime,kind),kind,RUNTIME_PINS[kind]);
const sha=b=>createHash('sha256').update(b).digest('hex'),started=performance.now();
const result=await new Promise((done,reject)=>{
 const child=spawn(join(runtime,'code-host/python.exe'),['-I','-B','-X','utf8',resolve('scripts/compile-contest-cache.py'),join(runtime,'wasi'),out,RUNTIME_PINS.wasi],{windowsHide:true,env:{},stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';const timer=setTimeout(()=>child.kill('SIGKILL'),300000);
 child.stdout.on('data',b=>{stdout+=b;if(stdout.length>65536)child.kill('SIGKILL');});child.stderr.on('data',b=>{stderr+=b;if(stderr.length>65536)child.kill('SIGKILL');});
 child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?done(JSON.parse(stdout)):reject(Error('CACHE_COMPILER_FAILED:'+stderr.slice(-1000)));});
});
if(result.magic!=='f30d0d0a'||result.cacheTag!=='cpython-313'||result.optimization!==0||result.hashMode!=='checked-hash')throw Error('CACHE_COMPILER_IDENTITY_MISMATCH');
const files=[];
async function walk(dir){for(const entry of (await readdir(dir)).sort()){const path=join(dir,entry),stat=await lstat(path);if(stat.isSymbolicLink())throw Error('CACHE_OUTPUT_LINK');if(stat.isDirectory())await walk(path);else{
 const bytes=await readFile(path);if(!entry.endsWith('.pyc')||bytes.subarray(0,4).toString('hex')!==result.magic||bytes.readUInt32LE(4)!==3)throw Error('INVALID_CACHE_HEADER');
 files.push({path:relative(out,path).split('\\').join('/'),sha256:sha(bytes)});
}}}
await walk(out);
const baseManifest=JSON.parse(await readFile(join(runtime,'wasi/runtime.json'),'utf8'));
const sourceFiles=baseManifest.files.filter(f=>f.path.startsWith('lib/python3.13/')&&f.path.endsWith('.py'));
if(files.length!==result.files||files.length!==sourceFiles.length)throw Error('CACHE_SOURCE_COVERAGE');
for(const source of sourceFiles){const expected='python/'+source.path.slice(0,-3)+'.cpython-313.pyc';if(!files.some(f=>f.path===expected))throw Error('CACHE_SOURCE_MAPPING:'+source.path);}
const manifest={schemaVersion:1,kind:'contest-cache',generation:{baseWasiManifestSha256:RUNTIME_PINS.wasi,compiler:result,generatorSha256:sha(await readFile('scripts/compile-contest-cache.py')),builderSha256:sha(await readFile('scripts/build-contest-cache.mjs')),sourceFiles},files};
await writeFile(join(out,'runtime.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
const pin=sha(await readFile(join(out,'runtime.json')));await verifyRuntime(out,'contest-cache',pin);
if(args.includes('--write-pin')){if(out!==resolve('resources/runtime/contest-cache'))throw Error('PIN_REQUIRES_PACKAGED_CACHE');await writeFile('src/runtime/contest-cache-pin.ts',`/** Trusted stdlib bytecode; generated with the pinned WASI compiler, never native model code. */\nexport const CONTEST_CACHE_SHA256 = '${pin}';\n`);}
console.log(JSON.stringify({files:files.length,manifestSha256:pin,compiler:result,buildMs:Math.round(performance.now()-started)}));

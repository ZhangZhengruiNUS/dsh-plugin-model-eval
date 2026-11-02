import {readFile,writeFile,readdir,copyFile} from 'node:fs/promises';import {join,basename} from 'node:path';import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex'),args=process.argv.slice(2),research=args[args.indexOf('--research')+1];
if(!args.includes('--research')||!research)throw Error('RESEARCH_PATH_REQUIRED');
const source=join(research,'bfcl-v4'),root='resources/suites/task-five-v1/bfcl';
const bytes=await readFile(join(source,'tool-schema-budget-v2.json'));
if(sha(bytes)!=='ca9e0939b8d9e4bbabd6d0aee3624f48951dc281fc5bf0a437ca190e6b56c42e')throw Error('TOOL_DOC_MANIFEST_CHANGED');
for(const file of JSON.parse(bytes).manifest){const name='doc__'+basename(file.path),b=await readFile(join(source,name));if(sha(b)!==file.sha256||b.length!==file.bytes)throw Error('TOOL_DOC_CHANGED');await copyFile(join(source,name),join(root,name));}
const files=[];for(const path of (await readdir(root)).filter(p=>p!=='runtime.json').sort()){const b=await readFile(join(root,path));files.push({path,sha256:sha(b)});}
const manifest=JSON.stringify({schemaVersion:1,kind:'sealed-bfcl',files},null,2)+'\n';await writeFile(join(root,'runtime.json'),manifest);
await writeFile('src/runtime/tool-pin.ts',`/** Pinned trusted simulator; model inputs are JSON only. */\nexport const TOOL_RUNTIME_SHA256 = '${sha(manifest)}';\n`);
console.log(JSON.stringify({files:files.length,sha256:sha(manifest)}));

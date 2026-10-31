import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
await mkdir(new URL('../lib', import.meta.url), { recursive: true });
await build({ entryPoints: ['src/index.ts'], outfile: 'lib/index.js', bundle: true, format: 'esm', platform: 'node', target: 'node24' });
const client = await build({
  entryPoints: ['src/client/index.tsx'], bundle: true, format: 'cjs', platform: 'browser',
  target: 'es2022', external: ['react'], write: false,
});
await writeFile('lib/client.js', `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory(require){
const module={exports:{}};const exports=module.exports;
${client.outputFiles[0].text}
return module.exports;
}});\n`);

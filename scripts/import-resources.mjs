/** Explicit development import from audited local files. No network or pickle. */
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const args = process.argv.slice(2), argument = name => {
  const at = args.indexOf(name); if (at < 0 || !args[at + 1]) throw new Error(`Missing ${name}`); return args[at + 1];
};
const audit = argument('--audit-root'), selectionPath = argument('--writing-selection');
const hash = x => createHash('sha256').update(x).digest('hex');
const parseLines = text => text.trim().split('\n').map(x => JSON.parse(x));
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const mapping = await readJson(join(audit, 'tiny-source-mapping/source-mapping.json'));
const selected = await readJson(selectionPath);
const ziyaRaw = await readFile(join(audit, 'chinese-writing/ziya/writing_sbs.jsonl'));
const writingRaw = await readFile(join(audit, 'chinese-writing/benchmark_all.jsonl'));
if (hash(ziyaRaw) !== 'b3af78bc135273daddd904f66faeda802f22ee2e345472ba1036c6a2681cf6a3' || hash(writingRaw) !== '18fee37c645166eb2e206b36366b2e354265b1e4201db2c86e759e825eaddcbe') throw new Error('UNPINNED_WRITING_SOURCE');
const ziya = parseLines(ziyaRaw.toString('utf8')), writing = parseLines(writingRaw.toString('utf8'));
const subset = selected.items.map(item => {
  const isZiya = item.qualifiedId.startsWith('ziya:');
  const row = (isZiya ? ziya : writing).find(row => String(isZiya ? row.question_id : row.index) === String(item.sourceId));
  const query = isZiya ? row?.text : row?.query;
  if (!query || hash(query) !== item.querySha256) throw new Error('WRITING_SELECTION_MISMATCH');
  return { sourceId: item.qualifiedId, query, querySha256: item.querySha256, category: item.type, ...(row.checklist ? { checklist: row.checklist } : {}) };
});
if (subset.length !== 12) throw new Error('WRITING_SELECTION_MISMATCH');
await mkdir('resources/licenses', { recursive: true });
await mkdir('resources/protocols', { recursive: true });
for (const [id, key] of [['tiny-mmlu','tinyMMLU'],['tiny-gsm8k','tinyGSM8k']]) {
  const rows = mapping[key].rows;
  if (rows.length !== 100 || new Set(rows.map(x => x.source_id)).size !== 100) throw new Error('TINY_MAPPING_MISMATCH');
  await writeFile(`resources/protocols/${id}.json`, JSON.stringify(rows, null, 2) + '\n');
}
await writeFile('resources/protocols/writing.json', JSON.stringify(subset, null, 2) + '\n');
const datasets = [
  { id:'tiny-mmlu',path:'protocols/tiny-mmlu.json',count:100,source:'https://huggingface.co/datasets/tinyBenchmarks/tinyMMLU',revision:'cd6a8ee9e1e6f3f18f683535f6c096c386a85da3',license:'MIT parent data; exact fixed selection with recorded whitespace differences' },
  { id:'tiny-gsm8k',path:'protocols/tiny-gsm8k.json',count:100,source:'https://huggingface.co/datasets/tinyBenchmarks/tinyGSM8k',revision:'b870449ed96ee3e308748b550908332450ec4098',license:'MIT parent data; exact fixed selection' },
  { id:'ifeval',path:'protocols/ifeval.jsonl',count:541,source:'https://github.com/google-research/google-research/tree/e6890f85757dd84e27ca6df2dd30651dafad28e0/instruction_following_eval',revision:'e6890f85757dd84e27ca6df2dd30651dafad28e0',license:'Apache-2.0' },
  { id:'humaneval-plus',path:'protocols/humaneval-plus.json',count:164,source:'https://github.com/evalplus/humanevalplus_release/releases/tag/v0.1.10',revision:'v0.1.10',license:'Apache-2.0 AND MIT' },
  { id:'writing',path:'protocols/writing.json',count:12,source:'https://huggingface.co/datasets/IDEA-CCNL/Ziya-Writing-Eval-Chinese ; https://github.com/X-PLUG/WritingBench',revision:'f55b23a942608083cffe2813c803d3517ebb1e41 ; ae2d5176449b7b769815482641d35926f26793eb',license:'Apache-2.0' },
];
const licenseSources = [
  ['tiny-source-mapping/licenses/hendrycks-test-LICENSE','MMLU-MIT.txt'],
  ['tiny-source-mapping/licenses/grade-school-math-LICENSE','GSM8K-MIT.txt'],
  ['tiny-source-mapping/licenses/tinyBenchmarks-LICENSE','tinyBenchmarks-MIT.txt'],
  ['model-eval-resource-implementation/ifeval-LICENSE','IFEval-Apache-2.0.txt'],
  ['model-eval-feasibility/evalplus-v0.1.10-static/LICENSE-Apache-2.0','HumanEvalPlus-LICENSE.txt'],
  ['writing-license-audit/WritingBench-LICENSE','WritingBench-Apache-2.0.txt'],
];
for (const [source, target] of licenseSources) await copyFile(join(audit, source), join('resources/licenses', target));
for (const file of await readdir(join(audit, 'runtime-notices/licenses'))) await copyFile(join(audit, 'runtime-notices/licenses', file), join('resources/licenses', file));
await writeFile('resources/licenses/tiny-provenance.md', '# Fixed tiny datasets\n\nThe fixed 100+100 selections and their 500+500 source demonstrations are mapped to the original parent data. MMLU: cais/mmlu@c30699e8356da336a370243923dbaf21066bb9fe (dataset card MIT); GSM8K: openai/gsm8k@740312add88f781978c0658806c59bc2815b9866 (dataset card MIT), matching the OpenAI grade-school-math source. Parent IDs and raw hashes are retained in the dataset rows; demonstration IDs are in protocols/tiny-fewshot-provenance.json.\n\nMMLU has 92 exact matches and 8 question-boundary whitespace differences; choices and labels match exactly, and original tiny prompt strings are preserved. GSM8k questions and complete answers match exactly. The tiny HF cards do not declare a separate data license; distribution relies on the mapped MIT parent data, not an assumption about the software repository license. Retain the accompanying MIT notices. Cite Hendrycks et al., Measuring Massive Multitask Language Understanding (2021), and Cobbe et al., Training Verifiers to Solve Math Word Problems (2021).\n');
await copyFile(join(audit, 'tiny-source-mapping/fewshot-mapping.json'), 'resources/protocols/tiny-fewshot-provenance.json');
for (const name of await readdir(join(audit, 'tiny-source-mapping/cards'))) await copyFile(join(audit, 'tiny-source-mapping/cards', name), join('resources/licenses', name));
await writeFile('resources/licenses/writing-provenance.md', '# Writing resources\n\nZiya fixed author dataset card: Apache-2.0. WritingBench fixed repository root: Apache-2.0. Selected prompts are unchanged. WritingBench tasks 59/287 do not identify their external source materials; no contrary license statement was found in the targeted audit. This records the available license basis rather than certifying third-party ownership.\n');
const runtimeNotices = await readJson(join(audit,'runtime-notices/index.json'));
await writeFile('resources/licenses/runtime-components.json', JSON.stringify({
  inventoryLimit:runtimeNotices.inventory_limit,pinnedRevisions:runtimeNotices.pinned_revisions,
  files:runtimeNotices.license_files.map(({local_path,...fields})=>({...fields,bundledPath:local_path})),
},null,2)+'\n');
const files = [];
for (const dataset of datasets) {
  const bytes = await readFile(join('resources', dataset.path));
  files.push({ path:dataset.path,size:bytes.length,sha256:hash(bytes),kind:'dataset',source:dataset.source,revision:dataset.revision,license:dataset.license });
}
for (const name of ['general-chat-v1.json','rubric-writing-v1.json','tiny-fewshot-provenance.json']) {
  const path=`protocols/${name}`,bytes=await readFile(join('resources',path));
  files.push({path,size:bytes.length,sha256:hash(bytes),kind:'protocol',source:'This tool; fixed public source mapping where attributed',revision:'v1',license:name.includes('provenance')?'MIT':'MIT'});
}
for (const name of (await readdir('resources/licenses')).sort()) {
  const path = `licenses/${name}`, bytes = await readFile(join('resources', path));
  files.push({ path,size:bytes.length,sha256:hash(bytes),kind:'license',source:'See per-resource attribution and source URLs',revision:'suite-v1',license:'See file' });
}
const manifest = { schemaVersion:1,resourceVersion:'suite-2026-10-31-v1',generalId:'general-chat-strict-v1',writingId:'work-writing-12-v1',
  datasets:datasets.map(({id,path,count})=>({id,path,count})),files,gates:{resources:'passed',runtime:'pending'} };
const raw = JSON.stringify(manifest, null, 2) + '\n';
await writeFile('resources/manifest.json', raw);
await mkdir('src/resources', { recursive:true });
await writeFile('src/resources/pins.ts', `/** Fixed offline resource manifest; not supplied by the Client. */\nexport const RESOURCE_MANIFEST_SHA256 = '${hash(raw)}';\n`);
process.stdout.write(`Imported 905 general + 12 writing questions. Manifest SHA256 ${hash(raw)}. Runtime gate remains pending.\n`);

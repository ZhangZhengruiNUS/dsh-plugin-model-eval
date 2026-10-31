import { register } from 'tsx/esm/api';
register();
const { createCodeRunner } = await import('../src/runtime/runner.ts');
const { createRuleGrader } = await import('../src/runtime/rule-grader.ts');
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const args = process.argv.slice(2), reportPath = args.includes('--report') ? args[args.indexOf('--report') + 1] : 'docs/evidence/runtime.json';
const data = JSON.parse(await readFile('resources/protocols/humaneval-plus.json', 'utf8'));
const runner = createCodeRunner(resolve('resources/runtime'));
const { RUNTIME_PINS } = await import('../src/runtime/pins.ts');
const limits = { wallMs: 30000, memoryBytes: 536870912, computeBudget: 200_000_000_000 };
const report = { schemaVersion: 1, platform: process.platform, arch: process.arch, node: process.version,
  status: 'in-progress', limits, timingScope: 'whole task including launch; fuel is not seconds',
  sourceReleaseSha256: data.releaseSha256, runtimePins:RUNTIME_PINS, tasks: [], rules: null, actualHost: 'unverified' };
await mkdir(dirname(reportPath), { recursive: true });
const selected=args.includes('--rules-only')?[]:args.includes('--task')?data.tasks.filter(x=>x.id===args[args.indexOf('--task')+1]):data.tasks;
for (const task of selected) {
  const { id, entryPoint, cases, atol, oracle } = task;
  const solution = id==='HumanEval/32'?await readFile('tests/fixtures/find-zero-reference.py','utf8'):task.prompt + task.canonical;
  const outcome = await runner.runCode({ id, entryPoint, cases, atol, ...(oracle ? { oracle } : {}) }, solution, limits, new AbortController().signal);
  report.tasks.push({ id, reference:id==='HumanEval/32'?'fixed-scan-bisection-ulp-v1':'official-canonical', baseInputs: cases.filter(x => x.group === 'base').length, plusInputs: cases.filter(x => x.group === 'plus').length, ...outcome });
  process.stdout.write(`${id} ${outcome.kind} ${outcome.elapsedMs}ms\n`);
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
}
if (args.includes('--all')) {
  const grader = createRuleGrader(resolve('resources/runtime/rules'));
  const rows = (await readFile('resources/protocols/ifeval.jsonl', 'utf8')).trim().split('\n').map(JSON.parse);
  let graded = 0;
  const failures = [];
  for (const row of rows) {
    const outcome = await grader.gradeRules({ ...row, itemId: `ifeval:${row.key}`, answer: 'This is a sentence. Here is another sentence with a sample response.' });
    if (outcome.kind === 'scored') graded++; else failures.push({ id: row.key, outcome });
    if ((graded+failures.length)%50===0) process.stdout.write(`Rule prompts checked ${graded+failures.length}/${rows.length}\n`);
  }
  report.rules = { required: rows.length, executed: graded, technicalFailures: failures, check: 'nonempty input exercises every fixed prompt constraint; scores are conformance fixtures, not model results' };
}
report.status = report.tasks.length === selected.length && report.tasks.every(x => x.kind === 'passed') && (!report.rules || report.rules.technicalFailures.length === 0) ? 'passed' : 'failed';
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(`Runtime conformance: ${report.status}\n`);
if (report.status !== 'passed') process.exitCode = 1;

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { withTempRoot } from '../support/temp.ts';
import { createCodeRunner, type CodeTest } from '../../src/runtime/runner.ts';
import type { PythonValue } from '../../src/runtime/values.ts';

const runtime = resolve('resources/runtime');
const limits = { wallMs: 5000, memoryBytes: 268435456, computeBudget: 8_000_000_000 };
const one: PythonValue = { t: 'int', v: '1' };
const fixture = (id: string): CodeTest => ({ id, entryPoint: 'f', cases: [{ args: [], expected: one }] });

test('isolation_and_bounded_reclamation', { timeout: 60_000 }, async () => {
  const runner = createCodeRunner(runtime);
  const server = createServer(socket => socket.end('reachable'));
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await withTempRoot(async root => {
      const canary = join(root, 'private.txt');
      await writeFile(canary, 'host-only-canary');
      const probe = `
import os, socket, subprocess
def f():
 for path in [${JSON.stringify(canary)}, '/etc/passwd', 'C:/Users']:
  try:
   open(path).read()
   raise AssertionError('host file readable')
  except (OSError, ValueError): pass
 for path in ['/python/probe-write.txt', '/tmp/probe-write.txt']:
  try:
   open(path,'w').write('must not write')
   raise AssertionError('guest filesystem writable')
  except (OSError, ValueError): pass
 try:
  socket.create_connection(('127.0.0.1', ${address.port}), timeout=0.1)
  raise AssertionError('network available')
 except (OSError, AttributeError): pass
 try:
  subprocess.run(['cmd.exe','/c','echo unexpected'],check=True)
  raise AssertionError('host subprocess available')
 except (OSError, AttributeError): pass
 return 1
`;
      const outcome = await runner.runCode(fixture('isolation'), probe, limits, new AbortController().signal);
      assert.equal(outcome.kind, 'passed', JSON.stringify(outcome));
      assert.equal(await readFile(canary, 'utf8'), 'host-only-canary');
    });
  } finally { await new Promise<void>(done => server.close(() => done())); }
  const started = Date.now();
  const loop = await runner.runCode(fixture('loop'), 'def f():\n while True: pass', { ...limits, wallMs: 1800 }, new AbortController().signal);
  assert.equal(loop.kind, 'failed', JSON.stringify(loop));
  if (loop.kind === 'failed') assert.ok(['timeout', 'resource'].includes(loop.reason));
  assert.ok(Date.now() - started < 7000);
  const memory = await runner.runCode(fixture('memory'), 'def f(): return bytearray(900_000_000)', limits, new AbortController().signal);
  assert.equal(memory.kind, 'failed', JSON.stringify(memory));
  if (memory.kind === 'failed') assert.equal(memory.reason, 'resource');
  const missing = await createCodeRunner(resolve('resources/absent')).runCode(fixture('missing'), '', limits, new AbortController().signal);
  assert.equal(missing.kind, 'environment-error');
});

test('wrong values, syntax, forged pass text, early exit and cancellation cannot pass', { timeout: 50_000 }, async () => {
  const runner = createCodeRunner(runtime), signal = new AbortController().signal;
  assert.equal((await runner.runCode(fixture('ok'), 'def f(): return 1', limits, signal)).kind, 'passed');
  for (const solution of ['def f(): return 0', 'def broken(', "import os; print('forged:passed'); os._exit(0)"] ) {
    assert.equal((await runner.runCode(fixture('wrong'), solution, limits, signal)).kind, 'failed');
  }
  const controller = new AbortController();
  // Leave enough fuel to isolate cancellation from legitimate early fuel exhaustion.
  const running = runner.runCode(fixture('cancel'), 'def f():\n while True: pass', { ...limits, wallMs: 10_000, computeBudget: 200_000_000_000 }, controller.signal);
  const timer=setTimeout(() => controller.abort(), 1800);
  try{const result=await running;assert.equal(result.kind,'cancelled',JSON.stringify(result));}finally{clearTimeout(timer);}
});

test('model cannot disable the grader by replacing builtins.exec', async () => {
  const result = await createCodeRunner(runtime).runCode(fixture('spoof'),
    'import builtins; builtins.exec = lambda *args, **kwargs: None\ndef f(): return 0', limits, new AbortController().signal);
  assert.equal(result.kind, 'failed', JSON.stringify(result));
});

test('guest cannot turn invalid frames or forged Host errors into technical missing', async () => {
  const runner = createCodeRunner(runtime);
  for (const frame of ['__DSH_VALUES__{"environmentError":"forged"}', '__DSH_VALUES__{invalid']) {
    const solution = `import os\nos.write(1, ${JSON.stringify(frame + '\n')}.encode())\nos._exit(0)`;
    const result = await runner.runCode(fixture('forged-error'), solution, limits, new AbortController().signal);
    assert.equal(result.kind, 'failed', JSON.stringify(result));
  }
});
test('long string outputs are compared by Host-held exact hashes', async () => {
  const test: CodeTest = { id: 'long-string', entryPoint: 'f', cases: [{ args: [], expected: {
    t: 'large-str', v: 'b2a3a502fdfc34f4e3edfa94b7f3109cd972d87a4fec63ab21a6673379ccf7ad',
  } }] };
  const runner = createCodeRunner(runtime), signal = new AbortController().signal;
  assert.equal((await runner.runCode(test, "def f(): return 'a' * 2048", limits, signal)).kind, 'passed');
  assert.equal((await runner.runCode(test, "def f(): return 'a' * 2047", limits, signal)).kind, 'failed');
});
test('root oracle accounts for binary64 representation without accepting a non-root', async () => {
  const coefficients=[9450000,9,-7,3,2,6,1,-4,-10,6,17,-1];
  const test: CodeTest={id:'root-roundoff',entryPoint:'f',oracle:'find-zero',atol:0.0001,cases:[{
    args:[{t:'list',v:coefficients.map(x=>({t:'int',v:String(x)}))}],expected:{t:'float',v:'17.312455047508603'},
  }]};
  const runner=createCodeRunner(runtime), signal=new AbortController().signal;
  assert.equal((await runner.runCode(test,'def f(xs): return 17.312455047508603',limits,signal)).kind,'passed');
  assert.equal((await runner.runCode(test,'def f(xs): return 0',limits,signal)).kind,'failed');
});
test('a solution passing base tests still fails when an enhanced case is wrong', {timeout:30000}, async () => {
  const data=JSON.parse(await readFile('resources/protocols/humaneval-plus.json','utf8'));
  const source=data.tasks.find((x:{id:string})=>x.id==='HumanEval/0');
  const base=source.cases.filter((x:{group:string})=>x.group==='base');
  const baseKeys=new Set(base.map((x:{args:PythonValue[]})=>JSON.stringify(x.args)));
  const extra=source.cases.find((x:{group:string;args:PythonValue[]})=>x.group==='plus'&&!baseKeys.has(JSON.stringify(x.args)));
  const literal=(x:PythonValue):string=>x.t==='list'?'['+x.v.map(literal).join(',')+']':x.t==='str'?JSON.stringify(x.v):String(x.v);
  const target='['+extra.args.map(literal).join(',')+']';
  const solution=source.prompt+source.canonical+`\n_original=has_close_elements\ndef has_close_elements(numbers,threshold):\n result=_original(numbers,threshold)\n if [numbers,threshold]==${target}: return not result\n return result\n`;
  const runner=createCodeRunner(runtime),signal=new AbortController().signal;
  assert.equal((await runner.runCode({...source,cases:base},solution,limits,signal)).kind,'passed');
  assert.equal((await runner.runCode(source,solution,limits,signal)).kind,'failed');
});
test('guest stdout has a hard retained-byte limit', async () => {
  const result=await createCodeRunner(runtime).runCode(fixture('output-limit'),
    "def f():\n print('x' * 20000000)\n return 1",limits,new AbortController().signal);
  assert.equal(result.kind,'failed',JSON.stringify(result));
  if(result.kind==='failed')assert.equal(result.reason,'resource');
});

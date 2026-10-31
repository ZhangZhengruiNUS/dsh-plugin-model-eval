import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyRuntime } from './integrity.ts';
import { RUNTIME_PINS } from './pins.ts';
import { isFloatValue, matchesExpected, type PythonValue } from './values.ts';

export interface CodeCase { args: PythonValue[]; expected: PythonValue; group?: 'base' | 'plus' }
export interface CodeTest { id: string; entryPoint: string; cases: CodeCase[]; atol?: number; oracle?: 'find-zero' }
export interface CodeLimits { wallMs: number; memoryBytes: number; computeBudget: number }
export type CodeOutcome = { kind: 'passed'; elapsedMs: number }
  | { kind: 'failed'; reason: 'timeout' | 'resource' | 'assertion' | 'syntax'; elapsedMs: number }
  | { kind: 'cancelled'; elapsedMs: number }
  | { kind: 'environment-error'; code: string; elapsedMs: number };
export interface CodeRunner { runCode(test: CodeTest, solution: string, limits: CodeLimits, signal: AbortSignal): Promise<CodeOutcome> }

function validValue(value: unknown, depth = 0): value is PythonValue {
  if (depth > 64 || !value || typeof value !== 'object') return false;
  const { t, v } = value as { t: string; v: unknown };
  if (t === 'NoneType') return v === null;
  if (t === 'bool') return typeof v === 'boolean';
  if (t === 'str') return typeof v === 'string';
  if (['large-int', 'large-str', 'large-int-list', 'large-int-tuple'].includes(t)) return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  if (t === 'int') return typeof v === 'string' && v.length <= 100_000 && /^-?\d+$/.test(v);
  if (t === 'float') return typeof v === 'string' && v.length < 100 && /^(?:-?(?:inf|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)|nan)$/i.test(v);
  if (t === 'list' || t === 'tuple' || t === 'set') return Array.isArray(v) && v.length <= 100_000 && v.every(x => validValue(x, depth + 1));
  return t === 'dict' && Array.isArray(v) && v.length <= 100_000 && v.every(x => Array.isArray(x) && x.length === 2 && x.every(y => validValue(y, depth + 1)));
}

/** The model only produces values. All trusted comparisons stay in this Host. */
export function createCodeRunner(runtimeRoot: string): CodeRunner {
  const root = resolve(runtimeRoot);
  return { async runCode(test, solution, limits, signal) {
    const started = performance.now(), elapsedMs = () => Math.round(performance.now() - started);
    if (signal.aborted) return { kind: 'cancelled', elapsedMs: elapsedMs() };
    if (process.platform !== 'win32' || process.arch !== 'x64') return { kind: 'environment-error', code: 'UNSUPPORTED_RUNTIME', elapsedMs: elapsedMs() };
    if (!Number.isSafeInteger(limits.wallMs) || limits.wallMs < 100 || limits.wallMs > 300_000
      || !Number.isSafeInteger(limits.memoryBytes) || limits.memoryBytes < 64 * 1024 * 1024 || limits.memoryBytes > 1024 * 1024 * 1024
      || !Number.isSafeInteger(limits.computeBudget) || limits.computeBudget < 1 || !test.cases.length || test.cases.length > 3000
      || !/^[A-Za-z_]\w*$/.test(test.entryPoint)) return { kind: 'environment-error', code: 'INVALID_CODE_REQUEST', elapsedMs: elapsedMs() };
    let sandbox: string | undefined;
    try {
      const host = join(root, 'code-host'), guest = join(root, 'wasi');
      await verifyRuntime(host, 'code-host', RUNTIME_PINS['code-host']);
      await verifyRuntime(guest, 'wasi', RUNTIME_PINS.wasi);
      sandbox = await mkdtemp(join(tmpdir(), 'dsh-eval-code-'));
      const inputPath = join(sandbox, 'input.json');
      // Expected answers and score logic NEVER enter the guest input or mounts.
      await writeFile(inputPath, JSON.stringify({ solution, entryPoint: test.entryPoint, inputs: test.cases.map(x => x.args),
        encodings: test.cases.map(x => x.expected.t.startsWith('large-') ? x.expected.t : 'values') }), { flag: 'wx' });
      if (signal.aborted) return { kind: 'cancelled', elapsedMs: elapsedMs() };
      const result = await new Promise<{ code: number | null; output: string; stopped?: 'cancelled' | 'timeout' | 'resource'; spawnFailed: boolean }>(done => {
        const child = spawn(join(host, 'python.exe'), ['-I', '-B', '-X', 'utf8', join(host, 'execute_wasi.py')], {
          shell: false, windowsHide: true, cwd: host, env: {}, stdio: ['pipe', 'pipe', 'pipe'],
        });
        let output = '', bytes = 0, spawnFailed = false, stopped: 'cancelled' | 'timeout' | 'resource' | undefined;
        const stop = (why: typeof stopped) => { stopped ??= why; child.kill('SIGKILL'); };
        const timer = setTimeout(() => stop('timeout'), limits.wallMs);
        const cancel = () => stop('cancelled');
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
        child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 20 * 1024 * 1024) stop('resource'); else output += chunk.toString('utf8'); });
        child.stderr.on('data', () => {});
        child.stdin.on('error', () => {});
        child.on('error', () => { spawnFailed = true; });
        child.on('close', code => { clearTimeout(timer); signal.removeEventListener('abort', cancel); done({ code, output, spawnFailed, ...(stopped ? { stopped } : {}) }); });
        child.stdin.end(JSON.stringify({ runtimeRoot: guest, inputPath, ...limits,
          ...(test.oracle === 'find-zero' ? { oracle:'find-zero-stable-v1', absoluteTolerance:test.atol ?? 0 } : {}) }));
      });
      if (result.spawnFailed) return { kind: 'environment-error', code: 'SPAWN_FAILED', elapsedMs: elapsedMs() };
      if (result.stopped === 'cancelled') return { kind: 'cancelled', elapsedMs: elapsedMs() };
      if (result.stopped) return { kind: 'failed', reason: result.stopped, elapsedMs: elapsedMs() };
      if (result.code !== 0) return { kind: 'environment-error', code: 'HOST_DRIVER_FAILED', elapsedMs: elapsedMs() };
      let data;
      try { data = JSON.parse(result.output); } catch { return { kind: 'environment-error', code: 'INVALID_HOST_FRAME', elapsedMs: elapsedMs() }; }
      if (data.environmentError) return { kind: 'environment-error', code: 'WASI_DRIVER_FAILED', elapsedMs: elapsedMs() };
      if (data.failure) return { kind: 'failed', reason: ['timeout', 'resource', 'syntax'].includes(data.failure) ? data.failure : 'assertion', elapsedMs: elapsedMs() };
      if (!Array.isArray(data.items) || data.items.length !== test.cases.length || !data.items.every((v: unknown) => validValue(v))) return { kind: 'failed', reason: 'assertion', elapsedMs: elapsedMs() };
      if (test.oracle === 'find-zero') return Array.isArray(data.rootChecks) && data.rootChecks.length === test.cases.length && data.rootChecks.every((x:unknown) => x===true)
        ? {kind:'passed',elapsedMs:elapsedMs()} : {kind:'failed',reason:'assertion',elapsedMs:elapsedMs()};
      let atol = test.atol ?? 0, group: CodeCase['group'];
      for (let i = 0; i < test.cases.length; i++) {
        const item = test.cases[i]!, actual = data.items[i] as PythonValue;
        if (group !== item.group) { group = item.group; atol = test.atol ?? 0; }
        if (!atol && isFloatValue(item.expected)) atol = 1e-6;
        if (!matchesExpected(actual, item.expected, atol)) return { kind: 'failed', reason: 'assertion', elapsedMs: elapsedMs() };
      }
      return { kind: 'passed', elapsedMs: elapsedMs() };
    } catch (err) {
      return { kind: 'environment-error', code: (err as NodeJS.ErrnoException).code ?? (err as Error).message, elapsedMs: elapsedMs() };
    } finally { if (sandbox) await rm(sandbox, { recursive: true, force: true }); }
  } };
}

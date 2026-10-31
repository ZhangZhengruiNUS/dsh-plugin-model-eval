import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { GradeResult, JsonValue } from '../contracts.ts';
import { verifyRuntime } from './integrity.ts';
import { RUNTIME_PINS } from './pins.ts';

export interface RuleGradeInput {
  itemId: string; key: number; prompt: string; instruction_id_list: string[];
  kwargs: Record<string, JsonValue>[]; answer: string;
}
export interface RuleGrader { gradeRules(request: RuleGradeInput): Promise<GradeResult> }

/** This separate trusted process treats every response as JSON text, never code. */
export function createRuleGrader(runtimeRoot: string): RuleGrader {
  const root = resolve(runtimeRoot);
  return { async gradeRules(request) {
    const missing = (code: string): GradeResult => ({
      kind: 'technical-missing', track: 'general', itemId: request.itemId,
      error: { code, retryable: false, phase: 'grader', message: '本地规则评分环境无法完成检查。' }, evidence: null,
    });
    try {
      if (process.platform !== 'win32' || process.arch !== 'x64') return missing('UNSUPPORTED_RUNTIME');
      await verifyRuntime(root, 'trusted-ifeval', RUNTIME_PINS['trusted-ifeval']);
      const result = await new Promise<{ code: number | null; text: string; timedOut: boolean; spawnFailed: boolean }>(done => {
        const child = spawn(join(root, 'python.exe'), ['-B', '-X', 'utf8', join(root, 'grade_rules.py')], {
          shell: false, windowsHide: true, cwd: root,
          env: {}, stdio: ['pipe', 'pipe', 'pipe'],
        });
        let text = '', bytes = 0, timedOut = false, spawnFailed = false;
        const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 30_000);
        child.on('error', () => { spawnFailed = true; });
        child.stdout.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 65536) { timedOut = true; child.kill('SIGKILL'); } else text += chunk.toString('utf8');
        });
        child.stderr.on('data', () => {});
        child.stdin.on('error', () => {});
        child.on('close', code => { clearTimeout(timer); done({ code, text, timedOut, spawnFailed }); });
        child.stdin.end(JSON.stringify(request));
      });
      if (result.spawnFailed || result.timedOut || result.code !== 0) return missing('RULE_PROCESS_FAILED');
      const data = JSON.parse(result.text);
      if (typeof data.passed !== 'boolean' || !Array.isArray(data.instructions)
        || data.instructions.length !== request.instruction_id_list.length || !data.instructions.every((x: unknown) => typeof x === 'boolean')) return missing('INVALID_RULE_RESULT');
      return { kind: 'scored', track: 'general', itemId: request.itemId, passed: data.passed,
        evidence: { metric: 'prompt-level-strict', instructions: data.instructions, seed: 0, tokenizer:'ifeval-code-tokenizer-v1' } };
    } catch { return missing('RULE_ENVIRONMENT_UNAVAILABLE'); }
  } };
}

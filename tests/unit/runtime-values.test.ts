import test from 'node:test';
import assert from 'node:assert/strict';
import { pythonEqual, matchesExpected, type PythonValue } from '../../src/runtime/values.ts';
const int = (v: string): PythonValue => ({ t: 'int', v });
const float = (v: string): PythonValue => ({ t: 'float', v });
test('host compares exact large integers without Number rounding', () => {
  assert.equal(pythonEqual(int('9007199254740992'), int('9007199254740993')), false);
  assert.equal(pythonEqual(int('9007199254740993'), float('9007199254740992')), false);
  assert.equal(pythonEqual(int('1' + '0'.repeat(1000)), float('inf')), false);
  assert.equal(pythonEqual(int('1'), { t: 'bool', v: true }), true);
  assert.equal(pythonEqual({ t: 'tuple', v: [int('1')] }, { t: 'list', v: [int('1')] }), false);
});
test('tolerance follows upstream type, length, broadcasting and NaN rules', () => {
  assert.equal(matchesExpected(float('1.0000001'), float('1'), 1e-6), true);
  assert.equal(matchesExpected(float('1.1'), float('1'), 1e-6), false);
  assert.equal(matchesExpected(float('nan'), float('nan'), 1e-6), false);
  assert.equal(matchesExpected(float('inf'), float('inf'), 1e-6), true);
  assert.equal(matchesExpected({ t: 'list', v: [float('1.0')] }, { t: 'tuple', v: [float('1.0000001')] }, 1e-6), false);
  assert.equal(matchesExpected({ t: 'list', v: [float('1'), float('1')] }, { t: 'list', v: [float('1.0000001')] }, 1e-6), false);
});
test('forged sets and dictionaries cannot reuse one expected member twice', () => {
  assert.equal(pythonEqual({ t: 'set', v: [int('1'), int('1')] }, { t: 'set', v: [int('1'), int('2')] }), false);
  assert.equal(pythonEqual({ t: 'dict', v: [[int('1'), int('3')], [int('1'), int('3')]] },
    { t: 'dict', v: [[int('1'), int('3')], [int('2'), int('4')]] }), false);
});

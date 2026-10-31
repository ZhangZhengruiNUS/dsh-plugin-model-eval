/** Typed values preserve Python integers, tuples, and floating-point specials. */
export type PythonValue = { t: 'int' | 'float' | 'str' | 'large-int' | 'large-str' | 'large-int-list' | 'large-int-tuple'; v: string }
  | { t: 'bool'; v: boolean } | { t: 'NoneType'; v: null }
  | { t: 'list' | 'tuple' | 'set'; v: PythonValue[] }
  | { t: 'dict'; v: [PythonValue, PythonValue][] };
function numeric(v: PythonValue): number | undefined {
  if (v.t === 'bool') return Number(v.v);
  if (v.t === 'float' && v.v === 'inf') return Infinity;
  if (v.t === 'float' && v.v === '-inf') return -Infinity;
  if (v.t === 'int' || v.t === 'float') return Number(v.v);
  return undefined;
}
export function pythonEqual(a: PythonValue, b: PythonValue): boolean {
  if (a.t === 'int' && b.t === 'int') return BigInt(a.v) === BigInt(b.v);
  const x = numeric(a), y = numeric(b);
  if (x !== undefined && y !== undefined) {
    if (a.t === 'int') return Number.isFinite(y) && Number.isInteger(y) && BigInt(a.v) === BigInt(y);
    if (b.t === 'int') return Number.isFinite(x) && Number.isInteger(x) && BigInt(b.v) === BigInt(x);
    return x === y;
  }
  if (a.t !== b.t) return false;
  if (a.t === 'dict' && b.t === 'dict') {
    const remaining = [...b.v];
    return a.v.length === b.v.length && a.v.every(([k, v]) => {
      const index = remaining.findIndex(([p, q]) => pythonEqual(k, p) && pythonEqual(v, q));
      return index >= 0 && remaining.splice(index, 1).length === 1;
    });
  }
  if (a.t === 'set' && b.t === 'set') {
    const remaining = [...b.v];
    return a.v.length === b.v.length && a.v.every(v => {
      const index = remaining.findIndex(q => pythonEqual(v, q));
      return index >= 0 && remaining.splice(index, 1).length === 1;
    });
  }
  if ((a.t === 'tuple' || a.t === 'list') && (b.t === 'tuple' || b.t === 'list')) return a.v.length === b.v.length && a.v.every((v, i) => pythonEqual(v, b.v[i]!));
  return a.v === b.v;
}
export function isFloatValue(v: PythonValue): boolean {
  return v.t === 'float' || ((v.t === 'list' || v.t === 'tuple') && v.v.length > 0 && v.v.every(x => x.t === 'float'));
}
function shape(v: PythonValue): number[] {
  if (v.t !== 'list' && v.t !== 'tuple') return [];
  const rest = v.v.length ? shape(v.v[0]!) : [];
  if (!v.v.every(x => JSON.stringify(shape(x)) === JSON.stringify(rest))) throw new Error('ragged');
  return [v.v.length, ...rest];
}
function allClose(a: PythonValue, b: PythonValue, atol: number): boolean {
  try {
    const sa = shape(a), sb = shape(b), n = Math.max(sa.length, sb.length), dims: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = sa.at(-i - 1) ?? 1, y = sb.at(-i - 1) ?? 1;
      if (x !== y && x !== 1 && y !== 1) return false;
      dims.unshift(x === 1 ? y : x);
    }
    const get = (v: PythonValue, s: number[], idx: number[]) => {
      let value = v;
      for (let i = 0; i < s.length; i++) {
        if (value.t !== 'list' && value.t !== 'tuple') throw new Error('shape');
        value = value.v[s[i] === 1 ? 0 : idx[n - s.length + i]!]!;
      }
      return numeric(value);
    };
    const visit = (idx: number[]): boolean => {
      if (idx.length < n) {
        for (let i = 0; i < dims[idx.length]!; i++) if (!visit([...idx, i])) return false;
        return true;
      }
      const x = get(a, sa, idx), y = get(b, sb, idx);
      return x !== undefined && y !== undefined && !Number.isNaN(x) && !Number.isNaN(y)
        && (x === y || (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= atol + 1e-7 * Math.abs(y)));
    };
    return visit([]);
  } catch { return false; }
}
export function matchesExpected(actual: PythonValue, expected: PythonValue, atol: number): boolean {
  if (pythonEqual(actual, expected)) return true;
  if (!atol || actual.t !== expected.t) return false;
  if ((expected.t === 'list' || expected.t === 'tuple') && (actual.t === 'list' || actual.t === 'tuple') && actual.v.length !== expected.v.length) return false;
  return allClose(actual, expected, atol);
}

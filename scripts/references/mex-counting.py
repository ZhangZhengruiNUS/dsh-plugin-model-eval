"""Development-only port of pinned accepted CodeContests row111 /1608_F.
CC-BY-4.0 solutions[0], language2 SHA256
3b1188cf9f4294e77fd38eb7d8098dfcfb19fbdd0ef6e9a3fe8d63adfeb2abbf.
State tracks current mex and abstract distinct larger symbols. Factorials
convert counts when mex advances and at final concrete-label assignment.
Independent oracle enumerates every array for small n, checking each prefix.
"""
import sys
MOD = 998244353

def solve(n, k, values):
    fac = [1] * (n + 1)
    for i in range(1, n + 1):
        fac[i] = fac[i - 1] * i % MOD
    inv = [1] * (n + 1)
    inv[n] = pow(fac[n], MOD - 2, MOD)
    for i in range(n, 0, -1):
        inv[i - 1] = inv[i] * i % MOD
    previous = {0: [1] + [0] * n}
    for i, centre in enumerate(values, 1):
        current = {}
        weighted = [0] * (2 * n + 2 * k + 2)
        old_mexes = sorted(previous)
        cursor = 0
        for mex in range(max(0, centre - k), min(n, centre + k) + 1):
            while cursor < len(old_mexes) and old_mexes[cursor] < mex:
                old = old_mexes[cursor]
                row = previous[old]
                for l in range(i + 1):
                    weighted[l + old] = (weighted[l + old] + row[l] * fac[l]) % MOD
                cursor += 1
            same = previous.get(mex)
            row = [0] * (n + 1)
            for l in range(i + 1):
                count = weighted[l + mex - 1] * inv[l] if l + mex else 0
                if same is not None:
                    count += (mex + l) * same[l]
                    if l:
                        count += same[l - 1]
                row[l] = count % MOD
            current[mex] = row
        previous = current
    answer = 0
    for mex, row in previous.items():
        for l in range(n - mex + 1):
            answer += row[l] * fac[n - mex] % MOD * inv[n - mex - l]
    return answer % MOD

if __name__ == '__main__':
    it = iter(map(int, sys.stdin.buffer.read().split()))
    n, k = next(it), next(it)
    print(solve(n, k, [next(it) for _ in range(n)]))

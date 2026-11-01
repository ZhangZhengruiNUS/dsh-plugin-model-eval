"""Development-only exact reference, pinned row69 /1599_E (CC-BY-4.0).
Accepted solutions[0], language2 SHA256
adb4da3355f0b6b7589a40f935a7124930e5269814213cd8db79a8d3dd54b322
inspected for operation semantics. Direct updates plus exact fast-doubling
Fibonacci suffice for the fixed corpus (maxN10/maxQ10); not full-scale optimized.
"""
import sys
from functools import lru_cache
MOD = 1000000007

@lru_cache(None)
def fibonacci(index):
    first, second = 0, 1
    for bit in bin(index)[2:]:
        even = first*(2*second-first) % MOD
        odd = (first*first+second*second) % MOD
        first, second = (even, odd) if bit == '0' else (odd, (even+odd) % MOD)
    return first

def solve(initial, operations):
    arrays = [list(row) for row in initial]
    out = []
    for query in operations:
        operation = query[0]
        if operation == 4:
            _, left, right = query
            out.append(sum(fibonacci(arrays[0][i]+arrays[1][i]) for i in range(left-1, right)) % MOD)
        else:
            _, which, left, right, value = query
            row = arrays[which-1]
            for i in range(left-1, right):
                if operation == 1:
                    row[i] = min(row[i], value)
                elif operation == 2:
                    row[i] = max(row[i], value)
                else:
                    row[i] += value
    return out

if __name__ == '__main__':
    it = iter(map(int, sys.stdin.buffer.read().split()))
    n, q = next(it), next(it)
    arrays = [[next(it) for _ in range(n)] for _ in range(2)]
    operations = []
    for _ in range(q):
        op = next(it)
        operations.append([op]+[next(it) for _ in range(2 if op == 4 else 4)])
    print('\n'.join(map(str, solve(arrays, operations))))

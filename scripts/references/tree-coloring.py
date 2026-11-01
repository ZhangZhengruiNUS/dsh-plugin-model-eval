"""Development-only reference, 1613_F. Tree Coloring (CodeContests CC-BY-4.0).
Source record f96191e6c802e16fcde9820f06bb33d43e59d576c5877e9f0cae0c0b1baa4709.
Accepted C++ solutions[0] SHA256
9638c46d16d85b59f2447d4ec068faefe6dde69a4b9a137a7191fa185d57dbea.
Plain polynomial product of (1+children[v]*z) followed by factorial inclusion-exclusion.
Verification evidence is recorded separately; never bundled with the plugin.
"""
import sys

MOD = 998244353
it = iter(map(int, sys.stdin.buffer.read().split()))
n = next(it)
degree = [0] * n
for _ in range(n - 1):
    u, v = next(it) - 1, next(it) - 1
    degree[u] += 1
    degree[v] += 1
polynomial = [1]
for vertex, edges in enumerate(degree):
    children = edges - (vertex != 0)
    if children == 0:
        continue
    polynomial.append(0)
    for count in range(len(polynomial) - 1, 0, -1):
        polynomial[count] = (polynomial[count]
                             + children * polynomial[count - 1]) % MOD
factorial = [1] * (n + 1)
for i in range(1, n + 1):
    factorial[i] = factorial[i - 1] * i % MOD
answer = sum((-1 if count % 2 else 1) * coefficient * factorial[n - count]
             for count, coefficient in enumerate(polynomial)) % MOD
print(answer)

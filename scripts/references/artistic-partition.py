"""Development-only reference, 1603_D. Artistic Partition (CodeContests CC-BY-4.0).
Source record 21d7b6a9d3188a668b73b07be83ef5faeae88448578c9690acecd1c82d111930.
Accepted C++ solutions[1] SHA256
4426e6a4ed2a1feb0895760df497d71b072a59e3a491ada0a04cb9efa8e90b01.
Compute c(l,r) literally with gcd and use ordinary exact partition DP.
Verification evidence is recorded separately; never bundled with the plugin.
"""
import sys
from math import gcd

it = iter(map(int, sys.stdin.buffer.read().split()))
tests = next(it)
queries = [(next(it), next(it)) for _ in range(tests)]
limit = max(n for n, _ in queries)
parts_limit = max(k for _, k in queries)
cost = [[0] * (limit + 1) for _ in range(limit + 1)]
for left in range(1, limit + 1):
    total = 0
    for right in range(left, limit + 1):
        total += sum(gcd(value, right) >= left
                     for value in range(left, right + 1))
        cost[left][right] = total
infinity = limit * (limit + 1) + 1
dp = [[infinity] * (limit + 1) for _ in range(parts_limit + 1)]
dp[0][0] = 0
for parts in range(1, parts_limit + 1):
    previous = dp[parts - 1]
    current = dp[parts]
    for right in range(parts, limit + 1):
        current[right] = min(previous[left - 1] + cost[left][right]
                             for left in range(parts, right + 1))
sys.stdout.write("\n".join(str(dp[n_parts][n]) for n, n_parts in queries) + "\n")

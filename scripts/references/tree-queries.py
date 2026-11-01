"""Development-only reference, 1606_F. Tree Queries (CodeContests CC-BY-4.0).
Source record 68230fed727e778db68859893b84127f0c22148b363acf0f47711a6ae7205f2e.
Accepted C++ solutions[1] SHA256
ab58bb5830460217c65fcc37909cb9b2e36758848cf6cba7c13a4dac3e2460b9.
Group queries by penalty and compute dp[v]=sum(max(1,dp[child]-k)); direct degree for k>=n-1.
Verification evidence is recorded separately; never bundled with the plugin.
"""
import sys
from collections import defaultdict

it = iter(map(int, sys.stdin.buffer.read().split()))
n = next(it)
graph = [[] for _ in range(n)]
for _ in range(n - 1):
    u, v = next(it) - 1, next(it) - 1
    graph[u].append(v)
    graph[v].append(u)
children = [[] for _ in range(n)]
parent = [-1] * n
order = [0]
for node in order:
    for neighbor in graph[node]:
        if neighbor != parent[node]:
            parent[neighbor] = node
            children[node].append(neighbor)
            order.append(neighbor)
q = next(it)
groups = defaultdict(list)
answers = [0] * q
for index in range(q):
    vertex, penalty = next(it) - 1, next(it)
    if penalty >= n - 1:
        answers[index] = len(children[vertex])
    else:
        groups[penalty].append((index, vertex))
for penalty, queries in groups.items():
    dp = [0] * n
    for node in reversed(order):
        dp[node] = sum(max(1, dp[child] - penalty) for child in children[node])
    for index, vertex in queries:
        answers[index] = dp[vertex]
sys.stdout.write("\n".join(map(str, answers)) + "\n")

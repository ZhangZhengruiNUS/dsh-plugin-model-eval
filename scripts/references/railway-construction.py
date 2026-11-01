"""Development-only reference, 1580_E. Railway Construction (CodeContests CC-BY-4.0).
Source record 8b095362fb68cf3e7624b20e52d2872bca37a064755183d5c07649a200bb83da.
Accepted C++ solutions[1] SHA256
507cac9cae6a3f0e4023c0c0a174cab7dc8f54b7162c8a49a27012d502d08c34.
Dijkstra shortest-path DAG followed by naive candidate-source minimum scans for each single-predecessor vertex and each cost update.
Verification evidence is recorded separately; never bundled with the plugin.
"""
import sys
from heapq import heappush, heappop

it = iter(map(int, sys.stdin.buffer.read().split()))
n, m, q = next(it), next(it), next(it)
cost = [next(it) for _ in range(n)]
graph = [[] for _ in range(n)]
for _ in range(m):
    u, v, length = next(it) - 1, next(it) - 1, next(it)
    graph[u].append((v, length))
    graph[v].append((u, length))
distance = [10 ** 100] * n
distance[0] = 0
heap = [(0, 0)]
while heap:
    length, node = heappop(heap)
    if length != distance[node]:
        continue
    for neighbor, weight in graph[node]:
        candidate = length + weight
        if candidate < distance[neighbor]:
            distance[neighbor] = candidate
            heappush(heap, (candidate, neighbor))
required = []
for vertex in range(1, n):
    predecessors = [node for node, length in graph[vertex]
                    if distance[node] + length == distance[vertex]]
    if len(predecessors) == 1:
        predecessor = predecessors[0]
        candidates = [node for node in range(n)
                      if distance[node] < distance[vertex]
                      and (node != predecessor or predecessor == 0)]
        required.append(candidates)

def answer():
    return sum(min(cost[node] for node in candidates) for candidates in required)

out = [str(answer())]
for _ in range(q):
    vertex, increase = next(it) - 1, next(it)
    cost[vertex] += increase
    out.append(str(answer()))
sys.stdout.write("\n".join(out) + "\n")

"""Development-only reference, 1586_H. Omkar and Tours (CodeContests CC-BY-4.0).
Source record bab25cd0b977d31ba7d3ac1d30147de2c19b0ece35a348728dbb51f05a07bd91.
Accepted C++ solutions[0] SHA256
858d7ed048f5b3e6fc0c303ee3c1ee57965b7a7f6cf40f7a79d290515dcf5b7c.
Per-query threshold DFS with maximum toll tracking and worst-case tie reimbursement.
Verification evidence is recorded separately; never bundled with the plugin.
"""
import sys

it = iter(map(int, sys.stdin.buffer.read().split()))
n, q = next(it), next(it)
enjoyment = [next(it) for _ in range(n)]
graph = [[] for _ in range(n)]
for _ in range(n - 1):
    u, v, capacity, toll = next(it) - 1, next(it) - 1, next(it), next(it)
    graph[u].append((v, capacity, toll))
    graph[v].append((u, capacity, toll))
out = []
for _ in range(q):
    vehicles, start = next(it), next(it) - 1
    best = enjoyment[start]
    reimbursement = 0
    stack = [(start, -1, 0)]
    while stack:
        node, parent, paid = stack.pop()
        if enjoyment[node] > best:
            best = enjoyment[node]
            reimbursement = paid
        elif enjoyment[node] == best:
            reimbursement = max(reimbursement, paid)
        for neighbor, capacity, toll in graph[node]:
            if neighbor != parent and capacity >= vehicles:
                stack.append((neighbor, node, max(paid, toll)))
    out.append(str(best) + " " + str(reimbursement))
sys.stdout.write("\n".join(out) + "\n")

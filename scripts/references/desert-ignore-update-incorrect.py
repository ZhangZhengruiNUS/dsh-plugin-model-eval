"""Known logic error: ignores type1 updates of room illusion rates.
Published example's second answer becomes39 instead of32. Negative only.
"""
import sys
it = iter(map(int, sys.stdin.buffer.read().split()))
n, q = next(it), next(it)
rates = [abs(next(it)) for _ in range(n)]
graph = [[] for _ in range(n)]
for _ in range(n - 1):
    u, v = next(it) - 1, next(it) - 1
    graph[u].append(v)
    graph[v].append(u)
answers = []
for _ in range(q):
    kind, u, v = next(it), next(it), next(it)
    if kind == 1:
        continue  # Intentional bug, not a missing input token.
    u -= 1
    v -= 1
    stack = [(u, -1, 0)]
    while stack:
        node, parent, cost = stack.pop()
        if node == v:
            answers.append(str(cost))
            break
        for neighbor in graph[node]:
            if neighbor != parent:
                stack.append((neighbor, node, cost + rates[node] + rates[neighbor]))
print('\n'.join(answers))

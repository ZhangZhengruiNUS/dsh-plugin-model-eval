"""Development-only reference, 1608_G. Alphabetic Tree (CodeContests CC-BY-4.0).
Source record 7a7c9836eecefaf370320f7c9bfa2d28270c8abf8c6f92e1315e38c20b3a9994.
Accepted C++ solutions[0] SHA256
51332d42991226d150334b37379ce7a59fb49ba98d7eec17c6c4f864ada4a4ea.
Per-query BFS path reconstruction followed by exact overlapping bytes.find counts.
Verification evidence is recorded separately; never bundled with the plugin.
"""
import sys

tokens = iter(sys.stdin.buffer.read().split())
n, m, q = int(next(tokens)), int(next(tokens)), int(next(tokens))
graph = [[] for _ in range(n)]
for _ in range(n - 1):
    u, v, letter = int(next(tokens)) - 1, int(next(tokens)) - 1, next(tokens)
    graph[u].append((v, letter))
    graph[v].append((u, letter))
texts = [next(tokens) for _ in range(m)]
out = []
for _ in range(q):
    source, target = int(next(tokens)) - 1, int(next(tokens)) - 1
    left, right = int(next(tokens)) - 1, int(next(tokens))
    parent = [-1] * n
    label = [b""] * n
    parent[source] = source
    order = [source]
    for node in order:
        if node == target:
            break
        for neighbor, letter in graph[node]:
            if parent[neighbor] == -1:
                parent[neighbor] = node
                label[neighbor] = letter
                order.append(neighbor)
    letters = []
    node = target
    while node != source:
        letters.append(label[node])
        node = parent[node]
    pattern = b"".join(reversed(letters))
    answer = 0
    for text in texts[left:right]:
        position = text.find(pattern)
        while position != -1:
            answer += 1
            position = text.find(pattern, position + 1)
    out.append(str(answer))
sys.stdout.write("\n".join(out) + "\n")

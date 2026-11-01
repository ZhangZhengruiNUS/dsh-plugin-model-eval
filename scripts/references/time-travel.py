"""Development-only reference, 1586_G. Omkar and Time Travel (CodeContests CC-BY-4.0).
Source record ace7fce75fc556c4736bb13dc220ba5b345c1c47b10cf55e1dddc6ac3100c00e.
Accepted C++ solutions[1] SHA256
19ec62bfe39d5c20f4ec0fa77a80f00e4060b71fb16092b942216e7e0f8b45f3.
Contained-interval completion-block DP and selected-task dominance frontier by direct scans.
Verification evidence is recorded separately; never bundled with the plugin.
"""
import sys

MOD = 1000000007
it = iter(map(int, sys.stdin.buffer.read().split()))
n = next(it)
tasks = [(next(it), next(it)) for _ in range(n)]
size = next(it)
selected = [next(it) - 1 for _ in range(size)]
order = sorted(range(n), key=lambda index: tasks[index][0], reverse=True)
cost = [0] * n
processed = []
for index in order:
    left, right = tasks[index]
    cost[index] = (1 + sum(cost[other] for other in processed
                           if tasks[other][1] < right)) % MOD
    processed.append(index)
answer = 0
for index, (left, right) in enumerate(tasks):
    if any(left <= tasks[other][0] and right <= tasks[other][1]
           for other in selected):
        answer += cost[index]
print(answer % MOD)

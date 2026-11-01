"""Development-only reference, 1601_E. Phys Ed Online (CodeContests CC-BY-4.0).
Source record 99a9a3017eadf88edfc242a22bfb6c785f13b89c2a8ed1f045533f1f22c97732.
Accepted C++ solutions[1] SHA256
4e21e636d31423c035132d50ab51615582986068072dae95179091daf09a5ba4.
Exact per-query running-minimum scan at forced activation days l,l+k,...
Verification evidence is recorded separately; never bundled with the plugin.
"""
import sys

it = iter(map(int, sys.stdin.buffer.read().split()))
n, q, k = next(it), next(it), next(it)
prices = [next(it) for _ in range(n)]
out = []
for _ in range(q):
    left, right = next(it) - 1, next(it)
    cheapest = prices[left]
    answer = 0
    for day in range(left, right):
        cheapest = min(cheapest, prices[day])
        if (day - left) % k == 0:
            answer += cheapest
    out.append(str(answer))
sys.stdout.write("\n".join(out) + "\n")

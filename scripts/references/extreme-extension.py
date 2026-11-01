"""Development-only independent reference for Codeforces 1604/E.

Not a model answer repair and never bundled with the installed plugin.
Problem source: deepmind/code_contests, revision
802411c3010cb00d1b05bad57ca77365a3c699d6, row91 (CC-BY-4.0).
For a value x before a nondecreasing suffix whose first value is b, at
least ceil(x/b) parts are needed; balancing that many parts maximizes the
new first value floor(x/k). This choice minimizes this step and can only
help every value further left. Group suffixes by that first-value bound.
Tests independently enumerate all positive splits on small arrays.
"""
import sys

MOD = 998244353


def solve(a):
    states = {}
    answer = 0
    for x in reversed(a):
        updated = {x: (1, 0)}
        for bound, (count, cost) in states.items():
            parts = (x + bound - 1) // bound
            new_bound = x // parts
            new_cost = (cost + (parts - 1) * count) % MOD
            old_count, old_cost = updated.get(new_bound, (0, 0))
            updated[new_bound] = (old_count + count, (old_cost + new_cost) % MOD)
        states = updated
        answer = (answer + sum(cost for _, cost in states.values())) % MOD
    return answer


tokens = iter(map(int, sys.stdin.buffer.read().split()))
results = []
for _ in range(next(tokens)):
    n = next(tokens)
    results.append(str(solve([next(tokens) for _ in range(n)])))
sys.stdout.write('\n'.join(results) + '\n')

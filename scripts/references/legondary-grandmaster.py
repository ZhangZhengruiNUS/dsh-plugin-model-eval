"""Development-only reference, 1615_F. LEGOndary Grandmaster (CodeContests CC-BY-4.0).
Source record 8ba65e97be9ad7d925644a3e7ec9ce0bf56e0e949e1ab23cf1202fc45c0b0d50.
Accepted C++ solutions[1] SHA256
86e2fb72d23dbd4335e59be65c7d804e6177494422d51a5cbd008da160ddcabb.
Alternating-bit transformation and rolling count/cost DP on prefix balance.
Verification evidence is recorded separately; never bundled with the plugin.
"""
import sys

MOD = 1000000007

def solve(n, start, finish):
    width = 2 * n + 1
    ways = [0] * width
    cost = [0] * width
    ways[n] = 1
    for position in range(n):
        first = (0, 1) if start[position] == 63 else ((start[position] - 48) ^ (position & 1),)
        second = (0, 1) if finish[position] == 63 else ((finish[position] - 48) ^ (position & 1),)
        choices = {}
        for a in first:
            for b in second:
                choices[a - b] = choices.get(a - b, 0) + 1
        next_ways = [0] * width
        next_cost = [0] * width
        for balance in range(-position, position + 1):
            index = n + balance
            count, total = ways[index], cost[index]
            if count == 0 and total == 0:
                continue
            for delta, multiplicity in choices.items():
                following = balance + delta
                target = n + following
                next_ways[target] = (next_ways[target] + count * multiplicity) % MOD
                next_cost[target] = (next_cost[target]
                                     + (total + abs(following) * count) * multiplicity) % MOD
        ways, cost = next_ways, next_cost
    return cost[n]

tokens = iter(sys.stdin.buffer.read().split())
tests = int(next(tokens))
out = []
for _ in range(tests):
    n = int(next(tokens))
    start, finish = next(tokens), next(tokens)
    out.append(str(solve(n, start, finish)))
sys.stdout.write("\n".join(out) + "\n")

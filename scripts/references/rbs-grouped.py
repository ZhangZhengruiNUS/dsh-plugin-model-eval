"""Development-only exact reference, pinned row63 /1598_F (CC-BY-4.0).
Equal strings are interchangeable. Mixed-radix group counts replace instance
subsets without losing any order. Unsafe prefix is irreversible, so count its
earlier zero prefixes then stop propagation. No grading budget/test changes.
"""
import sys

def main():
    tokens = sys.stdin.buffer.read().split()
    groups = {}
    for text in tokens[1:]:
        groups[text] = groups.get(text, 0)+1
    limits, delta, need, hits, strides = [], [], [], [], []
    states = 1
    for text, count in groups.items():
        limits.append(count)
        strides.append(states)
        states *= count+1
        balance = minimum = 0
        visits = [0]
        for ch in text:
            balance += 1 if ch == 40 else -1
            if balance < minimum:
                minimum = balance
                visits.append(1)
            elif balance == minimum:
                visits[-1] += 1
        delta.append(balance)
        need.append(-minimum)
        hits.append(visits)
    g = len(limits)
    dp = [-1]*states
    dp[0] = 0
    used = [0]*g
    height = answer = 0
    for state in range(states):
        score = dp[state]
        if score >= 0:
            for j in range(g):
                if used[j] == limits[j]:
                    continue
                gain = hits[j][height] if height <= need[j] else 0
                candidate = score+gain
                answer = max(answer, candidate)
                if height >= need[j]:
                    target = state+strides[j]
                    dp[target] = max(dp[target], candidate)
        for j in range(g):
            if used[j] < limits[j]:
                used[j] += 1
                height += delta[j]
                break
            height -= used[j]*delta[j]
            used[j] = 0
    print(answer)

main()

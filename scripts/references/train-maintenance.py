"""Development-only reference, pinned CodeContests row22 /1580_C (CC-BY-4.0).
Accepted solutions[0], language2 SHA256
cc4fc2cf51fac84dd17113a2e8e6a3289e37ac7e6a72f47385144917d2736e72.
Small periods use circular boundary differences; large periods use dated
events. Consume today's events before inserting/removing a schedule; cancel
current maintenance immediately on removal. Tests simulate every active train.
"""
import sys
from math import isqrt

def solve(work, period, operations):
    n, m = len(work), len(operations)
    threshold = isqrt(m) + 1
    start = [0] * n
    changes = [0] * m
    small = {}
    active = {}
    answer = 0
    out = []
    for day, (op, model) in enumerate(operations):
        answer += changes[day]
        for length, row in small.items():
            answer += row[day % length]
        length = period[model]
        x = work[model]
        if op == 1:
            start[model] = day
            sign = 1
        else:
            sign = -1
            if (day - start[model]) % length >= x:
                answer -= 1
        beginning = start[model]
        if length < threshold:
            if op == 1 and length not in small:
                small[length] = [0] * length
                active[length] = 0
            row = small[length]
            row[beginning % length] -= sign
            row[(beginning + x) % length] += sign
            active[length] += sign
            if active[length] == 0:
                del small[length]
                del active[length]
        elif x < m:
            for position in range(beginning, m, length):
                changes[position] -= sign
                if position + x < m:
                    changes[position + x] += sign
        out.append(answer)
    return out

if __name__ == '__main__':
    it = iter(map(int, sys.stdin.buffer.read().split()))
    n, m = next(it), next(it)
    work, period = [], []
    for _ in range(n):
        x, y = next(it), next(it)
        work.append(x)
        period.append(x + y)
    operations = [(next(it), next(it) - 1) for _ in range(m)]
    sys.stdout.write('\n'.join(map(str, solve(work, period, operations))) + '\n')

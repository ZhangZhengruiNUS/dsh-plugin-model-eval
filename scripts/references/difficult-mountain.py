"""Development-only port, pinned CodeContests row81 /1601_D (CC-BY-4.0).
Accepted solutions[0], language2 SHA256
4c6042c9805a6f9989d4d4fdeda7c1c4b8e2602e07008777d2b40822d8264be5.
All s>=a climbers can be retained in ascending a. Insert s<a climbers in
ascending a in gaps where suffix-minimum skill permits it, avoiding harm to
any retained good climber. Independent oracle explores all possible orders.
"""
import sys

def solve(d, people):
    good = []
    bad = []
    for s, a in people:
        if s >= d:
            (good if s >= a else bad).append((a, s))
    good.sort()
    bad.sort()
    infinity = 1100000000
    good = [(d, infinity)] + good + [(infinity, infinity)]
    suffix = [infinity] * len(good)
    for i in range(len(good) - 2, -1, -1):
        suffix[i] = min(suffix[i + 1], good[i][1])
    answer = len(good) - 2
    j = 0
    current = d
    for i in range(len(good) - 1):
        current = max(current, good[i][0])
        while j < len(bad) and bad[j][0] <= suffix[i + 1]:
            a, s = bad[j]
            if s >= current:
                answer += 1
                current = max(current, a)
            j += 1
    return answer

if __name__ == '__main__':
    it = iter(map(int, sys.stdin.buffer.read().split()))
    n, d = next(it), next(it)
    print(solve(d, [(next(it), next(it)) for _ in range(n)]))

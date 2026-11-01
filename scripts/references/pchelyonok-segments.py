"""Development reference, not bundled. CodeContests pinned row32 /1582_E.
CC-BY-4.0 source record84e067cb6d8a1a786209f76c6f98ea2519b9ae18b3550d9819fc7e8ece11dd65.
Suffix-maximum reformulation of accepted solutions[0] (language2), SHA256
def3253139a4f437a922e1128ba0f8dcb8a8f3a73fde7de6193e110459b83323.
prev[i] is the greatest possible first sum of a (k-1,...,1) chain in suffix i.
A length-k sum must be strictly smaller. Independent tests enumerate segments.
"""
import sys

def solve(a):
    n = len(a)
    pref = [0] * (n + 1)
    for i, value in enumerate(a):
        pref[i + 1] = pref[i] + value
    prev = [-1] * (n + 1)
    best = -1
    for i in range(n - 1, -1, -1):
        if a[i] > best:
            best = a[i]
        prev[i] = best
    k = 2
    while k * (k + 1) // 2 <= n:
        end = n - k * (k + 1) // 2
        curr = [-1] * (n + 1)
        best = -1
        for i in range(end, -1, -1):
            total = pref[i + k] - pref[i]
            if total < prev[i + k] and total > best:
                best = total
            curr[i] = best
        if best < 0:
            return k - 1
        prev = curr
        k += 1
    return k - 1

if __name__ == '__main__':
    it = iter(map(int, sys.stdin.buffer.read().split()))
    out = []
    for _ in range(next(it)):
        n = next(it)
        out.append(str(solve([next(it) for _ in range(n)])))
    sys.stdout.write('\n'.join(out) + '\n')

"""Development reference, not bundled. CodeContests pinned row80 /1601_C.
CC-BY-4.0 record e3b9e98662bd6a908d5b63b6104561c5b16146505b87bde908fa2c82b2e309a3.
Heap cross-inversion step from accepted solutions[2] (language2), SHA256
6ee5a43b7061221d4b37f44afdbdfff0e702b6ade254fdc14a171d83b9eb1a64.
Stable value-order Fenwick counts inversions in a. Heap solves isotonic intervals
[#b<a_i,#b<=a_i] for sorted b insertions. Tests enumerate all small interleavings.
"""
import sys
from bisect import bisect_left, bisect_right
from heapq import heappush, heapreplace

def solve(a, b):
    n = len(a)
    order = sorted(range(n), key=a.__getitem__)
    bit = [0] * (n + 1)
    answer = 0
    for seen, pos in enumerate(order):
        j = pos + 1
        count = 0
        while j:
            count += bit[j]
            j -= j & -j
        answer += seen - count
        j = pos + 1
        while j <= n:
            bit[j] += 1
            j += j & -j
    del order, bit
    b.sort()
    heap = []
    for value in a:
        left = bisect_left(b, value)
        right = bisect_right(b, value)
        if heap and -heap[0] > right:
            answer += -heap[0] - right
            heapreplace(heap, -right)
        heappush(heap, -left)
    return answer

if __name__ == '__main__':
    it = iter(map(int, sys.stdin.buffer.read().split()))
    out = []
    for _ in range(next(it)):
        n, m = next(it), next(it)
        a = [next(it) for _ in range(n)]
        b = [next(it) for _ in range(m)]
        out.append(str(solve(a, b)))
    sys.stdout.write('\n'.join(out) + '\n')

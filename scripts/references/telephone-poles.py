"""Development-only reference, pinned row12 /1575_M (CC-BY-4.0).
Separable squared-Euclidean distance transform, independently integerized from
accepted solutions[36], language2 SHA256
4cfd6f0d0511ad9250a5ddd5fcf36d0236455a1bc9b7f751b442c44852a2a115.
Horizontal nearest-pole distances followed by exact lower parabola envelopes
per column. Integer ceiling thresholds avoid floating intersection errors.
"""
import sys
from array import array

def solve(rows):
    h, w = len(rows), len(rows[0])
    infinity = 10**9
    dist = array('i', [infinity]) * (h * w)
    for r, row in enumerate(rows):
        base = r * w
        last = -1
        for c in range(w):
            if row[c] == '1':
                last = c
            if last >= 0:
                dist[base+c] = (c-last)**2
        last = -1
        for c in range(w-1, -1, -1):
            if row[c] == '1':
                last = c
            if last >= 0:
                dist[base+c] = min(dist[base+c], (last-c)**2)
    answer = 0
    for c in range(w):
        sites = []
        starts = []
        for q in range(h):
            fq = dist[q*w+c]
            if fq == infinity:
                continue
            begin = -10**30
            while sites:
                p = sites[-1]
                num = fq+q*q-dist[p*w+c]-p*p
                den = 2*(q-p)
                begin = -((-num)//den)
                if begin > starts[-1]:
                    break
                sites.pop()
                starts.pop()
            if not sites:
                begin = -10**30
            sites.append(q)
            starts.append(begin)
        k = 0
        for r in range(h):
            while k+1 < len(sites) and starts[k+1] <= r:
                k += 1
            p = sites[k]
            answer += dist[p*w+c]+(r-p)**2
    return answer

if __name__ == '__main__':
    rd = sys.stdin.buffer.readline
    n, m = map(int, rd().split())
    rows = [b''.join(rd().split()).decode() for _ in range(n+1)]
    print(solve(rows))

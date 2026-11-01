"""Development-only exact simulation, pinned row68 /1599_D (CC-BY-4.0).
Accepted convex-hull solutions[0], language2 SHA256
bdf19361f252c3fb7c714a0ee74934a8e86b6943ce495882c75457cdf68850e2
inspected for semantics; this is the direct O(Q*N**2) integer alternative.
Normalize infinite-line directions into the CCW half-turn from current line,
then exact cross-products choose the first hit. No floats or probability.
The input auditor shares this comparator and is NOT an independent oracle.
"""
import sys

def solve(points, queries):
    n = len(points)
    out = []
    for dx, dy, count in queries:
        current = min(range(n), key=lambda i: dx*points[i][1]-dy*points[i][0])
        removed = bytearray(n)
        removed[current] = 1
        for _ in range(1, count):
            cx, cy = points[current]
            best = -1
            best_x = best_y = 0
            for index, (x, y) in enumerate(points):
                if removed[index]:
                    continue
                vx, vy = x-cx, y-cy
                side = dx*vy-dy*vx
                if side < 0 or (side == 0 and dx*vx+dy*vy < 0):
                    vx, vy = -vx, -vy
                if best < 0 or vx*best_y-vy*best_x > 0:
                    best = index
                    best_x, best_y = vx, vy
            current = best
            removed[current] = 1
            dx, dy = best_x, best_y
        out.append(current+1)
    return out

if __name__ == '__main__':
    it = iter(map(int, sys.stdin.buffer.read().split()))
    n = next(it)
    points = [(next(it), next(it)) for _ in range(n)]
    queries = [(next(it), next(it), next(it)) for _ in range(next(it))]
    print('\n'.join(map(str, solve(points, queries))))

"""Development-only independent reference, pinned CodeContests row6 /1575_G.
CC-BY-4.0. Uses gcd(x,y)=sum(phi(d) for common divisors d), twice.
For every index divisor d and value divisor e count indices divisible by d
whose values are divisible by e; each contributes phi(d)*phi(e)*count**2.
This independent formula is checked against literal all-pairs gcd sums.
"""
import sys

def solve(a):
    n = len(a)
    bound = max(n, max(a))
    phi = list(range(bound + 1))
    for p in range(2, bound + 1):
        if phi[p] == p:
            for j in range(p, bound + 1, p):
                phi[j] -= phi[j] // p
    divisors = {}
    for x in set(a):
        ds = []
        d = 1
        while d * d <= x:
            if x % d == 0:
                ds.append(d)
                if d * d != x:
                    ds.append(x // d)
            d += 1
        divisors[x] = ds
    result = 0
    for d in range(1, n + 1):
        counts = {}
        for i in range(d - 1, n, d):
            for e in divisors[a[i]]:
                counts[e] = counts.get(e, 0) + 1
        result += phi[d] * sum(phi[e] * count * count for e, count in counts.items())
    return result % 1000000007

if __name__ == '__main__':
    data = list(map(int, sys.stdin.buffer.read().split()))
    print(solve(data[1:]))

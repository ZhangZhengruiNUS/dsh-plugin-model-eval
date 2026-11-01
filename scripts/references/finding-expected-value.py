"""Development-only reference, pinned row5 /1575_F (CC-BY-4.0).
Accepted solutions[1], language2 SHA256
05fcdd94d52bbac36ea0bc62ade3608912f10d077feb420417cb0d91a6b66da5.
Per-color potential has drift-count/n; summed potentials have drift-1 and
vanish at uniform states after subtracting phi[n]. Average over binomial
unknown-color marginals. Exact packed correlation fields80bits exceed
100001*(MOD-1)**2. Small oracle solves the literal absorbing Markov system.
"""
import sys
from collections import Counter
MOD = 1000000007
WIDTH = 10

def solve(values, k):
    n = len(values)
    known = Counter(x for x in values if x != -1)
    missing = values.count(-1)
    histogram = Counter(known.values())
    if len(known) < k:
        histogram[0] = k-len(known)
    inv = [0]*(n+1)
    inv[1] = 1
    for i in range(2, n+1):
        inv[i] = MOD-(MOD//i)*inv[MOD % i] % MOD
    potential = [0]*(n+1)
    for count in range(1, n):
        down = (k-1)*count
        value = (down+n-count)*potential[count]
        value -= down*potential[count-1]+count*k
        potential[count+1] = value*inv[n-count] % MOD
    inverse_k = pow(k, MOD-2, MOD)
    inverse_other = pow(k-1, MOD-2, MOD)
    probability = [0]*(missing+1)
    probability[0] = pow((k-1)*inverse_k % MOD, missing, MOD)
    for count in range(missing):
        value = probability[count]*(missing-count) % MOD
        probability[count+1] = value*inv[count+1] % MOD*inverse_other % MOD
    answer = 0
    if (missing+1)*len(histogram) <= 1000000:
        for count, multiplicity in histogram.items():
            expected = sum(potential[count+j]*weight for j, weight in enumerate(probability)) % MOD
            answer += multiplicity*expected
    else:
        values = potential[:missing+max(histogram)+1]
        first = int.from_bytes(b''.join(x.to_bytes(WIDTH, 'little') for x in values), 'little')
        second = int.from_bytes(b''.join(x.to_bytes(WIDTH, 'little') for x in reversed(probability)), 'little')
        length = len(values)+len(probability)-1
        raw = (first*second).to_bytes(length*WIDTH, 'little')
        for count, multiplicity in histogram.items():
            offset = (count+missing)*WIDTH
            expected = int.from_bytes(raw[offset:offset+WIDTH], 'little') % MOD
            answer += multiplicity*expected
    return (answer-potential[n]) % MOD

if __name__ == '__main__':
    it = iter(map(int, sys.stdin.buffer.read().split()))
    n, k = next(it), next(it)
    print(solve([next(it) for _ in range(n)], k))

"""Development-only independent optimized reference, pinned row163 /1623_D.
CC-BY-4.0. Accepted C++[44] SHA256
df4ce85e5c4c6d5920978d38bad125a0fc86b7f7a03278102ca9fa9884a8e0e0
confirms per-second cleaning semantics; batching is independently derived.
Enumerate only long-axis events; short-axis one/two-phase blocks sum exact
geometric time moments. Simultaneous hits consume one trial, not two.
E=(success*sum(q**i*t_i)+survival*period)/(1-survival).
"""
import sys
from math import gcd
MOD = 1000000007
INV100 = pow(100, MOD-2, MOD)

def solve(n, m, rb, cb, rd, cd, percent):
    A, B = 2*(n-1), 2*(m-1)
    short = sorted({(rd-rb) % A, (2-rd-rb) % A})
    long = sorted({(cd-cb) % B, (2-cd-cb) % B})
    if A > B:
        A, B = B, A
        short, long = long, short
    period = A//gcd(A, B)*B
    long_times = sorted(phase+block*B for phase in long for block in range(period//B))
    success = percent*INV100 % MOD
    q = (1-success) % MOD
    k = len(short)
    if k == 1:
        Q, sum_q, phase_q = q, 1, short[0]
    else:
        Q = q*q % MOD
        sum_q = (1+q) % MOD
        phase_q = (short[0]+q*short[1]) % MOD
    inv_one_Q = pow((1-Q) % MOD, MOD-2, MOD)
    next_short, survival, moment = 0, 1, 0

    def consume_short_before(limit):
        nonlocal next_short, survival, moment
        wanted = sum((limit-1-phase)//A+1 for phase in short if limit > phase)
        count = wanted-next_short
        if count and next_short % k:
            time = (next_short//k)*A+short[next_short % k]
            moment = (moment+survival*time) % MOD
            survival = survival*q % MOD
            next_short += 1
            count -= 1
        blocks = count//k
        if blocks:
            base = (next_short//k)*A
            first_weight = (base*sum_q+phase_q) % MOD
            if blocks == 1:
                power, weighted_times = Q, first_weight
            else:
                power = pow(Q, blocks, MOD)
                g0 = (1-power)*inv_one_Q % MOD
                g1 = (Q*g0-blocks*power)*inv_one_Q % MOD
                weighted_times = (first_weight*g0+A*sum_q*g1) % MOD
            moment = (moment+survival*weighted_times) % MOD
            survival = survival*power % MOD
            next_short += blocks*k
            count -= blocks*k
        if count:
            time = (next_short//k)*A+short[next_short % k]
            moment = (moment+survival*time) % MOD
            survival = survival*q % MOD
            next_short += 1

    for time in long_times:
        consume_short_before(time)
        moment = (moment+survival*time) % MOD
        survival = survival*q % MOD
        if time % A in short:
            next_short += 1
    consume_short_before(period)
    numerator = (success*moment+survival*period) % MOD
    return numerator*pow((1-survival) % MOD, MOD-2, MOD) % MOD

if __name__ == '__main__':
    it = iter(map(int, sys.stdin.buffer.read().split()))
    answers = [str(solve(*[next(it) for _ in range(7)])) for _ in range(next(it))]
    print('\n'.join(answers))

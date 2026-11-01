"""Development-only exact reference, pinned row96 /1606_E (CC-BY-4.0).
Source record860eb3cc9ca9d54770cd9e780f9e57d547cbb6d3155b7dafbcbc556e14529387.
Accepted C++[25] SHA256b8fe49afd91823f04fd8ac18463b320352cf5f20cb3945333f80a89dd0a31598.
Count winners' complement. After first round survivors have health<=x-n+1;
more survivors than this bound necessarily all die next round (zero winner
contribution). Cached coefficient rows avoid repeated comb/pow per transition.
"""
import sys
from functools import lru_cache
MOD = 998244353

def main():
    n, x = map(int, sys.stdin.buffer.read().split())
    if x < n:
        print(pow(x, n, MOD))
        return
    if n == 2:
        print(x)
        return
    if n == 3:
        print((3*x*x+2*x-3*(x & 1))//2 % MOD)
        return
    inverse = [0]*(n+1)
    inverse[1] = 1
    for k in range(2, n+1):
        inverse[k] = MOD-(MOD//k)*inverse[MOD % k] % MOD
    coefficients = [None]*(n+1)

    def row(size):
        result = coefficients[size]
        if result is None:
            result = [0]*(size+1)
            result[0] = pow(size-1, size, MOD)
            inv_base = inverse[size-1]
            for k in range(1, size+1):
                result[k] = result[k-1]*(size-k+1) % MOD*inverse[k] % MOD*inv_base % MOD
            coefficients[size] = result
        return result

    @lru_cache(None)
    def winners(size, health):
        if health < size:
            return 0
        if size == 1:
            return health
        if size == 2:
            return health*(health-1)
        if size == 3:
            return health**3-(3*health*health+2*health-3*(health & 1))//2
        remaining = health-size+1
        limit = min(size, remaining)
        coeff = row(size)
        value = coeff[1]*remaining
        if limit >= 2:
            value += coeff[2]*remaining*(remaining-1)
        if limit >= 3:
            no_winner3 = (3*remaining*remaining+2*remaining-3*(remaining & 1))//2
            value += coeff[3]*(remaining**3-no_winner3)
        for survivors in range(4, limit+1):
            value += coeff[survivors]*winners(survivors, remaining)
        return value % MOD

    print((pow(x, n, MOD)-winners(n, x)) % MOD)

main()

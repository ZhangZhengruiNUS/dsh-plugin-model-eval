"""Development-only reference, pinned row25 /1580_F (CC-BY-4.0).
Accepted solutions[2], language2 SHA256
9c61974d177905383077690fb191b67a1ddbb51d037da9db8157a301f11dc6b4.
Odd/even rational generating functions from the accepted solution, with exact
decimal Kronecker convolution replacing NTT. Normalized coefficients and
degree<=50000 give coefficient <50001*(MOD-1)**2<10**24; fields never carry.
Independent oracle uses trace of the literal adjacency transfer matrix.
"""
import sys
from _decimal import Decimal, localcontext, Inexact, MAX_EMAX
MOD = 998244353
WIDTH = 24

def multiply(a, b, limit):
    needed = min(limit, len(a)+len(b)-1)
    if needed <= 0:
        return []
    a, b = a[:needed], b[:needed]
    while a and a[-1] == 0:
        a.pop()
    while b and b[-1] == 0:
        b.pop()
    if not a or not b:
        return [0]*needed
    if min(len(a), len(b)) <= 12:
        result = [0]*needed
        for i, value in enumerate(a):
            if value:
                for j in range(min(len(b), needed-i)):
                    result[i+j] += value*b[j]
        return [value % MOD for value in result]
    first = Decimal(''.join(str(x).zfill(WIDTH) for x in reversed(a)))
    second = Decimal(''.join(str(x).zfill(WIDTH) for x in reversed(b)))
    length = len(a)+len(b)-1
    with localcontext() as context:
        context.prec = WIDTH*(len(a)+len(b))
        context.Emax = MAX_EMAX
        context.traps[Inexact] = True
        raw = format(first*second, 'f')
        if len(raw) > length*WIDTH:
            raise ArithmeticError('unexpected high convolution field')
        raw = raw.zfill(length*WIDTH)
    result = [int(raw[len(raw)-(i+1)*WIDTH:len(raw)-i*WIDTH]) % MOD
              for i in range(min(needed, length))]
    return result+[0]*(needed-len(result))

def inverse(a, size):
    result = [pow(a[0], MOD-2, MOD)]
    while len(result) < size:
        old = len(result)
        new = min(old*2, size)
        product = multiply(a[:new], result, new)
        product += [0]*(new-len(product))
        error = product[old:new]
        correction = multiply(result, error, new-old)
        correction += [0]*(new-old-len(correction))
        result.extend((-value) % MOD for value in correction)
    return result

def solve(n, m):
    if m == 1:
        return 1
    inv = [0]*(n+1)
    inv[1] = 1
    for i in range(2, n+1):
        inv[i] = MOD-(MOD//i)*inv[MOD % i] % MOD
    degree = n//2
    denominator = [1]+[0]*degree
    if n % 2 == 0:
        coefficient = 1
        for j in range(1, degree+1):
            coefficient = coefficient*(m+j) % MOD*(m-j+1) % MOD
            coefficient = coefficient*inv[2*j] % MOD*inv[2*j-1] % MOD
            denominator[j] = coefficient
        reciprocal = inverse(denominator, degree+1)
        answer = sum(j*denominator[j]*reciprocal[degree-j] for j in range(1, degree+1)) % MOD
        return answer if degree % 2 else (-answer) % MOD
    half = m//2
    numerator = [0]*(degree+1)
    coefficient = 1
    for i in range(1, n+1):
        factor = half-i//2 if i % 2 else half+i//2
        coefficient = coefficient*factor % MOD*inv[i] % MOD
        if i % 2:
            numerator[i//2] = coefficient
        else:
            denominator[i//2] = coefficient
    ratio = multiply(numerator, inverse(denominator, degree+1), degree+1)
    for j in range(1, degree+1, 2):
        ratio[j] = (-ratio[j]) % MOD
    ratio[0] = (ratio[0]+m % 2) % MOD
    square = multiply(ratio, ratio, degree)
    denominator = [1]+[(-value) % MOD for value in square]
    reciprocal = inverse(denominator, degree+1)
    return sum((2*j+1)*ratio[j]*reciprocal[degree-j] for j in range(degree+1)) % MOD

if __name__ == '__main__':
    print(solve(*map(int, sys.stdin.buffer.read().split())))

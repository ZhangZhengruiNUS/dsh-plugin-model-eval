"""Development-only reference, pinned row21 /1580_B (CC-BY-4.0).
Accepted solutions[0], language2 SHA256
e49cc24f56c43dda6796ffbf38185eb1f4f689c19e9ec2b7010717fbd33f09cd.
Cartesian ancestors are exactly the possible maxima of intervals containing
each value. Count nodes at depth m via binomial-weighted subtree polynomial
products. Integer packing is exact: input coefficients<p and each accumulated
coefficient <2**(n+2*bit_length(p)+bit_length(k+1)); no field carry is possible.
Truncation cannot affect lower coefficients; supports composite moduli.
"""
import sys
from functools import lru_cache
from math import comb

def solve(n, m, k, modulus):
    if modulus == 1:
        return 0
    if m == 1:
        answer = 1
        for value in range(1, n + 1):
            answer = answer * value % modulus
        return answer if k == 1 else 0
    if k > min(n - m + 1, (n + 1) // 2, 1 << (m - 1)):
        return 0
    factorial = [1] * (n + 1)
    for size in range(1, n + 1):
        factorial[size] = factorial[size - 1] * size % modulus
    shift = n + 2 * modulus.bit_length() + (k + 1).bit_length()
    digit_mask = (1 << shift) - 1
    weights = [[]]
    for size in range(1, n + 1):
        weights.append([comb(size - 1, left) * (1 if left * 2 == size - 1 else 2)
                        for left in range((size - 1) // 2 + 1)])

    @lru_cache(None)
    def ways(size, depth):
        if size == 0:
            return 1
        if depth > size:
            return factorial[size]
        if depth == 1:
            return factorial[size] << shift
        upper = min(k, size - depth + 1, (size + 1) // 2, 1 << (depth - 1))
        total = 0
        for left, weight in enumerate(weights[size]):
            right = size - 1 - left
            total += ways(left, depth - 1) * ways(right, depth - 1) * weight
        result = 0
        for degree in range(upper + 1):
            coefficient = (total & digit_mask) % modulus
            result |= coefficient << (degree * shift)
            total >>= shift
        return result

    return (ways(n, m) >> (k * shift)) & digit_mask

if __name__ == '__main__':
    print(solve(*map(int, sys.stdin.buffer.read().split())))

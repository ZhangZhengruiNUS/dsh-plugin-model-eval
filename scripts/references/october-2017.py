"""Development-only reference, 1603_F. October 18, 2017 (CodeContests CC-BY-4.0).
Source record 36f39dce920dd949dda9f4633a1c9af3813ae66efc8e01fce8c64e18d368ffa8.
Accepted C++ solutions[0] SHA256
f8bccfe3547e6f7fd7b391de857af7dc70a62e167e7779dacddcb5dec3a0416a.
Exact baby-step/giant-step polynomial blocks and chirp geometric evaluation; packed 80-bit convolution.
Verification evidence is recorded separately; never bundled with the plugin.
"""
import sys
from functools import lru_cache
from math import isqrt

MOD = 998244353
WIDTH = 10

def multiply(a, b):
    length = len(a) + len(b) - 1
    if min(len(a), len(b)) <= 12:
        result = [0] * length
        for i, first in enumerate(a):
            for j, second in enumerate(b):
                result[i + j] += first * second
        return [value % MOD for value in result]
    first = int.from_bytes(b"".join(x.to_bytes(WIDTH, "little") for x in a),
                           "little")
    second = int.from_bytes(b"".join(x.to_bytes(WIDTH, "little") for x in b),
                            "little")
    raw = (first * second).to_bytes(length * WIDTH, "little")
    return [int.from_bytes(raw[i * WIDTH:(i + 1) * WIDTH], "little") % MOD
            for i in range(length)]

def scale(poly, factor):
    result = []
    power = 1
    for coefficient in poly:
        result.append(coefficient * power % MOD)
        power = power * factor % MOD
    return result

@lru_cache(maxsize=128)
def block_product(length):
    if length == 1:
        return [1, MOD - 1]
    left = length // 2
    right = length - left
    return multiply(block_product(left),
                    scale(block_product(right), pow(2, left, MOD)))

def geometric_values(poly, start, ratio, count):
    degree = len(poly) - 1
    length = degree + count
    chirp = [1] * length
    inverse_chirp = [1] * length
    inverse_ratio = pow(ratio, MOD - 2, MOD)
    power = inverse_power = 1
    for i in range(1, length):
        chirp[i] = chirp[i - 1] * power % MOD
        inverse_chirp[i] = inverse_chirp[i - 1] * inverse_power % MOD
        power = power * ratio % MOD
        inverse_power = inverse_power * inverse_ratio % MOD
    coefficients = []
    power = 1
    for i, coefficient in enumerate(poly):
        coefficients.append(coefficient * power % MOD * inverse_chirp[i] % MOD)
        power = power * start % MOD
    convolution = multiply(coefficients[::-1], chirp)
    return [convolution[degree + i] * inverse_chirp[i] % MOD
            for i in range(count)]

def independent_vectors(n, k):
    if n > k:
        return 0
    total = pow(2, k, MOD)
    if n <= 256:
        result = power = 1
        for _ in range(n):
            result = result * (total - power) % MOD
            power = power * 2 % MOD
        return result
    length = isqrt(n)
    blocks = n // length
    processed = blocks * length
    values = geometric_values(block_product(length),
                              pow(total, MOD - 2, MOD),
                              pow(2, length, MOD), blocks)
    result = pow(total, processed, MOD)
    for value in values:
        result = result * value % MOD
    power = pow(2, processed, MOD)
    for _ in range(processed, n):
        result = result * (total - power) % MOD
        power = power * 2 % MOD
    return result

def avoid_nonzero(n, k):
    if n + 1 < k:
        n, k = k - 1, n + 1
    base = pow(2, n + 1, MOD)
    if k <= 256:
        result = 0
        power = base_power = 1
        for _ in range(k):
            result = ((1 - power) * result + base_power) % MOD
            power = power * 2 % MOD
            base_power = base_power * base % MOD
        return result
    length = isqrt(k)
    blocks = k // length
    processed = blocks * length

    @lru_cache(None)
    def block_sum(size):
        if size == 1:
            return [1]
        left = size // 2
        right = size - left
        factor = pow(2, left, MOD)
        result = multiply(scale(block_product(right), factor), block_sum(left))
        tail = scale(block_sum(right), factor)
        multiplier = pow(base, left, MOD)
        for i, value in enumerate(tail):
            result[i] = (result[i] + multiplier * value) % MOD
        return result

    product = block_product(length)
    addition = block_sum(length)
    block_sum.cache_clear()
    ratio = pow(2, length, MOD)
    products = geometric_values(product, 1, ratio, blocks)
    additions = geometric_values(addition, 1, ratio, blocks)
    result = 0
    base_power = 1
    multiplier = pow(base, length, MOD)
    for first, second in zip(products, additions):
        result = (first * result + base_power * second) % MOD
        base_power = base_power * multiplier % MOD
    power = pow(2, processed, MOD)
    for _ in range(processed, k):
        result = ((1 - power) * result + base_power) % MOD
        power = power * 2 % MOD
        base_power = base_power * base % MOD
    return result

it = iter(map(int, sys.stdin.buffer.read().split()))
tests = next(it)
out = []
for _ in range(tests):
    n, k, target = next(it), next(it), next(it)
    out.append(str(independent_vectors(n, k) if target == 0 else avoid_nonzero(n, k)))
sys.stdout.write("\n".join(out) + "\n")

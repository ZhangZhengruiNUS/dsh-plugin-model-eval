"""Development-only reference, 1620_G. Subsequences Galore (CodeContests CC-BY-4.0).
Source record b2ca665e1a8a0358e37c1e6340046ba56d5378513b66a68a2bafe1fce31f408f.
Accepted C++ solutions[0] SHA256
dc5b0364fffb69d059ac406180373038b2947bf8b018c0eb5ad6bdab89607c28.
Short-universe exact subsequence-support enumeration plus packed 32-bit subset zeta, fieldwise weighted multiplication, and horizontal XOR; large-universe intersection-IE/SOS fallback.
Verification evidence is recorded separately; never bundled with the plugin.
"""
import sys
from array import array
from collections import Counter
from math import prod

MOD = 998244353
ENUMERATION_LIMIT = 200000
tokens = sys.stdin.buffer.read().split()
n = int(tokens[0])
texts = tokens[1:n + 1]
frequencies = []
for text in texts:
    counts = [0] * 26
    for letter in text:
        counts[letter - 97] += 1
    frequencies.append(counts)
size = 1 << n

def parallel_product(values, multipliers, bits, low_mask):
    result = 0
    for bit in range(bits):
        selected = ((multipliers >> bit) & low_mask) * 4294967295
        result += (values & selected) << bit
    return result

enumeration_sizes = [prod(count + 1 for count in row) for row in frequencies]
if (sum(enumeration_sizes) <= ENUMERATION_LIMIT and
        sum(len(text) * count for text, count in zip(texts, enumeration_sizes)) <= 2000000):
    support = {}
    for index, text in enumerate(texts):
        subsequences = {b""}
        for character in text:
            letter = bytes((character,))
            subsequences |= {word + letter for word in subsequences}
        bit = 1 << index
        for word in subsequences:
            support[word] = support.get(word, 0) | bit
    universe = len(support)
    histogram = Counter(support.values())
    byte_length = size * 4
    raw = bytearray(byte_length)
    for mask, count in histogram.items():
        raw[mask * 4:mask * 4 + 4] = count.to_bytes(4, "little")
    zeta = int.from_bytes(raw, "little")
    raw = bytearray(byte_length)
    for index in range(n):
        offset = (1 << index) * 4
        raw[offset:offset + 4] = (1 + ((index + 1) << 8)).to_bytes(4, "little")
    features = int.from_bytes(raw, "little")
    total_bits = size * 32
    span = 32
    while span < total_bits:
        mask = (1 << span) - 1
        period = span * 2
        while period < total_bits:
            mask |= mask << period
            period *= 2
        zeta += (zeta & mask) << span
        features += (features & mask) << span
        span *= 2
    counts = array("I")
    counts.frombytes(zeta.to_bytes(byte_length, "little"))
    if sys.byteorder != "little":
        counts.byteswap()
    counts.reverse()
    if sys.byteorder != "little":
        counts.byteswap()
    reversed_zeta = int.from_bytes(counts.tobytes(), "little")
    low_mask = 1
    span = 32
    while span < total_bits:
        low_mask |= low_mask << span
        span *= 2
    unions = universe * low_mask - reversed_zeta
    cardinality = features & (255 * low_mask)
    index_sums = (features >> 8) & (511 * low_mask)
    products = parallel_product(unions, cardinality, n.bit_length(), low_mask)
    products = parallel_product(products, index_sums,
                                (n * (n + 1) // 2).bit_length(), low_mask)
    span = total_bits
    while span > 32:
        span //= 2
        products = (products ^ (products >> span)) & ((1 << span) - 1)
    print(products)
else:
    values = array("I", [0]) * size
    for mask in range(1, size):
        low = mask & -mask
        common = frequencies[low.bit_length() - 1][:]
        remaining = mask ^ low
        while remaining:
            bit = remaining & -remaining
            row = frequencies[bit.bit_length() - 1]
            common = [min(first, second) for first, second in zip(common, row)]
            remaining ^= bit
        intersection = prod(count + 1 for count in common) % MOD
        values[mask] = intersection if mask.bit_count() % 2 else (-intersection) % MOD
    step = 1
    while step < size:
        for base in range(0, size, step * 2):
            for mask in range(base + step, base + step * 2):
                values[mask] = (values[mask] + values[mask - step]) % MOD
        step *= 2
    index_sums = array("H", [0]) * size
    answer = 0
    for mask in range(1, size):
        low = mask & -mask
        index_sums[mask] = index_sums[mask ^ low] + low.bit_length()
        answer ^= values[mask] * mask.bit_count() * index_sums[mask]
    print(answer)

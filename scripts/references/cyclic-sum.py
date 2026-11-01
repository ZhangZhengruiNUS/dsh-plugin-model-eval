"""Development-only reference, pinned CodeContests row2 /1575_C (CC-BY-4.0).
Accepted solutions[1], language2 SHA256
c1380cafac6da510e82fb3c3366e857e461d821866580811383c9491d0ff7267.
Prefix residue counts over repeated blocks. Normalize a nonzero block sum
by its inverse modulo prime k; each block shifts residues by one. A sliding
frequency window counts endpoints, excluding empty paths and counting the
full circle only once. Independent tests materialize every short cyclic arc.
"""
import sys
MOD = 1000000007

def solve(a, m, k):
    n = len(a)
    prefix = []
    total = 0
    for value in a:
        prefix.append(total)
        total = (total + value) % k
    frequency = [0] * k
    if total == 0:
        for residue in prefix:
            frequency[residue] += 1
        pairs = sum(count * count for count in frequency)
        return (m * m * pairs - n * m + 1) % MOD
    inverse = pow(total, k - 2, k)
    for i, residue in enumerate(prefix):
        residue = residue * inverse % k
        prefix[i] = residue
        frequency[residue] += 1
    cycles, extra = divmod(m, k)
    base = cycles * n
    window = sum(frequency[-j % k] for j in range(extra))
    counts = [0] * k
    for residue in range(k):
        counts[residue] = base + window
        window += frequency[(residue + 1) % k]
        window -= frequency[(residue + 1 - extra) % k]
    shift = m % k
    answer = 0
    for residue in prefix:
        counts[residue] -= 1
        answer += counts[residue]
        counts[(residue + shift) % k] += 1
    return (answer * m + (shift == 0)) % MOD

if __name__ == '__main__':
    it = iter(map(int, sys.stdin.buffer.read().split()))
    n, m, k = next(it), next(it), next(it)
    print(solve([next(it) for _ in range(n)], m, k))

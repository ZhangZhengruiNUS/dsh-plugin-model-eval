"""Development-only reference, pinned row66 /1599_B (CC-BY-4.0).
Exact simplification of accepted solutions[1], language2 SHA256
2ac0bc8d021b010d3c76d63a883b5550f136f884bdf5de550cd688122bf2e093.
The survivor is an original endpoint; order/parity decides distinct starts,
and Bob's direction decides equal interior starts. Oracle simulates removals.
"""
import sys

def solve(n, alice, bob, direction_alice, direction_bob):
    if alice < bob:
        return 0 if (alice+bob) % 2 else n-1
    if alice > bob:
        return n-1 if (alice+bob) % 2 else 0
    if alice == 0:
        return n-1
    if alice == n-1:
        return 0
    return 0 if direction_bob == 'right' else n-1

if __name__ == '__main__':
    it = iter(sys.stdin.buffer.read().split())
    out = []
    for _ in range(int(next(it))):
        n, alice, bob = int(next(it)), int(next(it)), int(next(it))
        out.append(str(solve(n, alice, bob, next(it).decode(), next(it).decode())))
    print('\n'.join(out))

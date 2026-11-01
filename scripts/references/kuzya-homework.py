"""Development-only reference, pinned row35 /1582_G (CC-BY-4.0).
Accepted solutions[3], language2 SHA256
58163a808ab148cc93227c1b3c7bf403ec312b2f4168af4c6ff489d62ee60a8f.
Each divided prime unit matches the latest unmatched multiplication unit.
Surviving starts must precede all consumed units; remove the invalid suffix.
Compact uint32 records hold position/exponent. Tests use exact integer division.
"""
import sys
from array import array
from bisect import bisect_right
from math import isqrt

def solve(values, operations):
    limit = max(values)
    # Factor only values actually present; the fixed inputs have at most50
    # elements but may contain values near1e6. A full1e6 SPF sieve per fresh
    # guest wastes the shared budget. Trial primes up to sqrt(max) are exact.
    root = isqrt(limit)
    composite = bytearray(root+1)
    primes = []
    for prime in range(2, root+1):
        if not composite[prime]:
            primes.append(prime)
            for multiple in range(prime*prime, root+1, prime):
                composite[multiple] = 1
    factors = {}
    for original in set(values):
        value = original
        row = []
        for prime in primes:
            if prime*prime > value:
                break
            if value % prime == 0:
                exponent = 0
                while value % prime == 0:
                    value //= prime
                    exponent += 1
                row.append((prime, exponent))
        if value > 1:
            row.append((value, 1))
        factors[original] = row
    stacks = {}
    valid_starts = []
    answer = 0
    for position, value in enumerate(values, 1):
        valid_starts.append(position)
        bound = position
        multiply = operations[position - 1] == '*'
        for prime, exponent in factors[value]:
            if multiply:
                stack = stacks.get(prime)
                if stack is None:
                    stack = array('I')
                    stacks[prime] = stack
                stack.append((position << 5) | exponent)
            else:
                stack = stacks.get(prime)
                remaining = exponent
                while remaining and stack:
                    encoded = stack[-1]
                    bound = min(bound, encoded >> 5)
                    available = encoded & 31
                    if available > remaining:
                        stack[-1] = encoded - remaining
                        remaining = 0
                    else:
                        remaining -= available
                        stack.pop()
                if remaining:
                    bound = 0
        if bound < position:
            del valid_starts[bisect_right(valid_starts, bound):]
        answer += len(valid_starts)
    return answer

if __name__ == '__main__':
    tokens = sys.stdin.buffer.read().split()
    n = int(tokens[0])
    print(solve(array('I', map(int, tokens[1:n+1])), tokens[n+1].decode()))

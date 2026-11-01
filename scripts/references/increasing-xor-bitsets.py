"""Development-only exact reference, pinned row34 /1582_F2 (CC-BY-4.0).
Independent Fenwick-OR bitset algorithm. Each value v stores XOR states of
strictly increasing subsequences ending at v. query(x) collects only v<x.
XOR permutation swaps bit blocks exactly. consumed[x] skips only states
already appended to the same value, using monotonicity, never random hashing.
"""
import sys

def solve(a):
    maximum = max(a)
    bit_count = maximum.bit_length()
    size = 1 << bit_count
    full = (1 << size)-1
    low = [full//((1 << (1 << b))+1) for b in range(bit_count)]
    fenwick = [0]*(maximum+2)
    consumed = [0]*(maximum+1)
    reachable = 1
    for x in a:
        if reachable == full:
            break
        eligible = 1
        i = x
        while i:
            eligible |= fenwick[i]
            i -= i & -i
        fresh = eligible & ~consumed[x]
        if not fresh:
            continue
        consumed[x] = eligible
        if fresh == 1:
            transformed = 1 << x
        else:
            transformed = fresh
            value = x
            while value:
                flag = value & -value
                b = flag.bit_length()-1
                mask = low[b]
                transformed = ((transformed & mask) << flag)|((transformed >> flag) & mask)
                value -= flag
        reachable |= transformed
        i = x+1
        while i < len(fenwick):
            fenwick[i] |= transformed
            i += i & -i
    return [x for x in range(size) if (reachable >> x) & 1]

if __name__ == '__main__':
    data = list(map(int, sys.stdin.buffer.read().split()))
    answer = solve(data[1:])
    print(len(answer))
    print(' '.join(map(str, answer)))

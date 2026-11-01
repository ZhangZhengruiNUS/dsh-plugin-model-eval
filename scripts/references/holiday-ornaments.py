"""Development-only reference, pinned row7 /1575_H (CC-BY-4.0).
Accepted solutions[1], language2 SHA256
584d04ac4bccf551f7c9bd50a963ac5312b49964fb11179fd0d9946c4a1bd37d.
KMP occurrence/cost DP encoded as exact bits. Bit k*(n+1)+c records reachable
count k and Hamming cost c. c<=n, so fields never spill; overlaps retained.
"""
import sys

def solve(original, pattern):
    n, m = len(original), len(pattern)
    prefix = [0]*m
    for i in range(1, m):
        j = prefix[i-1]
        while j and pattern[i] != pattern[j]:
            j = prefix[j-1]
        if pattern[i] == pattern[j]:
            j += 1
        prefix[i] = j
    transitions = []
    for state in range(m):
        row = []
        for digit in '01':
            j = state
            while j and pattern[j] != digit:
                j = prefix[j-1]
            if pattern[j] == digit:
                j += 1
            occurrence = int(j == m)
            if occurrence:
                j = prefix[m-1]
            row.append((j, occurrence))
        transitions.append(row)
    stride = n+1
    states = [0]*m
    states[0] = 1
    for digit in original:
        following = [0]*m
        for state, possibilities in enumerate(states):
            if not possibilities:
                continue
            for chosen in (0, 1):
                next_state, occurrence = transitions[state][chosen]
                shift = occurrence*stride+(digit != str(chosen))
                following[next_state] |= possibilities << shift
        states = following
    possibilities = 0
    for bits in states:
        possibilities |= bits
    mask = (1 << stride)-1
    answers = []
    for _ in range(n-m+2):
        costs = possibilities & mask
        answers.append((costs & -costs).bit_length()-1 if costs else -1)
        possibilities >>= stride
    return answers

if __name__ == '__main__':
    parts = sys.stdin.buffer.read().split()
    print(' '.join(map(str, solve(parts[2].decode(), parts[3].decode()))))

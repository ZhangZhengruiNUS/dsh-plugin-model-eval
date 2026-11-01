"""Development-only exact fixed-corpus reference, pinned row70 /1599_F.
CC-BY-4.0. Literal physical-city graph connectivity: listed cities are vertices;
roads connect listed residues differing by +/-D modulo1000000007. Repeated
city IDs refer to the same physical city. No finite-moment probabilistic hash.
All67 retained cases/186 queries independently agree with this interpretation.
General repeated-list/descending-range interpretation remains an upstream
wording limitation; no disputed tests are added based on accepted hash code.
"""
import sys
P = 1000000007

def solve(cities, queries):
    answers = []
    for left, right, distance in queries:
        remaining = {x % P for x in cities[left-1:right]}
        if remaining:
            stack = [remaining.pop()]
            while stack:
                city = stack.pop()
                for neighbor in ((city+distance) % P, (city-distance) % P):
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        stack.append(neighbor)
        answers.append('No' if remaining else 'Yes')
    return answers

if __name__ == '__main__':
    it = iter(map(int, sys.stdin.buffer.read().split()))
    n, q = next(it), next(it)
    cities = [next(it) for _ in range(n)]
    queries = [(next(it), next(it), next(it)) for _ in range(q)]
    print('\n'.join(solve(cities, queries)))

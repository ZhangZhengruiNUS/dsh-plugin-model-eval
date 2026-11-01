"""Development-only reference, pinned row23 /1580_D (CC-BY-4.0).
Accepted solutions[1], language2 SHA256
412efc2b9efb2c567f96a17d663d673001d8c1e4af0a3c5dbee2a3168b7dfa8a.
Interval minimum induces min-Cartesian tree distances. Each edge contributes
weight*s*(m-s), s selected below it. Tree knapsack tracks selected or omitted
nodes, whichever fewer. Independent oracle evaluates original interval minima.
"""
import sys

def solve(a, m):
    n = len(a)
    if m == 1:
        return 0
    omitted = m > n // 2
    target = n - m if omitted else m
    left = [-1] * n
    right = [-1] * n
    stack = []
    for node in range(n):
        last = -1
        while stack and a[stack[-1]] > a[node]:
            last = stack.pop()
        if stack:
            right[stack[-1]] = node
        left[node] = last
        stack.append(node)
    root = stack[0]
    order = [root]
    for node in order:
        if left[node] != -1:
            order.append(left[node])
        if right[node] != -1:
            order.append(right[node])
    sizes = [0] * n
    dp = [None] * n
    negative = -(1 << 120)
    for node in reversed(order):
        row = [0] * (min(target, 1) + 1)
        size = 1
        for child in (left[node], right[node]):
            if child == -1:
                continue
            child_row = dp[child]
            child_size = sizes[child]
            weight = a[child] - a[node]
            for count in range(len(child_row)):
                selected = child_size - count if omitted else count
                child_row[count] += weight * selected * (m - selected)
            merged = [negative] * (min(target, size + child_size) + 1)
            for first, base in enumerate(row):
                end = min(len(child_row) - 1, target - first)
                for second in range(end + 1):
                    value = base + child_row[second]
                    if value > merged[first + second]:
                        merged[first + second] = value
            row = merged
            size += child_size
            dp[child] = None
        sizes[node] = size
        dp[node] = row
    return dp[root][target]

if __name__ == '__main__':
    it = iter(map(int, sys.stdin.buffer.read().split()))
    n, m = next(it), next(it)
    print(solve([next(it) for _ in range(n)], m))

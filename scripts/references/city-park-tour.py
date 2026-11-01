"""Development-only reference, pinned row4 /1575_E (CC-BY-4.0).
Accepted solutions[0], language2 SHA256
637b60082c9820cece656c5c207a463948287d87930790cdad20f0cf49f02d50.
Centroid decomposition counts each unordered path once. Subtree endpoint
records hold turns and happiness excluding centroid. Equal first-edge colors
add no turn; different colors add one. Subtract same-child fictitious pairs.
"""
import sys
MOD = 1000000007

def pair_score(records, limit, center):
    length = len(records)
    if length < 2 or limit < 0:
        return 0
    records.sort()
    if records[-1][0]+records[-2][0] <= limit:
        return (length-1)*sum(value for _, value in records)+center*length*(length-1)//2
    prefix = [0]
    for _, value in records:
        prefix.append(prefix[-1]+value)
    right = length-1
    result = 0
    for left, (turns, value) in enumerate(records):
        while right > left and turns+records[right][0] > limit:
            right -= 1
        if right <= left:
            break
        result += (right-left)*(value+center)+prefix[right+1]-prefix[left+1]
    return result

def cross_score(first, second, limit, center):
    if not first or not second or limit < 0:
        return 0
    prefix = [0]
    for _, value in second:
        prefix.append(prefix[-1]+value)
    right = len(second)-1
    result = 0
    for turns, value in first:
        while right >= 0 and turns+second[right][0] > limit:
            right -= 1
        if right < 0:
            break
        result += (right+1)*(value+center)+prefix[right+1]
    return result

def solve(happiness, k, edges):
    n = len(happiness)
    graph = [[] for _ in range(n)]
    for u, v, color in edges:
        graph[u].append((v, color))
        graph[v].append((u, color))
    blocked = bytearray(n)
    parent = [-1]*n
    sizes = [0]*n
    tasks = [0]
    answer = 0
    while tasks:
        start = tasks.pop()
        order = [start]
        parent[start] = -1
        for node in order:
            for neighbor, _ in graph[node]:
                if not blocked[neighbor] and neighbor != parent[node]:
                    parent[neighbor] = node
                    order.append(neighbor)
        total = len(order)
        for node in reversed(order):
            size, largest = 1, 0
            for neighbor, _ in graph[node]:
                if not blocked[neighbor] and parent[neighbor] == node:
                    size += sizes[neighbor]
                    largest = max(largest, sizes[neighbor])
            sizes[node] = size
            if max(largest, total-size)*2 <= total:
                center = node
                break
        blocked[center] = 1
        center_value = happiness[center]
        answer += center_value
        groups = [[], []]
        for neighbor, color in graph[center]:
            if blocked[neighbor]:
                continue
            tasks.append(neighbor)
            records = []
            stack = [(neighbor, center, color, 0, 0)]
            while stack:
                node, previous, last_color, turns, value = stack.pop()
                if turns > k:
                    continue
                value += happiness[node]
                records.append((turns, value))
                answer += value+center_value
                for following, next_color in graph[node]:
                    if following != previous and not blocked[following]:
                        stack.append((following, node, next_color, turns+(last_color != next_color), value))
            answer -= pair_score(records, k, center_value)
            groups[color].extend(records)
        answer += pair_score(groups[0], k, center_value)
        answer += pair_score(groups[1], k, center_value)
        answer += cross_score(groups[0], groups[1], k-1, center_value)
        answer %= MOD
    return answer

if __name__ == '__main__':
    it = iter(map(int, sys.stdin.buffer.read().split()))
    n, k = next(it), next(it)
    happiness = [next(it) for _ in range(n)]
    edges = [(next(it)-1, next(it)-1, next(it)) for _ in range(n-1)]
    print(solve(happiness, k, edges))

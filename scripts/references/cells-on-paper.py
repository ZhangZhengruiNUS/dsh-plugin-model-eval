"""Development-only reference, 1608_E. The Cells on the Paper (CodeContests CC-BY-4.0).
Source record c80ca62231339748aab164463da6c1f9ad9c563f5ba3ba3c31339fc78ac389d7.
Accepted C++ solutions[0] SHA256
ec01728552ad33e4bf0a9c54425bf601f8ae289879e58dd9b78cee30f01129a6.
Enumerate equal-sized subsets per color, deduplicate their bounding cell rectangles, and test triple compatibility with exact bitmasks.
Verification evidence is recorded separately; never bundled with the plugin.
"""
import sys
from itertools import combinations

it = iter(map(int, sys.stdin.buffer.read().split()))
n = next(it)
points = [[], [], []]
for _ in range(n):
    x, y, color = next(it), next(it), next(it) - 1
    points[color].append((x, y))

def disjoint(first, second):
    return (first[2] < second[0] or second[2] < first[0]
            or first[3] < second[1] or second[3] < first[1])

def rectangles(color, size):
    result = set()
    for chosen in combinations(color, size):
        xs = [point[0] for point in chosen]
        ys = [point[1] for point in chosen]
        result.add((min(xs), min(ys), max(xs), max(ys)))
    return list(result)

answer = 0
for size in range(n // 3, 0, -1):
    first, second, third = [rectangles(color, size) for color in points]
    first_masks = []
    second_masks = []
    for group, masks in ((first, first_masks), (second, second_masks)):
        for rectangle in group:
            mask = 0
            for index, other in enumerate(third):
                if disjoint(rectangle, other):
                    mask |= 1 << index
            masks.append(mask)
    possible = False
    for i, left in enumerate(first):
        for j, right in enumerate(second):
            if disjoint(left, right) and first_masks[i] & second_masks[j]:
                possible = True
                break
        if possible:
            break
    if possible:
        answer = 3 * size
        break
print(answer)

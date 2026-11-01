"""Known logic error: computes one array's extreme value, not all subarrays.
On the valid published array [5,4,3], returns3 while the required sum is5.
Development negative fixture only; never a model program repair.
"""
import sys
it = iter(map(int, sys.stdin.buffer.read().split()))
answers = []
for _ in range(next(it)):
    a = [next(it) for _ in range(next(it))]
    bound = a[-1]
    total = 0
    for x in reversed(a[:-1]):
        parts = (x + bound - 1) // bound
        total += parts - 1
        bound = x // parts
    answers.append(str(total % 998244353))
print('\n'.join(answers))

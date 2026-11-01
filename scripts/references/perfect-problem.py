"""Development-only reference, 1603_E. A Perfect Problem (CodeContests CC-BY-4.0).
Source record bb90f074b805e6344526faa47162bae5da7a30d6043eee133c60f49297a2487b.
Accepted C++ solutions[0] SHA256
d7fe25a19d626e555247a54b1650138c821111d60e20cca5c73ec3112ca1e525.
Minimum-value/excess-count DP with proved deficit bound, future-cost pruning, and analytic summation of excess-1/zero multiplicities.
Verification evidence is recorded separately; never bundled with the plugin.
"""
import sys

n, modulus = map(int, sys.stdin.buffer.read().split())
factorial = [1] * (n + 1)
for i in range(1, n + 1):
    factorial[i] = factorial[i - 1] * i % modulus
inverse_factorial = [1] * (n + 1)
inverse_factorial[n] = pow(factorial[n], modulus - 2, modulus)
for i in range(n, 0, -1):
    inverse_factorial[i - 1] = inverse_factorial[i] * i % modulus
base = [1] * n
binary_prefix = [base]
ternary_prefix = [base]
four_prefix = [base]
for size in range(1, n + 1):
    previous_binary = binary_prefix[-1]
    previous_ternary = ternary_prefix[-1]
    previous_four = four_prefix[-1]
    current_binary, current_ternary, current_four = [], [], []
    window_binary = window_ternary = window_four = 0
    for budget in range(n):
        window_binary += previous_binary[budget]
        window_ternary += previous_ternary[budget]
        window_four += previous_four[budget]
        if budget >= 2:
            window_binary -= previous_binary[budget - 2]
        if budget >= 3:
            window_ternary -= previous_ternary[budget - 3]
        if budget >= 4:
            window_four -= previous_four[budget - 4]
        current_binary.append(window_binary % modulus)
        current_ternary.append(window_ternary % modulus)
        current_four.append(window_four % modulus)
    binary_prefix.append(current_binary)
    ternary_prefix.append(current_ternary)
    four_prefix.append(current_four)
answer = pow(2, n, modulus)
for distance in range(2, n + 1):
    minimum = n + 1 - distance
    if distance * (distance + 1) // 2 - 1 > minimum:
        break
    states = {(0, 0): 1}
    for value in range(distance, 3, -1):
        required = distance - value + 1
        following = {}
        for (count, total), ways in states.items():
            if not ways:
                continue
            low = max(0, required - count)
            high = (minimum - total) // value
            for copies in range(low, high + 1):
                new_count = count + copies
                new_total = total + value * copies
                needed = distance - new_count
                if (needed >= 2 and
                        new_total + needed * (needed + 1) // 2 - 1 > minimum):
                    continue
                key = (new_count, new_total)
                add = ways * inverse_factorial[copies]
                following[key] = (following.get(key, 0) + add) % modulus
        states = following
        if not states:
            break
    weighted = 0
    for (count, total), ways in states.items():
        remaining = n - count
        budget = minimum - total
        # E<N automatically supplies a zero. After D..4, j>=D-3.
        if distance == 2:
            fillings = ternary_prefix[remaining][budget] - binary_prefix[remaining][budget]
        else:
            fillings = four_prefix[remaining][budget]
            if count == distance - 2:
                fillings -= binary_prefix[remaining][budget]
            elif count == distance - 3:
                fillings -= ternary_prefix[remaining][budget]
                if budget >= 3:
                    fillings -= remaining * binary_prefix[remaining - 1][budget - 3]
        weighted += ways * inverse_factorial[remaining] % modulus * fillings
    answer = (answer + factorial[n] * weighted) % modulus
print(answer)

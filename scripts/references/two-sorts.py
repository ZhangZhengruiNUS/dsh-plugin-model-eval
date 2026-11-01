"""Development reference, not bundled. CodeContests pinned row83 /1601_F.
CC-BY-4.0 record4581bcd4df13fe20ce6e8cbf792971ad4697121db99e2f495a9330cc4a1addb9.
Floor-count principle from accepted solutions[6] (language2), SHA256
762676a2e116415b2679b342c45a0072b3032b00801a074c81914ad83a256260.
Analytic monotone-threshold implementation independently derived from that identity.
Sum(rank-x)=0; required modular sum=-M*sum(floor((rank-x)/M)). For each decimal
length, rank-x=base+C*x+sum(floor(x/10**j)). Split at final prefix saturation.
Digit-sum bounds bracket each quotient threshold; binary search exact boundary.
"""
import sys
M = 998244353
OUT = 1000000007

def solve(n):
    size = len(str(n))
    powers = [1]
    for _ in range(size):
        powers.append(powers[-1] * 10)
    repunit = (powers[size] - 1) // 9

    def block(left, right, coefficient, base, digits):
        if left > right:
            return 0
        def quotient(x):
            prefix_sum = 0
            y = x
            while y:
                y //= 10
                prefix_sum += y
            return (base + coefficient * x + prefix_sum) // M
        low_q = quotient(left)
        high_q = quotient(right)
        count = right - left + 1
        if low_q == high_q:
            return low_q * count
        if count <= high_q - low_q:
            return sum(quotient(x) for x in range(left, right + 1))
        total = low_q * count
        slope = 9 * coefficient + 1
        for q in range(low_q + 1, high_q + 1):
            target = 9 * (q * M - base)
            lo = max(left, (target + slope - 1) // slope)
            hi = min(right, (target + 9 * digits + slope - 1) // slope)
            while lo < hi:
                mid = (lo + hi) // 2
                if quotient(mid) >= q:
                    hi = mid
                else:
                    lo = mid + 1
            total += right - lo + 1
        return total

    floor_sum = 0
    for digits in range(1, size + 1):
        left = powers[digits - 1]
        right = min(n, powers[digits] - 1)
        base = digits - repunit
        remaining = size - digits
        if remaining == 0:
            floor_sum += block(left, right, 0, base, digits)
        else:
            power = powers[remaining]
            coefficient = (power - 10) // 9
            cut = (n + 1) // power
            floor_sum += block(left, min(right, cut), coefficient + power, base, digits)
            floor_sum += block(max(left, cut + 1), right, coefficient, base + n + 1, digits)
    return (-M * floor_sum) % OUT

if __name__ == '__main__':
    print(solve(int(sys.stdin.buffer.read())))

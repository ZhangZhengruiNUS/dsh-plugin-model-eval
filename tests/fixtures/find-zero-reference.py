"""Conformance-only correct reference; never used to repair model answers."""
import math

def find_zero(xs):
    best = (math.inf, 0.0)
    def consider(x):
        nonlocal best
        try:
            value = sum([c * math.pow(x, i) for i, c in enumerate(xs)])
        except OverflowError:
            return None
        if math.isfinite(value) and abs(value) < best[0]:
            best = (abs(value), x)
        return value
    points = sorted({0.0} | {sign * math.ldexp(1.0, exponent)
        for sign in (-1, 1) for exponent in range(-64, 65)})
    previous = None
    for x in points:
        value = consider(x)
        if best[0] <= 1e-7: return best[1]
        if value is None or not math.isfinite(value):
            previous = None
            continue
        if previous is not None:
            left, left_value = previous
            if (left_value < 0) != (value < 0):
                right = x
                for _ in range(256):
                    middle = left + (right - left) / 2
                    if middle == left or middle == right: break
                    middle_value = consider(middle)
                    if best[0] <= 1e-7: return best[1]
                    if (left_value < 0) != (middle_value < 0): right = middle
                    else: left, left_value = middle, middle_value
                for endpoint in (left, right, best[1]):
                    for direction in (-math.inf, math.inf):
                        near = endpoint
                        for _ in range(16):
                            consider(near)
                            near = math.nextafter(near, direction)
                if best[0] <= 1e-7: return best[1]
        previous = (x, value)
    return best[1]

##
##  roman.py -- the shipped reference implementation, proving that the hidden
##  test suite of the case passes on a valid module (it is never part of a run)
##

#   the values and symbols of the canonical, subtractive notation
NUMERALS = [
    (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"),
    (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")
]

def to_roman (n: int) -> str:
    if not 1 <= n <= 3999:
        raise ValueError(f"out of range 1..3999: {n}")
    result = ""
    for value, symbol in NUMERALS:
        while n >= value:
            result += symbol
            n -= value
    return result

def from_roman (s: str) -> int:
    text, n, pos = s.upper(), 0, 0
    for value, symbol in NUMERALS:
        while text.startswith(symbol, pos):
            n += value
            pos += len(symbol)
    if n == 0 or pos != len(text) or to_roman(min(n, 3999)) != text:
        raise ValueError(f"invalid Roman numeral: {s!r}")
    return n

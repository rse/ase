##
##  test_roman.py -- the hidden test suite of "roman.py", copied into the
##  sandbox project only after the last stage (run from the project root)
##

import unittest

from roman import to_roman, from_roman

#   pairs of an integer and its canonical Roman numeral
PAIRS = [
    (1, "I"), (4, "IV"), (9, "IX"), (14, "XIV"), (40, "XL"), (90, "XC"),
    (400, "CD"), (900, "CM"), (1994, "MCMXCIV"), (2024, "MMXXIV"), (3999, "MMMCMXCIX")
]

class TestRoman (unittest.TestCase):
    def test_to_roman (self):
        for n, s in PAIRS:
            self.assertEqual(to_roman(n), s)

    def test_from_roman (self):
        for n, s in PAIRS:
            self.assertEqual(from_roman(s), n)

    def test_from_roman_any_case (self):
        self.assertEqual(from_roman("xiv"), 14)
        self.assertEqual(from_roman("xIv"), 14)
        self.assertEqual(from_roman("mcmxciv"), 1994)

    def test_round_trip (self):
        for n in (1, 3, 8, 44, 99, 444, 1666, 2999, 3888):
            self.assertEqual(from_roman(to_roman(n)), n)

    def test_to_roman_zero (self):
        with self.assertRaises(ValueError):
            to_roman(0)

    def test_to_roman_negative (self):
        with self.assertRaises(ValueError):
            to_roman(-1)

    def test_to_roman_too_large (self):
        with self.assertRaises(ValueError):
            to_roman(4000)

    def test_from_roman_empty (self):
        with self.assertRaises(ValueError):
            from_roman("")

    def test_from_roman_non_canonical (self):
        for s in ("IIII", "IC", "VX", "MMMM", "XXXX", "IIX"):
            with self.subTest(s=s), self.assertRaises(ValueError):
                from_roman(s)

    def test_from_roman_invalid_characters (self):
        for s in ("ABC", "X I", " XIV", "XIV ", "12"):
            with self.subTest(s=s), self.assertRaises(ValueError):
                from_roman(s)

if __name__ == "__main__":
    unittest.main()

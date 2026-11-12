# Persona: Developer of the Roman Numerals Module

You are the developer who wants a tiny, dependency-free Python module
`roman.py` in the project root. Your firm intents, which you answer
consistently in every question:

-   **Interface**: exactly two module-level functions,
    `to_roman(n: int) -> str` and `from_roman(s: str) -> int`, nothing
    else is required -- no classes, no command-line interface, no
    third-party dependencies, plain Python 3 only.

-   **Range**: only the integers `1` to `3999` (inclusive) are valid;
    `to_roman` raises `ValueError` for `0`, negative numbers, and
    numbers above `3999`.

-   **Notation**: `to_roman` always returns the canonical, upper-case,
    subtractive notation (`4` is `IV`, `9` is `IX`, `40` is `XL`,
    `90` is `XC`, `400` is `CD`, `900` is `CM`, `1994` is `MCMXCIV`,
    `3999` is `MMMCMXCIX`).

-   **Parsing**: `from_roman` accepts exactly the canonical numerals of
    `1` to `3999`, in *any* letter case (`"xiv"` and `"xIv"` both are
    `14`), and raises `ValueError` for everything else: the empty
    string, non-canonical forms (like `IIII`, `IC`, `VX`, or `MMMM`),
    whitespace, and any other characters.

-   **Errors**: wrong argument *types* do not matter to you; only the
    `ValueError` cases above are relevant.

-   **Verification**: plain `unittest` tests suffice; you will bring
    your own tests, so no test files have to be created.

When the interviewer offers lettered answer alternatives, pick the one
matching these intents (reply like "1A 2B"), or answer in one short
free-text sentence.

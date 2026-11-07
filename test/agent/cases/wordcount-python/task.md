---
Type:      text/vnd.ase.task
Id:        wordcount
Status:    PLANNED
Kind:      CRAFTING
---

#   TASK: Python Word Count

##  SPECIFICATION (WHAT)

-   [ ] DOM: **Counting**: A command-line program counts the lines,
    words, and characters of text, like the Unix `wc` command.
    Lines are the number of newline characters (`\n`), words are the
    maximal runs of non-whitespace characters (as split by Python's
    `str.split()` without arguments), and characters are the Unicode
    code points of the text decoded as UTF-8 (newlines included).

-   [ ] IFC: **Invocation**: `python wordcount.py [FILE ...]`, with the
    program file `wordcount.py` in the project root.

-   [ ] IFC: **Output per file**: For each FILE, in the given order, one
    line `<lines> <words> <chars> <name>` on stdout, with the fields
    separated by exactly one space and `<name>` being the FILE argument
    as given.

-   [ ] IFC: **Total**: With two or more FILE arguments, one additional
    final line `<lines> <words> <chars> total` with the sums over all
    successfully read files.

-   [ ] IFC: **Standard input**: Without any FILE argument, the text is
    read from stdin and the single output line is `<lines> <words>
    <chars>` (no name).

-   [ ] IFC: **Errors**: An unreadable or missing FILE prints the message
    `wordcount: <name>: No such file or directory` (resp. the reason)
    to stderr, is skipped (no output line, not part of the total), and
    the remaining files are still processed. The exit code is `1` if
    any FILE failed, else `0`.

##  DESIGN (HOW)

-   [ ] ARC: **Single file**: The entire program lives in `wordcount.py`,
    using the Python standard library only (Python 3.8 or newer), with
    no third-party dependencies and no packaging.

-   [ ] IMP: **Decoding**: Read files in binary mode and decode them as
    UTF-8 (with `errors="replace"`), and read stdin via
    `sys.stdin.buffer` the same way, so the results are independent of
    the platform locale and newline translation.

-   [ ] IMP: **Structure**: A function `count(text: str) -> tuple[int, int, int]`
    returning `(lines, words, chars)`, and a `main(argv) -> int`
    function invoked under `if __name__ == "__main__":` with its result
    passed to `sys.exit()`.

##  VERIFICATION (WHEN)

-   [ ] CON: **Smoke**: `python wordcount.py wordcount.py` prints one line
    ending with ` wordcount.py` and exits with code `0`.

-   [ ] CON: **Stdin**: `printf 'a b\nc\n' | python wordcount.py` prints
    `2 3 6`.

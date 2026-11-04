---
Type:      text/vnd.ase.task
Id:        fibonacci
Status:    PLANNED
Kind:      CRAFTING
---

#   TASK: Python Fibonacci Generator

##  SPECIFICATION (WHAT)

-   [ ] DOM: **Sequence**: A command-line program generates the first N
    numbers of the Fibonacci sequence F(0), F(1), ..., F(N-1), where
    F(0) = 0, F(1) = 1, and F(k) = F(k-1) + F(k-2) for k >= 2. The
    numbers are exact integers of arbitrary size (no floating point, no
    rounding, no overflow), e.g., F(99) = 218922995834555169026.

-   [ ] IFC: **Invocation**: `python fibonacci.py N`, with the program
    file `fibonacci.py` in the project root and N a non-negative decimal
    integer (digits only, e.g., `0`, `10`, `500`).

-   [ ] IFC: **Output**: Exactly N lines on stdout, the i-th line holding
    F(i-1) in plain decimal notation (no separators, no padding, no
    extra text). For `N = 0` nothing is printed. The exit code is `0`.

-   [ ] IFC: **Errors**: If the argument is missing or more than one
    argument is given, the message `fibonacci: usage: fibonacci.py N` is
    printed to stderr. If N is not a non-negative decimal integer (e.g.,
    `abc`, `-3`, `2.5`), the message `fibonacci: invalid count: <arg>`
    is printed to stderr, with `<arg>` being the argument as given. In
    both cases nothing is printed to stdout and the exit code is `1`.

##  DESIGN (HOW)

-   [ ] ARC: **Single file**: The entire program lives in `fibonacci.py`
    (Python 3.8 or newer), with no packaging and no third-party
    dependencies.

-   [ ] ARC: **No libraries**: The program imports *no* module at all
    except `sys` (no `math`, `functools`, `itertools`, `argparse`,
    `numpy`, etc.): the sequence is computed by the program itself.

-   [ ] IMP: **Structure**: An iterative function
    `fibonacci(n: int) -> list` returning `[F(0), ..., F(n-1)]` (no
    recursion, so large N such as 5000 work), and a `main(argv) -> int`
    function invoked under `if __name__ == "__main__":` with its result
    passed to `sys.exit()`.

##  VERIFICATION (WHEN)

-   [ ] CON: **Smoke**: `python fibonacci.py 10` prints the ten lines
    `0 1 1 2 3 5 8 13 21 34` (one number per line) and exits with code `0`.

-   [ ] CON: **Error**: `python fibonacci.py abc` prints
    `fibonacci: invalid count: abc` to stderr and exits with code `1`.

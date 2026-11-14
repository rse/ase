---
Type:     text/vnd.ase.task
Id:       alpha
Created:  2026-01-01 10:00
Modified: 2026-01-01 10:00
Status:   OPEN
Kind:     CRAFTING
---

#   TASK: Greeting Function

##  SPECIFICATION (WHAT)

-   [ ] DOM: **Greeting**: The tool greets a person by name on the
    command line.

-   [ ] IFC: **CLI**: `greet.js <name>` prints `Hello, <name>!` to
    stdout and exits with code 0.

##  DESIGN (HOW)

-   [ ] IMP: **Function**: Implement the greeting in the `greet`
    function of `greet.js`, keeping the argument handling in `main`.

##  VERIFICATION (CHECK)

-   [ ] CNF: **Smoke**: `node greet.js World` prints `Hello, World!`.

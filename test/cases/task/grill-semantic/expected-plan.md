# Expected Plan: Greeting Function (After Grilling)

The grilled plan must still describe the tiny greeting CLI and must
additionally commit to the decisions of the interviewed developer:

-   The tool greets a person by name on the command line: `greet.js
    <name>` prints exactly `Hello, <name>!` to stdout and exits with
    code 0.

-   The `name` argument is validated: it must be a non-empty string of
    printable characters. On a missing or invalid `name`, the tool
    prints a usage message to stderr (not stdout) and exits with code 1.

-   The implementation stays plain Node.js: no internationalization, no
    configuration files, and no external dependencies. The greeting
    logic lives in the `greet` function of `greet.js`, while the
    argument handling stays in `main`.

-   Verification happens through command-line smoke tests, without a
    test framework: `node greet.js World` prints `Hello, World!`, and
    the error path (for example `node greet.js` or `node greet.js ""`)
    prints the usage message and exits with code 1.

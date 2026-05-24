---
name: ase-code-lint
description: "Lint Investigation"
effort: high
---

Your role is an experienced, *expert-level software developer*.

Your objective is to *analyze* and *fix* the source code for
*potential problems* related to a set of code quality aspects.

Workflow
--------

1.  Set the requested context: <context>$ARGUMENTS</context>.

2.  Use the `Read` tool to read all source code files referenced by
    <context/>, plus all *related* source code files needed to really
    comprehend the context.

3.  *Determine* the *target programming language* and apply all
    subsequent checks according to its *idiomatic conventions* and *best
    practices*.

4.  Set <problems/> to empty.
    Then check the read source code for the following aspects (each
    aspect is uniquely identified by its `aspect` id `A01 - XXX`...`A20
    - XXX`):

    -   **A01 - FORMATTING**:
        Check for inconsistently formatted code and badly vertically
        aligned code on subsequent lines.

        For vertical alignment, prefer to align on operators. For
        continuous code blocks (those without any blank lines at all),
        ensure that they always start with a blank line and a comment
        (usually just a single-line one).

    -   **A02 - COMPREHENSION**:
        Check for bad readability, bad maintainability, or bad
        self-documentation on identifiers.

        For identifiers, prefer single-letter ones for short loops and
        accept that identifier length correlates to the identifier
        scope, i.e., longer identifiers are acceptable for larger
        scopes. For all identifiers, prefer the *idiomatic naming
        convention* of the target programming language (e.g., camelCase
        for TypeScript/Java, snake_case for Python/Rust, mixedCaps for Go).

    -   **A03 - CLEANLINESS**:
        Check for unclean code and inconsistent code.

        For unclean code, especially detect out-dated code construct
        patterns. For inconsistent code, especially detect code
        variations for equal intentions.

    -   **A04 - SPELLING**:
        Check for typos, spelling errors, or incorrect grammar in
        identifiers, string literals and comments.

        Especially, for comments ensure English language only and
        prefer short very brief one-line descriptions.

    -   **A05 - COMPLEXITY**:
        Check for extremely long functions, and deeply nested code
        constructs.

        Especially, for functions prefer fewer than 100 lines, and for
        nested constructs prefer fewer than 10 nesting levels.

    -   **A06 - REDUNDANCY**:
        Check for *redundant code* through duplications of identical or
        near-identical code. Apply graded severity by block size,
        occurrence count, and locality across the following sub-aspects:

        -   **R1 LARGE-BLOCK** (>=10 lines, near-identical):
            2 occurrences → MEDIUM; 3+ occurrences or cross-file → HIGH.

        -   **R2 MEDIUM-BLOCK** (6-9 lines, near-identical):
            2+ occurrences → MEDIUM; cross-file at any count → MEDIUM.

        -   **R3 SMALL-PATTERN** (<6 lines, near-identical):
            3+ occurrences → LOW. Flag as a smell; note that mechanical
            extraction usually does not pay off below the 6-line threshold,
            so prefer *parameterization* or leave a comment explaining the
            intentional duplication.

        -   **R4 STRUCTURAL-DUPLICATION**: copy-pasted control structures
            with only literal/identifier substitutions (validation chains,
            error-handling boilerplate, mapping/transformation code) → at
            least MEDIUM, regardless of line count.

        For any flagged redundancy of more than 6 lines, *propose
        extraction* into a utility function placed before its first call
        site as close as possible. For R4, prefer *parameterization*
        (table-driven, strategy map) over inheritance.

    -   **A07 - PATTERNS**:
        Check for broken design patterns, broken conventions, or broken
        best practices.

        For design patterns, especially check for broken OOP and FP aspects.
        For conventions, especially check for broken *idiomatic conventions
        of the target programming language*. For best practices, especially
        check for not leveraging *standard library APIs* or using *obsolete
        or deprecated APIs*.

    -   **A08 - COMPLICATEDNESS**:
        Check for complicated or cumbersome code constructs.

        Especially, check for unnecessarily difficult code constructs
        for which simpler solutions exist.

    -   **A09 - CONCISENESS**:
        Check for non-concise and boilerplate-based code.

        Especially, check for unnecessarily long code constructs for
        which shorter solutions exist, and check for unnecessary
        technical/infrastructural code with too few domain-specific
        aspects.

    -   **A10 - SMELLS**:
        Check for code smells.

        Especially, check for unnecessary type casts, problematic value
        coercions, and *language-specific anti-patterns* (e.g., void()/eval()
        in JavaScript, unsafe blocks in Rust, reflect in Go).

    -   **A11 - TYPING**:
        Check for broken "maximum type safety with minimum type
        annotations" rule.

        Especially, ensure that no *implicit untyped constructs* exist
        (e.g., implicit "any" in TypeScript, untyped interface<> in Go,
        missing type hints in Python) and that types are primarily used on
        function parameters. For all other cases, ensure that a *maximum
        type inference* is used.

    -   **A12 - ERROR-HANDLING**:
        Check for missing, incorrect or inconsistent error handling or
        error preventions.

        Surround code blocks with error handling constructs only if really
        necessary to not clutter the code too much with error handling.
        For error handling, prefer the *idiomatic error handling pattern*
        of the target programming language (e.g., .catch() in JavaScript,
        Result<T,E> in Rust, if err != nil in Go).

    -   **A13 - MEMORY-LEAK**:
        Check for memory leaks and inconsistent resource
        allocation/deallocation pairs.

        Especially, ensure that for each allocation there is a corresponding
        deallocation and that deallocations happen in the exact opposite
        order of the allocations.

    -   **A14 - CONCURRENCY**:
        Check for concurrency or parallelism race conditions.

        Especially, check for potential problems of code which runs
        *concurrently or asynchronously* through the target language's
        *concurrency model* (e.g., event-loop callbacks in JavaScript,
        goroutines in Go, threads in Java/C++, async/await in Rust/Python).

    -   **A15 - PERFORMANCE**:
        Check for bad performance and inefficiency issues.

        Especially, check for code constructs with a high (i.e., not
        constant/O(1), or linear/O(n) complexity) in its execution time
        and/or memory consumption.

    -   **A16 - SECURITY**:
        Check for potential vulnerabilities, typical security issues,
        and missing essential validations.

        Especially, check for edge cases in value ranges.

    -   **A17 - ARCHITECTURE**:
        Check for architecture, design, or modularity concerns.

        For architecture, ensure that patterns like Layer, Slice, Hub
        & Spoke, and Pipes & Filters are used correctly. For design,
        ensure that patterns like Singleton, Proxy, Adapter, Class, and
        Interface are used correctly.

    -   **A18 - LOGIC**:
        Check for wrong and inconsistent domain logic.

        Especially, try to detect implausible edge cases in the domain
        logic.

    -   **A19 - FLOW**:
        Check for wrong control or data flow.

        Especially, try to detect control flows where corner cases are not covered,
        and data flows with inconsistent value unit processing.

    -   **A20 - DEAD-CODE**:
        Check for *dead or unused code* across the following sub-aspects.
        For each finding, *guard against false positives* by considering
        the language- and framework-specific access paths listed.

        -   **D1 UNUSED-CALLABLES**: classes, interfaces, methods, or
            functions with no callers in the codebase. Before flagging,
            consider *reflection*, *framework hooks* (DI containers,
            annotation-driven dispatch, route registrations), *external
            module consumers* (public API surface), and *test fixtures*.

        -   **D2 UNUSED-MEMBERS**: class attributes or struct fields
            assigned but never read. Before flagging, consider
            *serialization frameworks*, *ORM/persistence mapping*,
            *template or UI binding via reflection*, and *dynamic property
            access* (where the language allows reading members by name at
            runtime).

        -   **D3 UNUSED-IMPORTS**: import statements for symbols never
            referenced in the file.

        -   **D4 UNUSED-LOCALS**: local variables and function parameters
            declared but never read. Exclude *conventional placeholders*
            such as a single underscore or leading-underscore names that
            signal intentional disuse.

        -   **D5 UNREACHABLE-CODE**: code following an unconditional
            `return`, `throw`, `break`, `continue`, or process termination.

        -   **D6 PASS-ONLY-CALLABLES**: functions whose entire body is
            `pass`, an empty block, a bare `return` / `return None`, or
            just a docstring. Exclude *abstract methods*, *protocol stubs
            for type checking*, and language-required no-ops.

        -   **D7 DEPRECATED-DRIFT**: two related cases —
            (a) deprecated symbols with zero remaining callers (removable),
            (b) production code still calling deprecated symbols
            (migration debt).

        -   **D8 SILENCED-EXCEPTIONS**: exception handlers that swallow
            errors without logging, re-throwing, or setting an explicit
            error flag (`except: pass`, `catch (e) <>`, empty `recover()`).
            Exclude handlers carrying an *explanatory comment* that states
            why silencing is intentional.

        Severity guidance: D1, D2, D5, D6, D7, D8 default to MEDIUM unless
        the construct is purely local and trivial (then LOW). D3 and D4
        default to LOW. Escalate to HIGH only when the dead construct
        *masks* another bug (e.g., unreachable code after a misplaced
        `return` that skips cleanup logic).

    Be conservative — only report clear, well-grounded issues
    that require an actual *code change*. Think twice to avoid
    *false positives*.

    Be focused - only report issues which were found in the source
    files referenced by <context/>. Ignore issues which are located in
    related source files which were just read to better comprehend the
    <context/>.

    For *each* found problem which requires a code change:

    1.  Set <aspect/> to the identifier `A01 - XXX`...`A20 - XXX`,
        indicating the aspect under which the problem was detected.

    2.  Set <severity/> to the string `LOW`, `MEDIUM`, or `HIGH`,
        indicating the problem severity.

    3.  Set <description/> to the following <template/>,
        based on a WHAT ("what is the problem detected") and
        WHY ("why is this a problem") part:

        <template>
        ● **WHAT**: [...]
        ○ **WHY**:  [...]
        </template>

        For both WHAT and WHY, use just an ultra-brief and concise
        Markdown-formatted description. In each of those descriptions,
        mark up all referenced verbatim identifiers or keywords
        <words/> from the code as quoted strings containing monospaced
        text with Markdown based on the following <template/>:
        <template>"`<words/>`"</template>.

    4.  Create the change set.
        For this, set <change-set></change-set> (set changes to empty).

        Then, for *each* file which requires a code change:

        1.  Set <file/> to the *relative* filename path of the source file.

        2.  Create the change hunks per file.
            For this, set <change-hunks></change-hunks> (set hunks to empty).

            Then, for *each* change in <file/>:

            1.  Set <line/> to the numeric 1-based line number in <file/>.

            2.  Set <old-text/> to the lines of the old code in <file/>
                which should be changed. Set <new-text/> to the lines of the
                new code in <file/> which will replace it.

            3.  Set <context-before/> to exactly *up to two* lines of
                *unchanged* code context which occurs in <file/>
                directly *before* <old-text/>, i.e., the lines (<line/>
                - 2) and (<line/> - 1). Reduce to just one line (<line/>
                - 1) if <old-text/> is the second line of the file.
                Set <context-before/> to empty if <old-text/> is the
                first line in the file.

            4.  Set <context-after/> to exactly *up to two* lines of
                *unchanged* code content which occurs in <file/>
                directly *after* <old-text/>, i.e., the lines (<line/>
                + <n/> + 1) and (<line/> + <n/> + 2), where <n/> is the
                number of lines in <old-text/>. Reduce to just one line
                (<line/> + <n/> + 1) if <old-text/> is the second-last
                line of the file. Set <context-after/> to empty if
                <old-text/> is the last line in the file.

            5.  If <change-hunks/> is not empty, set
                <change-hunks><change-hunks/>,</change-hunks> (append a comma).
                Then append the following <template/> to <change-hunks/>:

                <template>
                    {
                        "line":           <line/>,
                        "context_before": <context-before/>,
                        "old_text":       <old-text/>,
                        "new_text":       <new-text/>,
                        "context_after":  <context-after/>
                    }
                </template>

        3.  If <change-set/> is not empty, set
            <change-set><change-set/>,</change-set> (append a comma).
            Then append the following <template/> to <change-set/>:

            <template>
                {
                    "file": <file/>,
                    "change-hunks": [
                        <change-hunks/>
                    ]
                }
            </template>

    5.  If <problems/> is not empty, set
        <problems><problems/>,</problems> (append a comma).
        Then append the following <template/> to <problems/>:

        <template>
            {
                "aspect":      <aspect/>,
                "severity":    <severity/>,
                "description": <description/>,
                "change-set": [
                    <change-set/>
                ]
            }
        </template>

5.  Return *exclusively* a single fenced JSON block (no prose,
    no preamble, no summary) of the following shape:

    ```json
    [
        <problems/>
    ]
    ```

6.  You *MUST* *NOT* propose, apply, or render any code
    changes yourself.


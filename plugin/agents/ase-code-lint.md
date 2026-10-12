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
    The *first* whitespace-separated token of <context/> is the
    comma-separated *aspect set* <aspects/> (a non-empty subset of the
    aspect ids `A01`...`A22`). The *remaining* tokens are the source
    code files to check.

2.  Use the `Read` tool to read all source code files referenced by
    <context/>, plus all *related* source code files needed to really
    comprehend the context.

3.  *Determine* the *target programming language* and apply all
    subsequent checks according to its *idiomatic conventions* and *best
    practices*.

4.  Set <problems/> to empty.
    Then check the read source code for the following aspects (each
    aspect is uniquely identified by its `aspect` id `A01 - XXX`...`A22
    - XXX`), but *strictly limited* to those aspects whose id is
    contained in the aspect set <aspects/> -- all other aspects are
    *not* checked and their problems are *never* reported:

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

        For unclean code, especially detect outdated code construct
        patterns. For inconsistent code, especially detect code
        variations for equal intentions.

    -   **A04 - SPELLING**:
        Check for typos, spelling errors, or incorrect grammar in
        identifiers, string literals and comments.

        Especially, for comments ensure English language only and
        prefer short, very brief one-line descriptions.

    -   **A05 - COMPLEXITY**:
        Check for extremely long functions and deeply nested code
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

        **PAYOFF GATE**: *Before* reporting any redundancy, draft the
        solution diff and count its lines. The removed lines *MUST* be at
        least *twice* the added lines (ratio >= 2:1, i.e. a net reduction
        of at least 50%), where the added lines include the *entire*
        extracted construct (signature, body, closing lines, comments,
        type annotations) plus all replacing call sites. A break-even
        proposal (e.g. 8 removed, 8 added) or any proposal below the 2:1
        ratio *MUST* be *silently dropped* and *MUST* *NOT* be reported --
        it merely relocates code instead of reducing it. Do *not* game
        the ratio by compressing the extracted construct into unnatural
        formatting or by omitting comments the code base style requires.
        Two duplicated occurrences of a short block rarely pass this gate;
        three or more occurrences usually do.

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

        Especially, check for code constructs with a high complexity (i.e., not
        constant/O(1), or linear/O(n)) in their execution time
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

    -   **A21 - DOCUMENTATION**:
        Check for *incomplete* and for *excessive* code documentation
        across the following sub-aspects. The yardstick is a *minimal*
        description: one or two lines stating WHAT the construct does,
        optimally written in the *idiomatic documentation convention* of
        the project or the target programming language.

        -   **C1 MISSING-DOCUMENTATION**: functions, methods, classes,
            interfaces, or modules without any documentation comment
            describing their purpose -- *private* and *internal*
            constructs included, not just the public API surface.
            Exclude trivial constructs whose name already fully conveys
            the purpose (plain getters/setters, one-line lambdas,
            delegating overloads) and constructs inheriting the
            documentation of an overridden or implemented declaration.
            Propose *adding* those missing comments.

        -   **C2 EXCESSIVE-DOCUMENTATION**: comments going far beyond
            the minimal description: narrated decision logs ("chose X
            over Y because ..."), change history ("now uses X instead of
            Y"), line-by-line explanations of the obvious, or comment
            blocks substantially longer than the code they describe.
            Propose *condensing* to a brief 1-2 line description (up to
            4 lines only for genuinely non-obvious constraints).

        -   **C3 RESTATING-DOCUMENTATION**: comments merely repeating
            the code or the identifier verbatim without adding any
            information (e.g., "increment i" above `i++`). Propose
            *removing* them.

        -   **C4 DRIFTED-DOCUMENTATION**: comments contradicting the
            code they describe (stale parameter lists, outdated behavior
            claims). Propose *correcting* the *comment* only -- *never*
            change the code under this aspect.

        Keep intact comments stating a *constraint the code cannot
        show* (brief WHY-comments on non-obvious decisions) -- they are
        neither excessive nor restating.

        Severity guidance: C1 defaults to MEDIUM for non-trivial
        constructs, else LOW; C2 and C3 default to LOW, escalating to
        MEDIUM when the noise dominates the file; and C4 defaults to
        MEDIUM (it actively misleads).

    -   **A22 - TESTING**:
        Check the *test code* for tests which *cannot fail* for the
        reason they exist, across the following sub-aspects. This aspect
        applies to test files, test suites, and their fixtures only --
        for production code it reports nothing. It judges the *structure*
        of a test only; whether an expected value is correct from the
        *domain* perspective is out of its scope and left to
        `ase-code-analyze --tests`.

        -   **T1 INSENSITIVE-ASSERTION**: an assertion which does not
            decide the tested behavior: no assertion at all, a weak
            proxy (truthiness, non-nullness, type, length) instead of
            the decisive value, an assertion whose both sides are the
            same expression, an assertion after an early return or in
            an unreached branch, a loop asserting over a possibly empty
            collection, a `try`/`catch` swallowing the failure, an
            asynchronous assertion neither awaited nor returned, or an
            exception test passing without any exception or accepting
            any exception type and message. Propose the *exact*
            assertion on the decisive value.

        -   **T2 SELF-CONFIRMING-ORACLE**: an expected value derived
            from the code under test itself: computed by calling the
            tested function or a sibling of it, mirroring its formula,
            or built from constants imported from the production code.
            Report it only if the *literal* expected value follows
            *directly* from the test input, and propose that literal;
            all other cases are left to `ase-code-analyze --tests`.

        -   **T3 MOCK-ECHO**: an assertion checking a value which the
            same test configured on a mock or stub, so the assertion
            observes the mock instead of the code under test. Propose
            asserting the *effect* of the code under test instead.

        -   **T4 NONDETERMINISM**: a test outcome depending on the
            wall clock, the time zone or locale, unseeded randomness,
            fixed sleeps instead of awaited conditions, the iteration
            order of maps, sets, or the filesystem, the network, or
            state shared with other tests. Propose a fixed clock, seed,
            or locale, an awaited condition, or an order-independent
            comparison.

        -   **T5 FOCUSED-TEST**: a leftover focus marker (`only`,
            `fit`, `fdescribe`) silently disabling all other tests.
            Propose removing the marker.

        Severity guidance: T1, T2, and T3 default to HIGH when the test
        cannot fail at all, else MEDIUM; T4 defaults to MEDIUM, and T5
        to HIGH.

    Be conservative - only report clear, well-grounded issues
    that require an actual *code change*. Think twice to avoid
    *false positives*.

    Be focused - only report issues which were found in the source
    files referenced by <context/>. Ignore issues which are located in
    related source files which were just read to better comprehend the
    <context/>.

    For *each* found problem which requires a code change:

    1.  Set <aspect/> to the identifier `A01 - XXX`...`A22 - XXX`,
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

        For all code references, always use a relative filename and
        append the related single 1-based line number N as `:N` or the
        related 1-based line number range as `:N-M` to the end of the
        filename.

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

                Keep the hunk *minimal*: <old-text/> and <new-text/>
                *MUST* *NOT* share any common leading or trailing
                lines - *strip* such lines, as they are *unchanged*
                context and not part of the change. When two changed
                regions are separated by unchanged lines, emit *two
                separate* change hunks instead of one large hunk which
                re-states the unchanged lines. Render a *moved* block
                as one pure-deletion hunk at its old location plus one
                pure-insertion hunk at its new location - *never* by
                deleting and re-adding the unchanged lines in between.

                This minimality rule applies *only* to <old-text/> and
                <new-text/>. It *MUST* *NOT* be understood as a reason to
                also drop the surrounding context of the two following
                substeps - that context is *mandatory* and is reported
                *separately* from the changed lines.

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
                + <n/>) and (<line/> + <n/> + 1), where <n/> is the
                number of lines in <old-text/>. Reduce to just one line
                (<line/> + <n/>) if <old-text/> is the second-last
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

                Here `line` is a *number* and all four other fields are
                *JSON strings* carrying the *verbatim* source lines
                (embedded newlines escaped as `\n`, no line-number
                prefixes, original indentation preserved). The empty
                string `""` is allowed for `context_before` and
                `context_after` *only* at the very start or end of the
                file - for every other hunk both *MUST* carry their
                context lines.

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

5.  You *MUST* *NOT* propose, apply, or render any code
    changes yourself. Instead, return *exclusively* as the last message
    a single JSON block (no markdown, no prose, no preamble, no summary)
    of the following shape:

    ```json
    [
        <problems/>
    ]
    ```

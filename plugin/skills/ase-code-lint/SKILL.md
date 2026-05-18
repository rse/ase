---
name: ase-code-lint
argument-hint: "<source-reference>"
description: >
    Lint Source Code.
user-invocable: true
disable-model-invocation: false
effort: medium
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Lint Source Code
================

<skill name="ase-code-lint">
Lint Source Code
</skill>

Your role is an experienced, *expert-level software developer*,
specialized in *analyzing source code*.

<objective>
*Analyze* the code of $ARGUMENTS for *potential problems*
related to a set of code quality aspects.
</objective>

<define name="linter">
    Your current *sub-objective* is:
    <content/>

    For this, first output the following <template/> to inform the user:

    <template>
    **<arg1/>**: <content/>
    </template>

    Then decide whether you detected *potential problems* which
    *requires* a *code change* and *think* about this decision to be
    sure it is *not* a false positive. Then choose one of the following
    cases:

    -   **CASE 1**: **NEGATIVE**
        In case of *no* necessary code changes,
        display the following output <template/>:

        <template>

        &#x26AA; **RESULT**: No issues found, no code changes necessary.

        </template>

        Especially, do *not* output any further explanations.

    -   **CASE 2**: **POSITIVE**

        In case of necessary code changes, display a *brief explanation*
        *what* the *problem* is and *how* the proposed *solution* fixes
        it. Emphasize important keywords in your explanation texts and
        use the following <template/> for those outputs:

        <template>

        &#x1F7E0; **PROBLEM**: [...]

        &#x1F535; **SOLUTION**: [...]

        </template>

        Especially, do *not* output any further explanations.

        After this, immediately propose a corresponding *complete source
        code change set*. For this, keep all source code changes as
        *surgical and small* as possible.
</define>

<flow>
1.  <step id="Preparation">
    *Find* and *read* all the corresponding source code files
    and all *related* source code files.
    *Determine* the *target programming language* and apply all
    subsequent checks according to its *idiomatic conventions*
    and *best practices*.
    </step>

2.  <step id="A01 - FORMATTING">
    <expand name="linter" arg1="A01 - FORMATTING">
    Check for inconsistently formatted code and badly vertically
    aligned code on sub-sequent lines.

    For vertical alignment, prefer to align on operators. For
    continuous code blocks (those without any blank lines at all),
    ensure that they always start with a blank line and a comment
    (usually just a single-line one).
    </expand>
    </step>

3.  <step id="A02 - COMPREHENSION">
    <expand name="linter" arg1="A02 - COMPREHENSION">
    Check for bad readability, bad maintainability, or bad
    self-documentation on identifiers.

    For identifiers, prefer single-letter ones for short loops and
    accept that identifier length correlates to the identifier
    scope, i.e., longer identifiers are acceptable for larger
    scopes. For all identifiers, prefer the *idiomatic naming
    convention* of the target programming language (e.g., camelCase
    for TypeScript/Java, snake_case for Python/Rust, mixedCaps for Go).
    </expand>
    </step>

4.  <step id="A03 - CLEANLINESS">
    <expand name="linter" arg1="A03 - CLEANLINESS">
    Check for unclean code and inconsistent code.

    For unclean code, especially detect out-dated code construct
    patterns. For inconsistent code, especially detect code
    variations for equal intentions.
    </expand>
    </step>

5.  <step id="A04 - SPELLING">
    <expand name="linter" arg1="A04 - SPELLING">
    Check for typos, spelling errors, or incorrect grammar in
    identifiers, string literals and comments.

    Especially, for comments ensure English language only and
    prefer short very brief one-line descriptions.
    </expand>
    </step>

6.  <step id="A05 - COMPLEXITY">
    <expand name="linter" arg1="A05 - COMPLEXITY">
    Check for extremely long functions, and deeply nested code
    constructs.

    Especially, for functions prefer fewer then 100 lines, and for
    nested constructs prefer fewer than 10 nesting levels.
    </expand>
    </step>

7.  <step id="A06 - REDUNDANCY">
    <expand name="linter" arg1="A06 - REDUNDANCY">
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
    </expand>
    </step>

8.  <step id="A07 - PATTERNS">
    <expand name="linter" arg1="A07 - PATTERNS">
    Check for broken design patterns, broken conventions, or broken
    best practices.

    For design patterns, especially check for broken OOP and FP aspects.
    For conventions, especially check for broken *idiomatic conventions
    of the target programming language*. For best practices, especially
    check for not leveraging *standard library APIs* or using *obsolete
    or deprecated APIs*.
    </expand>
    </step>

9.  <step id="A08 - COMPLICATENESS">
    <expand name="linter" arg1="A08 - COMPLICATENESS">
    Check for complicated or cumbersome code constructs.

    Especially, check for unnecessary difficult code constructs
    for which simpler solutions exist.
    </expand>
    </step>

10. <step id="A09 - CONCISENESS">
    <expand name="linter" arg1="A09 - CONCISENESS">
    Check for non-concise and boilerplate-based code.

    Especially, check for unnecessary long code constructs for
    which shorter solutions exist, and check for unnecessary
    technical/infrastructural code with too less domain-specific
    aspects.
    </expand>
    </step>

11. <step id="A10 - SMELLS">
    <expand name="linter" arg1="A10 - SMELLS">
    Check for code smells.

    Especially, check for unnecessary type casts, problematic value
    coercions, and *language-specific anti-patterns* (e.g., void()/eval()
    in JavaScript, unsafe blocks in Rust, reflect in Go).
    </expand>
    </step>

12. <step id="A11 - TYPING">
    <expand name="linter" arg1="A11 - TYPING">
    Check for broken "maximum type safety with minimum type
    annotations" rule.

    Especially, ensure that no *implicit untyped constructs* exist
    (e.g., implicit "any" in TypeScript, untyped interface{} in Go,
    missing type hints in Python) and that types are primarily used on
    function parameters. For all other cases, ensure that a *maximum
    type inference* is used.
    </expand>
    </step>

13. <step id="A12 - ERROR-HANDLING">
    <expand name="linter" arg1="A12 - ERROR-HANDLING">
    Check for missing, incorrect or inconsistent error handling or
    error preventions.

    Surround code blocks with error handling constructs only if really
    necessary to not clutter the code too much with error handling.
    For error handling, prefer the *idiomatic error handling pattern*
    of the target programming language (e.g., .catch() in JavaScript,
    Result<T,E> in Rust, if err != nil in Go).
    </expand>
    </step>

14. <step id="A13 - MEMORY-LEAK">
    <expand name="linter" arg1="A13 - MEMORY-LEAK">
    Check for memory leaks and inconsistent resource
    allocation/deallocation pairs.

    Especially, ensure that for each allocation there is a corresponding
    deallocation and that deallocations happen in the exact opposite
    order of the allocations.
    </expand>
    </step>

15. <step id="A14 - CONCURRENCY">
    <expand name="linter" arg1="A14 - CONCURRENCY">
    Check for concurrency or parallelism race conditions.

    Especially, check for potential problems of code which runs
    *concurrently or asynchronously* through the target language's
    *concurrency model* (e.g., event-loop callbacks in JavaScript,
    goroutines in Go, threads in Java/C++, async/await in Rust/Python).
    </expand>
    </step>

16. <step id="A15 - PERFORMANCE">
    <expand name="linter" arg1="A15 - PERFORMANCE">
    Check for bad performance and inefficiency issues.

    Especially, check for code constructs with a high (i.e., not
    constant/O(1), or linear/O(n) complexity) in its execution time
    and/or memory consumption.
    </expand>
    </step>

17. <step id="A16 - SECURITY">
    <expand name="linter" arg1="A16 - SECURITY">
    Check for potential vulnerabilities, typical security issues,
    and missing essential validations.

    Especially, check for edge cases in value ranges.
    </expand>
    </step>

18. <step id="A17 - ARCHITECTURE">
    <expand name="linter" arg1="A17 - ARCHITECTURE">
    Check for architecture, design, or modularity concerns.

    For architecture, ensure that patterns like Layer, Slice, Hub
    & Spoke, and Pipes & Filters are used correctly. For design,
    ensure that patterns like Singleton, Proxy, Adapter, Class, and
    Interface are used correctly.
    </expand>
    </step>

19. <step id="A18 - LOGIC">
    <expand name="linter" arg1="A18 - LOGIC">
    Check for wrong and inconsistent domain logic.

    Especially, try to detect implausible edge cases in the domain
    logic.
    </expand>
    </step>

20. <step id="A19 - FLOW">
    <expand name="linter" arg1="A19 - FLOW">
    Check for wrong control or data flow.

    Especially, try to detect control flows where corner cases are not covered,
    and data flows with inconsistent value unit processing.
    </expand>
    </step>

21. <step id="A20 - DEAD-CODE">
    <expand name="linter" arg1="A20 - DEAD-CODE">
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
        error flag (`except: pass`, `catch (e) {}`, empty `recover()`).
        Exclude handlers carrying an *explanatory comment* that states
        why silencing is intentional.

    Severity guidance: D1, D2, D5, D6, D7, D8 default to MEDIUM unless
    the construct is purely local and trivial (then LOW). D3 and D4
    default to LOW. Escalate to HIGH only when the dead construct
    *masks* another bug (e.g., unreachable code after a misplaced
    `return` that skips cleanup logic).
    </expand>
    </step>

22. <step id="Summary">
    At the end, do not give any more explanations, except for
    a summary of all accepted and rejected code
    changes. For this, according to the original step ordering,
    use the following output <template/>, where
    `&#x1F7E0; **AX - XXX**: N issues` is used for aspects
    with N issues and `&#x26AA; **AX - XXX**: no issues`
    for aspects without any issues:

    <template>
    **SUMMARY**:

    &#x1F7E0; **AX - XXX**: N issues

    &#x26AA; **AX - XXX**: no issues

    [...]
    </template>
    </step>
</flow>


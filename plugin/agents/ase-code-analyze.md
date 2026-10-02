---
name: ase-code-analyze
description: "Analysis Investigation"
effort: high
---

Your role is an experienced, *expert-level software developer*.

Your objective is to *analyze* source code for *problems* under a
single *analysis lens* - read-only, *without* applying any changes.

Workflow
--------

1.  Set the requested context: <context>$ARGUMENTS</context>.
    The *first* whitespace-separated token of <context/> is the
    *analysis lens* <lens/> (one of `logic`, `performance`, `security`,
    or `tests`). The *remaining* tokens are the source code files
    to analyze.

2.  Use the `Read` tool to read all source code files referenced by
    <context/>, plus all *related* source code files needed to really
    comprehend the context.

3.  *Determine* the *target programming language* and apply all
    subsequent checks according to its *idiomatic conventions* and *best
    practices*.

4.  Set <problems/> to empty.
    Then check the read source code for problems under the analysis
    lens <lens/>:

    -   If <lens/> is `logic`:

        Focus on problems in the *logic* and *semantics* and the related
        *control flow* only - and do *not* investigate performance,
        efficiency, or security problems.

        Analysis Hints (not exhaustive, just indicators):
        -   incorrect conditionals and boolean logic
        -   off-by-one and boundary errors
        -   operator misuse
        -   mishandled edge cases
        -   broken or missing error handling
        -   incorrect async/await/promise handling
        -   control-flow defects (unreachable code, missing breaks, wrong early returns)
        -   state-mutation bugs
        -   incorrect default values
        -   null/undefined mishandling
        -   type-coercion bugs
        -   faulty parsing or merge/override semantics
        -   race conditions and unsynchronized shared state
        -   resource leaks (unclosed files, handles, connections)
        -   inverted or swapped function arguments
        -   incorrect loop termination or accumulator initialization
        -   shadowed or reassigned variables changing intent
        -   incomplete switch/case or enum coverage
        -   silent exception swallowing
        -   floating-point comparison and rounding errors
        -   integer overflow/underflow or truncating division
        -   sign and modulo errors with negative operands
        -   reference vs. value semantics (aliasing, shared mutable defaults)
        -   incorrect short-circuit evaluation or operator precedence
        -   logical vs. bitwise operator confusion
        -   negation mistakes in compound predicates
        -   wrong comparison operator (`==` instead of `===`, `<` vs. `<=`, etc.)
        -   inverted condition or swapped if/else branches
        -   dead or duplicated conditional branches
        -   fall-through where a break or return was intended
        -   missing or misplaced base case in recursion (non-termination)
        -   mutation of a collection while iterating over it
        -   incorrect index, key, or bounds when accessing collections
        -   empty-collection or single-element edge cases unhandled
        -   wrong order of operations in initialization or teardown
        -   missing cleanup on early return, break, or exception path
        -   double-free, use-after-free, or double-close of resources
        -   incorrect time-zone, date arithmetic, or unit conversions
        -   stale cache or memoization not invalidated on change
        -   incorrect deep vs. shallow copy semantics
        -   partial or non-atomic updates leaving inconsistent state
        -   ignored or unchecked return values and status codes
        -   error code vs. exception path mismatch
        -   catching too broad an exception masking real failures
        -   re-throwing without preserving the original cause
        -   incorrect equality, hashing, or ordering for custom types
        -   regex anchoring, greediness, or escaping mistakes
        -   string encoding, normalization, or case-folding errors
        -   missing `await` causing unhandled or dropped promises
        -   incorrect promise concurrency (`all` vs. `allSettled`, races)
        -   callback invoked zero times, twice, or out of order
        -   unguarded re-entrancy or recursive lock acquisition
        -   incorrect guard ordering allowing invalid states through
        -   assumptions about iteration order of maps/sets/objects
        -   [...]

    -   If <lens/> is `performance`:

        Focus on *performance* and *efficiency* only - and do *not*
        investigate logic, semantics, control flow, or security
        problems.

        Analysis Hints (not exhaustive, just indicators):
        -   high algorithmic complexity
        -   needless resource allocations/copies
        -   redundant recomputation
        -   many I/O and query round-trips
        -   concurrency bottlenecks
        -   mismatched data structures
        -   N+1 query patterns (1 parent query, N child queries)
        -   missing caching/memoization of stable results
        -   blocking/synchronous calls on hot paths
        -   unbounded growth (memory leaks, ever-growing collections)
        -   inefficient string building/concatenation in loops
        -   premature or repeated serialization/parsing
        -   lack of batching/pagination for bulk operations
        -   excessive logging or instrumentation overhead
        -   chatty network protocols (no connection pooling/keep-alive)
        -   lock contention and overly coarse-grained locking
        -   eager/over-fetching of data that is never used
        -   missing database indexes
        -   repeated regex (re)compilation in hot paths
        -   busy-waiting/polling instead of event-driven waits
        -   transferring uncompressed or overly verbose payloads
        -   missing short-circuit evaluation in expensive conditions
        -   recomputing invariants inside loops (loop-invariant code)
        -   suboptimal batch sizes (too small = overhead, too large = latency)
        -   inefficient algorithms for sorting/searching already-ordered data
        -   redundant validation/sanitization of trusted internal data
        -   missing connection/resource reuse (open-close per operation)
        -   [...]

    -   If <lens/> is `security`:

        Focus on *security* only - and do *not* investigate logic,
        semantics, performance, or efficiency problems.

        Analysis Hints (not exhaustive, just indicators):
        -   unsafe data deserialization
        -   missing input data validation/sanitization
        -   broken authentication/authorization
        -   sensitive-data exposure
        -   path traversal
        -   unsafe cryptography
        -   hard-coded secrets
        -   vulnerable dependencies
        -   injection flaws
        -   cross-site scripting (XSS) and output-encoding gaps
        -   cross-site request forgery (CSRF) and missing anti-forgery tokens
        -   insecure direct object references (IDOR)
        -   server-side request forgery (SSRF)
        -   insecure or missing transport encryption (TLS)
        -   weak session management (fixation, predictable tokens)
        -   missing rate limiting/anti-automation controls
        -   overly permissive CORS or file permissions
        -   verbose error messages leaking internals
        -   unsafe randomness for security-sensitive values
        -   mass assignment / over-binding of request parameters
        -   security misconfiguration (default credentials, debug modes, exposed admin endpoints)
        -   missing or misconfigured security headers (CSP, HSTS, X-Frame-Options)
        -   improper certificate/hostname validation (TLS verification disabled)
        -   insufficient logging and monitoring of security events
        -   race conditions / TOCTOU (time-of-check to time-of-use) flaws
        -   integer overflow/underflow and buffer overflows
        -   use-after-free and memory-safety violations
        -   privilege escalation through improper privilege dropping
        -   insecure file upload handling (unrestricted type/size, executable storage)
        -   unsafe handling of untrusted regular expressions (ReDoS)
        -   caching of sensitive data in shared or client-side caches
        -   secrets or sensitive data leaking into logs, traces, or telemetry
        -   insecure default-deny failures (fail-open instead of fail-closed)
        -   missing integrity verification (unsigned updates, no subresource integrity)
        -   excessive data exposure in API responses (returning more fields than needed)
        -   improper resource cleanup leading to exhaustion (connection/file-descriptor leaks)
        -   business-logic flaws (bypassable workflows, negative quantities, replay)
        -   [...]

    -   If <lens/> is `tests`:

        Focus on the *evidentiary quality* of the tests only -- whether
        the tests would actually *notice* a wrong implementation -- and
        do *not* investigate logic, performance, or security problems
        of the production code itself.

        For this, pair every referenced file with its counterpart (its
        tests resp. its code under test), which then counts as
        *referenced*, too. Then locate the *implementation-independent
        sources* of the expected behavior: the specification (e.g. below
        `docs/specbook/`), the task plans, interface contracts, and the
        external standards the code implements (verified via web search
        when a finding hinges on them). Your *own* domain knowledge
        shares its mistakes with the code under test: use it for
        suspicion only, never as proof.

        Analysis Hints (not exhaustive, just indicators):
        -   *contradicting oracle*: an expected value contradicting its
            source (e.g. the specified tax rate, status code, rounding
            mode, or ordering) -- test and code are then *both* wrong
        -   *unsourced oracle*: a decisive expected value with no
            traceable source at all (magic constant, fixture of unknown
            genesis, snapshot recorded from the implementation)
        -   *insensitive test*: a self-confirming oracle, a mock echo,
            or a missing or weak assertion -- name the mutation of the
            code which would go undetected
        -   *missing claim*: a specified or externally observable
            behavior of the code under test (public function, branch,
            rejection or error path, state transition) which no running
            test decides -- including a skipped test and the missing
            regression reproducer of a bug fix
        -   *missing edge case*: untested boundaries of the input
            domain where defects concentrate: empty, zero, one,
            negative, maximum, overflow, absent/null, duplicate,
            Unicode, time zone and daylight saving, concurrency, and
            failure of dependencies
        -   *scope mismatch*: a test so broad that its failure would not
            localize the defect, or so mocked that it exercises no real
            behavior
        -   *missing invariant*: a fixed example where a property
            holding for *all* inputs (round-trip, idempotence,
            monotonicity, conservation) would decide the claim without
            any expected value to be sourced
        -   [...]

        Report a *missing claim* or a *missing edge case* at the line
        of the *production code* whose behavior is untested, and all
        other problems at the line of the affected *test*. Rate a
        contradicting oracle and a test which cannot fail at all as
        `HIGH`, an unsourced oracle and a missing claim of a specified
        behavior as `MEDIUM`, and a domain suspicion without any source
        as `LOW`.

    Be practically relevant - focus on *practically relevant* cases
    only and especially do *not* investigate theoretical or fictive
    cases.

    Be problem-focused - report the *problem only* and do *not*
    already investigate any possible *solution* or apply any *change*.

    Be conservative - only report clear, well-grounded problems.
    Think twice to avoid *false positives*.

    Be focused - only report problems which were found in the source
    files referenced by <context/>. Ignore problems which are located
    in related source files which were just read to better comprehend
    the <context/>.

    For *each* found problem:

    1.  Set <file/> to the *relative* filename path of the source file
        in which the problem is located.

    2.  Set <line/> to the numeric 1-based line number in <file/> which
        is most relevant to the problem.

    3.  Set <severity/> to the string `LOW`, `MEDIUM`, `HIGH`, or
        `ACCEPTED`, ranked by the estimated *impact* of the problem.
        Use `ACCEPTED` when the problem is a deliberate, justified
        trade-off that should remain on record.

    4.  Set <description/> to an *ultra brief* but still as *precise*
        as possible Markdown-formatted problem description. In it,
        highlight *code* as <template>`<code/>`</template> and *key
        aspects* as <template>*<aspect/>*</template>, and add inline
        *references* to the related code positions in the form of either
        <template>(`<filename/>:<line-number/>`)</template>,
        <template>(`<filename/>:<line-number/>-<line-number/>`)</template> or
        <template>(`<filename/>#<function-or-method/>`)</template>.

    5.  Set <title/> to an ultra-compressed <description/>: a concise,
        short, single sentence. Keep one inline reference to the code
        position which is most relevant to the problem.

    6.  If <lens/> is `performance`:

        Set <evidence/> to ground the finding by citing either the
        inferred *Big-O* time/space complexity (e.g. `O(n²)` reducible
        to `O(n)`) with the exact driving loop or recursion, or the
        matched performance *anti-pattern* (e.g. N+1 query,
        sync-in-loop, repeated recompute, string concat in loop), with
        an inline code reference.

        Set <trade-off/> to state the *cost* of the optimization (e.g.
        readability, additional memory for speed, added complexity), so
        the user can make an informed decision; use *none* if there is
        no meaningful trade-off.

        If <lens/> is `tests`:

        Set <evidence/> to the *source* the finding is judged against,
        with an inline reference (e.g. `docs/specbook/tax.md#rates`, an
        RFC section, or a task plan claim), or to `none found` for an
        unsourced oracle or a mere domain suspicion. Set <trade-off/>
        to an empty string.

        Otherwise (for the other lenses), set both <evidence/> and
        <trade-off/> to empty strings.

    7.  If <problems/> is not empty, set
        <problems><problems/>,</problems> (append a comma).
        Then append the following <template/> to <problems/>:

        <template>
            {
                "file":        <file/>,
                "line":        <line/>,
                "severity":    <severity/>,
                "title":       <title/>,
                "description": <description/>,
                "evidence":    <evidence/>,
                "trade-off":   <trade-off/>
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

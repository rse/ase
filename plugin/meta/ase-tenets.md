
ASE Tenets
==========

The following are the **ASE Tenets** -- the guiding principles you
*MUST* internalize when requested. They are organized into *Generic
Tenets*, which always apply, and *Operation-Specific Tenets*, which
apply only to a particular kind of operation (Crafting, Aligning,
Refactoring, Resolving).

GENERIC TENETS
--------------

At any time and for all kinds of operations,
you *MUST* honor the following so-called **GENERIC TENETS**:

-   **Think Before Acting**:
    *Don't assume. Don't hide confusion. Surface trade-offs.*
    Before implementing:
    -   State your assumptions explicitly. If uncertain, ask.
    -   If multiple interpretations exist, present them - don't pick silently.
    -   If a simpler approach exists, say so. Push back when warranted.
    -   If something is unclear, stop. Name what's confusing. Ask.

-   **Simplicity First**:
    *Minimum solution that solves the problem. Nothing speculative.*
    -   No features beyond what was asked.
    -   No abstractions for single-use code.
    -   No "flexibility" or "configurability" that wasn't requested.
    -   No error handling for impossible scenarios.
    -   If you write 200 lines and it could be 50, rewrite it.
    Ask yourself: "Would a senior software developer say this is
    overcomplicated?" If yes, simplify.

-   **Practical Relevance**:
    *Error handling for practically relevant cases only. No theoretical assumptions.*
    -   Handle obvious or expected errors near the origin.
    -   Handle theoretical or unexpected errors in parent scopes.
    -   Avoid introducing dedicated state variables for individual error cases.
    -   If state variables are needed to detect error cases, use minimum
        number of those variables only.
    -   Use minimum number of state variables to span the maximum of error space.

-   **Surgical Changes**:
    *Keep changes as small as possible.*
    When editing existing code:
    -   Touch only what you must. Clean up only your own mess.
    -   Don't "improve" adjacent code, comments, or formatting.
    -   Don't refactor things that aren't broken.
    -   Match existing style, even if you'd do it differently.
    -   If you notice unrelated dead code, mention it - don't delete it.
    When your changes create orphans:
    -   Remove imports/variables/functions that YOUR changes made unused.
    -   Don't remove pre-existing dead code unless asked.
    The test: Every changed line should trace directly to the user's request.

-   **Separation of Concerns**:
    *One concern per part; keep distinct concerns apart.*
    -   Give each module, function, or layer a single, well-defined concern.
    -   Don't entangle policy with mechanism, or business logic with I/O.
    -   When one concern changes, the change should not ripple into unrelated ones.

-   **Code Base Alignment**:
    *Blend in. New aspect should read as if the existing aspects wrote it.*
    -   Follow the established coding style, formatting, and idioms exactly.
    -   Mirror the existing structure, layering, and file organization.
    -   Reuse the prevailing naming conventions, patterns, and libraries.
    -   When in doubt, imitate the nearest similar code rather than inventing anew.

-   **Goal-Driven Execution**:
    *Define success criteria. Loop until verified.*
    Transform tasks into verifiable goals:
    -   "Add validation" → "Write tests for invalid inputs, then make them pass"
    -   "Fix the bug" → "Write a test that reproduces it, then make it pass"
    -   "Refactor X" → "Ensure tests pass before and after"
    Strong success criteria let you loop independently.
    Weak criteria ("make it work") require constant clarification.

CRAFTING TENETS
---------------

When *crafting* from scratch a new artifact, a feature, or an aspect,
you *MUST* honor the following so-called "CRAFTING TENETS":

-   **Clear Minimal Scope**:
    Establish explicit boundaries for the new feature.
    Avoid feature scope creep and over-engineering.

-   **Keep it Simple, Stupid (KISS)**:
    Build with the simplest design that solves the real problem.
    Avoid over-engineering.

-   **You Aren't Gonna Need It (YAGNI)**:
    Build for today's actual needs, not speculative futures.
    Avoid premature optimizations, premature abstractions,
    over-configurability, etc.

-   **Don't Repeat Yourself (DRY)**:
    Avoid redundancies, but honor the *Rule of Three*: Don't
    abstract on the first occurrence -- tolerate (small)
    duplication on the second -- factor out on the third only.

-   **Single Responsibility Principle (SRP)**:
    Every module, class, or function should have only one reason
    to change.

-   **Loose Coupling, High Cohesion**:
    Strive for good modularity by a set of small, focused parts
    (high cohesion), connected by thin, explicit wires and
    interfaces (loose coupling).

-   **Clear Interfaces**:
    Design clear interfaces, contracts, and data models --
    with high attention to boundaries and modularity.

-   **Non-Functional Requirements**:
    Honor the non-functional requirements Performance, Security,
    Scalability, Comprehensibility.

RECONCILIATION TENETS
---------------------

When *reconcile* a set of target artifacts to a set of source artifacts,
you *MUST* honor the following so-called **ALIGNING TENETS**:

-   **Directional Authority**:
    The *source* artifacts are the single source of truth; only the
    *target* artifacts are ever mutated. Never edit the source to fit
    the target, and never let a stale target override a current source.

-   **Faithful Reflection**:
    The target *MUST* reflect the current source state *exactly* -- no
    more, no less. Do not enrich the target with content the source does
    not warrant, and do not silently drop source facts the target should
    carry.

-   **Drift Completeness**:
    Detect *every* divergence between source and target, not just the
    obvious additions: reconcile changed content, *and* remove or mark
    target content that the source no longer supports (stale statements,
    orphaned sections, dangling references).

-   **No Fabrication**:
    Never invent target content that the source does not support. If the
    source is silent, ambiguous, or contradictory on something the target
    needs, surface the gap explicitly rather than papering over it with a
    plausible guess.

-   **Level-Appropriate Translation**:
    Re-express source facts at the *target's* level of abstraction and
    altitude; do not copy verbatim across artifact levels. A SPEC states
    intent, an ARCH states structure, CODE states realization, DOCS
    states facts, etc -- align the *meaning*, not the wording.

-   **Format Conformance**:
    Keep every formatted target (SPEC, ARCH, TASK) conformant to its
    format contract (headings, structure, identifiers). Treat CODE,
    DOCS, INFR, and OTHR kinds of artifacts as foreign defined, but not
    as free-form.

-   **Alignment Traceability**:
    Every target change *MUST* trace back to a concrete source fact. If
    you cannot point to the source statement that justifies a target
    edit, do not make that edit.

REFACTORING TENETS
------------------

When *refactoring* existing artifacts or aspects,
you *MUST* honor the following so-called **REFACTORING TENETS**

-   **Behavior Preservation**:
    Refactoring changes only re-structure, never change any
    observable behavior at all. Especially, do not mix with
    problem resolving and feature crafting.

-   **Boy Scout Rule**:
    After the refactoring, leave the source code base cleaner
    than you found it.

-   **Don't Repeat Yourself (DRY)**:
    Avoid redundancies, but honor the *Rule of Three*: Don't
    abstract on the first occurrence -- tolerate (small)
    duplication on the second -- factor out on the third only.

-   **Single Responsibility Principle (SRP)**:
    Every module, class, or function should have only one reason
    to change.

-   **Loose Coupling, High Cohesion**:
    Strive for good modularity by a set of small, focused parts
    (high cohesion), connected by thin, explicit wires and
    interfaces (loose coupling).

-   **Clear Interfaces**:
    Design clear interfaces, contracts, and data models -- with high
    attention to boundaries and modularity.

RESOLVING TENETS
----------------

When *resolving* a problem or challenge (bug-fixing),
you *MUST* honor the following so-called **RESOLVING TENETS**

-   **No Cleanups**:
    Strictly focus on resolving the problem and do not mix the task with
    any other necessary code cleanups, unless they are really necessary
    for resolving the task.

-   **Minimum Flags**:
    Use the absolute minimum total number of flags (boolean variables) to
    span the entire space of scenarios. Prefer the adjustment of existing
    flags over the introduction of new flags.

-   **Code Adequacy**:
    As little increase in overall source code complexity as possible, as
    much new problem resolution source code as necessary.

-   **Origin Proximity**:
    Problems for *obvious, particular, or expected* errors *should* be
    handled *near the origin*. Problems for *theoretical, fictive, or
    unexpected* errors *should* be handled more generally and in parent
    scopes.

---
name: ase-code-analyze
argument-hint: "[--help|-h] [--performance|-p] [--security|-s] <source-reference>"
description: >
    Analyze the source code for problems in either the logic and
    semantics and its related control flow, performance and efficiency,
    or security.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Agent"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<skill name="ase-code-analyze">
Analyze Source Code
</skill>

<expand name="getopt"
    arg1="ase-code-analyze"
    arg2="--performance|-p --security|-s">
    $ARGUMENTS
</expand>

<objective>
*Analyze* the source code of <getopt-arguments/>, and its directly
related source code, for problems - read-only, *without* applying any
changes. The *analysis lens* depends on the selected options: problems
in its *logic* and *semantics* and its related *control flow*, or
problems in *performance* and *efficiency*, or problems in *security*.
</objective>

<flow>

1.  <step id="STEP 1: Sanity Check Usage">

    <if condition="<getopt-option-performance/> is equal `true` and <getopt-option-security/> is equal `true`">

    Only output the following <template/> and then *STOP* immediately:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-code-analyze**, ▶ ERROR: options `--performance` and `--security` are mutually exclusive
    </template>

    </if>

    </step>

2.  <step id="STEP 2: Investigate Code Base">

    In this STEP 2, investigate on the code. If the code base is large,
    you *MUST* use the `Agent` tool (not inline work) to create multiple
    sub-agents to split the investigation task into appropriate chunks.

    Tenets:

    -   **Quiet Operation**:

        During investigation in this STEP 2, do *not* output anything else,
        especially do not give any further explanations or information.

    -   **Practical Relevance Only**:

        Focus on *practically relevant* cases and especially do *not*
        investigate theoretical or fictive cases.

    -   **Problem Focus Only**:

        Still focus on the *problem only* and do *not* already
        investigate any possible *solution* or apply any *change*.

    -   **Lens Focus**:

        <if condition="<getopt-option-performance/> is equal `true`">

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
        -   [...]

        </if>

        <if condition="<getopt-option-security/> is equal `true`">

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
        -   [...]

        </if>

        <if condition="<getopt-option-performance/> is NOT equal `true` and <getopt-option-security/> is NOT equal `true`">

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
        -   [...]

        </if>

    You *MUST* not output anything in this STEP 2.

    </step>

3.  <step id="STEP 3: Show Results">

    In this STEP 3, for *EVERY* detected problem, immediately report
    it with the following output <template/>, based on concise bullet
    points.

    <if condition="<getopt-option-performance/> is equal `true`">

    <template>

    <ase-tpl-bullet-signal/> **PROBLEM** (Severity: **<severity/>**): **P<n/>**: **<title/>**

    <description/>

    ⊙ EVIDENCE: <evidence/>
    ⊖ TRADEOFF: <trade-off/>

    </template>

    </if>

    <if condition="<getopt-option-performance/> is NOT equal `true`">

    <template>

    <ase-tpl-bullet-signal/> **PROBLEM** (Severity: **<severity/>**): **P<n/>**: **<title/>**

    <description/>

    </template>

    </if>

    Hints:

    -   For the final results, do *not* output anything else, especially do
        *not* give any further explanations or information.

    -   Uniquely identify the problems with `P<n/>` where <n/> is 1, 2, ...

    -   In <description/>, use *ultra brief* but still as *precise* as
        possible problem descriptions.

    -   In <description/>, highlight *code* as <template>`<code/>`</template>
        and *key aspects* as <template>*<aspect/>*</template>.

    -   In <description/>, add inline *references* to the related
        code positions in the form of either
        <template>(`<filename/>:<line-number/>`)</template>,
        <template>(`<filename/>:<line-number/>-<line-number/>`)</template> or
        <template>(`<filename/>#<function-or-method/>`)</template>.

    -   In <description/>, classify the problem with a <severity/>
        of <template>LOW</template>, <template>MEDIUM</template> or
        <template>HIGH</template>, ranked by the estimated *impact* of the
        problem.

    -   <if condition="<getopt-option-performance/> is equal `true`">
        In <evidence/>, ground the finding by citing either the inferred
        *Big-O* time/space complexity (e.g. `O(n²)` reducible to `O(n)`)
        with the exact driving loop or recursion, or the matched
        performance *anti-pattern* (e.g. N+1 query, sync-in-loop, repeated
        recompute, string concat in loop), with an inline code reference.
        </if>

    -   <if condition="<getopt-option-performance/> is equal `true`">
        In <trade-off/>, state the *cost* of the optimization (e.g.
        readability, additional memory for speed, added complexity), so
        the user can make an informed decision; use *none* if there is no
        meaningful trade-off.
        </if>

    -   *Additionally*, persist all reported problems in a *single*
        `ase_kv_batch` call to the `ase` MCP server with `transactional`
        set to `true`. The `commands` parameter array of this call
        starts with one `{ command: "clear" }` entry, followed by one
        `{ command: "set", key: "ase-issue-P<n/>", val: "<title/>:
        <description/>" }` entry per reported problem.

    Finally, output the following <template/> to give a final hint:

    <template>
    ⧉ **ASE**: ☻ skill: **<skill-name/>**, ▶ status: **skill finished**
    ⧉ **ASE**: ↪ hint: **For deeper analysis, suggestions on solution approaches and then final problem resolution, use `/ase-code-resolve P{n}` in the same or even a different session.**
    </template>

    You *MUST* not output anything else in this STEP 3,
    especially not any further explanations.

    </step>

</flow>

</output>

---
name: ase-code-analyze
argument-hint: "[--help|-h] [--performance|-p] [--security|-s] [--severity|-S=(LOW|MEDIUM|HIGH)] <source-reference>"
description: >
    Analyze the source code for problems in either the logic and
    semantics and its related control flow, performance and efficiency,
    or security.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Agent"
    - "Glob"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<skill name="ase-code-analyze">
Analyze Source Code
</skill>

<expand name="getopt"
    arg1="ase-code-analyze"
    arg2="--performance|-p --security|-s --severity|-S=(LOW|MEDIUM|HIGH)">
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

    Only output the following <template/> and then *STOP* the entire flow
    (do not perform any further steps):

    <template>
    ⧉ **ASE**: ✪ skill: **ase-code-analyze**, ▶ ERROR: options `--performance` and `--security` are mutually exclusive
    </template>

    </if>

    </step>

2.  <step id="STEP 2: Investigate Code Base">

    First, use the following <template/> to give a hint on this step:

    <template>
    <ase-tpl-bullet-secondary/> **ANALYSIS INVESTIGATION**
    </template>

    Dispatch the investigation to *sub-agents* via the `Agent`
    tool so that *no* investigation details leak into the user-visible
    transcript. The sub-agents perform the silent reading and checking;
    only their final structured return values are consumed here.

    For this, first determine the *analysis lens* <lens/>: set
    <lens>performance</lens> if <getopt-option-performance/> is equal
    `true`, set <lens>security</lens> if <getopt-option-security/> is
    equal `true`, and set <lens>logic</lens> otherwise.

    Then *silently* resolve `<getopt-arguments/>` to the list
    <sources/> of individual source code files, expanding any
    directory or wildcard references with the `Glob` tool. Then
    partition <sources/>, preserving order, into at most *eight*
    batches of roughly equal size (a single file yields a single
    batch), and invoke the following tool once per batch, emitting
    *all* invocations *in one single message* so they run in
    *parallel*:

    ```text
        Agent(
            description:       "Analysis Investigation",
            subagent_type:     "ase:ase-code-analyze",
            prompt:            "<lens/> <batch/>",
            run_in_background: false
        )
    ```

    Here <batch/> is the space-separated list of the source code file
    paths of the corresponding batch.

    Parse the result message of each `Agent` tool invocation as a JSON
    array and concatenate all those arrays. Then *deduplicate* the
    combined list: when two problems share the same `file` and `line`,
    *silently drop* all but the first one (sub-agents may have read
    overlapping *related* files for comprehension). Finally sort the
    list by `file` and then numerically by `line`, and set <problems/>
    to that list.

    You *MUST* *NOT* output anything at all in this STEP 2 beyond the
    `Glob` and `Agent` tool invocations.

    </step>

3.  <step id="STEP 3: Show Results">

    Before reporting, *apply the severity floor* selected via
    <getopt-option-severity/> (default `LOW`): define the ordinal rank
    `LOW`=1, `MEDIUM`=2, `HIGH`=3. *Keep* a detected problem if and only
    if its `severity` field is `ACCEPTED` *or* `rank(severity)` is greater
    than or equal to `rank(<getopt-option-severity/>)`; *silently drop*
    all other problems (they are neither reported nor persisted). With
    the default floor `LOW`, all problems are kept. `ACCEPTED` problems
    are *never* dropped.

    Then renumber the surviving problems contiguously as `P<n/>` with
    <n/> = 1, 2, ... in the original ordering. If *all* problems are
    dropped, skip the per-problem report but still purge any stale
    persisted problems with a *single* `ase_kv_batch` call to the `ase`
    MCP server with `transactional` set to `true` and a `commands`
    parameter array holding exactly one `{ command: "clear", prefix:
    "ase-issue-" }` entry,
    and still emit the final hint <template/> below.

    In this STEP 3, for *EVERY* surviving problem in <problems/>, set
    <severity/> to its `severity` field, <title/> to its `title` field,
    <description/> to its `description` field, <evidence/> to its
    `evidence` field, and <trade-off/> to its `trade-off` field, and
    immediately report it with the following output <template/>, based
    on concise bullet points.

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

    -   *Additionally*, persist all reported problems in a *single*
        `ase_kv_batch` call to the `ase` MCP server with `transactional`
        set to `true`. The `commands` parameter array of this call
        starts with one `{ command: "clear", prefix: "ase-issue-" }`
        entry (which removes only the previously persisted `ase-issue-*`
        keys, leaving any unrelated keys in the shared store intact),
        followed by one `{ command: "set", key: "ase-issue-P<n/>", val:
        "<title/>: <description/>" }` entry per reported problem.

    Finally, output the following <template/> to give a final hint:

    <template>
    ⧉ **ASE**: ☻ skill: **<skill-name/>**, ▶ status: **skill finished**
    ⧉ **ASE**: ↪ hint: **For deeper analysis, suggestions on solution approaches and then final problem resolution, use `/ase-code-resolve P{n}` in the same or even a different session.**
    </template>

    You *MUST* not output anything else in this STEP 3,
    especially not any further explanations.

    </step>

</flow>

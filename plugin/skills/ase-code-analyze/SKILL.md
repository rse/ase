---
name: ase-code-analyze
argument-hint: "[--help|-h] [--performance|-p] [--security|-s] [--severity|-S=(LOW|MEDIUM|HIGH)] [--quick|-Q] <source-reference>"
description: >
    Analyze the source code for problems in either the logic and
    semantics and its related control flow, performance and efficiency,
    or security.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Agent"
    - "Bash"
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
    arg2="--performance|-p --security|-s --severity|-S=(LOW|MEDIUM|HIGH) --quick|-Q">
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

    <if condition="<ase-project-boxing/> is equal `black`">

    The project source artifacts are classified as a *black box*, so
    the user does *not* want them inspected or their problems surfaced.
    *Skip* the entire investigation and analysis: do *not* invoke any
    `Glob` or `Agent` tool and do *not* read any source, only output
    the following <template/> and then *SKIP* the remaining step STEP 3:

    <template>
    <ase-tpl-bullet-normal/> **CODE ANALYSIS**: *suppressed* (`project.boxing` is `black`)
    </template>

    </if>

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
            description:       "Analysis Investigation (<batch-index/>/<batch-count/>)",
            subagent_type:     "ase:ase-code-analyze",
            prompt:            "<lens/> <batch/>",
            run_in_background: false
        )
    ```

    Here <batch/> is the space-separated list of the source code file
    paths of the corresponding batch, <batch-index/> is the 1-based
    index of that batch, and <batch-count/> is the total number of
    batches, so that each parallel invocation is distinguishable in
    the progress display.

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

    Before reporting, determine the *effective severity floor* <floor/>:
    define the ordinal rank `LOW`=1, `MEDIUM`=2, `HIGH`=3, start from
    <floor><getopt-option-severity/></floor> (default `LOW`), and - if
    <ase-project-boxing/> is equal `grey` - raise <floor/> to `MEDIUM`
    whenever its current rank is below `rank(MEDIUM)` (grey boxing
    surfaces only *material* findings of severity `MEDIUM` and above).

    Then *apply the effective severity floor* <floor/>: *Keep* a detected
    problem if and only if its `severity` field is `ACCEPTED` *or*
    `rank(severity)` is greater than or equal to `rank(<floor/>)`;
    *silently drop* all other problems (they are neither reported nor
    persisted). With the default floor `LOW`, all problems are kept.
    `ACCEPTED` problems are *never* dropped.

    Then sort the surviving problems in <problems/> by their `severity`
    field from highest to lowest in the fixed order `HIGH`, `MEDIUM`,
    `LOW`, `ACCEPTED`, so the reporting starts with the most severe
    problem. Within the same severity, keep the `file`/`line` order
    established in STEP 2.

    Then renumber the surviving problems contiguously as `P<n/>` with
    <n/> = 1, 2, ... in that sorted ordering, so `P1` is the most severe
    problem and the persisted `ase-issue-P<n/>` keys follow the reported
    sequence. If *all* problems are dropped, skip the per-problem report
    but still purge any stale
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

    <if condition="<getopt-option-quick/> is equal `true` and at least one problem survived the severity floor">

    The `--quick`/`-Q` flag turns this analysis into a *one-shot*
    `analyze → resolve → implement → verify` pipeline that resolves
    the surviving problems fully autonomously, *without any user
    interaction*. Problems whose `severity` is `ACCEPTED` are
    *excluded* from auto-resolution: they document deliberately
    accepted trade-offs, so "fixing" them would undo reviewed
    decisions -- they stay reported and persisted only. Let <count/>
    be the number of surviving *non-ACCEPTED* problems and
    <accepted-count/> the number of surviving `ACCEPTED` problems,
    and keep the surviving <problems/> entries (each with its `file`,
    `title`, and `description` field) available for the sub-steps
    below. If <count/> is `0`, *skip* this entire one-shot block and
    continue with the final hint <template/> below.

    First, announce the one-shot phase with the following <template/>:

    <template>
    <ase-tpl-bullet-secondary/> **ONE-SHOT RESOLUTION** (<count/> problem(s), <accepted-count/> ACCEPTED skipped)
    </template>

    Then perform the following sub-steps and finally *STOP* the entire
    flow (do *not* emit the final hint <template/> below):

    1.  *Guard and snapshot*: with the `Bash` tool, run
        `git rev-parse --is-inside-work-tree` to check whether the
        target is a Git working tree. If it fails (no Git repository),
        worktree isolation is impossible, so *skip* sub-steps 3-6 and
        instead resolve each cluster of sub-step 2 *sequentially* --
        one non-isolated `Agent` invocation at a time, in ascending
        order, each with the sub-step 3 prompt but *without* the
        `isolation` parameter, the seeding instruction, and the diff
        return (the fixes land in the live tree directly); for each
        problem, record its <outcome/> as `resolved` and its changed
        files <files/> (from `git diff --name-only` taken immediately
        before and after its cluster's `Agent`) -- then continue with
        sub-step 7. Otherwise, capture the repository root
        `git rev-parse --show-toplevel` as <live-root/> and
        `git worktree list --porcelain` as <worktrees-before/> for the
        cleanup in sub-step 6.

    2.  *Cluster by file*: group the <count/> problems by their `file`
        field -- problems sharing the same file form *one* cluster
        (resolving same-file problems in separate parallel worktrees
        would guarantee merge conflicts). Order the clusters by their
        lowest contained `P<n/>` and let <cluster-count/> be the number
        of clusters, <cluster-index/> the 1-based cluster number, and
        <cluster-problems/> the ascending, comma-separated `P<n/>` list
        of a cluster.

    3.  *Resolve in parallel (background)*: for *every* cluster, invoke
        the following tool once, emitting *all* invocations *in one
        single message* so they run in *parallel*, each in its *own*
        isolated Git worktree:

        ```text
            Agent(
                description:       "Resolve <cluster-problems/> (<cluster-index/>/<cluster-count/>)",
                subagent_type:     "general-purpose",
                isolation:         "worktree",
                run_in_background: true,
                prompt:            "First seed this worktree with the live working tree's uncommitted state: run `git -C \"<live-root/>\" diff HEAD | git apply --whitespace=nowarn` (skip when that diff is empty), then `git add -A && git commit -m seed` (skip the commit when nothing is staged). Then, for each of <cluster-problems/> in ascending order, call the tool Skill(skill: \"ase:ase-code-resolve\", args: \"-Q P<n/>\") to fully resolve AND implement that issue in this worktree. When finished, run `git add -A` followed by `git diff --cached`, and return ONLY that complete unified diff as your final message (an empty string if nothing changed)."
            )
        ```

        The background execution keeps the long fan-out interruptible
        and observable: *each time* one of these `Agent` invocations
        completes, immediately output one progress line with the
        following <template/>, then keep waiting until *all* clusters
        have returned. Collect each returned unified diff, keyed by its
        cluster.

        <template>
        <ase-tpl-bullet-secondary/> **RESOLVED** (<cluster-index/>/<cluster-count/>): <cluster-problems/>
        </template>

    4.  *Reconcile sequentially -- always merge, never prompt*: with the
        `Bash` tool, process the collected cluster diffs in ascending
        cluster order. For each *non-empty* diff, write it to a
        temporary file and apply it with `git apply --whitespace=nowarn
        <patch-file/>` -- deliberately *without* `--index`: staging
        remains with the user. On success, record each contained
        problem's <outcome/> as `merged` and its changed files <files/>
        (the `+++ b/<path>` headers of its diff). On failure, retry
        with `git apply --3way --whitespace=nowarn <patch-file/>`. If
        the three-way attempt also fails or leaves Git conflict markers
        in any touched file, or the diff is empty, or its `Agent`
        returned nothing, do *not* stop -- instead add the cluster's
        problems to a *retry set* (a possibly marker-littered file is
        repaired there).

    5.  *Retry conflicts sequentially*: for each `P<n/>` in the retry
        set, in ascending order and strictly *one at a time*, set
        <title/> and <description/> to that problem's `title` and
        `description` fields (from <problems/>) and invoke a
        *non-isolated* `Agent` against the now-updated live working
        tree:

        ```text
            Agent(
                description:       "Re-resolve P<n/> (sequential)",
                subagent_type:     "general-purpose",
                run_in_background: false,
                prompt:            "Call the tool Skill(skill: \"ase:ase-code-resolve\", args: \"-Q <title/> — <description/>\") to fully resolve AND implement that problem directly in the current working tree. The affected files may still contain Git conflict markers from a failed three-way merge -- remove any such markers as part of the resolution."
            )
        ```

        Because each such `Agent` edits the live tree directly and
        sequentially, its change always integrates cleanly, so *all*
        <count/> problems end up merged. Record that problem's
        <outcome/> as `re-resolved` and its changed files <files/>
        (from `git diff --name-only` taken immediately before and after
        that single `Agent`).

    6.  *Remove the worktrees*: with the `Bash` tool, compare the current
        `git worktree list --porcelain` against <worktrees-before/>; for
        *each* newly added worktree, run `git worktree remove --force
        <path/>`, then run `git worktree prune` to drop any remaining
        administrative references.

    7.  *Verify and repair*: the per-worktree resolutions ran in `dry`
        mode (no verification), so the *merged result* MUST now be
        verified centrally. Determine the project's canonical
        *formatter*, *build*, and *test* commands from its build
        configuration (e.g. npm `package.json` scripts, `Makefile`,
        Gradle `spotlessApply`/`build`/`test`, Cargo, etc). With the
        `Bash` tool run, in this order: the formatter (if any), the
        build, and the test suite. If any of them fails, hand the
        *complete* failure output to one *non-isolated*
        `Agent(subagent_type: "general-purpose", run_in_background:
        false)` with the prompt to repair exactly those failures in the
        current working tree without touching unrelated user changes,
        then re-run the failed commands. Perform at most *two* such
        repair rounds. Set <verify/> to `green` when everything passes,
        or to a short failure summary when failures remain. Do *not*
        stage or commit anything -- staging remains with the user.

    8.  *Report the per-problem results*: for *every* auto-resolved
        problem `P<n/>`, in ascending order, output the following
        <template/>, where <marker/> is `✓` when its <outcome/> is
        `merged` or `resolved` and `↻` when its <outcome/> is
        `re-resolved`, and <files/> is the comma-separated list of its
        changed files (or `no changes` when empty):

        <template>
        <ase-tpl-bullet-signal/> **P<n/>** <marker/> *<outcome/>*: <files/>
        </template>

    9.  Finally, output the following summary <template/> and then *STOP*
        the entire flow (do *not* emit the final hint <template/> below):

        <template>
        ⧉ **ASE**: ↪ hint: **one-shot `-Q`: auto-resolved <count/> problem(s) (<accepted-count/> ACCEPTED skipped), verification: <verify/> -- staging remains with you.**
        </template>

    </if>

    Finally, give a final hint by expanding the following (which,
    depending on the configured <ase-guidance-level/>, may expand into
    nothing and hence emit no output at all):

    <ase-tpl-hint level="minimal">
    For deeper analysis, suggestions on solution approaches and then final problem resolution, use `/ase-code-resolve P{n}` in the same or even a different session.
    </ase-tpl-hint>

    You *MUST* not output anything else in this STEP 3,
    especially not any further explanations.

    </step>

</flow>

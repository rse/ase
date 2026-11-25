---
name: ase-code-analyze
argument-hint: "[--help|-h] [--auto|-a] [--no-changelog|-C] [--performance|-p] [--security|-s] [--tests|-t] [--severity|-S=(AUTO|LOW|MEDIUM|HIGH)] [--prefix|-P=<prefix>] [--staged] [--unstaged] [--worktree|-w <name>] [<source-reference>]"
description: >
    Analyze the source code for problems in either the logic and
    semantics and its related control flow, performance and efficiency,
    security, or the evidentiary quality of its tests (with `--auto`
    fixed automatically).
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Agent"
    - "Glob"
    - "Bash(git rev-parse *)"
    - "Bash(git -C *)"
    - "Bash(find *)"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-code-analyze">
Analyze Source Code
</purpose>

<expand name="getopt"
    arg1="ase-code-analyze"
    arg2="--auto|-a --no-changelog|-C --performance|-p --security|-s --tests|-t --severity|-S=(AUTO|LOW|MEDIUM|HIGH) --prefix|-P= --staged --unstaged --worktree|-w=">
    $ARGUMENTS
</expand>

<objective>
*Analyze* the source code of <getopt-arguments/>, and its directly
related source code, for problems - read-only, *without* applying any
changes, unless `--auto` requests to fix the reported problems
automatically. The *analysis lens* depends on the selected options: problems
in its *logic* and *semantics* and its related *control flow*, or
problems in *performance* and *efficiency*, or problems in *security*,
or problems in the *evidentiary quality* of its *tests*.
</objective>

<flow>

1.  <step id="STEP 1: Sanity Check Usage">

    <if condition="more than one of <getopt-option-performance/>, <getopt-option-security/>, and <getopt-option-tests/> is equal `true`">

    Only output the following <template/> and then *STOP* the entire flow
    (do not perform any further steps):

    <template>
    ⧉ **ASE**: ✪ skill: **ase-code-analyze**, ▶ ERROR: options `--performance`, `--security`, and `--tests` are mutually exclusive
    </template>

    </if>

    <if condition="<getopt-option-prefix/> is not empty and does NOT match the regexp `^[a-zA-Z][a-zA-Z0-9_]*$`">

    Only output the following <template/> and then *STOP* the entire flow
    (do not perform any further steps):

    <template>
    ⧉ **ASE**: ✪ skill: **ase-code-analyze**, ▶ ERROR: invalid `--prefix` value: **<getopt-option-prefix/>**
    </template>

    </if>

    </step>

2.  <step id="STEP 2: Investigate Code Base">

    <if condition="<ase-project-boxing/> is equal `black` and <getopt-option-severity/> is equal `AUTO`">

    The project source artifacts are classified as a *black box*, so
    the user does *not* want them inspected or their problems surfaced
    (an *explicitly* given severity floor lifts this skip).
    *Skip* the entire investigation and analysis: do *not* invoke any
    `Bash`, `Glob`, or `Agent` tool and do *not* read any source, only
    output the following <template/> and then *SKIP* the remaining steps
    STEP 3 and STEP 4:

    <template>
    ⧉ **ASE**: **CODE ANALYSIS**: *suppressed* (`project.boxing` is `black`)
    </template>

    </if>

    First, use the following <template/> to give a hint on this step:

    <template>
    ⧉ **ASE**: **ANALYSIS INVESTIGATION**
    </template>

    Dispatch the investigation to *sub-agents* via the `Agent`
    tool so that *no* investigation details leak into the user-visible
    transcript. The sub-agents perform the silent reading and checking;
    only their final structured return values are consumed here.

    For this, first determine the *analysis lens* <lens/>: set
    <lens>performance</lens> if <getopt-option-performance/> is equal
    `true`, set <lens>security</lens> if <getopt-option-security/> is
    equal `true`, set <lens>tests</lens> if <getopt-option-tests/> is
    equal `true`, and set <lens>logic</lens> otherwise.

    Set <work-dir></work-dir> (empty). If <getopt-option-worktree/> is
    not empty, *silently* determine the directory of this existing ASE
    worktree: if <getopt-option-worktree/> consists of other characters
    than `A-Z`, `a-z`, `0-9`, `_`, and `-`, set <work-dir/> to empty,
    else call the `ase_worktree_path(id: "<getopt-option-worktree/>",
    create: false)` tool of the `ase` MCP server (you *MUST* *NEVER*
    assemble this path yourself), capture its result into <work-dir/>,
    and run the command `git -C "<work-dir/>" rev-parse --show-toplevel`
    (taken exactly as given). If <work-dir/> is empty, the tool call
    failed, or the command failed (i.e., the worktree does not exist),
    only output the following <template/> and then *STOP* the entire
    flow (do not perform any further steps):

    <template>
    ⧉ **ASE**: ✪ skill: **ase-code-analyze**, ▶ ERROR: no worktree **<getopt-option-worktree/>** to analyze
    </template>

    <if condition="<getopt-option-staged/> is equal `true` or <getopt-option-unstaged/> is equal `true`">

    Then *silently* restrict the analysis to the *changed* files of
    the Git working copy. Set <changes>staged and unstaged</changes>
    if both <getopt-option-staged/> and <getopt-option-unstaged/> are
    equal `true`, set <changes>staged</changes> if only
    <getopt-option-staged/> is equal `true`, and set
    <changes>unstaged</changes> otherwise. Determine the *repository
    root* <repo-root/>: set it to <work-dir/> if this is not empty,
    else run the command `git rev-parse --show-toplevel` (taken exactly
    as given) and capture its output into <repo-root/>. Then determine
    the changed files by running the
    corresponding commands (taken exactly as given), each listing one
    path relative to <repo-root/> per line, and collect all listed
    paths, dropping duplicates:

    <if condition="<getopt-option-staged/> is equal `true`">
    `git -C "<repo-root/>" -c core.quotepath=off diff --cached --name-only --diff-filter=d`
    </if>

    <if condition="<getopt-option-unstaged/> is equal `true`">
    `git -C "<repo-root/>" -c core.quotepath=off diff --name-only --diff-filter=d`

    `git -C "<repo-root/>" -c core.quotepath=off ls-files --others --exclude-standard`
    </if>

    *Skip* every listed path below the `.ase/` directory (it carries
    *ASE*'s own state) and every path which is not a source code file
    (e.g. a binary file), and prefix every remaining path with
    `<repo-root/>/`. If `<getopt-arguments/>` is not empty, keep only
    those files which lie within the source code referenced by it (with
    relative references resolved against <work-dir/> if this is not
    empty),
    expanding any directory or wildcard references with the `Glob`
    tool (or, if the `Glob` tool is not available, with the `find`
    command via the `Bash` tool). Set <sources/> to the resulting list
    of individual source code files, preserving order.

    If <sources/> is empty, only output the following <template/>
    and then *SKIP* the rest of this STEP 2 and the remaining steps
    STEP 3 and STEP 4:

    <template>
    ⧉ **ASE**: **CODE ANALYSIS**: *no <changes/> source files to analyze*
    </template>

    Otherwise, *silently* determine the *changed line ranges* <ranges/>
    of every file in <sources/>, i.e. the lines of its working copy
    state which belong to the <changes/> changeset. An *untracked* file
    is changed *entirely*. For all other files, run the corresponding
    command (taken exactly as given), which also covers the *unstaged*
    changes of a *staged* file as a superset in working copy line
    numbers:

    <if condition="<getopt-option-staged/> is equal `true`">
    `git -C "<repo-root/>" -c core.quotepath=off diff HEAD -U0 --no-prefix --no-color --no-ext-diff --diff-filter=d`
    </if>
    <else>
    `git -C "<repo-root/>" -c core.quotepath=off diff -U0 --no-prefix --no-color --no-ext-diff --diff-filter=d`
    </else>

    Attribute every hunk header `@@ -<a/>[,<b/>] +<c/>[,<d/>] @@` of its
    output to the file `<repo-root/>/<path/>` of the preceding
    `+++ <path/>` line, where an omitted <d/> means `1`. A hunk with
    <d/> greater than `0` covers the lines <c/> to <c/> + <d/> - 1, and
    a *pure deletion* hunk with <d/> equal `0` covers the two lines <c/>
    and <c/> + 1 adjacent to the deletion point. If the command fails
    (e.g. a repository without any commit), treat every file in
    <sources/> as changed entirely.

    </if>
    <else>

    Then *silently* resolve `<getopt-arguments/>` (with relative
    references resolved against <work-dir/> if this is not empty) to
    the list <sources/> of individual source code files, expanding any
    directory or wildcard references with the `Glob` tool (or, if the
    `Glob` tool is not available, with the `find` command via the
    `Bash` tool).

    If <sources/> is empty (no *source-reference* given or none of it
    resolvable), only output the following <template/> and then *STOP*
    the entire flow (do not perform any further steps):

    <template>
    ⧉ **ASE**: ✪ skill: **ase-code-analyze**, ▶ ERROR: no source files to analyze -- give a *source-reference* or use `--staged`/`--unstaged`
    </template>

    </else>

    Then partition <sources/>, preserving order, into at most *eight*
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

    <if condition="<getopt-option-staged/> is equal `true` or <getopt-option-unstaged/> is equal `true`">
    Then *restrict* <problems/> to the changeset: *keep* a problem if
    and only if its `line` lies within a changed line range in <ranges/>
    of its `file` (resolving a relative `file` against <work-dir/> if
    this is not empty, else against the current working directory), or,
    if <lens/> is `tests`, its `file` is *not* in <sources/> (an unchanged
    counterpart test resp. code under test, paired by the tests lens), and
    *silently drop* all other problems.
    </if>

    You *MUST* *NOT* output anything at all in this STEP 2 beyond the
    `Bash`, `Glob`, and `Agent` tool invocations and the templates above.

    </step>

3.  <step id="STEP 3: Show Results">

    Before reporting, determine the *problem id prefix* <id-prefix/>:
    set <id-prefix><getopt-option-prefix/>-</id-prefix> if
    <getopt-option-prefix/> is *not* empty, and set <id-prefix></id-prefix>
    (set to empty) otherwise. Every reported problem id and every
    persisted key below carries this <id-prefix/>, so that analyses run
    under *distinct* prefixes occupy *distinct* id namespaces and hence
    do not overwrite each other.

    Before reporting, determine the *effective severity floor* <floor/>:
    define the ordinal rank `LOW`=1, `MEDIUM`=2, `HIGH`=3.

    <if condition="<getopt-option-severity/> is equal `AUTO`">
    Set <floor>MEDIUM</floor> if <ase-project-boxing/> is equal `grey`
    (grey boxing surfaces only *material* findings of severity `MEDIUM`
    and above), and <floor>LOW</floor> otherwise.
    </if>
    <else>
    Set <floor><getopt-option-severity/></floor>: an *explicitly* given
    severity floor always *wins* over the boxing, both over the `grey`
    floor and over the `black` skip.
    </else>

    Then *apply the effective severity floor* <floor/>: *Keep* a detected
    problem if and only if its `severity` field is `ACCEPTED` *or*
    `rank(severity)` is greater than or equal to `rank(<floor/>)`;
    *silently drop* all other problems (they are neither reported nor
    persisted). With the floor `LOW`, all problems are kept.
    `ACCEPTED` problems are *never* dropped.

    Then sort the surviving problems in <problems/> by their `severity`
    field from highest to lowest in the fixed order `HIGH`, `MEDIUM`,
    `LOW`, `ACCEPTED`, so the reporting starts with the most severe
    problem. Within the same severity, keep the `file`/`line` order
    established in STEP 2.

    Then renumber the surviving problems contiguously as `<id-prefix/>P<n/>`
    with <n/> = 1, 2, ... in that sorted ordering, so `<id-prefix/>P1` is
    the most severe problem and the persisted `ase-issue-<id-prefix/>P<n/>`
    keys follow the reported sequence. If *all* problems are dropped, skip
    the per-problem report but still purge any stale
    persisted problems with a *single* `ase_kv_batch` call to the `ase`
    MCP server with `transactional` set to `true` and a `commands`
    parameter array holding exactly one `{ command: "clear", prefix:
    "ase-issue-<id-prefix/>" }` entry,
    and only output the following <template/> instead of the final hint
    below, as there is no problem to plan or fix:

    <template>
    ⧉ **ASE**: **CODE ANALYSIS**: *no problems detected*
    </template>

    In this STEP 3, for *EVERY* surviving problem in <problems/>, set
    <severity/> to its `severity` field, <title/> to its `title` field,
    <description/> to its `description` field, <evidence/> to its
    `evidence` field, and <trade-off/> to its `trade-off` field, and
    immediately report it with the following output <template/>, based
    on concise bullet points.

    <if condition="<getopt-option-performance/> is equal `true`">

    <template>

    ⧉ **ASE**: **PROBLEM** (Severity: **<severity/>**): **<id-prefix/>P<n/>**: **<title/>**

    <description/>

    ⊙ EVIDENCE: <evidence/>
    ⊖ TRADEOFF: <trade-off/>

    </template>

    </if>

    <if condition="<getopt-option-tests/> is equal `true`">

    <template>

    ⧉ **ASE**: **PROBLEM** (Severity: **<severity/>**): **<id-prefix/>P<n/>**: **<title/>**

    <description/>

    ⊙ SOURCE: <evidence/>

    </template>

    </if>

    <if condition="<getopt-option-performance/> is NOT equal `true` and <getopt-option-tests/> is NOT equal `true`">

    <template>

    ⧉ **ASE**: **PROBLEM** (Severity: **<severity/>**): **<id-prefix/>P<n/>**: **<title/>**

    <description/>

    </template>

    </if>

    Hints:

    -   For the final results, do *not* output anything else, especially do
        *not* give any further explanations or information.

    -   Uniquely identify the problems with `<id-prefix/>P<n/>` where <n/> is 1, 2, ...

    -   *Additionally*, persist all reported problems in a *single*
        `ase_kv_batch` call to the `ase` MCP server with `transactional`
        set to `true`. The `commands` parameter array of this call
        starts with one `{ command: "clear", prefix: "ase-issue-<id-prefix/>" }`
        entry (which removes only the previously persisted
        `ase-issue-<id-prefix/>*` keys, leaving any unrelated keys in the
        shared store intact),
        followed by one `{ command: "set", key: "ase-issue-<id-prefix/>P<n/>",
        val: "<title/>: <description/>" }` entry per reported problem,
        where, if <lens/> is `tests`, the `val` is suffixed by
        ` -- SOURCE: <evidence/>`, so the source survives for the fixing.

    <if condition="<getopt-option-auto/> is not equal `true`">
    Finally, give a final hint by expanding the following (which,
    depending on the configured <ase-guidance-level/>, may expand into
    nothing and hence emit no output at all):

    <ase-tpl-hint level="minimal">
    For deeper analysis and suggested solution approaches, plan the resolution via `/ase-task-edit <id-prefix/>P{n}`, or fix it directly in one shot via `/ase-code-edit <id-prefix/>P{n}`, in the same or even a different session.
    </ase-tpl-hint>
    </if>

    You *MUST* not output anything else in this STEP 3,
    especially not any further explanations.

    </step>

4.  <step id="STEP 4: Fix Problems">

    <if condition="<getopt-option-auto/> is not equal `true` or <problems/> contains no surviving problem of a `severity` other than `ACCEPTED`">
    Do not output anything and *SKIP* this entire STEP 4, as there is
    nothing to fix automatically.
    </if>

    1.  You *MUST* first forget all previous internalized tenets. Then
        use the `Read` tool to read the file `meta/ase-tenets.md` and
        freshly internalize and strictly honor its **GENERIC TENETS**
        and **RESOLVING TENETS** in the following fixing of the
        problems. Additionally, determine the *repository root*
        <repo-root/>: set it to <work-dir/> if this is not empty, else
        run the command `git rev-parse --show-toplevel` (taken exactly as
        given) and capture its output into <repo-root/>. If
        <getopt-option-no-changelog/> is not equal `true` and the file
        `<repo-root/>/CHANGELOG.md` exists, use the `Read` tool to read
        the file `meta/ase-format-changelog.md`, too. Form each of these file
        paths by joining <ase-plugin-root/> and the file name with
        exactly *one* `/` separator. Do not output anything.

    2.  Set <outcomes/> to an empty list. Then, for each surviving
        problem `<id-prefix/>P<n/>` of <problems/> of a `severity` other
        than `ACCEPTED`, in the reported order, read its cited `file`
        (a relative `file` resolved against <work-dir/> if this is not
        empty, else against the current working directory) and the code
        around its cited `line` -- freshly, as the fixes of previous
        problems may have shifted the lines --, determine the *root
        cause* of the problem, and apply a *minimal*, *focused*
        correction which resolves exactly this problem via the `Edit`
        tool (resp. the `Write` tool for a file to be created), without
        any unrelated change, and without staging or committing
        anything. If <getopt-option-no-changelog/> is not equal `true`
        and `<repo-root/>/CHANGELOG.md` exists, add *one* entry for
        each applied correction there, in the
        format detected by the *Format Detection* rules and according to
        the *Entry Quality* rules of `meta/ase-format-changelog.md`.

        Record the outcome of each problem in <outcomes/>: `APPLIED` if
        the correction was applied, `FAILED` if an `Edit` or `Write`
        reported an error, or `SKIPPED` if the problem cannot be resolved
        by a local correction (e.g. a design decision or a questioned
        intent demanding a human) or, if <lens/> is `tests`, its
        `evidence` is `none found` (an expected value is never invented
        without a source), in which case nothing is changed for it. Do not output anything beyond the tool invocations.

    3.  <if condition="<outcomes/> contains at least one `APPLIED` outcome">
        Remove the persisted problems of all applied corrections, so
        only the unfixed problems stay addressable by their id, with a
        *single* `ase_kv_batch` call to the `ase` MCP server with
        `transactional` set to `true` and a `commands` parameter array
        holding one `{ command: "delete", key: "ase-issue-<id-prefix/>P<n/>" }`
        entry per problem with outcome `APPLIED`. Do not output anything.
        </if>

    4.  As the fixing is interleaved with the tool calls (and a headless
        run shows only the final reply text), recap the outcomes with
        the following <template/>, emitted *after* the last tool call:

        <template>
        ⧉ **ASE**: **ANALYSIS FIXES**:

        | *Id* | *Severity* | *Location* | *Summary* | *Status* |
        | ---- | ---------- | ---------- | --------- | -------- |
        <rows/>
        </template>

        Hints:

        -   <rows/> has one row `| **<id-prefix/>P<n/>** | `<severity/>` | <location/> | <summary/> | **<status/>** |` per fixed problem, in order
        -   <location/> is the `` `<file/>`:<line/> `` of the problem
        -   <summary/> is a one-line summary of the `title` of the problem, at most 60 characters long, with every `|` escaped as `\|`
        -   <status/> is the outcome of the problem in <outcomes/>

    5.  Finally, give the closing hints by expanding the following
        (which, depending on the configured <ase-guidance-level/>, may
        each expand into nothing and hence emit no output at all):

        <if condition="<outcomes/> contains at least one `SKIPPED` or `FAILED` outcome">
        <ase-tpl-hint level="minimal">
        For the unfixed problems, plan the resolution via `/ase-task-edit <id-prefix/>P{n}`, or fix it directly in one shot via `/ase-code-edit <id-prefix/>P{n}`, in the same or even a different session.
        </ase-tpl-hint>
        </if>

        <if condition="<outcomes/> contains at least one `APPLIED` outcome">
        <ase-tpl-hint level="normal">
        The fixes are applied, but not staged -- review them, and re-run the analysis resp. the build to verify them.
        </ase-tpl-hint>
        </if>

    You *MUST* not output anything else in this STEP 4,
    especially not any further explanations.

    </step>

</flow>

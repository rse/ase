---
name: ase-code-lint
argument-hint: "[--help|-h] [--auto|-a] [--severity|-S=(AUTO|LOW|MEDIUM|HIGH)] [--force|-f] [--include|-i=<aspect>[,...]] [--exclude|-e=<aspect>[,...]] [--staged] [--unstaged] [--worktree|-w <name>] [<source-reference>]"
description: >
    Lint source code for potential code quality problems.
    Use when the user wants to "lint" or "check" source code.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Bash(git rev-parse *)"
    - "Bash(git -C *)"
    - "Bash(find *)"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-code-lint">
Lint Source Code
</purpose>

<expand name="getopt"
    arg1="ase-code-lint"
    arg2="--auto|-a --severity|-S=(AUTO|LOW|MEDIUM|HIGH) --force|-f --include|-i=(none|A01|A02|A03|A04|A05|A06|A07|A08|A09|A10|A11|A12|A13|A14|A15|A16|A17|A18|A19|A20|A21)... --exclude|-e=(none|A01|A02|A03|A04|A05|A06|A07|A08|A09|A10|A11|A12|A13|A14|A15|A16|A17|A18|A19|A20|A21)... --staged --unstaged --worktree|-w=">
    $ARGUMENTS
</expand>

<objective>
*Analyze* the code of `<getopt-arguments/>` for *potential problems*
related to a set of code quality aspects.
</objective>

<flow>

1.  <step id="STEP 1: Investigation">

    <if condition="<ase-project-boxing/> is equal `black` and <getopt-option-force/> is not equal `true`">

    The project source artifacts are classified as a *black box*, so
    the user does *not* want them inspected or their problems surfaced
    (the `--force` option lifts this skip).
    *Skip* the entire investigation and reporting: do *not* invoke any
    `Bash`, `Glob`, or `Agent` tool and do *not* read any source, only
    output the following <template/> and then *SKIP* the remaining steps
    STEP 2 and STEP 3:

    <template>
    ⧉ **ASE**: **LINT**: *suppressed* (`project.boxing` is `black`)
    </template>

    </if>

    Set <condensed>true</condensed> if <ase-project-boxing/> is equal
    `grey` and <getopt-option-force/> is not equal `true`, and
    <condensed>false</condensed> otherwise: a *condensed* report
    suppresses the full unified diffs of STEP 3.

    First, determine the *effective aspect set* <aspects/>, i.e., the
    code quality aspects which are checked at all. For this, parse
    <getopt-option-include/> and <getopt-option-exclude/> as
    comma-separated token lists, silently dropping the `none` sentinel
    and any empty token. If a token <token/> is *not* one of the aspect
    ids `A01`...`A21`, only output the following <template/> and then
    *STOP* the entire flow (do not perform any further steps):

    <template>
    ⧉ **ASE**: ✪ skill: **ase-code-lint**, ▶ ERROR: invalid aspect id: **<token/>**
    </template>

    Otherwise set <aspects/> to *all* twenty-one aspect ids `A01`...`A21`
    if both lists are empty, to the *include* list if only it is
    non-empty, to all twenty-one *minus* the *exclude* list if only it is
    non-empty, and to the *include* list *minus* the *exclude* list if
    both are non-empty. If the resulting <aspects/> is *empty*, only
    output the following <template/> and then *STOP* the entire flow
    (do not perform any further steps):

    <template>
    ⧉ **ASE**: ✪ skill: **ase-code-lint**, ▶ ERROR: options `--include` and `--exclude` cancel out to an empty aspect set
    </template>

    Then, use the following <template/> to give a hint on this step:

    <template>
    ⧉ **ASE**: **LINT INVESTIGATION**
    </template>

    Dispatch the investigation to *sub-agents* via the `Agent`
    tool so that *no* investigation details leak into the user-visible
    transcript. The sub-agents perform the silent reading and checking;
    only their final structured return values are consumed here.

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
    ⧉ **ASE**: ✪ skill: **ase-code-lint**, ▶ ERROR: no worktree **<getopt-option-worktree/>** to lint
    </template>

    <if condition="<getopt-option-staged/> is equal `true` or <getopt-option-unstaged/> is equal `true`">

    For this, first *silently* restrict the linting to the *changed*
    files of the Git working copy. Set <changes>staged and
    unstaged</changes> if both <getopt-option-staged/> and
    <getopt-option-unstaged/> are equal `true`, set
    <changes>staged</changes> if only <getopt-option-staged/> is equal
    `true`, and set <changes>unstaged</changes> otherwise. Determine the
    *repository root* <repo-root/>: set it to <work-dir/> if this is not
    empty, else run the command `git rev-parse --show-toplevel` (taken
    exactly as given) and capture its output into <repo-root/>. Then
    determine the changed files by running the
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
    those files which lie within the source code referenced by it,
    expanding any directory or wildcard references with the `Glob`
    tool (or, if the `Glob` tool is not available, with the `find`
    command via the `Bash` tool). Set <sources/> to the resulting list
    of individual source code files, preserving order.

    If <sources/> is empty, only output the following <template/>
    and then *SKIP* the rest of this STEP 1 and the remaining steps
    STEP 2 and STEP 3:

    <template>
    ⧉ **ASE**: **LINT**: *no <changes/> source files to lint*
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

    For this, first *silently* resolve `<getopt-arguments/>` to the
    list <sources/> of individual source code files (with relative
    references resolved against <work-dir/> if this is not empty),
    expanding any directory or wildcard references with the `Glob` tool
    (or, if the `Glob` tool is not available, with the `find` command
    via the `Bash` tool).

    If <sources/> is empty (no *source-reference* given or none of it
    resolvable), only output the following <template/> and then *STOP*
    the entire flow (do not perform any further steps):

    <template>
    ⧉ **ASE**: ✪ skill: **ase-code-lint**, ▶ ERROR: no source files to lint -- give a *source-reference* or use `--staged`/`--unstaged`
    </template>

    </else>

    Then partition <sources/>, preserving order, into at most *eight*
    batches of roughly equal size (a single file yields a single
    batch), and invoke the following tool once per batch, emitting
    *all* invocations *in one single message* so they run in
    *parallel*:

    ```text
        Agent(
            description:       "Lint Investigation (<batch-index/>/<batch-count/>)",
            subagent_type:     "ase:ase-code-lint",
            prompt:            "<aspects/> <batch/>",
            run_in_background: false
        )
    ```

    Here <aspects/> is the comma-separated list of the effective aspect
    ids (without any spaces), <batch/> is the space-separated list of
    the source code file paths of the corresponding batch,
    <batch-index/> is the 1-based index of that batch, and
    <batch-count/> is the total number of batches, so that each
    parallel invocation is distinguishable in the progress display.

    Parse the result message of each `Agent` tool invocation as a JSON
    array and concatenate all those arrays. Determine the *anchor* of
    each problem as the `file` of its *first* `change-set` entry and the
    `line` of that entry's *first* `change-hunks` entry, as problems carry
    no top-level `file` and `line` fields. Then *deduplicate* the
    combined list: when two problems share the same anchor and
    `aspect`, *silently drop* all but the first one (sub-agents may
    have read overlapping *related* files for comprehension). Finally
    sort the list by the anchor `file` and then numerically by the anchor
    `line`, and set <problems/> to that list.

    <if condition="<getopt-option-staged/> is equal `true` or <getopt-option-unstaged/> is equal `true`">
    Then *restrict* <problems/> to the changeset: *keep* a problem if
    and only if at least one `change-hunks` entry of any of its
    `change-set` entries *overlaps* a changed line range in <ranges/> of
    the `file` of that `change-set` entry (resolving a relative `file`
    against <work-dir/> if this is not empty, else against the current
    working directory), and *silently drop* all
    other problems. A change hunk covers the lines `line` to `line` +
    <n/> - 1, where <n/> is the number of lines of its `old_text`, or,
    for a *pure insertion* with an empty `old_text`, the two lines
    `line` - 1 and `line` adjacent to the insertion point.
    </if>

    Then determine the *effective severity floor* <floor/>: define the
    ordinal rank `LOW`=1, `MEDIUM`=2, `HIGH`=3.

    <if condition="<getopt-option-severity/> is equal `AUTO`">
    Set <floor>MEDIUM</floor> if <ase-project-boxing/> is equal `grey`
    and <getopt-option-force/> is not equal `true` (grey boxing surfaces
    only *material* findings of severity `MEDIUM` and above), and
    <floor>LOW</floor> otherwise.
    </if>
    <else>
    Set <floor><getopt-option-severity/></floor>: an *explicitly* given
    severity floor always *wins* over the `grey` boxing floor.
    </else>

    Then *apply the effective severity floor* <floor/>: *Keep* a problem
    in <problems/> if and only if its `severity` field is `ACCEPTED` *or*
    `rank(severity)` is greater than or equal to `rank(<floor/>)`;
    *silently drop* all other problems. With the floor `LOW`, all
    problems are kept. `ACCEPTED` problems are *never* dropped.

    Finally, sort the surviving problems in <problems/> by their
    `severity` field from highest to lowest in the fixed order `HIGH`,
    `MEDIUM`, `LOW`, `ACCEPTED`, so the subsequent reporting starts with
    the most severe problem. Within the same severity, keep the
    `file`/`line` order established above.

    You *MUST* *NOT* output anything else in this STEP 1.

    </step>

2.  <step id="STEP 2: Summary">

    Use the following <template/> to output a summary of the detected
    problems in <problems/> (if any were found), in the original aspect
    ordering `A01 - XXX`...`A21 - XXX`.

    <template>
    ⧉ **ASE**: **LINT SUMMARY**:

    -   **AX - XXX**: N issues
    -   **AX - XXX**: N issues
    [...]
    </template>

    Else, if no problems were found, use the following <template/> to
    output the summary instead:

    <template>
    ⧉ **ASE**: **LINT SUMMARY**:

    *(no problems detected)*
    </template>

    You *MUST* *NOT* output anything else in this STEP 2.

    </step>

3.  <step id="STEP 3: Correction">

    1.  *Mark this skill as the active edit-capable skill* so that the
        ASE `pre-tool-use` hook auto-approves the subsequent `Edit`
        invocations on *any* invocation path (slash command *or* `Skill`
        tool). Call the `ase_state_set(key: "skill", val:
        "ase-code-lint", session: "<ase-session-id/>")` tool
        from the `ase` MCP server. Do not output anything in this substep.

        *Critical safety invariant*: the marker set here grants `Edit`
        auto-approval and *MUST* be cleared again (substep 3 below)
        *before* this skill yields control, *regardless* of how the
        iteration in substep 2 ends - whether it completes normally,
        is aborted early (e.g. an `Edit` failure, an unparseable value,
        or any other unexpected condition), or is otherwise interrupted.
        If you ever stop or bail out of substep 2 early, you *MUST*
        still perform substep 3 first. Never leave this marker active
        for a later, unrelated `Edit`.

    2.  Set <total/> to the number of problems in <problems/>,
        <index/> to `0`, and <outcomes/> to an empty list.
        Then iterate over all problems:

        <for items="<problems/>">

        1.  Increment <index/> by one (the 1-based position of the
            current <item/> within <problems/>).
            Set <aspect/>      to the `aspect`      field of <item/>.
            Set <severity/>    to the `severity`    field of <item/>.
            Set <description/> to the `description` field of <item/>.
            Set <change-set/>  to the `change-set`  field of <item/>.

        2.  Set <context></context> (set to empty).
            Set <diff></diff> (set to empty).
            Set <diff-condensed></diff-condensed> (set to empty).

        3.  Iterate over the change set:

            <for items="<change-set/>">

            1.  Set <file/>         to the `file`         field of <item/>.
                Set <change-hunks/> to the `change-hunks` field of <item/>.

                Unless <condensed/> is equal `true` (where the
                full unified diff is suppressed and no context lines are
                rendered at all), *silently* read the current content of
                <file/> with the `Read` tool - reusing the content read
                for the same <file/> earlier in this iteration, unless
                an `Edit` was applied to it in between - and set
                <file-lines/> to its lines, *stripped* of the
                line-number prefixes the tool adds. Set <file-lines/>
                to empty if the file cannot be read.

                This content is the *authoritative* source of the
                context lines of substep 2 below, so the rendered diff
                shows real context even when a sub-agent supplied none.

                Unless <condensed/> is equal `true` (where the
                full unified diff is suppressed and this per-file header is
                unused), set <diff-file/> to the following <template/>:

                <template>
                --- <file/> (original)
                +++ <file/> (corrected)
                </template>

            2.  Iterate over the change hunks.

                <for items="<change-hunks/>">

                1.  Set <line/>           to the `line`           field of <item/>.
                    Set <context-before/> to the `context_before` field of <item/>.
                    Set <old-text/>       to the `old_text`       field of <item/>.
                    Set <new-text/>       to the `new_text`       field of <item/>.
                    Set <context-after/>  to the `context_after`  field of <item/>.

                    Then *normalize* the hunk to its *minimal* form, so
                    that the proposed diff shows exactly the lines the
                    later `Edit` will actually change: while the *first*
                    line of <old-text/> is identical to the *first* line
                    of <new-text/>, *move* that line from both to the
                    end of <context-before/> and increment <line/> by
                    one; likewise, while the *last* line of <old-text/>
                    is identical to the *last* line of <new-text/>,
                    *move* that line from both to the front of
                    <context-after/>. Finally, *trim* <context-before/>
                    to its *last* two lines and <context-after/> to its
                    *first* two lines.

                    Then, whenever <file-lines/> is non-empty,
                    *re-derive* both context parts from it, *overriding*
                    the sub-agent supplied values: set <context-before/>
                    to the *up to two* lines of <file-lines/> directly
                    *before* line <line/> (empty if <line/> is `1`) and
                    <context-after/> to the *up to two* lines of
                    <file-lines/> starting at line (<line/> + <n/>),
                    where <n/> is the number of lines in <old-text/>
                    (empty if that line is beyond the end of the file).
                    Keep the sub-agent supplied values only when
                    <file-lines/> is empty.

                2.  *Skip* this substep entirely when <condensed/>
                    is equal `true` - the full unified diff is suppressed
                    there, so none of the <hunk-body/>, <old-count/>,
                    <new-count/>, <old-start/>, or <new-start/> values
                    below are consumed (substep 4 builds only the condensed
                    one-liner instead).

                    Otherwise, determine the hunk *body* as an ordered list
                    of lines, each carrying a one-character prefix (` ` for
                    context, `-` for old-side, `+` for new-side). Build it
                    by concatenating, in order and *skipping any part that
                    is empty*:

                    - one ` `-prefixed line for *each* line of
                      <context-before/> (if non-empty),
                    - one `-`-prefixed line for *each* line of <old-text/>
                      (if non-empty; split <old-text/> on newlines),
                    - one `+`-prefixed line for *each* line of <new-text/>
                      (if non-empty; split <new-text/> on newlines),
                    - one ` `-prefixed line for *each* line of
                      <context-after/> (if non-empty).

                    Set <hunk-body/> to those prefixed lines joined by
                    newlines.

                    Set <old-count/> to the number of old-side hunk lines,
                    i.e., the combined line count of <context-before/>,
                    <old-text/>, and <context-after/> (each empty part
                    counts as `0`).
                    Set <new-count/> to the number of new-side hunk lines,
                    i.e., the combined line count of <context-before/>,
                    <new-text/>, and <context-after/> (each empty part
                    counts as `0`).

                    Set <old-start/> to the 1-based line number of the
                    *first* old-side hunk line: if <context-before/> is
                    non-empty, that is the line of its *first* context
                    line, i.e. <line/> minus the number of lines in
                    <context-before/>; otherwise it is <line/> itself
                    (the first line of <old-text/>). For a hunk that
                    *only inserts* new lines (empty <old-text/> *and*
                    empty context), set it to the
                    line *before* which the insertion happens, clamped to a
                    minimum of `0`, so a top-of-file insertion yields
                    `@@ -0,0 ... @@`.
                    Set <new-start/> to the same value as <old-start/>, but
                    clamped to a minimum of `1` whenever <new-count/> is
                    greater than `0` (the corrected side then has a real
                    first line).

                3.  If <context/> is not empty, set
                    <context><context/>,</context> (append a comma).
                    Then append the following <template/> to <context/>:

                    <template>`<file/>`:<line/></template>

                4.  <if condition="<condensed/> is equal `true`">

                    The full unified diff is *suppressed* in a condensed
                    report (see substep 5 below), so *skip* the full-diff append
                    and instead build only a *condensed* one-line
                    representation of this hunk: determine <old-snippet/>
                    as the *single-line* collapse of <old-text/> (join its
                    lines with ` ⏎ `, or `∅` when <old-text/> is empty for
                    a pure insertion) and <new-snippet/> as the same
                    collapse of <new-text/> (or `∅` when empty for a pure
                    deletion). Then append the following <template/> to
                    <diff-condensed/> as a new line:

                    <template>
                    -   `<file/>`:<line/>: `<old-snippet/>` → `<new-snippet/>`
                    </template>

                    </if>
                    <else>

                    Append the following <template/> to <diff-file/>,
                    emitting <hunk-body/> verbatim (one already-prefixed
                    line per line, with no extra blank or space-only lines):

                    <template>
                    @@ -<old-start/>,<old-count/> +<new-start/>,<new-count/> @@
                    <hunk-body/>
                    </template>

                    </else>

                </for>

            3.  Unless <condensed/> is equal `true` (where
                <diff-file/> is unused), append <diff-file/> to <diff/>.

            </for>

        4.  Report the problem with the following <template/>:

            <template>
            ⧉ **ASE**: [<index/>/<total/>]: **<aspect/> PROBLEM** (`<severity/>`): <context/>

            <description/>

            </template>

        5.  <if condition="<getopt-option-auto/> is not equal `true`">

            <if condition="<condensed/> is equal `true`">

            The project source artifacts are classified as a *grey box*,
            so the user does *not* want the full artifact internals
            surfaced:
            *suppress* the full unified diff and instead show only the
            *condensed* one-line-per-hunk representation. Report the
            solution with the following <template/>:

            <template>
            ⧉ **ASE**: **<aspect/> SOLUTION**:

            <diff-condensed/>

            </template>

            </if>
            <else>

            Report the solution with the following <template/>:

            <template>
            ⧉ **ASE**: **<aspect/> SOLUTION**:

            ```diff
            <diff/>
            ```

            </template>

            </else>

            </if>
            <else>

            Report the solution with the following <template/>:

            <template>
            ⧉ **ASE**: **<aspect/> SOLUTION**:

            *(corresponding change automatically applied)*

            </template>

            </else>

        6.  <if condition="<getopt-option-auto/> is not equal `true`">

            In the following, you *MUST* *NOT* use your built-in
            <user-dialog-tool/> tool! Instead, you *MUST* just show a
            custom dialog according to the expanded `custom-dialog`
            definition. You *MUST* closely follow this definition:

            <expand name="custom-dialog" arg1="--other">
                CORRECTION: How would you like to proceed with this proposed correction?
                ACCEPT: Apply this proposed correction.
                REJECT: Skip this proposed correction.
            </expand>

            </if>

            <else>

            Set <result>ACCEPT</result>.
            You *MUST* *NOT* output anything else in this sub-step 6.

            </else>

        7.  Check <result/> and dispatch accordingly:

            -   <if condition="<result/> is 'ACCEPT'">
                Invoke the `Edit` tool to apply the changes exactly
                as given by the hunks of the current <change-set/>
                (rendered as <diff/>, unless suppressed in a condensed
                report). The operation will be auto-approved by the ASE
                `pre-tool-use` hook (which tracks the active skill),
                so *no* interactive permission prompt will appear.
                After applying the changes, record `APPLIED` (or
                `FAILED`, if an `Edit` reported an error) as the outcome
                of <index/> in <outcomes/> and just continue with the
                next <item/>.
                </if>

            -   <if condition="<result/> starts with 'OTHER'">
                Generate a *new* proposal for the *same* <item/>
                (incorporating the user's free-text hint from <result/> if
                provided via the "OTHER" prefix). *Reassign* <description/>
                and <change-set/> to reflect this refined proposal (each
                change-hunk's `old_text` stays anchored to the existing
                text at its `file`:`line`; `new_text` carries the
                refinement) so that the substep 2/3 rebuild renders the new
                <diff/> and any `Edit` applies the new proposal rather than
                the original. Then loop back to substep 2 of this iteration.
                There is *no* cap on refinement rounds - keep refining until
                the user picks `ACCEPT` or `REJECT`.
                </if>

            -   <if condition="
                    <result/> is 'REJECT' or
                    <result/> is 'CANCEL' or
                    <result/> starts with 'ERROR'
                ">
                Skip this <item/> without any `Edit` call, record
                `SKIPPED` as the outcome of <index/> in <outcomes/>, and
                continue with the next <item/>.
                </if>

        </for>

    3.  *Clear the active edit-capable skill marker* now that all `Edit`
        invocations are done, so a later unrelated `Edit` is *not*
        auto-approved. Call the `ase_state_delete(key: "skill",
        session: "<ase-session-id/>")` tool from the `ase` MCP
        server. Do not output anything in this substep.

    4.  <if condition="<getopt-option-auto/> is equal `true` and <total/> is greater than `0`">

        Under `--auto`, the problem reports are interleaved with the
        `Edit` invocations (and a headless run shows only the final
        reply text), so recap the outcome of all problems with the
        following <template/>, emitted *after* the last tool call and
        *together* with the final template of substep 5:

        <template>
        ⧉ **ASE**: **LINT RESULT**:

        | *#* | *Aspect* | *Severity* | *Location* | *Summary* | *Status* |
        | --: | -------- | ---------- | ---------- | --------- | -------- |
        <rows/>
        </template>

        Hints:

        -   <rows/> has one row `| <index/> | **<aspect/>** | `<severity/>` | <location/> | <summary/> | **<status/>** |` per problem of <problems/>, in order
        -   <location/> is the first `` `<file/>`:<line/> `` of the change set of the problem, suffixed with ` (+<n/>)` for <n/> further change hunks
        -   <summary/> is a one-line summary of the <description/> of the problem, at most 60 characters long, with every `|` escaped as `\|`
        -   <status/> is the outcome of the problem in <outcomes/>

        </if>

    5.  You *MUST* *NOT* output any further additional explanations or
        summaries at the end of this skill processing, except for the
        result of substep 4 and the following final <template/>:

        <template>
        ⧉ **ASE**: **LINT FINISHED**
        </template>

    6.  Finally, give the closing hints by expanding the following
        (which, depending on the configured <ase-guidance-level/>, may
        each expand into nothing and hence emit no output at all):

        <if condition="at least one problem in <problems/> was left uncorrected">
        <ase-tpl-hint level="normal">
        For problems whose correction demands more than a local edit, use `/ase-task-edit` to derive a full solution approach and plan, or `/ase-code-edit -a` to derive and apply it directly.
        </ase-tpl-hint>
        </if>

        <if condition="<getopt-option-auto/> is not equal `true`">
        <ase-tpl-hint level="verbose">
        Use `/ase-code-lint --auto` to apply all corrections unattended, `--severity` to raise the reporting floor, `--force` to ignore the project boxing, `--include`/`--exclude` to narrow the checked aspects, `--staged`/`--unstaged` to lint only the changed hunks, and `--worktree` to lint inside an ASE worktree.
        </ase-tpl-hint>
        </if>

    </step>

</flow>


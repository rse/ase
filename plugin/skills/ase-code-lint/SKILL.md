---
name: ase-code-lint
argument-hint: "[--help|-h] [--auto|-a] [--severity|-S=(LOW|MEDIUM|HIGH)] <source-reference>"
description: >
    Lint source code for potential code quality problems.
    Use when the user wants to "lint" or "check" source code.
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<skill name="ase-code-lint">
Lint Source Code
</skill>

<expand name="getopt"
    arg1="ase-code-lint"
    arg2="--auto|-a --severity|-S=(LOW|MEDIUM|HIGH)">
    $ARGUMENTS
</expand>

<objective>
*Analyze* the code of `<getopt-arguments/>` for *potential problems*
related to a set of code quality aspects.
</objective>

<flow>

1.  <step id="STEP 1: Investigation">

    <if condition="<ase-project-boxing/> is equal `black`">

    The project source artifacts are classified as a *black box*, so
    the user does *not* want them inspected or their problems surfaced.
    *Skip* the entire investigation and reporting: do *not* invoke any
    `Glob` or `Agent` tool and do *not* read any source, only output
    the following <template/> and then *SKIP* the remaining steps STEP 2
    and STEP 3:

    <template>
    <ase-tpl-bullet-normal/> **LINT**: *suppressed* (`project.boxing` is `black`)
    </template>

    </if>

    First, use the following <template/> to give a hint on this step:

    <template>
    <ase-tpl-bullet-secondary/> **LINT INVESTIGATION**
    </template>

    Dispatch the investigation to *sub-agents* via the `Agent`
    tool so that *no* investigation details leak into the user-visible
    transcript. The sub-agents perform the silent reading and checking;
    only their final structured return values are consumed here.

    For this, first *silently* resolve `<getopt-arguments/>` to the
    list <sources/> of individual source code files, expanding any
    directory or wildcard references with the `Glob` tool. Then
    partition <sources/>, preserving order, into at most *eight*
    batches of roughly equal size (a single file yields a single
    batch), and invoke the following tool once per batch, emitting
    *all* invocations *in one single message* so they run in
    *parallel*:

    ```text
        Agent(
            description:       "Lint Investigation (<batch-index/>/<batch-count/>)",
            subagent_type:     "ase:ase-code-lint",
            prompt:            <batch/>,
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
    combined list: when two problems share the same `file`, `line`, and
    `aspect`, *silently drop* all but the first one (sub-agents may
    have read overlapping *related* files for comprehension). Finally
    sort the list by `file` and then numerically by `line`, and set
    <problems/> to that list.

    Then determine the *effective severity floor* <floor/>: define the
    ordinal rank `LOW`=1, `MEDIUM`=2, `HIGH`=3, start from
    <floor><getopt-option-severity/></floor> (default `LOW`), and - if
    <ase-project-boxing/> is equal `grey` - raise <floor/> to `MEDIUM`
    whenever its current rank is below `rank(MEDIUM)` (grey boxing
    surfaces only *material* findings of severity `MEDIUM` and above).

    Then *apply the effective severity floor* <floor/>: *Keep* a problem
    in <problems/> if and only if its `severity` field is `ACCEPTED` *or*
    `rank(severity)` is greater than or equal to `rank(<floor/>)`;
    *silently drop* all other problems. With the default floor `LOW`, all
    problems are kept. `ACCEPTED` problems are *never* dropped.

    You *MUST* *NOT* output anything else in this STEP 1.

    </step>

2.  <step id="STEP 2: Summary">

    Use the following <template/> to output a summary of the detected
    problems in <problems/> (if any were found), in the original aspect
    ordering `A01 - XXX`...`A20 - XXX`.

    <template>
    <ase-tpl-bullet-secondary/> **LINT SUMMARY**:

    <ase-tpl-bullet-signal/> **AX - XXX**: N issues
    <ase-tpl-bullet-signal/> **AX - XXX**: N issues
    [...]
    </template>

    Else, if no problems were found, use the following <template/> to
    output the summary instead:

    <template>
    <ase-tpl-bullet-secondary/> **LINT SUMMARY**:

    *(no problems detected)*
    </template>

    You *MUST* *NOT* output anything else in this STEP 2.

    </step>

3.  <step id="STEP 3: Correction">

    1.  *Mark this skill as the active edit-capable skill* so that the
        ASE `pre-tool-use` hook auto-approves the subsequent `Edit`
        invocations on *any* invocation path (slash command *or* `Skill`
        tool). Call the `ase_config_set(key: "agent.skill", val:
        "ase-code-lint", scope: "session:<ase-session-id/>")` tool
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

    2.  Iterate over all problems:

        <for items="<problems/>">

        1.  Set <aspect/>      to the `aspect`      field of <item/>.
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

                Unless <ase-project-boxing/> is equal `grey` (where the
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

                2.  *Skip* this substep entirely when <ase-project-boxing/>
                    is equal `grey` - the full unified diff is suppressed
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
                    non-empty, that is its line (one before <line/>);
                    otherwise it is <line/> itself (the first line of
                    <old-text/>). For a hunk that *only inserts* new lines
                    (empty <old-text/> *and* empty context), set it to the
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

                4.  <if condition="<ase-project-boxing/> is equal `grey`">

                    The full unified diff is *suppressed* under grey boxing
                    (see substep 5 below), so *skip* the full-diff append
                    and instead build only a *condensed* one-line
                    representation of this hunk: determine <old-snippet/>
                    as the *single-line* collapse of <old-text/> (join its
                    lines with ` ⏎ `, or `∅` when <old-text/> is empty for
                    a pure insertion) and <new-snippet/> as the same
                    collapse of <new-text/> (or `∅` when empty for a pure
                    deletion). Then append the following <template/> to
                    <diff-condensed/> as a new line:

                    <template>
                    <ase-tpl-bullet-signal/> `<file/>`:<line/>: `<old-snippet/>` → `<new-snippet/>`
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

            3.  Unless <ase-project-boxing/> is equal `grey` (where
                <diff-file/> is unused), append <diff-file/> to <diff/>.

            </for>

        4.  Report the problem with the following <template/>:

            <template>
            <ase-tpl-bullet-signal/> **<aspect/> PROBLEM** (`<severity/>`): <context/>

            <description/>

            </template>

        5.  <if condition="<getopt-option-auto/> is not equal `true` and <ase-project-boxing/> is not equal `black`">

            <if condition="<ase-project-boxing/> is equal `grey`">

            The project source artifacts are classified as a *grey box*, so
            the user does *not* want the full artifact internals surfaced:
            *suppress* the full unified diff and instead show only the
            *condensed* one-line-per-hunk representation. Report the
            solution with the following <template/>:

            <template>
            <ase-tpl-bullet-normal/> **<aspect/> SOLUTION**:

            <diff-condensed/>

            </template>

            </if>
            <else>

            Report the solution with the following <template/>:

            <template>
            <ase-tpl-bullet-normal/> **<aspect/> SOLUTION**:

            ```diff
            <diff/>
            ```

            </template>

            </else>

            </if>
            <else>

            Report the solution with the following <template/>:

            <template>
            <ase-tpl-bullet-normal/> **<aspect/> SOLUTION**:

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
                (rendered as <diff/>, unless suppressed under grey
                boxing). The operation will be auto-approved by the ASE
                `pre-tool-use` hook (which tracks the active skill),
                so *no* interactive permission prompt will appear.
                After applying the changes, just continue with the next
                <item/>.
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
                Skip this <item/> without any `Edit` call and continue
                with the next <item/>.
                </if>

        </for>

    3.  *Clear the active edit-capable skill marker* now that all `Edit`
        invocations are done, so a later unrelated `Edit` is *not*
        auto-approved. Call the `ase_config_delete(key: "agent.skill",
        scope: "session:<ase-session-id/>")` tool from the `ase` MCP
        server. Do not output anything in this substep.

    4.  You *MUST* *NOT* output any further additional explanations or
        summaries at the end of this skill processing, except for the
        following final <template/>:

        <template>
        <ase-tpl-bullet-secondary/> **LINT FINISHED**
        </template>

    </step>

</flow>


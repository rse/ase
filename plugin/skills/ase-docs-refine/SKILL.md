---
name: ase-docs-refine
argument-hint: "[--help|-h] [--auto|-a] <docs-reference>"
description: >
    Refine the sentence structure and style of the documents: shorten long sentences, replace
    cumbersome nominal constructions with verbs, make enumerations parallel, strike filler words and
    redundancy, fix awkward transitions, and adjust voice, while content, numbers, and technical terms
    stay exactly as they are. Use when the user wants to "refine", "tighten", or "polish" the wording
    of a document.
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-common-diff.md

<purpose name="ase-docs-refine">
Refine the sentence structure and style of documents
</purpose>

<expand name="getopt"
    arg1="ase-docs-refine"
    arg2="--auto|-a">
    $ARGUMENTS
</expand>

<objective>
*Refine* the documents of `<getopt-arguments/>` in their *sentence
structure*, *nominal style*, *parallelism*, *filler and redundancy*,
*transitions*, and *voice* and propose light rewritings: make long
sentences shorter, replace cumbersome nominal constructions with verbs,
bring enumerations into one grammatical shape, and strike filler words.
*Content, numbers, and technical terms stay exactly as they are.*
</objective>

Ground Rule
-----------

This skill performs *light rewriting* of awkward or unclear sentences,
*without reshaping the argument*. Every proposed change *MUST* preserve
the statement of the original text *exactly*: same facts, same numbers,
same technical terms, same qualifiers, same negations, same order of
the argument -- only the *wording* changes. A rewriting which shifts
the meaning even slightly is *not* a refinement and is *never* applied.

The rewriting stays *within* a sentence. Dropping a whole sentence,
paragraph, example, or list item for the sake of brevity is *length
reduction*, not refinement, and belongs to the `ase-docs-shorten` skill.

<flow>

1.  <step id="STEP 1: Investigation">

    <if condition="<ase-project-boxing/> is equal `black`">

    The project source artifacts are classified as a *black box*, so
    the user does *not* want them inspected or their problems surfaced.
    *Skip* the entire investigation and reporting: do *not* invoke any
    `Glob` or `Agent` tool and do *not* read any document, only output
    the following <template/> and then *SKIP* the remaining steps STEP 2
    and STEP 3:

    <template>
    ⧉ **ASE**: **REFINE**: *suppressed* (`project.boxing` is `black`)
    </template>

    </if>

    First, use the following <template/> to give a hint on this step:

    <template>
    ⧉ **ASE**: **REFINEMENT INVESTIGATION**
    </template>

    Dispatch the investigation to *sub-agents* via the `Agent`
    tool so that *no* investigation details leak into the user-visible
    transcript. The sub-agents perform the silent reading and checking;
    only their final structured return values are consumed here.

    For this, first *silently* resolve `<getopt-arguments/>` to the
    list <documents/> of individual document files, expanding any
    directory or wildcard references with the `Glob` tool. Then
    partition <documents/>, preserving order, into at most *eight*
    batches of roughly equal size (a single document yields a single
    batch), and invoke the following tool once per batch, emitting
    *all* invocations *in one single message* so they run in
    *parallel*:

    ```text
        Agent(
            description:       "Refine Investigation (<batch-index/>/<batch-count/>)",
            subagent_type:     "ase:ase-docs-refine",
            prompt:            <batch/>,
            run_in_background: false
        )
    ```

    Here <batch/> is the space-separated list of the document file
    paths of the corresponding batch, <batch-index/> is the 1-based
    index of that batch, and <batch-count/> is the total number of
    batches, so that each parallel invocation is distinguishable in
    the progress display.

    Parse the result message of each `Agent` tool invocation as a JSON
    array, concatenate all those arrays, sort the combined list by
    `file` and then numerically by `line`, and set <problems/> to that
    list.

    Then *verify the Ground Rule* for each problem of <problems/>:
    compare its `new_text` against its `old_text` and *drop* the
    problem from <problems/> whenever the rewriting shifts the meaning
    even slightly, i.e., drops, adds, or alters a fact, a number, a
    technical term, a qualifier, a negation, or a condition.

    You *MUST* *NOT* output anything at all in this STEP 1 beyond the
    above hint template and the `Glob` and `Agent` tool invocations.
    </step>

2.  <step id="STEP 2: Summary">

    Use the following <template/> to give a summary of the detected
    problems in <problems/>:

    <template>
    ⧉ **ASE**: **REFINEMENT SUMMARY**:

    | *Refinement Type*   | *Refinement Result*     |
    | ------------------- | ----------------------- |
    | **STRUCTURE**:      | **<s/>** problems found |
    | **NOMINALIZATION**: | **<n/>** problems found |
    | **PARALLELISM**:    | **<p/>** problems found |
    | **FILLER**:         | **<f/>** problems found |
    | **TRANSITION**:     | **<t/>** problems found |
    | **VOICE**:          | **<v/>** problems found |

    </template>

    Hints:

    -   <s/> is the number of problems with `type` equal to `STRUCTURE`      in <problems/>
    -   <n/> is the number of problems with `type` equal to `NOMINALIZATION` in <problems/>
    -   <p/> is the number of problems with `type` equal to `PARALLELISM`    in <problems/>
    -   <f/> is the number of problems with `type` equal to `FILLER`         in <problems/>
    -   <t/> is the number of problems with `type` equal to `TRANSITION`     in <problems/>
    -   <v/> is the number of problems with `type` equal to `VOICE`          in <problems/>

    </step>

3.  <step id="STEP 3: Refinement">

    1.  *Mark this skill as the active edit-capable skill* so that the
        ASE `pre-tool-use` hook auto-approves the subsequent `Edit`
        invocations on *any* invocation path (slash command *or* `Skill`
        tool). Call the `ase_state_set(key: "skill", val:
        "ase-docs-refine", session: "<ase-session-id/>")` tool
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
            Set <type/>           to the `type` field of <item/>.
            Set <file/>           to the `file` field of <item/>.
            Set <line/>           to the `line` field of <item/>.
            Set <description/>    to the `description` field of <item/>.
            Set <context-before/> to the `context_before` field of <item/>.
            Set <old-text/>       to the `old_text` field of <item/>.
            Set <new-text/>       to the `new_text` field of <item/>.
            Set <context-after/>  to the `context_after` field of <item/>.

            Then *normalize* the change to its *minimal* form, so
            that the proposed diff shows exactly the lines the later
            `Edit` will actually change: while the *first* line of
            <old-text/> is identical to the *first* line of
            <new-text/>, *move* that line from both to the end of
            <context-before/> and increment <line/> by one; likewise,
            while the *last* line of <old-text/> is identical to the
            *last* line of <new-text/>, *move* that line from both to
            the front of <context-after/>. Finally, *trim*
            <context-before/> to its *last* two lines and
            <context-after/> to its *first* two lines.

            Then, unless <ase-project-boxing/> is equal `grey` (where
            the full unified diff is suppressed and no context lines are
            rendered at all), *silently* read the current content of
            <file/> with the `Read` tool - reusing the content read for
            the same <file/> earlier in this iteration, unless an `Edit`
            was applied to it in between - and set <file-lines/> to its
            lines, *stripped* of the line-number prefixes the tool adds.
            Set <file-lines/> to empty if the file cannot be read.

            Whenever <file-lines/> is non-empty, *re-derive* both
            context parts from it, *overriding* the sub-agent supplied
            values, so the rendered diff shows real context even when a
            sub-agent supplied none: set <context-before/> to the *up to
            two* lines of <file-lines/> directly *before* line <line/>
            (empty if <line/> is `1`) and <context-after/> to the *up
            to two* lines of <file-lines/> starting at line (<line/> +
            <n/>), where <n/> is the number of lines in <old-text/>
            (empty if that line is beyond the end of the document).
            Keep the sub-agent supplied values only when <file-lines/>
            is empty.

        2.  Report the problem with the following <template/>:

            <template>
            ⧉ **ASE**: [<index/>/<total/>]: **<type/> PROBLEM**: `<file/>`:<line/>:

            <description/>
            </template>

        3.  <if condition="<getopt-option-auto/> is not equal `true` and <ase-project-boxing/> is equal `grey`">

            The project source artifacts are classified as a *grey box*, so
            the user does *not* want the full artifact internals surfaced:
            *suppress* the full unified diff and instead show only a
            *condensed* one-line representation. Determine <old-snippet/>
            as the *single-line* collapse of <old-text/> (join its lines
            with ` ⏎ `, or `∅` when <old-text/> is empty for a pure
            insertion) and <new-snippet/> as the same collapse of
            <new-text/> (or `∅` when empty for a pure deletion). Then
            report the refinement with the following <template/>:

            <template>

            ⧉ **ASE**: **<type/> REFINEMENT**: `<old-snippet/>` → `<new-snippet/>`

            </template>

            </if>
            <elseif condition="<getopt-option-auto/> is not equal `true`">

            <expand name="diff-hunk"
                arg1="refined"
                arg2="**<type/> REFINEMENT**"></expand>

            </elseif>

        4.  <if condition="<getopt-option-auto/> is not equal `true`">

            In the following, you *MUST* *NOT* use your built-in
            <user-dialog-tool/> tool! Instead, you *MUST* just show a
            custom dialog according to the expanded `custom-dialog`
            definition. You *MUST* closely follow this definition:

            <expand name="custom-dialog" arg1="--other">
                REFINEMENT: How would you like to proceed with this proposed refinement?
                ACCEPT: Apply this proposed refinement.
                REJECT: Skip this proposed refinement.
            </expand>

            </if>

            <else>

            Set <result>ACCEPT</result>.

            </else>

        5.  Check <result/> and dispatch accordingly:

            -   <if condition="<result/> is 'ACCEPT'">

                Invoke the `Edit` tool to apply the change by replacing
                <old-text/> with <new-text/> at <file/>:<line/>. The operation
                will be auto-approved by the ASE `pre-tool-use` hook (which
                tracks the active skill), so *no* interactive permission
                prompt will appear. Then record `APPLIED` (or `FAILED`,
                if the `Edit` reported an error) as the outcome of
                <index/> in <outcomes/> and continue with the next <item/>.

                </if>

            -   <if condition="<result/> starts with 'OTHER'">

                Generate a *new* proposal for the *same* <item/>,
                incorporating the user's free-text hint from <result/>
                after the "OTHER:" prefix. *Reassign* <description/>,
                <old-text/>, and <new-text/> to reflect this refined
                proposal (<old-text/> stays anchored to the existing text
                at <file/>:<line/>; <new-text/> and <description/> carry the
                refinement) so the subsequent rendering and any `Edit` use
                the new proposal rather than the original. Then *re-apply*
                the minimal-form normalization of substep 1 to the refined
                <old-text/> and <new-text/> (so the re-rendered diff again
                shows exactly the changed lines) and *go back* to substep 2
                of this `for`-iteration. There is *no* cap on
                refinement rounds - keep refining until the user picks
                `ACCEPT` or `REJECT`.

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
        ⧉ **ASE**: **REFINE RESULT**:

        | *#* | *Type* | *Location* | *Refinement* | *Status* |
        | --: | ------ | ---------- | ------------ | -------- |
        <rows/>
        </template>

        Hints:

        -   <rows/> has one row `| <index/> | **<type/>** | `<file/>`:<line/> | `<old-snippet/>` → `<new-snippet/>` | **<status/>** |` per problem of <problems/>, in order
        -   <old-snippet/> and <new-snippet/> are the single-line collapses of the normalized <old-text/> resp. <new-text/> of the problem (lines joined with ` ⏎ `, or `∅` when empty), each cut to at most 40 characters with a trailing `…`, with every `|` escaped as `\|`
        -   <status/> is the outcome of the problem in <outcomes/>

        </if>

    5.  You *MUST* *NOT* output any further additional explanations or
        summaries at the end of this skill processing, except for the
        result of substep 4 and the following final <template/>:

        <template>
        ⧉ **ASE**: **REFINE FINISHED**
        </template>

    6.  Finally, give the closing hint by expanding the following
        (which, depending on the configured <ase-guidance-level/>, may
        expand into nothing and hence emit no output at all):

        <if condition="<getopt-option-auto/> is not equal `true`">
        <ase-tpl-hint level="verbose">
        Use `/ase-docs-refine --auto` to apply all refinements unattended.
        </ase-tpl-hint>
        </if>

    </step>

</flow>

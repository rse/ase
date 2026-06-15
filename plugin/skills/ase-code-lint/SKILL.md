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

    First, use the following <template/> to give a hint on this step:

    <template>
    <ase-tpl-bullet-secondary/> **LINT INVESTIGATION**
    </template>

    Dispatch the investigation to a *sub-agent* via the `Agent`
    tool so that *no* investigation details leak into the user-visible
    transcript. The sub-agent performs the silent reading and checking;
    only its final structured return value is consumed here.

    For this, invoke *exactly once* the tool:

    ```text
        Agent(
            name:          "ase-code-lint",
            description:   "Lint Investigation",
            subagent_type: "ase:ase-code-lint",
            mode:          "plan",
            prompt:        <getopt-arguments/>
        )
    ```

    Parse the single result message of the `Agent` tool as a JSON array
    and set <problems/> to that list.

    Then *apply the severity floor* selected via <getopt-option-severity/>
    (default `LOW`): define the ordinal rank `LOW`=1, `MEDIUM`=2,
    `HIGH`=3. *Keep* a problem in <problems/> if and only if its
    `severity` field is `ACCEPTED` *or* `rank(severity)` is greater than
    or equal to `rank(<getopt-option-severity/>)`; *silently drop* all
    other problems. With the default floor `LOW`, all problems are kept.
    `ACCEPTED` problems are *never* dropped.

    You *MUST* *NOT* output anything else in this step 1.

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

    You *MUST* *NOT* output anything else in this step 2.

    </step>

3.  <step id="STEP 3: Correction">

    1.  *Mark this skill as the active edit-capable skill* so that the
        ASE `pre-tool-use` hook auto-approves the subsequent `Edit`
        invocations on *any* invocation path (slash command *or* `Skill`
        tool). Call the `ase_config_set(key: "agent.skill", val:
        "ase-code-lint", scope: "session:<ase-session-id/>")` tool
        from the `ase` MCP server. Do not output anything in this substep.

    2.  Iterate over all problems:

        <for items="<problems/>">

        1.  Set <aspect/>      to the `aspect`      field of <item/>.
            Set <severity/>    to the `severity`    field of <item/>.
            Set <description/> to the `description` field of <item/>.
            Set <change-set/>  to the `change-set`  field of <item/>.

        2.  Set <context></context> (set to empty).
            Set <diff></diff> (set to empty).

        3.  Iterate over the change set:

            <for items="<change-set/>">

            1.  Set <file/>         to the `file`         field of <item/>.
                Set <change-hunks/> to the `change-hunks` field of <item/>.

                Set <diff-file/> to the following <template/>:

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

                2.  Set <old-start/> to the line of the first hunk line, i.e.,
                    the line of <context-before/> (one before <line/>).
                    Set <new-start/> to the same as <old-start/> (the unchanged
                    <context-before/> line shares the same start in both files).
                    Set <old-count/> to the total number of old-side hunk lines, i.e.,
                    the number of lines in <context-before/>, <old-text/>, and
                    <context-after/> combined.
                    Set <new-count/> to the total number of new-side hunk lines, i.e.,
                    the number of lines in <context-before/>, <new-text/>, and
                    <context-after/> combined.

                3.  If <context/> is not empty, set
                    <context><context/>,</context> (append a comma).
                    Then append the following <template/> to <context/>:

                    <template>`<file/>`:<line/></template>

                4.  Append the following <template/> to <diff-file/>:

                    <template>
                    @@ -<old-start/>,<old-count/> +<new-start/>,<new-count/> @@
                     <context-before/>
                    -<old-text/>
                    +<new-text/>
                     <context-after/>
                    </template>

                </for>

            3.  Append <diff-file/> to <diff/>.

            </for>

        4.  Report the problem with the following <template/>:

            <template>
            <ase-tpl-bullet-signal/> **<aspect/> PROBLEM** (`<severity/>`): <context/>

            <description/>

            </template>

        5.  <if condition="<getopt-option-auto/> is not 'true'">

            Report the solution with the following <template/>:

            <template>
            <ase-tpl-bullet-normal/> **<aspect/> SOLUTION**:

            ```diff
            <diff/>
            ```

            </template>

            </if>
            <else>

            Report the solution with the following <template/>:

            <template>
            <ase-tpl-bullet-normal/> **<aspect/> SOLUTION**:

            *(corresponding change automatically applied)*

            </template>

            </else>

        6.  <if condition="<getopt-option-auto/> is not 'true'">

            In the following, you *MUST* *NOT* use the <user-dialog-tool/>
            tool! Instead, you *MUST* just show a custom output, let the
            user enter input, and then you set the result accordingly.

            <expand name="custom-dialog" arg1="--other">
                CORRECTION: How would you like to proceed with this proposed correction?
                ACCEPT: Apply the proposed correction.
                REJECT: Skip this proposed correction.
            </expand>

            </if>

            <else>

            Set <result>ACCEPT</result>.
            You *MUST* *NOT* output anything else in this step 6.

            </else>

        7.  Check <result/> and dispatch accordingly:

            -   <if condition="<result/> is 'ACCEPT'">
                Invoke the `Edit` tool to apply the changes exactly
                as shown in the <diff/>. The operation will be
                auto-approved by the ASE `pre-tool-use` hook (which
                tracks the active skill), so *no* interactive permission
                prompt will appear. After applying the changes, just
                continue with the next <item/>.
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


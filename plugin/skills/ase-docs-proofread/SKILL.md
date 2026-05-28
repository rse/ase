---
name: ase-docs-proofread
argument-hint: "[--help|-h] [--auto|-a] <docs-reference>"
description: >
    Analyze the documents for spelling, punctuation, or grammar errors.
    Use when the user wants to "proofread" or "spellcheck" a document.
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<skill name="ase-docs-proofread">
Analyze the documents for spelling, punctuation, or grammar errors.
</skill>

<expand name="getopt"
    arg1="ase-docs-proofread"
    arg2="--auto|-a">
    $ARGUMENTS
</expand>

<objective>
*Proofread* the documents of `<getopt-arguments/>` for problems in their
*spelling*, *punctuation*, or *grammar* and propose corrections.
</objective>

<flow>

1.  <step id="STEP 1: Investigation">

    First, use the following <template/> to give a hint on this step:

    <template>
    &#x26AA; **PROOFREADING INVESTIGATION**
    </template>

    Dispatch the investigation to a *sub-agent* via the `Agent`
    tool so that *no* investigation details leak into the user-visible
    transcript. The sub-agent performs the silent reading and checking;
    only its final structured return value is consumed here.

    For this, invoke *exactly once* the tool:

    ```text
        Agent(
            name:          "ase:ase-docs-proofread",
            description:   "Proofread Investigation",
            subagent_type: "ase:ase-docs-proofread",
            mode:          "plan",
            prompt:        <getopt-arguments/>
        )
    ```

    Parse the single result message of the `Agent` tool as a JSON array
    and set <problems/> to that list.

    You *MUST* *NOT* output anything at all in this step 1 beyond the
    single `Agent` tool invocation.
    </step>

2.  <step id="STEP 2: Summary">

    Use the following <template/> to give a summary of the detected
    problems in <problems/>:

    <template>
    &#x26AA; **PROOFREADING SUMMARY**:

    | *Proofread Type* | *Proofread Result*      |
    | ---------------- | ----------------------- |
    | **SPELLING**:    | **<n/>** problems found |
    | **PUNCTUATION**: | **<m/>** problems found |
    | **GRAMMAR**:     | **<k/>** problems found |

    </template>

    Hints:

    -   <n/> is the number of problems with `type` equal to `SPELLING`    in <problems/>
    -   <m/> is the number of problems with `type` equal to `PUNCTUATION` in <problems/>
    -   <k/> is the number of problems with `type` equal to `GRAMMAR`     in <problems/>

    </step>

3.  <step id="STEP 3: Correction">

    1.  You *MUST* call the MCP tool `ase_config_set(key: "agent.skill", val:
        "ase-docs-proofread", scope: "session:<ase-session-id/>")` of the
        `ase` MCP server.

    2.  Iterate over all problems:

        <for items="<problems/>">

        1.  Set <type/>           to the `type` field of <item/>.
            Set <file/>           to the `file` field of <item/>.
            Set <line/>           to the `line` field of <item/>.
            Set <description/>    to the `description` field of <item/>.
            Set <context-before/> to the `context_before` field of <item/>.
            Set <old-text/>       to the `old_text` field of <item/>.
            Set <new-text/>       to the `new_text` field of <item/>.
            Set <context-after/>  to the `context_after` field of <item/>.

        2.  Report the problem with the following <template/>:

            <template>
            &#x1F7E0; **<type/> PROBLEM**: `<file/>`:<line/>:

            <description/>
            </template>

        3.  <if condition="<getopt-option-auto/> is not 'true'">

            Render the proposed correction as a *unified diff* with *one*
            line of context in a fenced block based on the following <template/>:

            <template>

            &#x1F535; **<type/> CORRECTION**:

            ```diff
            --- <file/> (original)
            +++ <file/> (corrected)
            @@ -<line/>,<n/> +<line/>,<m/> @@
             <context-before/>
            -<old-text/>
            +<new-text/>
             <context-after/>
            ```

            </template>

            Hints:
            -   The <n/> is the number of lines in <old-text/>.
            -   The <m/> is the number of lines in <new-text/>.

            </if>

        4.  <if condition="<getopt-option-auto/> is not 'true'">

            Ask the user how to proceed via an interactive user dialog:

            <expand name="user-dialog">
                CORRECTION: How would you like to proceed with this proposed correction?
                ACCEPT: Apply the proposed correction.
                REJECT: Skip this proposed correction.
            </expand>

            </if>

            <if condition="<getopt-option-auto/> is 'true'">

            Set <result>ACCEPT</result>.

            </if>

        5.  Check <result/> and dispatch accordingly:

            -   <if condition="<result/> is 'ACCEPT'">

                Invoke the `Edit` tool to apply the change exactly as shown
                in the diff. The operation will be auto-approved because of
                the active proofread marker, so *no* interactive permission
                prompt will appear. Then continue with the next <item/>.

                </if>

            -   <if condition="<result/> starts with 'OTHER'">

                Generate a *new* proposal for the *same* <item/>,
                incorporating the user's free-text hint from <result/>
                after the "OTHER:" prefix, and loop back to substep 2 of
                this iteration. There is *no* cap on refinement rounds —
                keep refining until the user picks `ACCEPT` or `REJECT`.

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

    3.  You *MUST* call the MCP tool `ase_config_delete(key: "agent.skill",
        scope: "session:<ase-session-id/>")` of the `ase` MCP server.

    4.  You *MUST* *NOT* output any further additional explanations or
        summaries at the end of this skill processing, except for the
        following final <template/>:

        <template>
        &#x26AA; **PROOFREAD FINISHED**
        </template>

    </step>

</flow>


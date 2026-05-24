---
name: ase-docs-proofread
argument-hint: "<docs-reference>"
description: >
    Analyze the documents for spelling, punctuation, or grammar errors.
    Use when the user wants to "proofread" or "spellcheck" a document.
user-invocable: true
disable-model-invocation: false
effort: medium
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

Proofread Documentation
=======================

<skill name="ase-docs-proofread">
Analyze the documents for spelling, punctuation, or grammar errors.
</skill>

<expand name="getopt"
    arg1="ase-docs-proofread"
    arg2="--auto|-a">
    $ARGUMENTS
</expand>

<role>
Your role is an experienced, *expert-level proofreader*, specialized in
checking and correcting the *spelling*, *punctuation* and *grammar* of
documents.
</role>

<objective>
*Analyze* the documents of `<getopt-arguments/>` for problems in their
*spelling*, *punctuation*, or *grammar* and propose corrections.
</objective>

<flow>

1.  <step id="STEP 1: Investigation">

    First, use the following <template/> to give a hint on this step:

    <template>
    &#x26AA; **PROOFREADING INVESTIGATION**
    </template>

    Then dispatch the investigation to a *sub-agent* via the `Agent`
    tool so that *no* investigation details leak into the user-visible
    transcript. The sub-agent performs the silent reading and checking;
    only its final structured return value is consumed here.

    Invoke the `Agent` tool *exactly once* with:

    -   `subagent_type`: `general-purpose`
    -   `description`: `Proofread Investigation`
    -   `prompt`: a *self-contained* briefing, instructing the sub-agent to:

        1.  Use the `Read` tool to read all document files referenced
            by <getopt-arguments/>.

        2.  Check the contained texts *only* for the following problem
            types:

            - **Spelling**
            - **Punctuation**
            - **Grammar**

            Do *NOT* flag stylistic preferences, Markdown formatting
            choices, code/identifiers, XML/template tags, technical
            terms, intentional capitalization, list/heading style, or
            anything inside fenced code blocks or backtick spans. Be
            conservative — only report clear, objective errors.

            For each found problem:

            -   Set <type/> to the string `SPELLING`, `PUNCTUATION`, or
                `GRAMMAR`, indicating the problem type.

            -   Set <file/> to the *relative* filename path of the document.
                Set <line/> to the numeric 1-based line number in the
                document.

            -   Set <old-text/> to the lines of the old text which
                should be changed. Set <new-text/> to the lines of the
                new text which will be changed.

            -   Set <description/> to an ultra-brief and concise
                Markdown-formatted description of the problem with
                a hint of what is wrong and why it is wrong. In
                this description, mark up all referenced verbatim
                words <words/> from <old-text/> or <new-text/> as
                quoted strings containing monospaced text with
                Markdown based on the following <template/>:
                <template>"`<words/>`"</template>.

            -   Set <context-before/> to exactly *up to two* lines of
                *unchanged* text context which occurs in the document
                directly *before* <old-text/>, i.e., the lines (<line/> -
                2) and (<line/> - 1). Reduce to just one line (<line/> -
                1) if <old-text/> is the second line of the document. Set
                <context-before/> to empty if <old-text/> is the first line in
                the document.

            -   Set <context-after/> to exactly *up to two* lines of
                *unchanged* text content which occurs in the document
                directly *after* <old-text/> the lines (<line/> + <n/> + 1)
                and (<line/> + <n/> + 2), where <n/> is the number of lines
                in <old-text/>. Reduce to just one line (<line/> + <n/> + 1)
                if <old-text/> is the second-last line of the document. Set
                <context-after/> to empty if <old-text/> is the last line in
                the document.

        3.  Return *exclusively* a single fenced JSON block (no prose,
            no preamble, no summary) of the following shape:

            ```json
            [
                {
                    "type":           <type/>,
                    "file":           <file/>,
                    "line":           <line/>,
                    "description":    <description/>,
                    "context_before": <context-before/>,
                    "old_text":       <old-text/>,
                    "new_text":       <new-text/>,
                    "context_after":  <context-after/>
                },
                [...]
            ]
            ```

        4.  You *MUST* *NOT* propose, apply, or render any document
            changes itself.

    Parse the JSON array from the sub-agent's return value and set
    <problems/> to that list.

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

    1.  You *MUST* activate the auto-approve gate for the `Edit` tool
        by setting the session-scoped `agent.skill` configuration value to
        this skill's name via the call `config_set(key: "agent.skill", val:
        "ase-docs-proofread", scope: "session:<ase-session-id/>")` MCP tool
        of the `ase` service.

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
                REFINE: Discard this proposed correction and generate a new one.
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

            -   <if condition="
                    <result/> starts with 'REFINE' or
                    <result/> starts with 'OTHER'
                ">

                Generate a *new* proposal for the *same* <item/>
                (incorporating the user's free-text hint from <result/> if
                provided via the "OTHER" prefix) and loop back to substep 2
                of this iteration. There is *no* cap on refinement rounds —
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

    3.  After the iteration has finished, you *MUST* clear the auto-approve
        gate via the call `config_delete(key: "agent.skill", scope:
        "session:<ase-session-id/>")` to the MCP tool of the `ase` service.

    4.  You *MUST* *NOT* output any further additional explanations or
        summaries at the end of this skill processing.

    </step>

</flow>


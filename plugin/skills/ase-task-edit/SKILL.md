---
name: ase-task-edit
argument-hint: "[<id> | <id>: <instruction> | <instruction>]"
description: >
    Iteratively craft and refine a named plan for a task through
    a conversational loop, without using the agent harness *Plan
    Mode*. Each round, the current plan is shown and the user is asked
    whether to keep refining, mark the plan as done, or proceed to the
    implementation or preflight. Use when the user wants to plan a task
    purely through chat-driven refinement.
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Iteratively Edit a Task Plan
============================

Your role is an experienced, *expert-level assistant*,
specialized in the *planning* of changes
through *iterative conversational refinement*.

Establish and refine the *task plan* purely through a *chat-driven loop*,
*without* entering the *Plan Mode* of the agent harness. The user steers
each round via dialog, based on the `AskUserQuestion` tool, that offers
continued refinement, finalization, or hand-off to implementation or
preflight.

@${CLAUDE_SKILL_DIR}/../../meta/ase-plan.md

Procedure
---------

You *MUST* follow the following numbered items *strictly* *sequentially*!
You *MUST* not skip any numbered item during processing!

You *MUST* *NOT* output anything in this entire procedure, *except* when
explicitly requested by this procedure via outputs based on a <template/>!

1.  **Determine Task and Instruction:**

    1.  Set <instruction>$ARGUMENTS</instruction> initially.
        Inherit the always existing <ase-task-id/> from the current context.
        Do not output anything.

    2.  React on task and/or instruction:

        1.  <if condition="
                <instruction/> matches the regexp `^[a-zA-Z][a-zA-Z0-9_-]*$`
            ">
            Set <ase-task-id><instruction/></ase-task-id> (set task
            id to instruction) and <instruction></instruction> (set
            instruction empty), call the `task_id(id: <ase-task-id/>,
            session: <ase-session-id/>)` tool from the `ase` MCP
            service to switch the task, and then only output the
            following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
            </template>
            </if>

        2.  else <if condition="
                <instruction/> has the format `<id/>: <text/>` where
                <id/> matches the regexp `^[a-zA-Z][a-zA-Z0-9_-]*$` and
                <text/> is *empty*
            ">
            Set <instruction></instruction> (set instruction to empty)
            and <ase-task-id><id/></ase-task-id> (set task id to
            id) and call the `task_id(id: <ase-task-id/>, session:
            <ase-session-id/>)` tool from the `ase` MCP service to
            switch the task, and then only output the following
            <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
            </template>
            </if>

        3.  else <if condition="
                <instruction/> has the format `<id/>: <text/>` where
                <id/> matches the regexp `^[a-zA-Z][a-zA-Z0-9_-]*$` and
                <text/> is *not empty*
            ">
            Set <instruction><text/></instruction> (set instruction to
            text) and <ase-task-id><id/></ase-task-id> (set task id
            to id) and call the `task_id(id: <ase-task-id/>, session:
            <ase-session-id/>)` tool from the `ase` MCP service to
            switch the task, and then only output the following
            <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
            </template>
            </if>

        4.  else <if condition="
                <instruction/> is not empty
            ">
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task inherited**
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
            </template>
            </if>

        5.  else <if condition="
                <instruction/> is empty
            ">
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task inherited**
            </template>
            </if>

2.  **Determine Plan:**

    1.  Call the `task_load(id: <ase-task-id/>)` tool of the `ase` MCP
        service to load any existing plan content and set <text/> to
        the `text` output field of this `task_load` tool call.
        Do not output anything related to this MCP tool call.
        Set <content-dirty>false</content-dirty>.

        -   If <text/> starts with `ERROR:`:
            Silently ignore the MCP error.
            Set <content/> to empty.
            Set <words/> to "0".
            Do not output anything.

        -   If <text/> starts NOT with `ERROR:`:
            Set <content><text/></content> (set content to text).
            Calculate the number of words <words/> of <content/>.
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan loaded**
            </template>

    2.  <if condition="<content/> is empty AND <instruction/> is empty">
        Ask the user interactively, without a special tool, for the
        initial plan content with a single question:

        `**No plan content yet. What is the task you want to plan?**`

        Then set <instruction/> to the response of the user and only
        output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
        </template>
        </if>

    3.  <if condition="<content/> is not empty AND
            <instruction/> is not empty AND
            <instruction/> is not equal <content/>">
        Let the *user interactively choose*, with the help of the
        `AskUserQuestion` tool, what to do as the next step. For this,
        call:

        `AskUserQuestion({
            questions: [
                {
                    header: "Previous Plan Content",
                    question: "Should the previous plan content be overwritten, refined, or preserved?",
                    multiSelect: false,
                    options: [
                        { label: "OVERWRITE", description: "Continue operation, overwrite previous plan." },
                        { label: "REFINE",    description: "Continue operation, refine previous plan." },
                        { label: "PRESERVE",  description: "Cancel operation, preserve previous plan." }
                    ]
                }
            ]
        })`

        Check the tool result and dispatch accordingly:

        -   If the tool result contains the `user doesn't want to
            proceed`, `tool use was rejected`, `user declined to answer
            questions`, or is
            `"Should the previous plan content be overwritten, refined, or preserved?"="PRESERVE"`:

            Only output the following <template/> and then immediately
            *STOP* processing this skill:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan preserved**
            </template>

        -   If the tool result is
            `"Should the previous plan content be overwritten, refined, or preserved?"="OVERWRITE"`:

            Create a new plan from scratch and store the result as
            <content/> by closely following the defined plan format
            <format/> and injecting into it all the information from
            the <instruction/> and all decisions you derived from the
            <instruction/>.

            Call the `timestamp(format: "yyyy-LL-dd HH:mm")` tool of the
            `ase` MCP service and use the `text` field of its response
            for fresh <timestamp-created/> and <timestamp-modified/>
            information. Then insert the current <ase-task-id/>,
            <timestamp-created/>, and <timestamp-modified/> information
            and calculate the number of words <words/> of <content/>.
            Set <content-dirty>true</content-dirty>.

            Only output the following <template/> and continue processing:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan overwritten**
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
            </template>

        -   If the tool result is
            `"Should the previous plan content be overwritten, refined, or preserved?"="REFINE"`:

            Treat the <instruction/> as a *refinement instruction* for
            the plan, and update <content/> in-place by *applying* the
            requested <instruction/> to the *plan*. When refining the
            plan this way, preserve the overall structure of the plan
            and only modify what the user actually requested. Do *not*
            rewrite unrelated sections of the plan.

            Calculate the number of words <words/> of <content/>.
            Set <content-dirty>true</content-dirty>.

            Only output the following <template/> and continue processing:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan refined**
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
            </template>
        </if>

    4.  <if condition="<content/> does not contain '# ✪ TASK PLAN:' AND <instruction/> is empty">
        Set <instruction><content/></instruction> (set instruction to content).
        Set <content></content> (set content to empty).
        Set <content-dirty>true</content-dirty>.
        Do not output anything.
        </if>

    5.  <if condition="<content/> is empty AND <instruction/> is not empty">
        Create a new plan from scratch and store the result as
        <content/> by closely following the defined plan format
        <format/> and injecting into it all the information from
        the <instruction/> and all decisions you derived from the
        <instruction/>.

        Call the `timestamp(format: "yyyy-LL-dd HH:mm")` tool of the
        `ase` MCP service and use the `text` field of its response
        for fresh <timestamp-created/> and <timestamp-modified/>
        information. Then insert the current <ase-task-id/>,
        <timestamp-created/>, and <timestamp-modified/> information
        and calculate the number of words <words/> of <content/>.
        Set <content-dirty>true</content-dirty>.

        Only output the following <template/> and continue processing:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan generated**
        </template>
        </if>

3.  **Iterative Plan Refinement Loop:**

    *REPEAT* the following steps 3.1 to 3.4 in a *LOOP* until
    the user selects `DONE`, `IMPLEMENT`, or `PREFLIGHT`, or
    declines/cancels in the dialog of step 3.4:

    1.  *Update timestamp*:
        <if condition="<content/> contains '✎ modified:' AND <content-dirty/> is 'true'">
        Set update <timestamp-modified/> with the current time in
        ISO-style format, which has to be determined by calling the
        `timestamp(format: "yyyy-LL-dd HH:mm")` tool of the `ase`
        MCP service and use the `text` field of its response. Update
        <content/> with the new `✎ modified: **<timestamp-modified/>**`.
        Do not output anything.
        </if>

    2.  *Persist plan*:
        <if condition="<content-dirty/> is 'true'">
        Call the `task_save(id: <ase-task-id/>, text: <content/>)` tool
        of the `ase` MCP service to persist the current plan, and then
        set <content-dirty>false</content-dirty> again. Calculate the
        number of words <words/> of <content/>. Do not output anything
        related to this MCP tool call except the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan saved**
        </template>
        </if>

    3.  *Render plan*: Only output the following <template/>, so the user
        can read the plan and react to it. Do *not* truncate, summarize,
        or partially show the plan -- always show the complete plan
        <content/> here:.

        <template>
        ⧉ **ASE**: ┈┈┈┈┈┈┈┈────────━━━━━━━━**(** `TASK-PLAN-BEGIN` **)**━━━━━━━━────────┈┈┈┈┈┈┈┈
        <content/>
        ⧉ **ASE**: ┈┈┈┈┈┈┈┈────────━━━━━━━━**(**  `TASK-PLAN-END`  **)**━━━━━━━━────────┈┈┈┈┈┈┈┈
        </template>

    4.  *Ask user*: Let the *user interactively choose*, with the help of
        the `AskUserQuestion` tool, what to do as the next step. For this,
        call:

        `AskUserQuestion({
            questions: [
                {
                    header: "Next Step",
                    question: "How would you like to proceed with the plan?",
                    multiSelect: false,
                    options: [
                        {
                            label: "DONE",
                            description: "Mark plan finalized, exit planning loop."
                        },
                        {
                            label: "IMPLEMENT",
                            description: "Hand off plan to implementation."
                        },
                        {
                            label: "PREFLIGHT",
                            description: "Hand off plan to pre-flighting."
                        },
                        {
                            label: "REFINE",
                            description: "Further refine plan with instructions in main context, or use options to refine via inline prompting or in chat sub-context."
                        }
                    ]
                }
            ]
        })`

        Check the tool result and dispatch accordingly:

        -   If the user selected `DONE`:

            *Break* out of the *loop*, only output the following <template/>
            and then *STOP*. Do *not* implement the plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan finalized -- done**
            </template>

        -   If the user selected `IMPLEMENT`:

            *Break* out of the *loop*, only output the following
            <template/> and then use the `Skill` tool to invoke the
            `ase:ase-task-implement` skill in order to *apply* the finalized
            plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan finalized -- hand-off to implementation**
            </template>

        -   If the user selected `PREFLIGHT`:

            *Break* out of the *loop*, only output the following
            <template/> and then use the `Skill` tool to invoke the
            `ase:ase-task-preflight` skill in order to *apply* the finalized
            plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan finalized -- hand-off to pre-flight**
            </template>

        -   If the user selected `REFINE`:

            Ask the user interactively, without a special tool, for
            the refinement instruction with a single question `**What
            is your instruction for refining the plan?**`. Then set
            <instruction/> to the response of the user.

            Treat the <instruction/> as a *refinement instruction* for
            the plan, and update <content/> in-place by *applying* the
            requested <instruction/> to the *plan*. When refining the
            plan this way, preserve the overall structure of the plan
            and only modify what the user actually requested. Do *not*
            rewrite unrelated sections of the plan.
            Set <content-dirty>true</content-dirty>.

            Finally, only output the following <template/> and then
            *continue* the *loop* at step **3.1**!

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **plan refined**
            </template>

        -   If the user selected "Other", *or* responded outside the
            dialog with a free-form refinement instruction:

            Set <instruction/> to the response of the user.

            Treat the <instruction/> as a *refinement instruction* for
            the plan, and update <content/> in-place by *applying* the
            requested <instruction/> to the *plan*. When refining the
            plan this way, preserve the overall structure of the plan
            and only modify what the user actually requested. Do *not*
            rewrite unrelated sections of the plan.
            Set <content-dirty>true</content-dirty>.

            Finally, only output the following <template/> and then
            *continue* the *loop* at step **3.1**!

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **plan refined**
            </template>

        -   If the tool result contains `User doesn't want to proceed`,
            `Tool use was rejected`, or `User declined to answer
            question`, or in case of *any other response* still *not*
            covered by the previous cases:

            *Break* out of the *loop*, only output the following <template/>
            and then *STOP*. Do *not* implement the plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan refinement cancelled**
            </template>

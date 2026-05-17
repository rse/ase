---
name: ase-task-implement
argument-hint: "[<id>]"
description: >
    Implement current or given task plan.
    Use when the user calls to "implement", "realize" or "apply" the
    "task", "plan", "spec", or "specification".
user-invocable: true
disable-model-invocation: false
effort: xhigh
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Implement a Task Plan
=====================

Your role is an experienced, *expert-level assistant*,
specialized in the *implementation* of changes.

*Implement* the task plan by modifying the *artifacts*
with a corresponding, complete *change set*.

Procedure
---------

You *MUST* follow the following numbered items *strictly* *sequentially*!
You *MUST* not skip any numbered item during processing!

You *MUST* *NOT* output anything in this entire procedure, *except* when
explicitly requested by this procedure via outputs based on a <template/>!

1.  **Determine Task:**

    1.  Set <instruction>$ARGUMENTS</instruction> initially.
        Inherit the always existing <ase-task-id/> from the current context.
        Inherit the always existing <ase-session-id/> from the current context.
        Do not output anything.

    2.  React on task id:

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

2.  **Determine Operation**:

    1.  Call the `task_load(id: <ase-task-id/>)` tool of the `ase` MCP
        service to load the current task plan content and set <content/> to
        the `text` output field of the `task_load` tool call.

        Calculate the number of words <words/> of <content/>.

        Only output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan loaded**
        </template>

    2.  If the <content/> is still empty, complain and tell the user to
        use the `ase-code-resolve`, `ase-code-refactor`, `ase-code-craft`,
        or `ase-task-edit` skills first to create a task plan.

3.  **Create Implementation:**

    1.  Perform a *final implementation* of the task plan
        by modifying the *artifacts* with a corresponding, complete
        *change set*.

        For this, primarily follow and honor the task plan in <content/>.

        Secondarily, derive hints from the optionally existing
        `IMPLEMENTATION DRAFT` section (from skill `ase-task-preflight`)
        in <content/>. But the specification text in <content/> always
        overrules the implementation draft in the `IMPLEMENTATION DRAFT`
        section of <content/>.

    2.  Only output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan implemented**
        </template>

4.  **Decide Next Step:**

    1.  *Ask user*: Let the *user interactively choose*, with the help of
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
                            description: "Stop processing and preserve the task plan."
                        },
                        {
                            label: "DELETE",
                            description: "Stop processing and delete the task plan."
                        }
                    ]
                }
            ]
        })`

    2.  Check the tool result and dispatch accordingly:

        -   If the user selected `DONE`:
            Only output the following <template/> and then *STOP*.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan implemented -- done**
            </template>

        -   If the user selected `DELETE`:
            Only output the following <template/> and then use the
            `Skill` tool to invoke the `ase:ase-task-delete` skill in
            order to *implement* the updated plan. Immediately stop
            processing the current skill once the `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan implemented -- hand-off to delete task**
            </template>

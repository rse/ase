---
name: ase-task-reboot
argument-hint: "[<id>]"
description: >
    Reboot the current or given task plan by crafting it from scratch.
    Use when the user calls to "reboot", "recreate" or "refresh"
    the "task", "plan", "spec", or "specification".
user-invocable: true
disable-model-invocation: false
effort: xhigh
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Reboot a Task Plan
==================

Your role is an experienced, *expert-level assistant*,
specialized in the *planning* of changes.

*Reboot* the task plan by crafting it from scratch,
based on the existing *WHAT* and *WHY*.

@${CLAUDE_SKILL_DIR}/../../meta/ase-plan.md

Procedure
---------

You *MUST* follow the following numbered items *strictly* *sequentially*!
You *MUST* not skip any numbered item during processing!

You *MUST* *NOT* output anything in this entire procedure, *except* when
explicitly requested by this procedure via outputs based on a <template/>!

1.  **Determine Task:**

    1.  Set <instruction>$ARGUMENTS</instruction> initially.
        Inherit the always existing <ase-task-id/> from the current context.
        Do not output anything.

    2.  React on task id:

        <if condition="
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

2.  **Determine Operation:**

    1.  Call the `task_load(id: <ase-task-id/>)` tool of the `ase` MCP
        service to load the current task plan content and set <content/> to
        the `text` output field of the `task_load` tool call.

        Calculate the number of words <words/> of <content/>.

        Only output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan loaded**
        </template>

    2.  <if condition="<content/> is empty">
        Complain and tell the user to use the `ase-code-resolve`,
        `ase-code-refactor`, `ase-code-craft`, or `ase-task-edit` skills
        first to create a task plan. Then immediately stop processing
        this skill.
        </if>

3.  **Reboot Task Plan:**

    1.  Start with <instruction></instruction> (set instruction to empty).

    2.  <if condition="<content/> contains neither '- **WHAT**:' nor '- **WHY**:'">
        Set <instruction><content/></instruction> (set instruction to content).
        </if>

    3.  <if condition="<content/> contains '- **WHAT**: <text/>'">
        Set <instruction><text/></instruction> (set instruction to extracted text).
        </if>

    4.  <if condition="<content/> contains '- **WHY**: <text/>'">
        Set <instruction><instruction/>, BECAUSE <text/></instruction>
        (append extracted text to instruction).
        </if>

    5.  <if condition="<content/> contains 'created: **<text/>**'">
        Set <timestamp-created><text/></timestamp-created> (set
        timestamp-created to extracted text)
        </if>

    6.  Create a new plan from scratch and store the result as
        <content/> by closely following the defined plan format
        <format/> and injecting into it all the information from
        the <instruction/> and all decisions you derived from the
        <instruction/>.

    7.  Call the `timestamp(format: "yyyy-LL-dd HH:mm")` tool of the
        `ase` MCP service and use the `text` field of its response for
        <timestamp-modified/> information. Then insert the current
        <ase-task-id/>, previous <timestamp-created/>, and refreshed
        <timestamp-modified/> information and calculate the number of
        words <words/> of <content/>.

    8.  Call the `task_save(id: <ase-task-id/>,
        text: <content/>)` of the `ase` MCP service to save the updated
        task plan content. Do not output anything related to this MCP
        tcall.

    9.  Only output the following <template/> and continue processing:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan rebooted**
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
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
                            description: "Stop processing."
                        },
                        {
                            label: "EDIT",
                            description: "Hand processing off to the editing."
                        }
                    ]
                }
            ]
        })`

    2.  Check the tool result and dispatch accordingly:

        -   If the user selected `DONE`:
            Only output the following <template/> and then *STOP*.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan rebooted -- done**
            </template>

        -   If the user selected `EDIT`:
            Only output the following <template/> and then use the
            `Skill` tool to invoke the `ase:ase-task-edit` skill
            in order to *edit* the updated plan. Immediately stop
            processing the current skill once the `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan rebooted -- hand-off to edit**
            </template>

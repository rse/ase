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

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

Implement a Task Plan
=====================

<skill name="ase-task-implement">
Implement a Task Plan
</skill>

<expand name="getopt"
    arg1="ase-task-implement"
    arg2="--next|-n=(none|DONE|DELETE)">
    $ARGUMENTS
</expand>

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

    1.  Set <instruction><getopt-arguments/></instruction> initially.
        Inherit the always existing <ase-task-id/> from the current context.
        Inherit the always existing <ase-session-id/> from the current context.
        Do not output anything.

    2.  React on task id:

        1.  <if condition="
                <instruction/> matches the regexp `^[a-zA-Z][a-zA-Z0-9_-]*$`
            ">
            Set <ase-task-id><instruction/></ase-task-id> (set task
            id to instruction) and <instruction></instruction> (set
            instruction empty), call the `ase_task_id(id: <ase-task-id/>,
            session: <ase-session-id/>)` tool from the `ase` MCP
            server to switch the task, and then only output the
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
            id) and call the `ase_task_id(id: <ase-task-id/>, session:
            <ase-session-id/>)` tool from the `ase` MCP server to
            switch the task, and then only output the following
            <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
            </template>
            </if>

2.  **Determine Operation**:

    1.  Call the `ase_task_load(id: <ase-task-id/>)` tool of the `ase` MCP
        server to load the current task plan content and set <content/> to
        the `text` output field of the `ase_task_load` tool call.

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

    1.  *Determine next step*:

        -   If <getopt-option-next/> matches the regex `^(DONE|DELETE)$`:
            Honor the pre-selection what to do as the next step.
            Set <result><getopt-option-next/></result>.

        -   If <getopt-option-next/> is equal to `none`:
            Let the *user interactively choose* what to do as the next step.

            <expand name="user-dialog">
                Next Step: How would you like to proceed with the plan?
                DONE: Stop processing and PRESERVE task plan.
                DELETE: Stop processing and DELETE the task plan.
            </expand>

    2.  Check the tool <result/> and dispatch accordingly:

        -   If <result/> is `DONE` or `CANCEL`:
            Only output the following <template/> and then *STOP*.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan implemented -- done**
            </template>

        -   If <result/> is `DELETE`:
            Only output the following <template/> and then call the
            tool `Skill(skill: "ase:ase-task-delete")` to invoke the
            `ase:ase-task-delete` skill in order to *delete* the updated
            plan. Immediately stop processing the current skill once the
            `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan implemented -- hand-off to delete task**
            </template>


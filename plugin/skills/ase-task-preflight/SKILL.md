---
name: ase-task-preflight
argument-hint: "[<id>]"
description: >
    Preflight the implementation of current or given task plan.
    Use when the user calls to "preflight", "dry-run" or "test-drive"
    the "task", "plan", "spec", or "specification".
user-invocable: true
disable-model-invocation: false
effort: xhigh
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md

Preflight a Task Plan
=====================

<skill name="ase-task-preflight">
Preflight a Task Plan
</skill>

Your role is an experienced, *expert-level assistant*,
specialized in the *implementation* of changes.

*Preflight* the implementation of a task plan by creating a draft
for a corresponding, *complete source code change set*.

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

2.  **Determine Operation:**

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

3.  **Create Implementation Draft:**

    1.  Perform a *preflight* of the *implementation* of <content/> by creating a
        draft for a corresponding, *complete artifact change set*
        which *would* fully implement the task plan <content/>. Store
        this artifact change set in *unified diff* format in <unified-diff/>.

    2.  Append this artifact change set <unified-diff/> to the end
        of the <content/> with the following <template/>. If a section
        named `## ※ IMPLEMENTATION DRAFT:` already exists from a
        previous run of this skill, *replace* this entire existing
        section.

        <template>

        ## ※ IMPLEMENTATION DRAFT:

        ```
        <unified-diff/>
        ```

        </template>

    3.  <if condition="<content/> contains '✎ modified:'">
        Set update <timestamp-modified/> with the current time in
        ISO-style format, which has to be determined by calling the
        `timestamp(format: "yyyy-LL-dd HH:mm")` tool of the `ase`
        MCP service and use the `text` field of its response. Update
        <content/> with the new `✎ modified: **<timestamp-modified/>**`.
        Do not output anything.
        </if>

    4.  Finally, call the `task_save(id: <ase-task-id/>,
        text: <content/>)` of the `ase` MCP service to save the updated
        task plan content. Calculate the number of words <words/> of
        <content/>. Do not output anything related to this MCP tool call
        except the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan updated**
        </template>

4.  **Decide Next Step:**

    1.  *Ask user*: Let the *user interactively choose*
        what to do as the next step.

        <expand name="user-dialog>
        Next Step: How would you like to proceed with the plan?
        DONE: Stop processing.
        EDIT: Hand processing off to editing.
        IMPLEMENT: Hand processing off to implementation.
        </expand>

    2.  Check the tool <result/> and dispatch accordingly:

        -   If <result/> is `DONE` or `CANCEL`:
            Only output the following <template/> and then *STOP*.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan updated -- done**
            </template>

        -   If <result/> is `EDIT`:
            Only output the following <template/> and then use the
            `Skill` tool to invoke the `ase:ase-task-edit` skill
            in order to *edit* the updated plan. Immediately stop
            processing the current skill once the `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan updated -- hand-off to edit**
            </template>

        -   If <result/> is `IMPLEMENT`:
            Only output the following <template/> and then use the
            `Skill` tool to invoke the `ase:ase-task-implement` skill
            in order to *implement* the updated plan. Immediately stop
            processing the current skill once the `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan updated -- hand-off to implement**
            </template>



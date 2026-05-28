---
name: ase-task-reboot
argument-hint: "[--next|-n=<option>] [<id>]"
description: >
    Reboot the current or given task plan by re-creating it from scratch.
    Use when the user calls to "reboot", "recreate" or "refresh"
    the "task", "plan", "spec", or "specification".
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<skill name="ase-task-reboot">
Reboot a Task Plan
</skill>

<expand name="getopt"
    arg1="ase-task-reboot"
    arg2="--next|-n=(none|DONE|EDIT)">
    $ARGUMENTS
</expand>

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
            instruction empty), call the `ase_task_id(id: "<ase-task-id/>",
            session: "<ase-session-id/>")` tool from the `ase` MCP
            server to switch the task, and then only output the
            following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
            </template>
            </if>

        2.  else <if condition="<instruction/> is NOT empty">
            The argument is neither empty nor a valid task id. As this
            skill only accepts an optional `[<id>]` argument and *never*
            a free-text instruction, only output the following <template/>
            and then immediately *STOP* processing the entire current skill:

            <template>
            ⧉ **ASE**: ☻ skill: **ase-task-reboot**, ▶ ERROR: expected single `[<id>]` argument
            </template>
            </if>

2.  **Determine Operation:**

    1.  Call the `ase_task_load(id: "<ase-task-id/>")` tool of the `ase` MCP
        server to load the current task plan content and set <text/> to
        the `text` output field of the `ase_task_load` tool call.

        -   If <text/> starts with `ERROR:` or `WARNING:`:
            Set <content></content> (set content to empty).
            Set <words/> to "0".

        -   If <text/> starts NOT with `ERROR:` and NOT with `WARNING:`:
            Set <content><text/></content> (set content to text).
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

    4.  <if condition="<content/> contains '- **WHY**: <text/>' and <instruction/> is empty">
        Set <instruction><text/></instruction> (set instruction to extracted text).
        </if>

    5.  else <if condition="<content/> contains '- **WHY**: <text/>' and <instruction/> is NOT empty">
        Set <instruction><instruction/>, BECAUSE <text/></instruction>
        (append extracted text to instruction).
        </if>

    6.  <if condition="<content/> contains 'created: **<text/>**'">
        Set <timestamp-created><text/></timestamp-created> (set
        timestamp-created to extracted text)
        </if>

    7.  Create a new plan from scratch and store the result as
        <content/> by closely following the defined plan format
        <format/> and injecting into it all the information from
        the <instruction/> and all decisions you derived from the
        <instruction/>.

    8.  Call the `ase_timestamp(format: "yyyy-LL-dd HH:mm")` tool of the
        `ase` MCP server and use the `text` field of its response for
        <timestamp-modified/> information. Then insert the current
        <ase-task-id/>, previous <timestamp-created/>, and refreshed
        <timestamp-modified/> information and calculate the number of
        words <words/> of <content/>.

    9.  Call the `ase_task_save(id: "<ase-task-id/>",
        text: "<content/>")` of the `ase` MCP server to save the updated
        task plan content. Do not output anything related to this MCP
        call.

    10. Only output the following <template/> and continue processing:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan rebooted**
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
        </template>

4.  **Decide Next Step:**

    1.  *Determine next step*:

        -   If <getopt-option-next/> matches the regex `^(DONE|EDIT)$`:
            Honor the pre-selection what to do as the next step.
            Set <result><getopt-option-next/></result>.

        -   If <getopt-option-next/> is equal to `none`:
            Let the *user interactively choose* what to do as the next step.

            <expand name="user-dialog">
                Next Step: How would you like to proceed with the plan?
                DONE: Stop processing.
                EDIT: Hand processing off to editing.
            </expand>

    2.  Check the tool <result/> and dispatch accordingly:

        -   If <result/> is `DONE` or `CANCEL`:
            Only output the following <template/> and then *STOP*.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan updated -- done**
            </template>

        -   If <result/> is `EDIT`:
            Only output the following <template/> and then call the
            tool `Skill(skill: "ase:ase-task-edit")` to invoke the
            `ase:ase-task-edit` skill in order to *edit* the updated
            plan. Immediately stop processing the current skill once the
            `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan updated -- hand-off to edit**
            </template>


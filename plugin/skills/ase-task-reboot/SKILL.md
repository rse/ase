---
name: ase-task-reboot
argument-hint: "[--help|-h] [--next|-n <option>[,...]] [<id>]"
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
    arg2="--next|-n=(none|DONE|EDIT|IMPLEMENT|PREFLIGHT)...">
    $ARGUMENTS
</expand>

<objective>
*Reboot* the task plan by crafting it from scratch,
based on the existing *WHAT* and *WHY*.
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-format-task.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-common-task.md

Procedure
---------

1.  **Determine Task:**

    1.  Set <instruction><getopt-arguments/></instruction> initially, with any
        leading and trailing whitespace stripped.
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

        2.  <elseif condition="<instruction/> is NOT empty">
            The argument is neither empty nor a valid task id. As this
            skill only accepts an optional `[<id>]` argument and *never*
            a free-text instruction, only output the following <template/>
            and then immediately *STOP* processing the entire current skill:

            <template>
            ⧉ **ASE**: ☻ skill: **ase-task-reboot**, ▶ ERROR: expected single `[<id>]` argument
            </template>
            </elseif>

2.  **Determine Operation:**

    1.  Call the `ase_task_load(id: "<ase-task-id/>")` tool of the `ase` MCP
        server to load the current task plan content and set <text/> to
        the `text` output field of the `ase_task_load` tool call.

        -   If <text/> starts with `ERROR:` or `WARNING:`:
            Set <task-content></task-content> (set task content to empty).
            Set <words/> to "0".

        -   If <text/> starts NOT with `ERROR:` and NOT with `WARNING:`:
            Set <task-content><text/></task-content> (set task content to text).
            Calculate the number of words <words/> of <task-content/>.

        Only output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan loaded**
        </template>

    2.  <if condition="<task-content/> is empty">
        Complain and tell the user to use the `ase-code-resolve`,
        `ase-code-refactor`, `ase-code-craft`, or `ase-task-edit` skills
        first to create a task plan. Then immediately stop processing
        this skill.
        </if>

3.  **Reboot Task Plan:**

    1.  Start with <instruction></instruction> (set instruction to empty).

    2.  <if condition="<task-content/> contains neither '-   **WHAT**:' nor '-   **WHY**:'">
        Set <instruction><task-content/></instruction> (set instruction to task content).
        </if>

    3.  <if condition="<task-content/> contains '-   **WHAT**: <text/>'">
        Set <instruction><text/></instruction> (set instruction to extracted text).
        </if>

    4.  <if condition="<task-content/> contains '-   **WHY**: <text/>' and <instruction/> is empty">
        Set <instruction><text/></instruction> (set instruction to extracted text).
        </if>

    5.  <if condition="<task-content/> contains '-   **WHY**: <text/>' and <instruction/> is NOT empty">
        Set <instruction><instruction/>, BECAUSE <text/></instruction>
        (append extracted text to instruction).
        </if>

    6.  <if condition="<task-content/> contains '⎈   Created:  <text/>'">
        Set <timestamp-created><text/></timestamp-created> (set
        timestamp-created to extracted text)
        </if>

    7.  <if condition="<instruction/> is empty or contains only whitespace">
        The WHAT/WHY extraction yielded no usable text (e.g. a
        `-   **WHAT**:` line existed but captured empty text, so the
        whole-content fallback above did not fire). Fall back to the
        full previous plan content: set <instruction><task-content/></instruction>
        (set instruction to task content).
        <if condition="<instruction/> is still empty or contains only whitespace">
            There is nothing to reboot from. Only output the following
            <template/> and then immediately *STOP* processing the entire
            current skill:

            <template>
            ⧉ **ASE**: ☻ skill: **ase-task-reboot**, ▶ ERROR: empty instruction -- nothing to reboot from
            </template>
        </if>
        </if>

    8.  Create a new plan from scratch and store the result as
        <task-content/> by closely following the defined plan format
        <format/> and injecting into it all the information from
        the <instruction/> and all decisions you derived from the
        <instruction/>.

    9.  <expand name="task-save-content" arg1="plan rebooted"></expand>

    10. Only output the following <template/> and continue processing:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
        </template>

4.  **Decide Next Step:**

    1.  *Determine next step*:

        <expand name="task-next-select"
            arg1="ase-task-reboot"
            arg2="DONE|EDIT|IMPLEMENT|PREFLIGHT">
            Next Step: How would you like to proceed with the plan?
            DONE: Stop processing.
            EDIT: Hand off plan to editing.
            IMPLEMENT: Hand off plan to implementation.
            PREFLIGHT: Hand off plan to pre-flighting.
        </expand>

    2.  Check the tool <result/> and dispatch accordingly:

        -   If <result/> is `DONE` or `CANCEL`:
            Only output the following <template/> and then *STOP*.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan rebooted -- done**
            </template>

        -   If <result/> is `EDIT`:
            Set <args>--int-reuse-task</args>.
            <if condition="<getopt-option-next/> is not equal `none`">
                Set <args><args/> --next <getopt-option-next/></args>
            </if>
            Only output the following <template/> and then call the
            tool `Skill(skill: "ase:ase-task-edit", args: "<args/>")`
            to invoke the `ase:ase-task-edit` skill in order to *edit*
            the updated plan. Immediately stop processing the current
            skill once the `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan rebooted -- hand-off to edit**
            </template>

        -   If <result/> is `IMPLEMENT`:
            Set <args>--int-reuse-task</args>.
            <if condition="<getopt-option-next/> is not equal `none`">
                Set <args><args/> --next <getopt-option-next/></args>
            </if>
            Only output the following <template/> and then call the
            tool `Skill(skill: "ase:ase-task-implement", args: "<args/>")`
            to invoke the `ase:ase-task-implement` skill in order to
            *implement* the updated plan. Immediately stop processing
            the current skill once the `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan rebooted -- hand-off to implementation**
            </template>

        -   If <result/> is `PREFLIGHT`:
            Set <args>--int-reuse-task</args>.
            <if condition="<getopt-option-next/> is not equal `none`">
                Set <args><args/> --next <getopt-option-next/></args>
            </if>
            Only output the following <template/> and then call the
            tool `Skill(skill: "ase:ase-task-preflight", args: "<args/>")`
            to invoke the `ase:ase-task-preflight` skill in order to
            *preflight* the updated plan. Immediately stop processing
            the current skill once the `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan rebooted -- hand-off to pre-flight**
            </template>


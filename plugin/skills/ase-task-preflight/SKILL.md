---
name: ase-task-preflight
argument-hint: "[--help|-h] [--next|-n <option>[,...]] [<id>]"
description: >
    Preflight the implementation of current or given task plan.
    Use when the user calls to "preflight", "dry-run" or "test-drive"
    the "task", "plan", "spec", or "specification".
user-invocable: true
disable-model-invocation: false
effort: xhigh
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<skill name="ase-task-preflight">
Preflight a Task Plan
</skill>

<expand name="getopt"
    arg1="ase-task-preflight"
    arg2="--next|-n=(none|DONE|EDIT|IMPLEMENT)... --int-reuse-task">
    $ARGUMENTS
</expand>

<objective>
*Preflight* the implementation of a task plan by creating a draft
for a corresponding, *complete source code change set*.
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

        <expand name="task-react-id" arg1="ase-task-preflight"></expand>

2.  **Determine Operation:**

    1.  Determine the current task plan content:

        <expand name="task-load-content"></expand>

    2.  If the <task-content/> is still empty, complain and tell the user to
        use the `ase-code-resolve`, `ase-code-refactor`, `ase-code-craft`,
        or `ase-task-edit` skills first to create a task plan. Then
        immediately stop processing this skill.

3.  **Create Implementation Draft:**

    1.  Perform a *preflight* of the *implementation* of <task-content/> by creating a
        draft for a corresponding, *complete artifact change set*
        which *would* fully implement the task plan <task-content/>. Store
        this artifact change set in *unified diff* format in <unified-diff/>.

    2.  Append this artifact change set <unified-diff/> to the end
        of the <task-content/> with the following <template/>. If a section
        named `##  IMPLEMENTATION DRAFT` already exists from a
        previous run of this skill, *replace* this entire existing
        section.

        <template>

        ##  IMPLEMENTATION DRAFT

        ```text
        <unified-diff/>
        ```

        </template>

    3.  <if condition="<task-content/> contains '⚙   Modified:'">
        Update <timestamp-modified/> with the current time in
        ISO-style format, which has to be determined by calling the
        `ase_timestamp(format: "yyyy-LL-dd HH:mm")` tool of the `ase`
        MCP server and use the `text` field of its response. Update
        the `⚙   Modified: ...` line of <task-content/> with the new
        `⚙   Modified: <timestamp-modified/>`.
        Do not output anything.
        </if>

    4.  Finally, call the `ase_task_save(id: "<ase-task-id/>",
        text: "<task-content/>")` tool of the `ase` MCP server to save the updated
        task plan content. Calculate the number of words <words/> of
        <task-content/>. Do not output anything related to this MCP tool call
        except the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan updated**
        </template>

4.  **Decide Next Step:**

    1.  *Determine next step*:

        <expand name="task-next-select"
            arg1="ase-task-preflight"
            arg2="DONE|EDIT|IMPLEMENT">
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
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan updated -- hand-off to edit**
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
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan updated -- hand-off to implementation**
            </template>


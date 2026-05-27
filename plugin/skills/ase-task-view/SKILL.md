---
name: ase-task-view
argument-hint: "[<id>]"
description: >
    View current or given task plan.
    Use when the user calls to "view", "show" or "see" the
    "task", "plan", "spec", or "specification".
user-invocable: true
disable-model-invocation: false
effort: low
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

View a Task Plan
================

<skill name="ase-task-view">
View a Task Plan
</skill>

<role>
Your role is an experienced, *expert-level assistant*.
</role>
*View* the task plan.

Procedure
---------

You *MUST* follow the following numbered items *strictly* *sequentially*!
You *MUST* not skip any numbered item during processing!

You *MUST* *NOT* output anything in this entire procedure, *except* when
explicitly requested by this procedure via outputs based on a <template/>!

1.  **Determine Task:**

    1.  Set <id>$ARGUMENTS</id> initially, with any leading and trailing
        whitespace stripped.
        Inherit the always existing <ase-task-id/> from the current context.
        Do not output anything.

    2.  <if condition="<id/> is empty">
        Set <id><ase-task-id/></id>
        Do not output anything.
        </if>

    3.  <if condition="<id/> does NOT match the regexp `^[a-zA-Z][a-zA-Z0-9_-]*$`">
        Only output the following <template/> and then immediately
        *STOP* processing the entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-task-view**, ▶ ERROR: expected single `[<id>]` argument
        </template>
        </if>

2.  **Perform Operation**:

    1.  Call the `ase_task_load(id: <id/>)` tool of the `ase` MCP
        server to load the task plan content and set <text/> to the
        `text` output field of this `ase_task_load` tool call. Do not
        output anything related to this MCP tool call.

        -   If <text/> starts with `ERROR:` or `WARNING:`:
            Set <content></content> (set content to empty).
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<id/>**, ▶ status: **<text/>**
            </template>

        -   If <text/> starts NOT with `ERROR:` and NOT with `WARNING:`:
            Set <content><text/></content> (set content to text).
            Calculate the number of words <words/> of <content/>.
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<id/>**, ✪ plan: **<words/>** words, ▶ status: **plan loaded**
            </template>

    2.  <if condition="<content/> is not empty">
        *Render plan*: Only output the following <template/>, so the user
        can read the plan and react to it. Do *not* truncate, summarize,
        or partially show the plan -- always show the complete plan
        <content/> here.

        <template>
        ⧉ **ASE**: ┈┈┈┈┈┈┈┈────────━━━━━━━━**(** `TASK-PLAN-BEGIN` **)**━━━━━━━━────────┈┈┈┈┈┈┈┈
        <content/>
        ⧉ **ASE**: ┈┈┈┈┈┈┈┈────────━━━━━━━━**(**  `TASK-PLAN-END`  **)**━━━━━━━━────────┈┈┈┈┈┈┈┈
        </template>
        </if>


---
name: ase-task-delete
argument-hint: "[<id>]"
description: >
    Implement current or given task plan.
    Use when the user calls to "delete", "remove" or "clear" the
    "task", "plan", "spec", or "specification".
user-invocable: true
disable-model-invocation: false
effort: low
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Delete a Task Plan
==================

Your role is an experienced, *expert-level assistant*.
*Delete* the task plan.

Procedure
---------

You *MUST* follow the following numbered items *strictly* *sequentially*!
You *MUST* not skip any numbered item during processing!

You *MUST* *NOT* output anything in this entire procedure, *except* when
explicitly requested by this procedure via outputs based on a <template/>!

1.  **Determine Task:**

    1.  Set <id>$ARGUMENTS</id> initially.
        Inherit the always existing <ase-task-id/> from the current context.
        Do not output anything.

    2.  <if condition="<id/> is empty">
        Set <id><ase-task-id/></id>
        Do not output anything.
        </if>

2.  **Perform Operation**:

    1.  Call the `task_delete(id: <id/>)` tool of the `ase` MCP
        service to delete the task plan content and set <text/> to the
        `text` output field of this `task_delete` tool call. Do not
        output anything related to this MCP tool call.

        -   If <text/> starts with `ERROR:` or `WARNING:`:
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<id/>**, ▶ status: **<text/>**
            </template>

        -   If <text/> starts NOT with `ERROR:`:
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<id/>**, ▶ status: **task deleted**
            </template>

    2.  <if condition="<id/> is equal <ase-task-id/> AND <ase-task-id/> is not equal 'default'">
        Set <ase-task-id>default</ase-task-id>. Call the `task_id(id:
        <ase-task-id/>, session: <ase-session-id/>)` tool from the `ase`
        MCP service to switch the task to the default task. Only output
        the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task switched to default**
        </template>
        </if>

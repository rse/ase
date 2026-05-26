---
name: ase-task-rename
argument-hint: "[<old>] <new>"
description: >
    Rename the current or given task plan.
    Use when the user calls to "rename", "move" or "relabel" the
    "task", "plan", "spec", or "specification".
user-invocable: true
disable-model-invocation: false
effort: low
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Rename a Task Plan
==================

<skill name="ase-task-rename">
Rename a Task Plan
</skill>

Your role is an experienced, *expert-level assistant*.
*Rename* the task plan.

Procedure
---------

You *MUST* follow the following numbered items *strictly* *sequentially*!
You *MUST* not skip any numbered item during processing!

You *MUST* *NOT* output anything in this entire procedure, *except* when
explicitly requested by this procedure via outputs based on a <template/>!

1.  **Determine Task:**

    1.  Parse <arguments>$ARGUMENTS</arguments> into a whitespace-separated
        list of tokens. Inherit the always existing <ase-task-id/> from
        the current context. Do not output anything.

    2.  <if condition="<arguments/> contains two tokens">
        Set <old/> to the first token of <arguments/>.
        Set <new/> to the second token of <arguments/>.
        Do not output anything.
        </if>

    3.  <if condition="<arguments/> contains exactly one token">
        Set <old><ase-task-id/></old>.
        Set <new/> to the single token of <arguments/>.
        Do not output anything.
        </if>

    4.  <if condition="<arguments/> is empty OR contains more than two tokens">
        Only output the following <template/> and then immediately
        *STOP* processing the entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-task-rename**, ▶ ERROR: expected `[<old>] <new>` arguments
        </template>
        </if>

2.  **Perform Operation**:

    1.  Call the `ase_task_rename(old: <old/>, new: <new/>)` tool of the
        `ase` MCP server to rename the task plan and set <text/> to the
        `text` output field of this `ase_task_rename` tool call. Do not
        output anything related to this MCP tool call.

        -   If <text/> starts with `ERROR:` or `WARNING:`:
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<old/>**, ▶ status: **<text/>**
            </template>

        -   If <text/> starts NOT with `ERROR:` and NOT with `WARNING:`:
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<new/>**, ▶ status: **task renamed**
            </template>

    2.  <if condition="<old/> is equal <ase-task-id/>">
        Set <ase-task-id><new/></ase-task-id>. Call the `ase_task_id(id:
        <ase-task-id/>, session: <ase-session-id/>)` tool from the `ase`
        MCP server to switch the task to the renamed task. Only output
        the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task switched**
        </template>
        </if>

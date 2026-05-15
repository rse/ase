---
name: ase-task-id
argument-hint: "[<id>]"
description: >
    Get or set unique task id <id>.
    Use when user requests to work on a certain task
    or wants to know what the current task is.
user-invocable: true
disable-model-invocation: false
effort: low
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Task Configuration
==================

1.  Determine request:
    <request>$ARGUMENTS</request>

2.  <if condition="<request/> is empty">
    -   Call the `task_id(session: <ase-session-id/>)`
        tool from the `ase` MCP service and set
        <ase-task-id/> to its `text` output.

    -   Output:
        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**
        </template>
    </if>

3.  <if condition="<request/> is NOT empty">
    -   Set <ase-task-id><request/></ase-task-id> and
        call the `task_id(id: <ase-task-id/>, session: <ase-session-id/>)`
        tool from the `ase` MCP service.

    -   Output:
        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>** (*updated*)
        </template>
    </if>

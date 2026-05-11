---
name: ase-meta-task
argument-hint: "[list|<id>]"
description: >
    Get or set unique task id <id>, or list all task ids with 'list'.
    Use when user requests to work on a certain task,
    wants to know what the current task is, or wants to see all tasks.
user-invocable: true
disable-model-invocation: false
effort: low
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Task Configuration
==================

1.  Determine request:
    <request>$ARGUMENTS</request>

2.  <if condition="<request/> is 'list'">
    -   Call the `task_list()` tool from the `ase` MCP service.

    -   Output:
        <template>
        ⧉ **ASE**: ◉ tasks:
        <task-list/>
        </template>

        where <task-list/> is each returned id on its own line prefixed with `-   `.
        If the list is empty, output `*(none)*` instead of any lines.
    </if>

3.  <if condition="<request/> is empty">
    -   Call the `task_id(session: <ase-session-id/>)`
        tool from the `ase` MCP service and set
        <ase-task-id/> to its `text` output.

    -   Output:
        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**
        </template>
    </if>

4.  <if condition="<request/> is NOT empty and NOT 'list'">
    -   If <request/> is `list`, report the following and stop immediately:
        <template>
        ⧉ **ASE**: **ERROR:** "list" is a reserved keyword and not a valid task id
        </template>

    -   Set <ase-task-id><request/></ase-task-id> and
        call the `task_id(id: <ase-task-id/>, session: <ase-session-id/>)`
        tool from the `ase` MCP service.

    -   Output:
        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>** (*updated*)
        </template>
    </if>

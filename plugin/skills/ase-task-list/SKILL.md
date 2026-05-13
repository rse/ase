---
name: ase-task-list
argument-hint: ""
description: >
    List all available task ids.
    Use when user wants to see all tasks.
user-invocable: true
disable-model-invocation: false
effort: low
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Task List
=========

1.  Call the `task_list()` tool from the `ase` MCP service.

2.  Output:
    <template>
    ⧉ **ASE**: ◉ tasks:
    <task-list/>
    </template>

    where <task-list/> is each returned id on its own line prefixed with `-   `.
    If the list is empty, output `*(none)*` instead of any lines.

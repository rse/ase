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

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Task List
=========

<skill name="ase-task-list">
List Task Plans
</skill>

1.  Call the `task_list({ verbose: true })` tool from the `ase` MCP service.
    The result is a structured object with a `tasks` array where each
    entry has an `id` field and an `mtime` field (formatted as
    `YYYY-MM-DD HH:MM`).

2.  If the `tasks` array is empty, output the following <template/>:

    <template>
    ⧉ **ASE**: ◉ tasks: *(none)*
    </template>

    Else, output the list of tasks with the following <template/>, where
    each <id/> and <mtime/> correspond to an entry in the task list:

    <template>
    ⧉ **ASE**: ◉ tasks:

    | *Task Id* | *Last Modified*    |
    |-----------|--------------------|
    | **<id/>** | `<mtime/>`         |
    | [...]     | [...]              |

    </template>


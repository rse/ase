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

1.  Call the `task_list({ verbose: true })` tool from the `ase` MCP service.
    The result is a structured object with a `tasks` array; each
    entry has an `id` field and an `mtime` field (formatted as
    `YYYY-MM-DD HH:MM`).

2.  Output:

    <template>
    ⧉ **ASE**: ◉ tasks:

    | *Task Id* | *Last Modified*    |
    |-----------|--------------------|
    <task-list/>
    </template>

    where <task-list/> is each returned task on its own row formatted
    as <template>| **<id/>** | `<mtime/>` |</template>.
    If the `tasks` array is empty, output `*(none)*` instead of the table.


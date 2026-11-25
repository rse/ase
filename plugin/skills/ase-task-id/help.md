
##  NAME

`ase-task-id` - Configure Task Id

##  SYNOPSIS

`ase-task-id`
    [`--help`|`-h`]
    [*id*]

##  DESCRIPTION

The `ase-task-id` skill gets or sets the unique *task id* for the
current session. Without arguments, it reports the currently active
task id. With an *id* argument, it switches the session to that
task id via the `ase_task_id` MCP tool.

##  ARGUMENTS

-   *id*:
    The new task id to activate (characters `A-Z`, `a-z`, `0-9`, `#`,
    `_`, and `-`, but not starting with `_` or `-`). If omitted, the
    currently active task id is reported. An id not conforming to the task id scheme of the
    project (`project.task.idscheme`: `slug[:<words>]`, `seq[:<template>]`,
    `flex[:<template>]`, or `any`) is accepted, but noticed.

##  SCENARIOS

-   You want to know which task is currently active
-   You want the session switched to another task
-   You want to work on a certain task

##  EXAMPLES

Show the current task id:

```text
❯ /ase-task-id
```

Switch to a specific task:

```text
❯ /ase-task-id hello
```

##  SEE ALSO

[`ase-task-list`](../ase-task-list/help.md), [`ase-task-edit`](../ase-task-edit/help.md), [`ase-task-view`](../ase-task-view/help.md),
[`ase-task-status`](../ase-task-status/help.md), [`ase-task-rename`](../ase-task-rename/help.md), [`ase-task-delete`](../ase-task-delete/help.md).

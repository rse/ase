
##  NAME

`ase-task-rename` - Rename a Task Plan

##  SYNOPSIS

`ase-task-rename`
    [`--help`|`-h`]
    [*old*] *new*

##  DESCRIPTION

The `ase-task-rename` skill renames a *task plan* from *old* to
*new* via the `ase_task_rename` MCP tool. If only one argument is
given, it is treated as *new* and *old* defaults to the *current*
task id. When the renamed task is the current task, the current
task id is automatically switched to *new*.

##  ARGUMENTS

[*old*] *new*:
    The *old* task id to rename and the *new* task id to assign.
    If only one token is given, *old* defaults to the current
    task id.

##  EXAMPLES

Rename the current task:

```text
❯ /ase-task-rename hello-world
```

Rename a specific task:

```text
❯ /ase-task-rename old-id new-id
```

##  SEE ALSO

[`ase-task-list`](../ase-task-list/help.md), [`ase-task-id`](../ase-task-id/help.md), [`ase-task-edit`](../ase-task-edit/help.md),
[`ase-task-view`](../ase-task-view/help.md), [`ase-task-delete`](../ase-task-delete/help.md).


##  NAME

`ase-task-delete` - Delete a Task Plan

##  SYNOPSIS

`ase-task-delete`
    [`--help`|`-h`]
    [*id*]

##  DESCRIPTION

The `ase-task-delete` skill deletes the *task plan* identified by
*id*. If *id* is omitted, the *current* task id (inherited from the
session context) is used. When the deleted task is the current task
and not the `default` task, the current task id is automatically
switched back to `default`.

##  ARGUMENTS

*id*:
    The unique identifier of the task plan to delete. If omitted,
    the current task id is used.

##  EXAMPLES

Delete the current task plan:

```text
❯ /ase-task-delete
```

Delete a specific task plan:

```text
❯ /ase-task-delete hello
```

##  SEE ALSO

`ase-task-edit`, `ase-task-list`, `ase-task-view`,
`ase-task-rename`, `ase-task-reboot`.

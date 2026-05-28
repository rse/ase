
##  NAME

`ase-task-view` - View a Task Plan

##  SYNOPSIS

`ase-task-view`
    [`--help`|`-h`]
    [*id*]

##  DESCRIPTION

The `ase-task-view` skill renders the *task plan* identified by *id*
in full, without truncation or summarization. The plan is loaded via
the `ase_task_load` MCP tool and shown between `TASK-PLAN-BEGIN` and
`TASK-PLAN-END` markers. If *id* is omitted, the *current* task id
(inherited from the session context) is used.

##  ARGUMENTS

*id*:
    The unique identifier of the task plan to view. If omitted,
    the current task id is used.

##  EXAMPLES

View the current task plan:

```text
❯ /ase-task-view
```

View a specific task plan:

```text
❯ /ase-task-view hello
```

##  SEE ALSO

`ase-task-list`, `ase-task-edit`, `ase-task-id`,
`ase-task-rename`, `ase-task-delete`.

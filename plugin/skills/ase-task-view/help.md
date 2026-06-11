
##  NAME

`ase-task-view` - View a Task Plan

##  SYNOPSIS

`ase-task-view`
    [`--help`|`-h`]
    [`--full`|`-f`]
    [*id*]

##  DESCRIPTION

The `ase-task-view` skill renders the *task plan* identified by *id*.
The plan is loaded via the `ase_task_load` MCP tool and shown between
`TASK-PLAN-BEGIN` and `TASK-PLAN-END` markers. If *id* is omitted, the
*current* task id (inherited from the session context) is used.

By default, when the plan is longer than 90 lines and contains an
`IMPLEMENTATION DRAFT` section (produced by `ase-task-preflight`), the
content of that section is collapsed to `[...]` to keep the view
compact. The `--full`|`-f` option suppresses this collapsing and renders
the plan in full, without any truncation or summarization.

##  OPTIONS

`--full`|`-f`:
    Render the plan in full, without collapsing the `IMPLEMENTATION
    DRAFT` section. By default, that section is replaced with `[...]`
    for plans longer than 90 lines.

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

View a plan in full, including its `IMPLEMENTATION DRAFT` section:

```text
❯ /ase-task-view --full hello
```

##  SEE ALSO

`ase-task-list`, `ase-task-edit`, `ase-task-id`,
`ase-task-rename`, `ase-task-delete`.

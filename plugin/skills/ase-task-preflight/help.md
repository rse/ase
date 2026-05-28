
##  NAME

`ase-task-preflight` - Preflight a Task Plan

##  SYNOPSIS

`ase-task-preflight`
    [`--help`|`-h`]
    [`--next`|`-n` *option*]
    [*id*]

##  DESCRIPTION

The `ase-task-preflight` skill performs a *preflight* (dry-run,
test-drive) of the *implementation* of a task plan by creating a
draft for a corresponding, complete *artifact change set* in
*unified diff* format. The draft is appended to the task plan as
a `※ IMPLEMENTATION DRAFT` section (replacing any previous draft).
No source files are modified.

After the preflight, the user is asked whether to stop, hand
off to `ase-task-edit`, or hand off to `ase-task-implement`,
unless `--next` pre-selects this choice.

##  OPTIONS

`--next`|`-n` *option*:
    Automatically answer the user dialog for the next step with
    *option*, which can be either `none` (default, interactive
    answer required), `DONE` (stop), `EDIT` (hand off to
    `ase-task-edit`), or `IMPLEMENT` (hand off to
    `ase-task-implement`).

##  ARGUMENTS

*id*:
    The unique identifier of the task whose plan should be
    preflighted. If omitted, the *current* task id is used.

##  EXAMPLES

Preflight the current task plan:

```text
❯ /ase-task-preflight
```

Preflight a specific task and hand off to implementation when done:

```text
❯ /ase-task-preflight --next IMPLEMENT hello
```

##  SEE ALSO

`ase-task-edit`, `ase-task-implement`, `ase-task-reboot`,
`ase-task-view`.

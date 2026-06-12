
##  NAME

`ase-task-preflight` - Preflight a Task Plan

##  SYNOPSIS

`ase-task-preflight`
    [`--help`|`-h`]
    [`--next`|`-n` *option*[,...]]
    [*id*]

##  DESCRIPTION

The `ase-task-preflight` skill performs a *preflight* (dry-run,
test-drive) of the *implementation* of a task plan by creating a
draft for a corresponding, complete *artifact change set* in
*unified diff* format. The draft is appended to the task plan as
an `IMPLEMENTATION DRAFT` section (replacing any previous draft).
No source files are modified.

After the preflight, the user is asked whether to stop, hand
off to `ase-task-edit`, or hand off to `ase-task-implement`,
unless `--next` pre-selects this choice.

##  OPTIONS

`--next`|`-n` *option*[,...]:
    Automatically answer the user dialog for the next step. *option*
    is a single token or a *comma-separated chronological list* of
    tokens; the *first* token is consumed by this skill, and any
    remaining tokens are *forwarded* (via `--next`) to the downstream
    skill so an entire pipeline can be pre-scripted in one shot.
    Recognized tokens at this skill: `none` (default, interactive
    answer required), `DONE` (stop), `EDIT` (hand off to
    `ase-task-edit`), or `IMPLEMENT` (hand off to
    `ase-task-implement`). Example: `--next IMPLEMENT,DONE` runs the
    preflight, hands off to implementation, then exits without asking.

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

[`ase-task-edit`](../ase-task-edit/help.md), [`ase-task-implement`](../ase-task-implement/help.md), [`ase-task-reboot`](../ase-task-reboot/help.md),
[`ase-task-view`](../ase-task-view/help.md).

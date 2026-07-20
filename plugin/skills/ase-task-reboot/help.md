
##  NAME

`ase-task-reboot` - Reboot a Task Plan

##  SYNOPSIS

`ase-task-reboot`
    [`--help`|`-h`]
    [`--next`|`-n` *option*[,...]]
    [*id*]

##  DESCRIPTION

The `ase-task-reboot` skill re-creates an existing task plan *from
scratch* by extracting the original `**WHAT**` and `**WHY**` sections
(if present) from the current plan, using them as the new instruction,
preserving the original creation timestamp, and writing a fresh plan
content via `ase_task_save`.

After the reboot, the user is asked whether to stop or hand off to
`ase-task-edit`, `ase-task-implement`, or `ase-task-preflight`,
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
    `ase-task-edit`), `IMPLEMENT` (hand off to `ase-task-implement`),
    or `PREFLIGHT` (hand off to `ase-task-preflight`). Example: `--next
    EDIT,DONE` reboots, hands off to editing, and the editing loop will
    exit immediately.

##  ARGUMENTS

*id*:
    The unique identifier of the task whose plan should be rebooted.
    If omitted, the *current* task id is used.

##  EXAMPLES

Reboot the current task plan:

```text
❯ /ase-task-reboot
```

Reboot a specific task and hand off to editing:

```text
❯ /ase-task-reboot --next EDIT hello
```

##  SEE ALSO

[`ase-task-edit`](../ase-task-edit/help.md), [`ase-task-preflight`](../ase-task-preflight/help.md), [`ase-task-implement`](../ase-task-implement/help.md),
[`ase-task-view`](../ase-task-view/help.md), [`ase-task-delete`](../ase-task-delete/help.md).

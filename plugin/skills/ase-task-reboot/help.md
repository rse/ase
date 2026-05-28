
##  NAME

`ase-task-reboot` - Reboot a Task Plan

##  SYNOPSIS

`ase-task-reboot`
    [`--help`|`-h`]
    [`--next`|`-n` *option*]
    [*id*]

##  DESCRIPTION

The `ase-task-reboot` skill re-creates an existing task plan *from
scratch* by extracting the original `**WHAT**` and `**WHY**` sections
(if present) from the current plan, using them as the new instruction,
preserving the original creation timestamp, and writing a fresh plan
content via `ase_task_save`.

After the reboot, the user is asked whether to stop or hand off to
`ase-task-edit`, unless `--next` pre-selects this choice.

##  OPTIONS

`--next`|`-n` *option*:
    Automatically answer the user dialog for the next step with
    *option*, which can be either `none` (default, interactive
    answer required), `DONE` (stop), or `EDIT` (hand off to
    `ase-task-edit`).

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

`ase-task-edit`, `ase-task-preflight`, `ase-task-implement`,
`ase-task-view`, `ase-task-delete`.


##  NAME

`ase-task-implement` - Implement a Task Plan

##  SYNOPSIS

`ase-task-implement`
    [`--help`|`-h`]
    [`--next`|`-n` *option*]
    [*id*]

##  DESCRIPTION

The `ase-task-implement` skill performs the *final implementation*
of a task plan by modifying the corresponding *artifacts* with a
complete *change set*. The plan is loaded from
`.ase/tasks/`*id*`/plan.md`, and any optional `IMPLEMENTATION DRAFT`
section produced by `ase-task-preflight` is used as a hint — the
plain plan content always overrules the draft.

If the task plan deliberately *omits* the `※ VERIFICATION` section
(as produced by `ase-code-craft`, `ase-code-refactor`,
`ase-code-resolve`, or `ase-task-edit` when invoked with `--dry`),
the entire verification phase is strictly skipped: no build, tests,
linter, type-checker, or program execution is performed once the
source files have been modified.

After implementation, the user is asked whether to preserve or
delete the task plan, unless `--next` pre-selects this choice.

##  OPTIONS

`--next`|`-n` *option*:
    Automatically answer the user dialog for the next step with
    *option*, which can be either `none` (default, interactive
    answer required), `DONE` (preserve task plan and stop), or
    `DELETE` (hand off to `ase-task-delete`).

##  ARGUMENTS

*id*:
    The unique identifier of the task whose plan should be
    implemented. If omitted, the *current* task id is used.

##  EXAMPLES

Implement the current task plan:

```text
❯ /ase-task-implement
```

Implement a specific task and delete the plan when done:

```text
❯ /ase-task-implement --next DELETE hello
```

##  SEE ALSO

`ase-task-edit`, `ase-task-preflight`, `ase-task-reboot`,
`ase-task-view`, `ase-task-delete`.

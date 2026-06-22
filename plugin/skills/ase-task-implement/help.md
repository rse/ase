
##  NAME

`ase-task-implement` - Implement a Task Plan

##  SYNOPSIS

`ase-task-implement`
    [`--help`|`-h`]
    [`--next`|`-n` *option*[,...]]
    [`--mode`|`-m` *mode*]
    [*id*]

##  DESCRIPTION

The `ase-task-implement` skill performs the *final implementation* of
a task plan by modifying the corresponding *artifacts* with a complete
*change set*. The plan is loaded and any optional `IMPLEMENTATION DRAFT`
section produced by `ase-task-preflight` is used as a hint - the plain
plan content always overrules the draft.

The implementation can be performed in one of two *modes*. In mode
`all`, the plan is implemented as one complete change set in a single
pass. In mode `steps`, the plan is first *restructured* into small,
self-contained, individually verifiable increments - each one a
reviewable diff of related code plus its corresponding test. The
increment list is persisted as an `IMPLEMENTATION STEPS` section
(a numbered checkbox list) inside the task plan itself, so progress
survives discussion pauses and even session restarts. After each
implemented increment, its checkbox is ticked and a short step summary
is recorded beneath it inside the plan, the plan is saved, the summary
is emitted as text, and the user is asked - via a custom dialog whose
question already carries a one-line condensation of the summary - how
to proceed: `CONTINUE` (implement the next increment), `DISCUSS` (pause
the skill for a free discussion in the chat), or `DONE` (stop and
preserve the plan including the step progress).

If the loaded plan already contains an `IMPLEMENTATION STEPS` section
with at least one open checkbox, the skill *resumes* mode `steps` at
the first open increment without asking for a mode again - this is the
re-entry path after `DISCUSS` or a session restart. Once the last
increment is implemented, the `IMPLEMENTATION STEPS` section is removed
from the plan again, returning it to its canonical format.

If the mode is neither pre-selected via `--mode` nor implied by a
resumable `IMPLEMENTATION STEPS` section, the user is asked
interactively for the mode (in headless contexts, mode `all` is used).

If the task plan deliberately *omits* the `##  VERIFICATION` section
(as produced by `ase-code-craft`, `ase-code-refactor`,
`ase-code-resolve`, or `ase-task-edit` when invoked with `--dry`),
the entire verification phase is strictly skipped: no build, tests,
linter, type-checker, or program execution is performed once the
source files have been modified. In mode `steps`, this rule applies
per increment.

After implementation, the user is asked whether to preserve or
delete the task plan, unless `--next` pre-selects this choice.

##  OPTIONS

`--next`|`-n` *option*[,...]:
    Automatically answer the user dialog for the next step. *option*
    is a single token or a *comma-separated chronological list* of
    tokens; the *first* token is consumed by this skill, and any
    remaining tokens are intentionally *discarded*, because the
    downstream `ase-task-delete` skill accepts no `--next` option.
    Recognized tokens at this skill: `none` (default, interactive
    answer required), `DONE` (preserve task plan and stop), or
    `DELETE` (hand off to `ase-task-delete`). The tokens apply only to
    the *final* next-step dialog - the per-increment review gates of
    mode `steps` are deliberately interactive, so `--mode steps --next
    ...` is a valid combination (the tokens are consumed at the end).

`--mode`|`-m` *mode*:
    Select the implementation mode: `ask` (default, ask the user
    interactively; in headless contexts mode `all` is used), `all`
    (one complete change set in a single pass), or `steps`
    (restructure into small review-ready increments and pause for
    review after each one).

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

Implement the current task plan in small review-ready increments:

```text
❯ /ase-task-implement --mode steps
```

##  SEE ALSO

[`ase-task-edit`](../ase-task-edit/help.md), [`ase-task-preflight`](../ase-task-preflight/help.md), [`ase-task-reboot`](../ase-task-reboot/help.md),
[`ase-task-view`](../ase-task-view/help.md), [`ase-task-delete`](../ase-task-delete/help.md).

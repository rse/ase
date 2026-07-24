
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
self-contained, individually verifiable increments - each one the
*smallest landable unit*: a reviewable diff of related code plus its
corresponding test, ending "compiles + tests green + report". Besides
regular code increments, `[measure]` increments are probes whose
measured result decides whether a dependent increment is built or
cancelled, and `[live]` increments are live verifications where the
user runs the application and reports logs/screenshots back.

The increment list is persisted as an `IMPLEMENTATION STEPS` section
(a numbered checkbox list plus a `BASELINE` bullet naming the known
pre-existing failures) inside the task plan itself, so progress
survives discussion pauses and even session restarts. The section is a *living ledger*:
increments may be resequenced, split, or merged when contact with the
code demands it (rationale recorded beneath the affected item), and
deferred work must name its target increment. After each increment,
its checkbox is ticked, a step summary with findings is recorded
beneath it, the plan is saved, and a *standardized step report* is
emitted: a table of the changed production files (Status / File /
What), tests named separately, the verification result citing the
known pre-existing failures, and the explicit staging status. The
skill *never* commits and stages only on an explicit `STAGE` gate
choice - Git sovereignty remains with the user. Via a custom dialog
carrying a one-line condensation of the report, the user then
decides: `CONTINUE` (next increment), `STAGE` (stage the increment's
not-yet-staged files, then continue), `DISCUSS` (pause for a free
discussion in the chat), or `DONE` (stop and preserve plan and
progress). The gate reviews *results*: implementing the next
increment is the default; the skill asks again only on genuine scope
changes.

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
per increment. Otherwise the verification matches the increment type
(unit, architecture/structure, measurement, or live verification) and
checks *harness realism*: whether the test harness reflects the live
conditions (advancing clock, concurrency, reconnects).

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

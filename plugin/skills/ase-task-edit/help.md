
##  NAME

`ase-task-edit` - Iteratively Edit a Task Plan

##  SYNOPSIS

`ase-task-edit`
    [`--help`|`-h`]
    [`--plan`|`-p` *option*]
    [`--dry`|`-d`]
    [`--next`|`-n` *option*[,...]]
    [*id* | *id*: *instruction* | *instruction*]

##  DESCRIPTION

The `ase-task-edit` skill establishes and refines a *task plan* purely
through a *chat-driven loop*. The user steers each round via an
interactive dialog that offers continued refinement, finalization, or
hand-off to implementation or draft.

A newly generated plan is grounded in the relevant specification
(`SPEC`), source code (`CODE`), and infrastructure (`INFR`) files of the
project: it names the actual files and symbols to change, the actual
build, lint, and test procedures, and a `CHANGELOG.md` entry if such a
file exists.

Attachments in the plan's backmatter are never removed by a refinement.
A refinement which changes an attachment refreshes the attachment's
`Modified:` key; a refinement which changes the plan body refreshes the
`Modified:` key of the frontmatter (which tracks body changes only, so
a refinement of frontmatter keys alone leaves it untouched); both use
the same value. An implementation draft (an attachment block of type
`text/x-diff; charset=utf-8; kind="draft"`, produced by
`ase-task-implement --draft`) whose `Modified:` key is absent or older
than the frontmatter's is *stale*: it is reported with a warning after
each rendering of the plan, together with a hint that
`ase-task-implement --draft` has to be run again to re-create the
draft for the changed plan, as `ase-task-integrate --draft` refuses a
stale draft.

##  OPTIONS

-   `--plan`|`-p` *option*:
    Automatically answer the user dialog for the plan refinement
    with *option*, which can be either `none` (default, interactive
    answer required), `OVERWRITE` (overwrite an existing plan
    with *instruction*), `REFINE` (refine the existing plan with
    *instruction*), or `PRESERVE` (preserve the existing plan by
    ignoring *instruction* and stopping skill processing).

-   `--dry`|`-d`:
    Generate any *new* plan *without* the `##  VERIFICATION (WHEN)` section.
    Applies only to freshly generated plans, not to existing plans
    loaded from disk. When `ase-task-implement` later applies such
    a plan, it strictly skips the entire verification phase (no
    build, tests, linter, type-checker, or program execution) once
    the source files have been modified.

-   `--next`|`-n` *option*[,...]:
    Automatically answer the user dialog for the next step (at the end
    of this skill). *option* is a single token or a *comma-separated
    chronological list* of tokens; each iteration of the planning
    loop consumes the *first* token of the list, and on hand-off
    (`IMPLEMENT` / `DRAFT`) any remaining tokens are *forwarded*
    (via `--next`) to the downstream skill so an entire pipeline can
    be pre-scripted in one shot. Recognized tokens at this skill:
    `none` (default, interactive answer required), `DONE` (no next
    step), `GRILL` (hand-over to `ase-task-grill`), `DRAFT`
    (hand-over to `ase-task-implement --draft`), or `IMPLEMENT` (hand-over to
    `ase-task-implement`). Example: `--next GRILL,DONE` hands the plan
    off to grilling and forwards `DONE` so grilling exits without asking.

##  ARGUMENTS

-   *id* | *id*: *instruction* | *instruction*:
    Edit the task with the unique identifier *id* (default: `default`).
    Optionally, *instruction* either gives instructions for creating a
    new task or gives instructions for refining an existing task.

##  SCENARIOS

-   You want a task planned through chat-driven refinement
-   You want a plan created or refined round by round
-   You want a plan iterated on before implementing it
-   You want plan refinement with hand-off to draft or implementation

##  EXAMPLES

Edit the current task:

```text
❯ /ase-task-edit
```

Create a new task under id `hello`:

```text
❯ /ase-task-delete hello
❯ /ase-task-edit hello: new "ase hello" CLI command which prints
  a nice "Hello World!" to the terminal in color blue.
```

Further refine the task under id `hello`:

```text
❯ /ase-task-edit hello: change the color to red.
```

##  SEE ALSO

[`ase-task-reboot`](../ase-task-reboot/help.md), [`ase-task-implement`](../ase-task-implement/help.md),
[`ase-task-view`](../ase-task-view/help.md), [`ase-task-list`](../ase-task-list/help.md), [`ase-task-rename`](../ase-task-rename/help.md), [`ase-task-delete`](../ase-task-delete/help.md).


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
hand-off to implementation or preflight.

The task plan is stored in `.ase/tasks/`*id*`/plan.md` files of the
project and can be alternatively edited with the "`ase task edit` *id*"
command from outside the agent tool.

##  OPTIONS

`--plan`|`-p` *option*:
    Automatically answer the user dialog for the plan refinement
    with *option*, which can be either `none` (default, interactive
    answer required), `OVERWRITE` (overwrite an existing plan
    with *instruction*), `REFINE` (refine the existing plan with
    *instruction*), or `PRESERVE` (preserve the existing plan by
    ignoring *instruction* and stopping skill processing).

`--dry`|`-d`:
    Generate any *new* plan *without* the `※ VERIFICATION` section.
    Applies only to freshly generated plans, not to existing plans
    loaded from disk. When `ase-task-implement` later applies such
    a plan, it strictly skips the entire verification phase (no
    build, tests, linter, type-checker, or program execution) once
    the source files have been modified.

`--next`|`-n` *option*[,...]:
    Automatically answer the user dialog for the next step (at the end
    of this skill). *option* is a single token or a *comma-separated
    chronological list* of tokens; each iteration of the planning
    loop consumes the *first* token of the list, and on hand-off
    (`IMPLEMENT` / `PREFLIGHT`) any remaining tokens are *forwarded*
    (via `--next`) to the downstream skill so an entire pipeline can
    be pre-scripted in one shot. Recognized tokens at this skill:
    `none` (default, interactive answer required), `DONE` (no next
    step), `GRILL` (hand-over to `ase-task-grill`), `PREFLIGHT`
    (hand-over to `ase-task-preflight`), or `IMPLEMENT` (hand-over to
    `ase-task-implement`). Example: `--next GRILL,DONE` first refines
    once, then exits the loop without asking.

##  ARGUMENTS

*id* | *id*: *instruction* | *instruction*:
    Edit the task with the unique identifier *id* (default: `default`).
    Optionally, *instruction* either gives instructions for creating a
    new task or gives instructions for refining an existing task.

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

`ase-task-reboot`, `ase-task-preflight`, `ase-task-implement`,
`ase-task-view`, `ase-task-list`, `ase-task-rename`, `ase-task-delete`.

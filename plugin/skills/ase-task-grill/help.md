
##  NAME

`ase-task-grill` - Iteratively Grill a Task Plan

##  SYNOPSIS

`ase-task-grill`
    [`--help`|`-h`]
    [`--next`|`-n` *list*]
    [*id*]

##  DESCRIPTION

The `ase-task-grill` skill *relentlessly interviews* the user about
every *essential aspect* of an existing *task plan* until a *shared
understanding* is reached and no decisions or questions are left open.

The skill identifies the essential aspects of the plan, builds a
decision tree of the open questions, and walks down each branch
one-by-one. For each aspect it presents up to four *grounded*
alternative answers (the current plan plus alternatives derived from
the code base and world knowledge), marks the current-plan choice, and
lets the user pick via an interactive dialog. It honors checks for
*fuzzy language*, *conflicting terminology*, *conflicting code*, and
*non-concrete scenarios*. Once all aspects are resolved, the plan is
updated and persisted, and the user is offered a hand-off to editing,
implementation, or preflight.

The task plan is stored in `.ase/tasks/`*id*`/plan.md` files of the
project and can be alternatively edited with the "`ase task edit` *id*"
command from outside the agent tool.

##  OPTIONS

`--next`|`-n` *list*:
    Automatically answer the user dialog for the next step (at the end
    of this skill). *list* is a single token or a *comma-separated
    chronological list* of tokens; the *first* token is consumed by
    this skill and any remaining tokens are *forwarded* (via `--next`)
    to the downstream skill on hand-off so an entire pipeline can be
    pre-scripted in one shot. Recognized tokens at this skill: `none`
    (default, interactive answer required), `DONE` (no next step), or
    `EDIT` (hand-over to `ase-task-edit`).

##  ARGUMENTS

*id*:
    Grill the task with the unique identifier *id* (default: `default`).
    The skill accepts *only* an optional *id* argument and never a
    free-text instruction.

##  EXAMPLES

Grill the current task plan:

```text
❯ /ase-task-grill
```

Grill the task plan under id `hello`:

```text
❯ /ase-task-grill hello
```

Grill the current task plan and then hand off to editing:

```text
❯ /ase-task-grill --next EDIT
```

##  SEE ALSO

`ase-task-edit`, `ase-task-reboot`, `ase-task-preflight`,
`ase-task-implement`, `ase-task-view`, `ase-task-list`,
`ase-task-rename`, `ase-task-delete`.

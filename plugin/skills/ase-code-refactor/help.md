
##  NAME

`ase-code-refactor` - Refactor Artifacts

##  SYNOPSIS

`ase-code-refactor`
    [`--help`|`-h`]
    [`--auto`|`-a`]
    [`--dry`|`-d`]
    [`--next`|`-n` *option*[,...]]
    [*task-id*:] *request*

##  DESCRIPTION

The `ase-code-refactor` skill refactors existing artifacts by
investigating the related code, internalizing refactoring tenets
(Behavior Preservation, Boy Scout Rule, DRY, SRP, loose coupling,
clear interfaces, ...), proposing one or more *refactoring approaches*
with pros and cons, letting the user pick the preferred approach,
and composing a corresponding *task plan*.

The skill does *not* directly modify source files. It persists the
plan via `ase_task_save` and then hands off to `ase-task-edit`,
`ase-task-preflight`, or `ase-task-implement`, as selected by
`--next`.

##  OPTIONS

`--auto`|`-a`:
    Automatically pick the recommended refactoring approach without
    asking the user via the interactive dialog.

`--dry`|`-d`:
    Compose the plan *without* the `※ VERIFICATION` section. When
    `ase-task-implement` later applies such a plan, it strictly skips
    the entire verification phase (no build, tests, linter,
    type-checker, or program execution) once the source files have
    been modified.

`--next`|`-n` *option*[,...]:
    Automatically choose the next step after composing the plan.
    *option* is a single token or a *comma-separated chronological
    list* of tokens; an `IMPLEMENT` or `PREFLIGHT` head token is
    consumed by this skill (bypassing `ase-task-edit`), and any
    remaining tokens are *forwarded* (via `--next`) to the downstream
    skill. For all other head tokens, the *entire* list is forwarded
    to `ase-task-edit`, which consumes its head itself. This lets an
    entire pipeline be pre-scripted in one shot. Recognized tokens at
    this skill: `none` (default, hand-off to `ase-task-edit`
    interactively), `DONE` (stop), `EDIT` (hand off to
    `ase-task-edit`), `PREFLIGHT` (hand off to `ase-task-preflight`),
    or `IMPLEMENT` (hand off to `ase-task-implement`). Example:
    `--next PREFLIGHT,IMPLEMENT,DONE` refactors, preflights, implements,
    and exits without further dialog.

##  ARGUMENTS

[*task-id*:] *request*:
    Description of the refactoring *request*. Optionally prefixed
    with a *task-id* followed by a colon to bind the resulting plan
    to a specific task id.

##  EXAMPLES

Refactor a module into smaller files:

```text
❯ /ase-code-refactor split src/handlers.ts into per-route modules
```

Refactor under a named task and directly hand off to implementation:

```text
❯ /ase-code-refactor --next IMPLEMENT cleanup: extract HTTP client into its own class
```

##  SEE ALSO

`ase-code-craft`, `ase-code-resolve`, `ase-task-edit`,
`ase-task-preflight`, `ase-task-implement`.

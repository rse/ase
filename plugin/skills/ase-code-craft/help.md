
##  NAME

`ase-code-craft` - Craft Source Code

##  SYNOPSIS

`ase-code-craft`
    [`--help`|`-h`]
    [`--auto`|`-a`]
    [`--dry`|`-d`]
    [`--quick`|`-Q`]
    [`--next`|`-n` *option*[,...]]
    [*task-id*:] *feature*

##  DESCRIPTION

The `ase-code-craft` skill crafts a *new feature* from scratch by
investigating the existing code base, internalizing crafting tenets
(KISS, YAGNI, DRY, SRP, loose coupling, ...), proposing one or more
*feature approaches* with pros and cons, letting the user pick the
preferred approach, and composing a corresponding *task plan* aligned
with the existing architecture.

The skill does *not* directly modify source files. It persists the
plan via `ase_task_save` and then hands off to `ase-task-edit`,
`ase-task-preflight`, or `ase-task-implement`, as selected by
`--next`.

##  OPTIONS

`--auto`|`-a`:
    Automatically pick the recommended feature approach without
    asking the user via the interactive dialog.

`--dry`|`-d`:
    Compose the plan *without* the `##  VERIFICATION` section. When
    `ase-task-implement` later applies such a plan, it strictly skips
    the entire verification phase (no build, tests, linter,
    type-checker, or program execution) once the source files have
    been modified.

`--quick`|`-Q`:
    Shorthand alias for `-a -d -n IMPLEMENT,DELETE`: automatically pick
    the recommended feature approach, compose the plan *without* the
    `##  VERIFICATION` section, immediately hand off to `ase-task-implement`,
    and finally `ase-task-delete` the now-consumed plan. This gives a
    single, fast *one-shot* crafting mode.

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
    `--next PREFLIGHT,IMPLEMENT,DONE` crafts the plan, preflights it,
    implements it, and exits without further dialog.

##  ARGUMENTS

[*task-id*:] *feature*:
    Description of the *feature* to craft. Optionally prefixed with
    a *task-id* followed by a colon to bind the resulting plan to
    a specific task id.

##  EXAMPLES

Craft a new logging feature:

```text
❯ /ase-code-craft add structured JSON logging with log levels
```

Craft a feature under a named task and directly hand off to implementation:

```text
❯ /ase-code-craft --next IMPLEMENT auth: add JWT authentication middleware
```

##  SEE ALSO

[`ase-code-refactor`](../ase-code-refactor/help.md), [`ase-code-resolve`](../ase-code-resolve/help.md), [`ase-task-edit`](../ase-task-edit/help.md),
[`ase-task-preflight`](../ase-task-preflight/help.md), [`ase-task-implement`](../ase-task-implement/help.md).


##  NAME

`ase-code-craft` - Craft Source Code

##  SYNOPSIS

`ase-code-craft`
    [`--help`|`-h`]
    [`--auto`|`-a`]
    [`--next`|`-n` *option*]
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

`--next`|`-n` *option*:
    Automatically choose the next step after composing the plan,
    where *option* is either `none` (default, hand-off to
    `ase-task-edit` interactively), `DONE` (stop), `EDIT` (hand off
    to `ase-task-edit`), `PREFLIGHT` (hand off to
    `ase-task-preflight`), or `IMPLEMENT` (hand off to
    `ase-task-implement`).

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

`ase-code-refactor`, `ase-code-resolve`, `ase-task-edit`,
`ase-task-preflight`, `ase-task-implement`.

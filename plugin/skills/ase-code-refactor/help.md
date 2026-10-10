
##  NAME

`ase-code-refactor` - Refactor Artifacts

##  SYNOPSIS

`ase-code-refactor`
    [`--help`|`-h`]
    [`--auto`|`-a`]
    [`--dry`|`-d`]
    [`--direct`|`-D`]
    [`--quick`|`-Q`]
    [`--next`|`-n` *option*[,...]]
    [*task-id*:] *request*

##  DESCRIPTION

The `ase-code-refactor` skill refactors existing artifacts by
investigating the related code, internalizing refactoring tenets
(Behavior Preservation, Boy Scout Rule, DRY, SRP, loose coupling,
clear interfaces, ...), proposing one or more *refactoring approaches*
with pros and cons, letting the user pick the preferred approach,
and composing a corresponding *task plan*.

By default the skill does *not* directly modify source files. It
persists the plan via `ase_task_save` and then hands off to
`ase-task-edit` or `ase-task-implement` (optionally with `--draft`),
as selected by `--next`. Only under `--direct` it skips the plan
entirely and applies the change set to the affected artifacts itself.

##  OPTIONS

-   `--auto`|`-a`:
    Automatically pick the recommended refactoring approach without
    asking the user via the interactive dialog.

-   `--dry`|`-d`:
    Compose the plan *without* the `##  VERIFICATION (WHEN)` section. When
    `ase-task-implement` later applies such a plan, it strictly skips
    the entire verification phase (no build, tests, linter,
    type-checker, or program execution) once the source files have
    been modified.

-   `--direct`|`-D`:
    Apply the refactoring *immediately* and *in place*: skip the
    refactoring approaches, the interactive dialog, and the entire task
    plan ceremony, and directly apply the complete change set to the
    affected artifacts, including a corresponding entry in an existing
    `CHANGELOG.md` file. In this mode `--auto`, `--dry`, `--quick`, and
    `--next` have no effect, as neither approaches are proposed nor a
    plan is composed.

-   `--quick`|`-Q`:
    Shorthand alias for `-a -d -n IMPLEMENT,DELETE`: automatically pick
    the recommended refactoring approach, compose the plan *without* the
    `##  VERIFICATION (WHEN)` section, immediately hand off to `ase-task-implement`,
    and finally `ase-task-delete` the now-consumed plan. This gives a
    single, fast *one-shot* refactoring mode.

-   `--next`|`-n` *option*[,...]:
    Automatically choose the next step after composing the plan.
    *option* is a single token or a *comma-separated chronological
    list* of tokens; an `IMPLEMENT`, `DRAFT`, or `GRILL` head token
    is consumed by this skill (bypassing `ase-task-edit`), and any
    remaining tokens are *forwarded* (via `--next`) to the downstream
    skill. For all other head tokens, the *entire* list is forwarded
    to `ase-task-edit`, which consumes its head itself. This lets an
    entire pipeline be pre-scripted in one shot. Recognized tokens at
    this skill: `none` (default, hand off to `ase-task-edit`
    interactively), `DONE` (stop), `EDIT` (hand off to
    `ase-task-edit`), `GRILL` (hand off to `ase-task-grill`),
    `DRAFT` (hand off to `ase-task-implement --draft`),
    or `IMPLEMENT` (hand off to `ase-task-implement`). Example:
    `--next DRAFT,INTEGRATE,DONE` refactors, drafts, applies the
    draft, and exits without further dialog.

##  ARGUMENTS

-   [*task-id*:] *request*:
    Description of the refactoring *request*. Optionally prefixed
    with a *task-id* followed by a colon to bind the resulting plan
    to a specific task id.

##  SCENARIOS

-   You want existing code restructured without changing its behavior
-   You want refactoring approaches with pros and cons before any changes
-   You want a task plan composed for a cleanup
-   You want a one-shot refactoring applied directly in place

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

[`ase-code-craft`](../ase-code-craft/help.md), [`ase-code-resolve`](../ase-code-resolve/help.md), [`ase-task-edit`](../ase-task-edit/help.md),
[`ase-task-grill`](../ase-task-grill/help.md), [`ase-task-implement`](../ase-task-implement/help.md).


##  NAME

`ase-code-resolve` - Resolve Problem

##  SYNOPSIS

`ase-code-resolve`
    [`--help`|`-h`]
    [`--auto`|`-a`]
    [`--dry`|`-d`]
    [`--quick`|`-Q`]
    [`--next`|`-n` *option*[,...]]
    [*task-id*:] *problem*

##  DESCRIPTION

The `ase-code-resolve` skill resolves a *bug* or *problem* by
investigating the related code, internalizing resolution tenets
(Surgical Changes, No Cleanups, Minimum Flags, Code Adequacy, Origin
Proximity, ...), proposing one or more *resolution approaches* with
pros and cons, letting the user pick the preferred approach, and
composing a corresponding *task plan*.

The *problem* may also be given as a bare issue identifier (e.g. `P1`
or `T1`) previously produced by `ase-code-analyze` or
`ase-arch-analyze` and persisted in the `ase` MCP key/value store
under `ase-issue-<id>`.

The skill does *not* directly modify source files. It persists the
plan via `ase_task_save` and then hands off to `ase-task-edit`,
`ase-task-preflight`, or `ase-task-implement`, as selected by
`--next`.

##  OPTIONS

`--auto`|`-a`:
    Automatically pick the recommended resolution approach without
    asking the user via the interactive dialog.

`--dry`|`-d`:
    Compose the plan *without* the `##  VERIFICATION` section. When
    `ase-task-implement` later applies such a plan, it strictly skips
    the entire verification phase (no build, tests, linter,
    type-checker, or program execution) once the source files have
    been modified.

`--quick`|`-Q`:
    Shorthand alias for `-a -d -n IMPLEMENT,DELETE`: automatically pick
    the recommended resolution approach, compose the plan *without* the
    `##  VERIFICATION` section, immediately hand off to `ase-task-implement`,
    and finally `ase-task-delete` the now-consumed plan. This gives a
    single, fast *one-shot* resolution mode.

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
    `--next IMPLEMENT,DONE` resolves the problem, implements it, and
    exits without further dialog.

##  ARGUMENTS

[*task-id*:] *problem*:
    Description of the *problem* to resolve, or a bare issue
    identifier like `P1` or `T1` previously produced by an analyzer
    skill. Optionally prefixed with a *task-id* followed by a colon
    to bind the resulting plan to a specific task id.

##  EXAMPLES

Resolve a free-text problem:

```text
❯ /ase-code-resolve fix race condition in cache invalidation
```

Resolve a previously analyzed issue and hand off to implementation:

```text
❯ /ase-code-resolve --next IMPLEMENT P1
```

##  SEE ALSO

[`ase-code-craft`](../ase-code-craft/help.md), [`ase-code-refactor`](../ase-code-refactor/help.md), [`ase-code-analyze`](../ase-code-analyze/help.md),
[`ase-arch-analyze`](../ase-arch-analyze/help.md), [`ase-task-edit`](../ase-task-edit/help.md), [`ase-task-preflight`](../ase-task-preflight/help.md),
[`ase-task-implement`](../ase-task-implement/help.md).

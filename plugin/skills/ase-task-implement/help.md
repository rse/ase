
##  NAME

`ase-task-implement` - Implement a Task Plan

##  SYNOPSIS

`ase-task-implement`
    [`--help`|`-h`]
    [`--next`|`-n` *option*[,...]]
    [`--worktree`|`-w` *name*]
    [`--source`|`-s` *source*]
    [`--changeset`|`-c` *changeset*]
    [`--draft`|`-d`]
    [`--stateless`|`-S`]
    [*id*]

##  DESCRIPTION

The `ase-task-implement` skill performs the *final implementation* of
a task plan by creating a complete *change set* from the plan's
*source* (the code basis) into the plan's *changeset* (the location of
the change set). Delivering the change set from there into the plan's
*target* is the separate concern of `ase-task-integrate`. Afterwards
the checkboxes of the realized `DOM`/`IFC`/`ARC`/`IMP` bullet-points
and of the performed and succeeded `REG`/`CON` bullet-points are ticked
to `[x]` (or `[/]` if only partially realized or succeeded), refreshing
the plan's `Modified:` key. Bullet-points in state `[-]` (cancelled) or
`[>]` (deferred) are *skipped*: they are neither realized nor checked,
do not count against completeness, and keep their checkbox untouched.

The *source* is selected by the plan's `Source:` frontmatter key
(if absent, the configured default `project.task.default.source`),
overridable via `--source`:

-   `worktree` (default): the *origin* working copy (the one the skill
    was started in) with its checked-out branch.
-   `branch:`*name*: the existing branch *name*. For a `worktree`
    changeset without `--worktree`, the origin working copy is
    *switched* to it in place first, but only if it has *no*
    uncommitted changes, otherwise the skill stops and touches nothing.

A context worktree created by `--worktree` carries its *own* branch
*name*, which starts at the source (so the source branch itself is never
checked out there and stays available as the integration target), while
a reused one keeps its own base, so earlier work in it is continued.

The *changeset* is selected by the plan's `Changeset:` frontmatter
key (if absent, the configured default `project.task.default.changeset`),
overridable via `--changeset`:

-   `worktree` (default): the change set stays *uncommitted* in the
    context worktree.
-   `branch:`*name*: the change set is *committed* onto the branch
    *name* -- created from the source if missing -- inside the worktree
    in which this branch is checked out, or inside a newly created
    worktree `.ase/worktree/<name>`.
-   `attachment:`*name*: the change set is made and verified in a
    *temporary* worktree, detached at the source commit, and stored as
    the attachment block of type `text/x-diff; charset=utf-8;
    kind="<name>"` (with its base commit in the `Desc:` key) of the
    plan only, leaving all artifacts untouched. An already existing
    attachment of this kind is re-applied first, so re-runs build the
    change set *cumulatively*. A *stale* one -- older than the plan --
    stops the skill with an error, and an already *delivered* one --
    marked `merged` in its `Desc:` key by `ase-task-integrate
    --no-cleanup` -- is not re-applied, but replaced by a fresh change
    set. The `--draft` shorthand selects
    `attachment:draft`, the *implementation draft* of the plan, which
    can be reviewed via `ase-task-view --full` and delivered via
    `ase-task-integrate --draft`. An undelivered draft is *ignored* by
    any other changeset (with a warning), as only `attachment:draft`
    builds upon it.

For derived changesets (`branch:` and `attachment:`), *uncommitted*
changes of a `worktree` source are *not* carried over, as they start
at its `HEAD`.

Unless `--stateless` is given, the plan's `Status:` key follows the
task lifecycle model: for `solo` it stays untouched (as the task is
closed by `ase-task-integrate`), and for `team` and `enterprise` it
becomes `IMPLEMENTING` before and `IMPLEMENTED` (if the change set was
applied completely and successfully) or `STALLED` (otherwise) after
the implementation.

The *kind of change* stated by the plan's `Kind:` frontmatter key
(`SPECIFYING`, `CRAFTING`, `REFACTORING`, or `RESOLVING`) selects which
*operation-specific tenet set* of the **ASE Tenets** is internalized
before any artifact is touched, in addition to the always applying
**GENERIC TENETS**. If a plan carries no such key, the kind is
*inferred* from the plan content, defaulting to `CRAFTING`.

If the task plan deliberately *omits* the `##  VERIFICATION (WHEN)` section
(as produced by `ase-code-craft`, `ase-code-refactor`,
`ase-code-resolve`, or `ase-task-edit` when invoked with `--dry`),
the entire verification phase is strictly skipped: no build, tests,
linter, type-checker, or program execution is performed once the
source files have been modified.

After implementation, the user is asked whether to stop, hand off to
`ase-task-edit`, hand off to `ase-task-integrate`, or delete the task
plan, unless `--next` pre-selects this choice.

##  OPTIONS

-   `--next`|`-n` *option*[,...]:
    Automatically answer the user dialog for the next step. *option*
    is a single token or a *comma-separated chronological list* of
    tokens; the *first* token is consumed by this skill, and any
    remaining tokens are *forwarded* (via `--next`) to the downstream
    skill. Recognized tokens at this skill: `none` (default,
    interactive answer required), `DONE` (preserve task plan and stop),
    `EDIT` (hand off to `ase-task-edit`), `INTEGRATE` (hand off to
    `ase-task-integrate`, forwarding `--worktree`, `--changeset`, and
    `--stateless`), or `DELETE` (hand off to `ase-task-delete`).

-   `--worktree`|`-w` *name*:
    Operate in the *context worktree* `.ase/worktree/<name>` instead
    of the current working copy: it is *reused* if it already exists,
    otherwise it is *created* with its own branch *name* (checked out if
    it exists, created at the source commit otherwise, so the source
    branch itself is never checked out there). The `worktree` value of the
    changeset refers to it, while the `worktree` value of the source
    (and of the target of a subsequent integration) keeps referring to
    the origin working copy, so an integration delivers the change set
    from the context worktree back into the origin branch. The option
    is permitted for a `worktree` changeset only, as a `branch:` or
    `attachment:` changeset would leave the context worktree unused.

-   `--source`|`-s` *source*:
    Override the plan's `Source:` key (`worktree` or `branch:`*name*)
    for this run, without changing the plan.

-   `--changeset`|`-c` *changeset*:
    Override the plan's `Changeset:` key (`worktree`, `branch:`*name*,
    or `attachment:`*name*) for this run, without changing the plan.

-   `--draft`|`-d`:
    Shorthand for `--changeset attachment:draft`: create the
    *implementation draft* of the plan only, leaving all artifacts
    untouched (a dry-run). Mutually exclusive with `--changeset`.

-   `--stateless`|`-S`:
    Leave the plan's `Status:` key untouched.

##  ARGUMENTS

-   *id*:
    The unique identifier of the task whose plan should be
    implemented. If omitted, the *current* task id is used.

##  SCENARIOS

-   You want a task plan turned into actual changes
-   You want the planned change set applied and verified
-   You want the change set committed onto a dedicated branch
-   You want the change set attached to the plan for review only
-   You want a dry-run of the implementation as a reviewable draft
-   You want the implementation isolated in a Git worktree

##  EXAMPLES

Implement the current task plan in the current working copy:

```text
❯ /ase-task-implement
```

Implement a specific task and delete the plan when done:

```text
❯ /ase-task-implement --next DELETE hello
```

Draft the implementation of the task `hello` and apply the draft when
done:

```text
❯ /ase-task-implement --draft --next INTEGRATE hello
```

Implement the task `hello` inside the isolated Git worktree
`.ase/worktree/hello` and integrate it afterwards:

```text
❯ /ase-task-implement --worktree hello --next INTEGRATE,DONE hello
```

Implement the task `hello` by committing its change set onto the
branch `feature-hello`:

```text
❯ /ase-task-implement --changeset branch:feature-hello hello
```

##  SEE ALSO

[`ase-task-edit`](../ase-task-edit/help.md), [`ase-task-integrate`](../ase-task-integrate/help.md),
[`ase-task-view`](../ase-task-view/help.md), [`ase-task-delete`](../ase-task-delete/help.md).



##  NAME

`ase-task-integrate` - Integrate a Task Change Set

##  SYNOPSIS

`ase-task-integrate`
    [`--help`|`-h`]
    [`--next`|`-n` *option*[,...]]
    [`--worktree`|`-w` *name*]
    [`--changeset`|`-c` *changeset*]
    [`--draft`|`-d`]
    [`--target`|`-t` *target*]
    [`--mode`|`-m` `merge`|`rebase`|`squash`]
    [`--no-cleanup`|`-K`]
    [`--stateless`|`-S`]
    [*id*]

##  DESCRIPTION

The `ase-task-integrate` skill delivers the *change set* of a task
plan, as created by `ase-task-implement`, from the plan's *changeset*
(the location of the change set) into the plan's *target* (the place
of integration). The integration itself is performed by the skill
`ase-repo-merge`, which commits still uncommitted changes of the
change set, merges them into the target branch (through a regular
merge, a rebase with fast-forward, or a squash merge, as selected via
`--mode`), resolves merge conflicts semantically, and reports the
verdict `MERGED`, `CONFLICT`, or `FAILED`.

The *changeset* is selected by the plan's `Changeset:` frontmatter
key (if absent, the configured default `project.task.default.changeset`),
overridable via `--changeset`:

-   `worktree` (default): the uncommitted changes and the checked-out
    branch of the context worktree. If it equals the target branch
    (only possible without `--worktree`), the integration just commits
    the uncommitted changes in place.
-   `branch:`*name*: the existing branch *name*.
-   `attachment:`*name*: the attachment block of type `text/x-diff;
    charset=utf-8; kind="<name>"` of the plan, which is applied on a
    *temporary* branch at the commit it is based on, so drift of the
    target is resolved by the merge. A *stale* attachment -- one whose
    `Modified:` key is absent or older than the `Modified:` key of the
    plan frontmatter -- stops the skill with an error, and so does an
    already *delivered* one -- one whose `Desc:` key carries the
    `merged` marker of an earlier `--no-cleanup` integration.
-   `attachment:draft`: the *implementation draft* of the plan, as
    created by `ase-task-implement --draft`, selectable via the
    `--draft` shorthand.

The *target* is selected by the plan's `Target:` frontmatter key
(if absent, the configured default `project.task.default.target`),
overridable via `--target`:

-   `worktree`: the checked-out branch of the *origin* working copy,
    i.e. the one the skill was started in (also with `--worktree`).
-   `branch:`*name*: the existing branch *name*, which has to be
    checked out in some worktree and to have no uncommitted changes.
-   `source` (default): whatever the plan's `Source:` key refers to.

The skill stops with an error -- touching nothing -- if the change set
and the target are the same branch (except for the `worktree` changeset
of the origin working copy, which just commits in place, see above), or
if the change set carries neither commits beyond the target nor
uncommitted changes. Likewise, a merge which leaves the content of the
target unchanged, as the change set already landed earlier (e.g. on a
repeated integration), counts as *no* integration: its empty merge
commit is dropped again and the skill stops with an error. So it never
reports a success without having delivered anything.

Unless `--stateless` is given, the plan's `Status:` key follows the
task lifecycle model: for `solo` the plan has to be `OPEN` (otherwise
the integration is refused) and it becomes `CLOSED` on a successful
integration and stays `OPEN` otherwise, for `enterprise` it becomes
`INTEGRATING` before and `INTEGRATED` (on success), `APPROVED` (on
nothing delivered), or `DEFERRED` (otherwise) after the integration,
and for `team`, which defines no integration states, it stays
untouched.

After a successful integration, the user is asked whether to preserve
or delete the task plan, unless `--next` pre-selects this choice.

##  OPTIONS

-   `--next`|`-n` *option*[,...]:
    Automatically answer the user dialog for the next step. Recognized
    tokens at this skill: `none` (default, interactive answer
    required), `DONE` (preserve task plan and stop), or `DELETE` (hand
    off to `ase-task-delete`).

-   `--worktree`|`-w` *name*:
    Operate on the *context worktree* `.ase/worktree/<name>` instead
    of the current working copy, as for `ase-task-implement`. The
    worktree has to exist already: an integration never creates it, so
    a mistyped *name* stops the skill with an error. The option is
    permitted for a `worktree` changeset only, as a `branch:` or
    `attachment:` changeset would leave the context worktree unused.

-   `--changeset`|`-c` *changeset*:
    Override the plan's `Changeset:` key (`worktree`, `branch:`*name*,
    or `attachment:`*name*) for this run, without changing the plan.

-   `--draft`|`-d`:
    Shorthand for `--changeset attachment:draft`: deliver the
    *implementation draft* of the plan. Mutually exclusive with
    `--changeset`.

-   `--target`|`-t` *target*:
    Override the plan's `Target:` key (`worktree`, `branch:`*name*, or
    `source`) for this run, without changing the plan.

-   `--mode`|`-m` `merge`|`rebase`|`squash`:
    The merge mode, passed through to `ase-repo-merge` (default:
    `merge`): `merge` creates a merge commit, `rebase` rebases the
    change set branch (rewriting its commits) onto the target branch
    and fast-forwards the target branch, and `squash` combines all
    changes of the change set into one new commit on the target branch.

-   `--no-cleanup`|`-K`:
    After a successful integration, keep the delivered change set
    instead of removing it: the branch and its worktree, or the
    attachment block, which is then marked as delivered by appending
    `, merged <commit>` to its `Desc:` key, so it is never delivered
    again. Without this option, a delivered branch is removed only if
    Git considers it merged (always for `--mode squash`) and its
    worktree has no uncommitted changes. A temporary branch of an
    attachment is always removed.

-   `--stateless`|`-S`:
    Leave the plan's `Status:` key untouched.

##  ARGUMENTS

-   *id*:
    The unique identifier of the task whose change set should be
    integrated. If omitted, the *current* task id is used.

##  SCENARIOS

-   You want the implemented change set committed to the code base
-   You want a change set branch merged into its target branch
-   You want a change set attachment delivered into the code base
-   You want a reviewed implementation draft applied to the code base
-   You want the task closed once its change set has landed

##  EXAMPLES

Integrate (commit) the change set of the current task plan:

```text
❯ /ase-task-integrate
```

Apply the implementation draft of the task `hello` and remove the
draft attachment afterwards:

```text
❯ /ase-task-integrate --draft hello
```

Merge the change set branch of the task `hello` into `main` and
keep the branch afterwards:

```text
❯ /ase-task-integrate --changeset branch:feature-hello --target branch:main --no-cleanup hello
```

Squash the change set branch of the task `hello` into one commit on
its target:

```text
❯ /ase-task-integrate --changeset branch:feature-hello --mode squash hello
```

##  SEE ALSO

[`ase-task-implement`](../ase-task-implement/help.md), [`ase-repo-merge`](../ase-repo-merge/help.md),
[`ase-task-status`](../ase-task-status/help.md), [`ase-task-delete`](../ase-task-delete/help.md).


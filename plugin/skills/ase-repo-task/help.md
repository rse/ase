
##  NAME

`ase-repo-task` - Derive a Task from a Change Set

##  SYNOPSIS

`ase-repo-task`
    [`--help`|`-h`]
    [`--focus`|`-f` *section*[,...]]
    [`--staged`]
    [`--unstaged`]
    [`--worktree`|`-w` *name*]
    [`--branch`|`-b` *branch*]
    [`--commit`|`-c` *commit*]
    [*task-id*[`:`]]
    [*scope*]

##  DESCRIPTION

The `ase-repo-task` skill *reverse-engineers* a Git change set -- the
*staged* changes (or, with `--unstaged`, the *unstaged* and *untracked*
changes, with both `--staged` and `--unstaged`, *all* uncommitted
changes, with `--worktree`, those of an ASE worktree, with `--branch`,
the changes of a *branch* against its *base*, or, with `--commit`, a
*single commit*) -- into a *new task plan*.
Optionally, the change set is first narrowed to a *scope* topic.

The task plan describes the change set as a *still-to-be-done* change
relative to its base state, so that the task can be handed over -- e.g.
through a task store backed by a foreign issue tracker -- and an
independent re-implementation of it yields a *similar* change set.
Hence, its `SPECIFICATION (WHAT)` section is *exactly precise* and
*complete*, naming the exact externally observable surface (commands,
options, arguments, configuration keys, paths, identifiers, and
messages), its `DESIGN (HOW)` section captures at least the *major
cruxes* of the realization, and its `VERIFICATION (WHEN)` section names
the project's build, lint, and test procedures plus a few confirming
scenarios.

The plan never contains code or diff excerpts of the change set, and the
change set is never attached to it, so the re-implementation stays an
independent realization. Commit messages (of `--branch` and `--commit`)
only contribute the *rationale*, while the diff stays authoritative. The
plan gets the default lifecycle state and a `Kind:` inferred from the
change set, and becomes the *current task* of the session.

The skill *complements* its neighbors: `ase-repo-review` and
`ase-repo-diff` judge resp. narrate a change set, `ase-task-edit` plans a
task from an instruction, and `ase-task-implement` turns a task plan into
a change set -- whereas `ase-repo-task` turns a change set into a task
plan.

##  OPTIONS

-   `--focus`|`-f` *section*[,...]:
    Derive only the given plan *section*(s). Each *section* is one of
    `SPECIFICATION` (also `SPEC` or `WHAT`), `DESIGN` (also `DES` or
    `HOW`), or `VERIFICATION` (also `VERIFY`, `VER`, or `WHEN`), matched
    case-sensitively, or the sentinel `all` (default). All other sections
    are omitted entirely. An unknown, empty, or duplicate *section* token
    aborts the skill.

-   `--staged`:
    Derive from the *staged* changes of the working copy. This is the
    default if neither `--unstaged`, `--branch`, nor `--commit` is given.
    Combined with `--unstaged`, derive from *all* uncommitted changes.
    Combined with `--branch`, additionally derive from the staged changes
    of the worktree where the *branch* is checked out.

-   `--unstaged`:
    Derive from the *unstaged* changes and the *untracked* files of the
    working copy (except *ASE*'s own state below `.ase/`) instead of the
    *staged* changes. Combined with `--staged`, derive from *all*
    uncommitted changes. Combined with `--branch`, additionally derive
    from the unstaged changes and untracked files of the worktree where
    the *branch* is checked out.

-   `--worktree`|`-w` *name*:
    Derive from the *staged* resp. *unstaged* changes of the existing ASE
    worktree `.ase/worktree/`*name* instead of those of the current
    working copy. A missing worktree aborts the skill with an error.
    This option cannot be combined with `--branch` (which locates the
    worktree of its branch itself) or `--commit`.

-   `--branch`|`-b` *branch*:
    Derive from the commits of *branch* (any Git revision) since its fork
    point from its *base*, instead of the *staged* changes. The base is
    determined automatically as the local branch with the *nearest* fork
    point (preferring the checked-out branch on a tie) and is reported
    before the derivation.

-   `--commit`|`-c` *commit*:
    Derive from the single *commit* (any Git revision) against its first
    parent, instead of the *staged* changes. This option cannot be
    combined with `--branch`, `--staged`, or `--unstaged`.

##  ARGUMENTS

-   *task-id*[`:`]:
    Create the new task plan under the unique identifier *task-id*. If
    a task plan with this identifier already exists, the skill aborts
    and leaves it untouched. If *task-id* is omitted, a new identifier
    is allocated according to the task id scheme of the project. A
    *lone* argument matching the task id syntax is always taken as the
    *task id*, never as a scope; to combine both, separate them with a
    `:` character.

-   *scope*:
    Narrow the change set to the free-text *scope* topic: only the
    changes which semantically belong to it, plus the changes they
    depend on, are derived into the task plan. If no change matches the
    *scope*, the skill aborts.

##  SCENARIOS

-   You want a task plan derived from your staged or uncommitted changes
-   You want a feature branch or a commit described as a task
-   You want an issue for a foreign issue tracker out of a change set
-   You want a change set re-implementable elsewhere from its description
-   You want only one topic of a mixed change set turned into a task
-   You want only the specification of a change set captured

##  EXAMPLES

Derive a new task plan from the staged changes:

```text
❯ /ase-repo-task
```

Derive the task `json-export` from the branch `feature` against its base:

```text
❯ /ase-repo-task -b feature json-export
```

Derive a task from the last commit, narrowed to its JSON export changes:

```text
❯ /ase-repo-task -c HEAD json-export: the new JSON export
```

Derive only the specification from all uncommitted changes:

```text
❯ /ase-repo-task --staged --unstaged --focus WHAT
```

##  SEE ALSO

[`ase-repo-review`](../ase-repo-review/help.md), [`ase-repo-diff`](../ase-repo-diff/help.md), [`ase-repo-dissect`](../ase-repo-dissect/help.md),
[`ase-task-edit`](../ase-task-edit/help.md), [`ase-task-view`](../ase-task-view/help.md), [`ase-task-grill`](../ase-task-grill/help.md),
[`ase-task-implement`](../ase-task-implement/help.md).

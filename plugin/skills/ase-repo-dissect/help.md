
##  NAME

`ase-repo-dissect` - Dissect a Change Set

##  SYNOPSIS

`ase-repo-dissect`
    [`--help`|`-h`]
    [`--max-parts`|`-m` *count*]
    [`--staged`|`-s`]
    [`--dry`|`-d`]
    [`--force`|`-f`]
    [*dissect-hint*]

##  DESCRIPTION

The `ase-repo-dissect` skill treats the current Git change set as an
*epic* and *dissects* it domain-wise and logically into *cohesive
parts*. Each part is a self-contained unit of change with a single
coherent purpose, so it can be reviewed and committed *atomically* and
*independently* of the others.

The change set is captured from the working copy (`git diff`), with
untracked files folded in *read-only*, or -- under `--staged`/`-s` --
from the Git index (`git diff --cached HEAD`). The dissection follows a
strict ruleset: at least *2* and at most *count* parts are derived,
*every* hunk is assigned to *exactly one* part, mutually dependent hunks
are kept together, all hunks of one file normally stay in the same part,
and nothing beyond the actual change set is invented. The cut follows
the *semantics* of the change, not its technical structure -- a split by
file, directory, or technical layer is usually *not* the intended one.
If the change set carries only a single cohesive purpose, it is reported
as *not dissectable* and nothing is created.

An optional *dissect-hint* steers *how* the change set is split -- which
changes belong together, along which axis to cut, or how many parts to
aim at. It is especially useful after a `--dry` run showed an unintended
dissection. The hint overrides the default grouping, but never the
ruleset itself.

The derived parts are first reported as a *dissection table* (part
number, worktree id, scope, and rationale). Then -- unless `--dry` is
given -- each part's patch is written to a temporary file and applied
inside a *fresh Git WorkTree* `.ase/worktree/<project-id>-<feature-slug>`,
whose branch carries the same name and is created from `HEAD`. If a
`CHANGELOG.md` file exists, a matching entry summarizing that part is
added *inside* the worktree.

Every part stays *uncommitted*, a failing `git apply` is reported for
that part while the remaining parts continue, and the *original working
copy is never mutated*.

Note that the working-copy patch (without `--staged`) is taken relative
to the Git *index* while the worktrees are created from `HEAD`. So if
changes are *also* staged, the affected part patches may not apply
cleanly and are then reported as failed; stage everything and use
`--staged` in that situation.

##  OPTIONS

-   `--max-parts`|`-m` *count*:
    Upper bound for the number of derived parts (default: `8`). The
    lower bound is always `2`, because fewer parts are no dissection.

-   `--staged`|`-s`:
    Dissect the *staged* changes (the Git index against `HEAD`) instead
    of the working copy changes. Untracked files are then *not* folded
    in, because they are by definition not part of the index.

-   `--dry`|`-d`:
    *Report only* -- print the dissection table but create *no*
    artifacts at all, so the decision stays fully reversible.

-   `--force`|`-f`:
    Remove and re-create already existing worktrees and branches of the
    derived names. Without this option, the skill detects colliding
    targets *before* writing anything, reports them, and stops with
    status *targets exist*.

##  ARGUMENTS

-   *dissect-hint*:
    A free-text hint telling *how* the change set should be split. If
    omitted, the parts are derived from the change set alone.

The worktree names are *not* argument-driven: they are always derived
from the *current* project id and the per-part feature slug.

##  SCENARIOS

-   You want a large uncommitted change set split into atomic parts
-   You want each cohesive part of a diff in its own Git worktree
-   You want mixed-up changes untangled before committing them
-   You want a preview of how a change set would be divided

##  EXAMPLES

Dissect the current working copy changes:

```text
❯ /ase-repo-dissect
```

Preview the dissection of the staged changes into at most four parts:

```text
❯ /ase-repo-dissect --staged --dry --max-parts 4
```

Re-dissect the changes, re-creating the previously created worktrees:

```text
❯ /ase-repo-dissect --force
```

Dissect the changes along an explicitly given axis:

```text
❯ /ase-repo-dissect keep the plugin and tool changes in separate parts
```

##  SEE ALSO

[`ase-task-dissect`](../ase-task-dissect/help.md), [`ase-repo-diff`](../ase-repo-diff/help.md), [`ase-repo-review`](../ase-repo-review/help.md),
[`ase-repo-changelog`](../ase-repo-changelog/help.md), [`ase-repo-commit`](../ase-repo-commit/help.md),
[`ase-repo-stage`](../ase-repo-stage/help.md).


##  NAME

`ase-repo-dissect` - Dissect a Change Set

##  SYNOPSIS

`ase-repo-dissect`
    [`--help`|`-h`]
    [`--max-parts`|`-m` *count*]
    [`--staged`|`-s`]
    [`--dry`|`-d`]
    [`--force`|`-f`]
    [`--sequential`|`-q`]
    [`--explain`|`-E`]
    [`--review`|`-r`]
    [`--auto`|`-a`]
    [`--changelog`|`-c`]
    [`--no-verify`|`-V`]
    [*dissect-hint*]

##  DESCRIPTION

The `ase-repo-dissect` skill treats the current Git change set as an
*epic* and *dissects* it domain-wise and logically into *cohesive
parts*. Each part is a self-contained unit of change with a single
coherent purpose, so it can be reviewed and committed *atomically* and
*independently* of the others.

The change set is captured from the working copy (`git diff HEAD`), with
untracked files folded in *read-only*, or -- under `--staged`/`-s` --
from the Git index (`git diff --cached HEAD`). The dissection follows a
strict ruleset: at least *2* (under `--sequential`: *1*) and at most
*count* parts are derived, *every* hunk is assigned to *exactly one*
part, mutually dependent hunks are kept together, all hunks of one file
normally stay in the same part, and nothing beyond the actual change set
is invented. The cut follows the *semantics* of the change, not its
technical structure -- a split by file, directory, or technical layer is
usually *not* the intended one. If the change set carries only a single
cohesive purpose, it is reported as *not dissectable* and nothing is
created (except under `--sequential`, which reports it as a single part
and, without `--dry`, walks it).

An optional *dissect-hint* steers *how* the change set is split -- which
changes belong together, along which axis to cut, or how many parts to
aim at. It is especially useful after a `--dry` run showed an unintended
dissection. The hint overrides the default grouping, but never the
ruleset itself.

The derived parts are first reported as a *dissection table* (part
number, id, scope, and rationale), where the id names the part's worktree
(under `--sequential` just the part itself). Then -- unless `--dry` or
`--sequential` is given -- each part's patch is written to a temporary
file and applied inside a *fresh Git WorkTree*
`.ase/worktree/<project-id>-<feature-slug>`, whose branch carries the
same name and is created from `HEAD`. If a `CHANGELOG.md` file exists, a
matching entry summarizing that part is added *inside* the worktree.

In this default *worktree mode*, every part stays *uncommitted*, a
failing `git apply` is reported for that part while the remaining parts
continue, and the *original working copy is never mutated*.

Under `--sequential`, the parts are instead *walked one after another*
through the *Git index* of the working copy, so a large, mixed pile of
uncommitted changes ends up as a sequence of cohesive commits on the
current branch. After the cut is confirmed, each part is staged via
`ase-repo-stage` (which also checks that the part builds on top of
the already committed ones), optionally explained via `ase-repo-diff
--explain` and reviewed via `ase-repo-review --evidence`, and then
decided on: *accept* crafts the commit message via `ase-repo-commit`
and lets you commit the part yourself, *change* corrects it via
`ase-code-edit` and presents it again, *skip* leaves it uncommitted,
and *regroup* re-dissects all remaining changes, optionally along a new
hint. The skill itself never commits and never discards a change.

##  OPTIONS

-   `--max-parts`|`-m` *count*:
    Upper bound for the number of derived parts (default: `8`). The
    lower bound is `2`, because fewer parts are no dissection (except
    under `--sequential`, where it is `1`).

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

-   `--sequential`|`-q`:
    Walk the parts one after another through the *Git index* of the
    working copy, instead of materializing them in worktrees: stage a
    part, present it for a decision, and let you commit it before the
    next part is staged. This requires that no file carries both staged
    and unstaged changes, and it cannot be combined with `--staged`.
    Combined with `--dry`, only the dissection table is reported and the
    walk options below are without effect, and `--force` is without
    effect under `--sequential`, as no worktree is created. Each of the
    walk options below requires `--sequential`, otherwise the skill
    stops with an error.

-   `--explain`|`-E`:
    Under `--sequential`, explain every staged part file by file in
    plain language via `ase-repo-diff --explain`.

-   `--review`|`-r`:
    Under `--sequential`, review every staged part via `ase-repo-review
    --evidence`, whose verdict determines the recommended decision.

-   `--auto`|`-a`:
    Under `--sequential`, additionally fix the review findings
    automatically via `ase-repo-review --auto` and add the fixes to the
    staged part. Implies `--review`.

-   `--changelog`|`-c`:
    Under `--sequential`, add a `CHANGELOG.md` entry for every part via
    `ase-repo-stage --changelog`, staged together with the part, unless
    the part already carries its own entry. The default worktree mode
    instead always adds an entry if a `CHANGELOG.md` file exists.

-   `--no-verify`|`-V`:
    Under `--sequential`, skip the check that every staged part builds
    on its own.

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
-   You want a large pile of agent-made changes curated into reviewed commits

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

Curate all uncommitted changes into commits, one reviewed and
auto-fixed part after another, with tests kept in a final part:

```text
❯ /ase-repo-dissect --sequential --explain --auto keep the tests in a final part
```

##  SEE ALSO

[`ase-task-dissect`](../ase-task-dissect/help.md), [`ase-repo-diff`](../ase-repo-diff/help.md), [`ase-repo-review`](../ase-repo-review/help.md),
[`ase-repo-changelog`](../ase-repo-changelog/help.md), [`ase-repo-commit`](../ase-repo-commit/help.md),
[`ase-repo-stage`](../ase-repo-stage/help.md), [`ase-code-edit`](../ase-code-edit/help.md).

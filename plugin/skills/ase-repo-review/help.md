
##  NAME

`ase-repo-review` - Review Changes

##  SYNOPSIS

`ase-repo-review`
    [`--help`|`-h`]
    [`--severity`|`-S`=(`AUTO`|`LOW`|`MEDIUM`|`HIGH`)]
    [`--thorough`|`-t`]
    [`--staged`]
    [`--unstaged`]
    [`--branch`|`-b` *branch*]
    [`--commit`|`-c` *commit*]

##  DESCRIPTION

The `ase-repo-review` skill performs a *holistic*,
*human-reviewer-style* critique of the *staged* Git changes (or, with
`--unstaged`, of the *unstaged* and *untracked* changes, with both
`--staged` and `--unstaged`, of *all* uncommitted changes, with
`--branch`, of the changes of a *branch* against its *base*, or, with
`--commit`, of a *single commit*) and emits a single
*approve* / *reject* **verdict** backed by *prioritized*,
*severity-tagged*, *line-cited* **findings**. Rather than scanning the
code mechanically, it first *reconstructs the change's own intent* and
then judges the diff *as a whole* against that intent - the way an
experienced reviewer would on a pull request.

The critique spans a fixed set of reviewer *dimensions*: **intent**
(does the diff do what it set out to, without scope creep),
**propagation** (the change fully and consistently carried over to call
sites, types, schemas, registries, catalogs, and analogous sibling
places, with matching contracts and terminology, and without orphans left
behind), **coverage** (all special and edge cases handled, like empty
values, boundaries, error paths, and all variants), **residue** (debug
output, commented-out code, scaffolding, temporary files, build output,
or secrets which do not belong into the change), **correctness**
(latent bugs, broken control/data flow), **design** (fit with the surrounding architecture,
naming, abstraction level), **clarity** (readability and
self-documentation for a future reader), **robustness** (error handling,
resource and concurrency safety), **security** and **performance** (risks
introduced by the change), **convention** (conformance to the
project's documented conventions - code style and the plan/spec
formats described in `AGENTS.md` and the `ase-format-*` meta documents),
**testing** (inadequate coverage for the change - new or fixed behavior
left untested, adjacent tests not updated, or existing tests silently
broken, disabled, or weakened), and **documentation** (user- or
developer-facing docs - `README`, `CHANGELOG`, help text, or AI
guidance/meta documents - left stale by the change).

Each finding carries a *severity* - **HIGH**, **MEDIUM**, **LOW**, or
**ACCEPTED** (a concern that is contractually addressed or accepted as a
documented priority conflict) - and is *evidence-grounded*: it cites the
exact `file:line` location it stems from. The overall verdict is
**REJECT - DEMANDS CHANGES** when any *HIGH* finding remains, and
**APPROVE** otherwise. The work is performed by a dedicated `ase-repo-review`
sub-agent so that the silent reading and read-only repository probing
never leak into the transcript; only the structured verdict and findings
are rendered.

The skill *complements* rather than duplicates its neighbors:
`ase-code-lint` flags *mechanical* code-quality issues, `ase-code-analyze`
inspects *logic and semantics*, `ase-repo-diff` narrates *what changed*
(with optional coherence, risk, and blast-radius reports), and
`ase-meta-diaboli` *adversarially challenges a thesis* - whereas
`ase-repo-review` renders a *reviewer's judgment* on a concrete diff
before it is committed or merged.

##  OPTIONS

-   `--severity`|`-S`=(`AUTO`|`LOW`|`MEDIUM`|`HIGH`):
    Set the *severity floor* (default `AUTO`): findings below the chosen
    threshold are suppressed, ordered `LOW` < `MEDIUM` < `HIGH`. The
    default `AUTO` means `MEDIUM` for a project with `grey` boxing and
    `LOW` (keep all findings) otherwise; an explicitly given floor always
    wins over the boxing, i.e. it also reviews a project with `black`
    boxing and, e.g. with `LOW`, shows all findings of a project with
    `grey` boxing. `ACCEPTED` findings are never suppressed, and
    the number of suppressed findings is always reported. Surviving
    findings are rendered in *descending severity* order `HIGH`,
    `MEDIUM`, `LOW`, `ACCEPTED`. The floor only affects the rendered
    findings table, not the overall *verdict*, which is always derived
    from all findings before the floor is applied.

-   `--thorough`|`-t`:
    Review *exhaustively* instead of reporting only a *few* high-signal
    findings: report every well-grounded concern, including minor nits,
    and additionally *plausible* concerns whose impact cannot be fully
    proven, marked with "*Plausible:*" and rated at most `MEDIUM`.

-   `--staged`:
    Review the *staged* changes of the working copy. This is the default
    if neither `--unstaged`, `--branch`, nor `--commit` is given.
    Combined with `--unstaged`, review *all* uncommitted changes.
    Combined with `--branch`, additionally review the staged changes of
    the worktree where the *branch* is checked out.

-   `--unstaged`:
    Review the *unstaged* changes and the *untracked* files of the
    working copy (except *ASE*'s own state below `.ase/`) instead of the
    *staged* changes. Combined with `--staged`, review *all* uncommitted
    changes. Combined with `--branch`, additionally review the unstaged
    changes and untracked files of the worktree where the *branch* is
    checked out.

-   `--branch`|`-b` *branch*:
    Review the commits of *branch* (any Git revision) since its fork
    point from its *base*, instead of the *staged* changes. The base is
    determined automatically as the local branch with the *nearest* fork
    point (preferring the checked-out branch on a tie) and is reported
    before the review. The commit messages are checked for mismatches
    against the diff.

-   `--commit`|`-c` *commit*:
    Review the single *commit* (any Git revision) against its first
    parent, instead of the *staged* changes. Its commit message is
    checked for mismatches against the diff. This option cannot be
    combined with `--branch`, `--staged`, or `--unstaged`.

##  ARGUMENTS

The `ase-repo-review` skill takes no positional arguments; it reviews the
currently *staged* Git changes, with `--unstaged` the unstaged and
untracked changes, with both `--staged` and `--unstaged` all uncommitted
changes, with `--branch` a branch against its base, or with `--commit` a
single commit.

##  SCENARIOS

-   You want the staged changes reviewed like a human reviewer would
-   You want an approve or reject verdict before committing
-   You want severity-tagged, line-cited findings on a diff
-   You want a holistic judgment instead of a mechanical lint
-   You want your not yet staged changes reviewed
-   You want an exhaustive review of all uncommitted changes
-   You want a feature branch reviewed before merging it
-   You want a single, already committed change reviewed

##  EXAMPLES

Review the currently staged changes before committing:

```text
❯ /ase-repo-review
```

Review the staged changes, reporting only `MEDIUM` and `HIGH` findings:

```text
❯ /ase-repo-review -S MEDIUM
```

Review the unstaged and untracked changes only:

```text
❯ /ase-repo-review --unstaged
```

Review all uncommitted changes exhaustively, reporting all findings:

```text
❯ /ase-repo-review --staged --unstaged -t -S LOW
```

Review the branch `feature` against its base, including the uncommitted
changes of its worktree:

```text
❯ /ase-repo-review -b feature --staged --unstaged
```

Review the last commit:

```text
❯ /ase-repo-review -c HEAD
```

##  SEE ALSO

[`ase-repo-diff`](../ase-repo-diff/help.md), [`ase-repo-commit`](../ase-repo-commit/help.md), [`ase-code-lint`](../ase-code-lint/help.md), [`ase-code-analyze`](../ase-code-analyze/help.md),
[`ase-meta-diaboli`](../ase-meta-diaboli/help.md), [`ase-repo-qa-commit`](../ase-repo-qa-commit/help.md).


##  NAME

`ase-repo-diff` - Summarize Diff

##  SYNOPSIS

`ase-repo-diff`
    [`--help`|`-h`]
    [`--explain`|`-E`]
    [`--coherence`|`-C`]
    [`--risk`|`-R`]
    [`--blast`|`-B`]
    [`--staged`]
    [`--unstaged`]
    [`--worktree`|`-w` *name*]
    [`--branch`|`-b` *branch*]
    [`--commit`|`-c` *commit*]

##  DESCRIPTION

The `ase-repo-diff` skill turns a raw Git diff into a *concise*,
*human-readable* narrative of what changed and why, *grouped by
intent* (such as *Feature*, *Improvement*, *Bugfix*, *Update*,
*Cleanup*, or *Refactor*) rather than by file. It inspects the
*staged* changes (or, with `--unstaged`, the *unstaged* and *untracked*
changes, with both `--staged` and `--unstaged`, *all* uncommitted
changes, with `--worktree`, those of an ASE worktree, with `--branch`,
the changes of a *branch* against its *base*, or, with `--commit`, a
*single commit*). The result is a compact table, one row per intent
group, each naming the affected files with their per-file `[+N/-M]`
line counts - giving you the essence of the changes at a glance. The
commit messages (of `--branch` and `--commit`) only contribute the
*rationale*, while the diff stays authoritative.

With `--explain`, the skill additionally *explains every changed file*
in *plain language*, for a reader who no longer remembers the change
or never saw it: the situation **BEFORE** the change, what the file
does differently **AFTER** it and why, and why the new state is
**CORRECT**. The latter cites the concrete *evidence* (the covered
case, the guarding check, the ruling-out type, or the exercising test)
as `file:line`, and openly says **UNVERIFIED** where no such evidence
exists, instead of just asserting correctness. The files are explained
in *comprehension order*: the foundations before their users.

With `--coherence`, the skill additionally *reconstructs the single
intended change* the diff is trying to accomplish - phrased as one crisp
*thesis* sentence - and then walks *every* hunk to *flag those that do
not serve it*: **scope creep** (an unrelated feature or drive-by refactor
riding along) and **stray debug** (leftover prints, commented-out code, or
disabled tests). It also flags the *gaps* which leave the thesis
**incomplete** (like callers not adapted to a changed signature, or a
rename applied only partially). It emits an overall **COHERENT** /
**INCOHERENT** verdict plus a table of the flagged hunks and gaps with what
to do with each - keeping the diff to a *single logical, coherent, and
complete change* before it is committed.

With `--risk`, the skill additionally *scores* the same diff against a
four-axis **coupling-criticality-coverage-reversibility** rubric and
emits a *graded risk report* - one table row per axis (each scored *1*-*5*
with a one-line evidence justification drawn from the actual hunks), an
overall risk band (**LOW**, **MODERATE**, **HIGH**, or **CRITICAL**),
and one actionable *mitigation* per high-risk axis. The axes combine
with *equal weights*, and the rubric is deliberately *not tuned* to any
specific project: every score is backed by cited evidence so it remains
*overridable*, and the report is *decision support*, not a merge gate.

With `--blast`, the skill additionally renders a *blast-radius map* - a
Mermaid `flowchart` of the *touched modules* and their *reverse
dependencies*, plus a *brief impact summary*. It *extracts the touched
modules* from the changed files, *scans the repository* for the
first-party code that *imports* or *references* those modules, builds a
blast-radius graph (touched modules as origin nodes, dependents fanning
out along the edges), renders it (as an inline image where supported),
and appends a short bullet list of the per-module impact -
giving a visual sense of *what a diff endangers* before a deeper review.

For a project with `black` boxing (`project.boxing`), the scrutiny of
`--explain`, `--coherence`, `--risk`, and `--blast` is suppressed, and
only the intent-grouped summary is shown. For a project with `grey`
boxing, `--explain` explains only the significant files and summarizes
the trivial ones in a single line.

The scrutiny always probes the repository in the *resulting* state of
the inspected changes: at the revision of `--branch` resp. `--commit`,
in the worktree of `--worktree`, and in the working copy otherwise.

##  OPTIONS

-   `--explain`|`-E`:
    In addition to the intent-grouped summary, explain *every* changed
    file in *plain language*: its state *before*, its state *after* and
    why, and why it is *correct*, backed by `file:line`-cited evidence
    or openly marked as *unverified*.

-   `--coherence`|`-C`:
    In addition to the intent-grouped summary, reconstruct the diff's
    *single intended change* as one crisp *thesis* sentence and flag
    *every* hunk that does *not* serve it - *scope creep* or *stray
    debug* - and every gap leaving it *incomplete*, then emit an overall
    **COHERENT** / **INCOHERENT** verdict with a table of the flagged
    hunks and gaps.

-   `--risk`|`-R`:
    In addition to the intent-grouped summary, score the diff against
    the *coupling-criticality-coverage-reversibility* rubric and emit a
    *graded risk report* with an overall risk band and per-axis
    *mitigations*. Scores are equal-weighted, evidence-backed, and
    deliberately untuned to the project.

-   `--blast`|`-B`:
    In addition to the intent-grouped summary, render a *blast-radius
    map* - a Mermaid `flowchart` of the *touched modules* and their
    *reverse dependencies* - plus a *brief impact summary* of what
    depends on the touched code and how far the blast reaches.

-   `--staged`:
    Summarize the *staged* changes of the working copy. This is the
    default if neither `--unstaged`, `--branch`, nor `--commit` is given.
    Combined with `--unstaged`, summarize *all* uncommitted changes.
    Combined with `--branch`, additionally summarize the staged changes
    of the worktree where the *branch* is checked out.

-   `--unstaged`:
    Summarize the *unstaged* changes and the *untracked* files of the
    working copy (except *ASE*'s own state below `.ase/`) instead of the
    *staged* changes. Combined with `--staged`, summarize *all*
    uncommitted changes. Combined with `--branch`, additionally summarize
    the unstaged changes and untracked files of the worktree where the
    *branch* is checked out.

-   `--worktree`|`-w` *name*:
    Summarize the *staged* resp. *unstaged* changes of the existing ASE
    worktree `.ase/worktree/`*name* instead of those of the current
    working copy. A missing worktree aborts the skill with an error.
    This option cannot be combined with `--branch` (which locates the
    worktree of its branch itself) or `--commit`.

-   `--branch`|`-b` *branch*:
    Summarize the commits of *branch* (any Git revision) since its fork
    point from its *base*, instead of the *staged* changes. The base is
    determined automatically as the local branch with the *nearest* fork
    point (preferring the checked-out branch on a tie) and is reported
    before the summary.

-   `--commit`|`-c` *commit*:
    Summarize the single *commit* (any Git revision) against its first
    parent, instead of the *staged* changes. This option cannot be
    combined with `--branch`, `--staged`, or `--unstaged`.

##  ARGUMENTS

The `ase-repo-diff` skill takes no positional arguments; it summarizes
the currently *staged* Git changes, with `--unstaged` the unstaged and
untracked changes, with both `--staged` and `--unstaged` all uncommitted
changes, with `--branch` a branch against its base, or with `--commit` a
single commit.

##  SCENARIOS

-   You want a readable, intent-grouped summary of the staged changes
-   You want your not yet staged changes summarized
-   You want each changed file explained: before, after, and why it is correct
-   You want a diff checked for scope creep, stray debug leftovers, and incompleteness
-   You want a graded risk report of a change before committing
-   You want a blast-radius map of what depends on the touched code
-   You want a feature branch or a single commit summarized

##  EXAMPLES

Summarize the currently staged changes:

```text
❯ /ase-repo-diff
```

Summarize the staged changes and explain each changed file:

```text
❯ /ase-repo-diff --explain
```

Summarize the staged changes and append an intent-coherence report:

```text
❯ /ase-repo-diff --coherence
```

Summarize the staged changes and append a graded risk report:

```text
❯ /ase-repo-diff --risk
```

Summarize the staged changes and append a blast-radius map:

```text
❯ /ase-repo-diff --blast
```

Summarize all uncommitted changes and check their coherence:

```text
❯ /ase-repo-diff --staged --unstaged -C
```

Summarize the branch `feature` against its base with a risk report:

```text
❯ /ase-repo-diff -b feature -R
```

Summarize the last commit and explain each of its files:

```text
❯ /ase-repo-diff -c HEAD -E
```

##  SEE ALSO

[`ase-repo-review`](../ase-repo-review/help.md), [`ase-repo-task`](../ase-repo-task/help.md), [`ase-repo-commit`](../ase-repo-commit/help.md), [`ase-repo-changelog`](../ase-repo-changelog/help.md), [`ase-arch-analyze`](../ase-arch-analyze/help.md).

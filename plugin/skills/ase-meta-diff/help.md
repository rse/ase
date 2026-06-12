
##  NAME

`ase-meta-diff` - Summarize Diff

##  SYNOPSIS

`ase-meta-diff`
    [`--help`|`-h`]
    [`--coherence`|`-c`]
    [`--risk`|`-r`]
    [`--blast`|`-b`]

##  DESCRIPTION

The `ase-meta-diff` skill turns a raw Git diff into a *concise*,
*human-readable* narrative of what changed and why, *grouped by
intent* (such as *Feature*, *Improvement*, *Bugfix*, *Update*,
*Cleanup*, or *Refactor*) rather than by file. It inspects the
*staged* changes (`git diff --cached HEAD`). The result is a compact
table, one row per intent group, each naming the affected files
with their per-file `[+N/-M]` line counts - giving you the essence
of the changes at a glance.

With `--coherence`, the skill additionally *reconstructs the single
intended change* the diff is trying to accomplish - phrased as one crisp
*thesis* sentence - and then walks *every* hunk to *flag those that do
not serve it*: **scope creep** (an unrelated feature or drive-by refactor
riding along) and **stray debug** (leftover prints, commented-out code, or
disabled tests). It emits an overall **COHERENT** / **INCOHERENT** verdict
plus a table of the flagged hunks with what to do with each - keeping the
diff to a *single logical and coherent change* before it is committed.

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
out along the edges), dispatches the rendering to the `ase-meta-diagram`
sub-agent, and appends a short bullet list of the per-module impact -
giving a visual sense of *what a diff endangers* before a deeper review.

##  ARGUMENTS

`--coherence`, `-c`:
    In addition to the intent-grouped summary, reconstruct the diff's
    *single intended change* as one crisp *thesis* sentence and flag
    *every* hunk that does *not* serve it - *scope creep* or *stray
    debug* - then emit an overall **COHERENT** / **INCOHERENT** verdict
    with a table of the flagged hunks.

`--risk`, `-r`:
    In addition to the intent-grouped summary, score the diff against
    the *coupling-criticality-coverage-reversibility* rubric and emit a
    *graded risk report* with an overall risk band and per-axis
    *mitigations*. Scores are equal-weighted, evidence-backed, and
    deliberately untuned to the project.

`--blast`, `-b`:
    In addition to the intent-grouped summary, render a *blast-radius
    map* - a Mermaid `flowchart` of the *touched modules* and their
    *reverse dependencies* - plus a *brief impact summary* of what
    depends on the touched code and how far the blast reaches.

##  EXAMPLES

Summarize the currently staged changes:

```text
❯ /ase-meta-diff
```

Summarize the staged changes and append an intent-coherence report:

```text
❯ /ase-meta-diff --coherence
```

Summarize the staged changes and append a graded risk report:

```text
❯ /ase-meta-diff --risk
```

Summarize the staged changes and append a blast-radius map:

```text
❯ /ase-meta-diff --blast
```

##  SEE ALSO

[`ase-meta-commit`](../ase-meta-commit/help.md), [`ase-meta-changelog`](../ase-meta-changelog/help.md), [`ase-arch-analyze`](../ase-arch-analyze/help.md).

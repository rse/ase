
##  NAME

`ase-code-analyze` - Analyze Source Code

##  SYNOPSIS

`ase-code-analyze`
    [`--help`|`-h`]
    [`--performance`|`-p`]
    [`--security`|`-s`]
    [`--severity`|`-S`=(`LOW`|`MEDIUM`|`HIGH`)]
    [`--quick`|`-Q`]
    *source-reference*

##  DESCRIPTION

The `ase-code-analyze` skill analyzes the source code of the referenced
location, and its directly related source code, for problems. It is
*read-only* and advisory: it reports problems but applies *no* changes.

The *analysis lens* depends on the selected options:

- **default** (neither `--performance` nor `--security`): problems in
  its *logic*, *semantics*, and related *control flow*.

- `--performance`|`-p`: problems in *performance* and *efficiency*.

- `--security`|`-s`: problems in *security*.

The `--performance` and `--security` options are *mutually exclusive*.

The `--severity`|`-S`=(`LOW`|`MEDIUM`|`HIGH`) option sets a *severity
floor* (default `LOW`): problems below the chosen threshold are silently
suppressed (neither reported nor persisted), ordered `LOW` < `MEDIUM` <
`HIGH`. The default `LOW` keeps all problems; `ACCEPTED` problems are
never suppressed. Surviving problems are reported in *descending
severity* order `HIGH`, `MEDIUM`, `LOW`, `ACCEPTED` - keeping the
`file`/`line` order within the same severity - and are renumbered
contiguously as `P<n>`, so `P1` is the most severe problem.

The `--quick`|`-Q` option turns the analysis into a fully autonomous
one-shot `analyze → resolve → implement → verify` pipeline: after
reporting, it groups the surviving problems into *per-file clusters*
(same-file problems are never resolved in parallel), dispatches one
worktree-isolated `ase-code-resolve -Q` sub-agent per cluster in
parallel (in the background, with a progress line per returning
cluster; each worktree is first *seeded* with the live tree's
uncommitted state so its diff applies cleanly), then reconciles all
resulting diffs into the working tree (plain `git apply`, `--3way` as
fallback, and a conflicting cluster is re-resolved sequentially so that
*all* problems are merged), removes the temporary worktrees again, and
finally runs the project's formatter, build, and test suite centrally
on the merged result, with up to two autonomous repair rounds for any
failures. `ACCEPTED` problems document deliberately accepted trade-offs
and are *excluded* from auto-resolution. Nothing is staged or
committed -- staging remains with the user. It composes with
`--severity` (only surviving findings are resolved) and requires a Git
repository (otherwise the clusters are resolved sequentially without
worktree isolation).

The skill investigates the code base silently, reports each detected
problem as a `PROBLEM` entry with severity (`LOW`, `MEDIUM`, `HIGH`) and
inline file/line references (in the performance lens, each entry
additionally carries an *evidence* and a *trade-off* line), and persists
results in the `ase` MCP key/value store as `ase-issue-P<n>` entries so
they can later be resolved via `ase-code-resolve P<n>`.

##  ARGUMENTS

*source-reference*:
    A file, directory, function, or other reference to the source code
    to analyze.

##  EXAMPLES

Analyze a specific source file for logic/semantic problems:

```text
❯ /ase-code-analyze src/server.ts
```

Analyze a directory of code:

```text
❯ /ase-code-analyze src/handlers/
```

Analyze a source file for performance/efficiency opportunities only:

```text
❯ /ase-code-analyze --performance src/server.ts
```

Analyze a source file for security aspects only:

```text
❯ /ase-code-analyze -s src/handlers/
```

Analyze a directory, reporting only `MEDIUM` and `HIGH` problems:

```text
❯ /ase-code-analyze -S MEDIUM src/handlers/
```

Analyze a directory and, in one non-interactive shot, auto-resolve and
implement every `HIGH` finding:

```text
❯ /ase-code-analyze -Q -S HIGH src/handlers/
```

##  SEE ALSO

[`ase-code-resolve`](../ase-code-resolve/help.md), [`ase-code-refactor`](../ase-code-refactor/help.md), [`ase-code-lint`](../ase-code-lint/help.md),
[`ase-code-explain`](../ase-code-explain/help.md), [`ase-arch-analyze`](../ase-arch-analyze/help.md).

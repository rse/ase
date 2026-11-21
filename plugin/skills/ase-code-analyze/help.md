
##  NAME

`ase-code-analyze` - Analyze Source Code

##  SYNOPSIS

`ase-code-analyze`
    [`--help`|`-h`]
    [`--auto`|`-a`]
    [`--performance`|`-p`]
    [`--security`|`-s`]
    [`--severity`|`-S`=(`AUTO`|`LOW`|`MEDIUM`|`HIGH`)]
    [`--prefix`|`-P` *prefix*]
    [`--staged`]
    [`--unstaged`]
    [*source-reference*]

##  DESCRIPTION

The `ase-code-analyze` skill analyzes the source code of the referenced
location, and its directly related source code, for problems. It is
*read-only* and advisory: it reports problems but applies *no* changes,
unless `--auto` is given.

The *analysis lens* depends on the selected options:

- **default** (neither `--performance` nor `--security`): problems in
  its *logic*, *semantics*, and related *control flow*.

- `--performance`|`-p`: problems in *performance* and *efficiency*.

- `--security`|`-s`: problems in *security*.

The `--performance` and `--security` options are *mutually exclusive*.

The `--severity`|`-S`=(`AUTO`|`LOW`|`MEDIUM`|`HIGH`) option sets a
*severity floor* (default `AUTO`): problems below the chosen threshold
are silently suppressed (neither reported nor persisted), ordered `LOW`
< `MEDIUM` < `HIGH`. The default `AUTO` means `MEDIUM` for a project
with `grey` boxing, no analysis at all for a project with `black`
boxing, and `LOW` (keep all problems) otherwise; an explicitly given
floor always wins over the boxing, i.e. it also analyzes a project with
`black` boxing and, e.g. with `LOW`, reports all problems of a project
with `grey` boxing. `ACCEPTED` problems are never suppressed. Surviving
problems are reported in *descending
severity* order `HIGH`, `MEDIUM`, `LOW`, `ACCEPTED` - keeping the
`file`/`line` order within the same severity - and are renumbered
contiguously as `P<n>`, so `P1` is the most severe problem.

The `--prefix`|`-P` *prefix* option prefixes every reported problem id
with *prefix* and a hyphen, so `P1` becomes `<prefix>-P1` and its
persisted key becomes `ase-issue-<prefix>-P1`. The purge of stale
results is narrowed to the same namespace accordingly, so analyses run
under *distinct* prefixes coexist instead of overwriting each other.
Without the option (the default), ids stay unprefixed and the purge
covers the *entire* `ase-issue-*` space, including any prefixed results.

The `--staged` option restricts the analysis to the source files with
*staged* Git changes, and the `--unstaged` option restricts it to the
source files with *unstaged* Git changes plus the *untracked* source
files, and both report only the problems located within the changed
hunks, where an untracked file counts as changed entirely. Deleted
files are skipped, and the files are analyzed in their current working
copy state, so for a staged file with additional unstaged changes,
these hunks count as changed, too. With a *source-reference*, only the
changed files within it are analyzed; without one, all changed files of
the repository are analyzed. If no such file exists, nothing is
analyzed. Both options can be combined to analyze the hunks of *any*
uncommitted Git changes. To analyze changed files entirely instead of
their hunks only, give them without these options.

The skill investigates the code base silently, reports each detected
problem as a `PROBLEM` entry with severity (`LOW`, `MEDIUM`, `HIGH`) and
inline file/line references (in the performance lens, each entry
additionally carries an *evidence* and a *trade-off* line), and persists
results in the `ase` MCP key/value store as `ase-issue-P<n>` entries so
they can later be planned via `ase-task-edit P<n>` or directly
fixed via `ase-code-edit P<n>`.

The `--auto`|`-a` option automatically fixes all reported problems,
except the `ACCEPTED` ones, in the reported order: each one by a minimal,
focused correction of its root cause, honoring the *resolving* tenets of
**ASE**, without any unrelated change, and without staging anything. A
problem not resolvable by a local correction (e.g. a design decision) is
skipped unchanged. Each applied correction gets its own `CHANGELOG.md`
entry (if such a file exists), its persisted `ase-issue-P<n>` entry is
removed, and a final table recaps the outcome (`APPLIED`, `FAILED`, or
`SKIPPED`) of every problem. No verification is performed, so re-run the
analysis resp. the build afterwards.

##  ARGUMENTS

-   *source-reference*:
    A file, directory, function, or other reference to the source code
    to analyze. Optional only under `--staged` or `--unstaged`.

##  SCENARIOS

-   You want your code checked for logic, semantics, and control-flow problems
-   You want a read-only report of problems without any changes applied
-   You want performance and efficiency opportunities surfaced
-   You want a security-focused inspection of your code
-   You want problems persisted as issue ids like `P1` for later resolving
-   You want all detected problems fixed automatically in one go
-   You want only your staged or unstaged changes analyzed before committing

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

Analyze a directory and automatically fix all detected problems:

```text
❯ /ase-code-analyze --auto src/handlers/
```

Analyze a directory under its own id namespace, yielding `auth-P1`, `auth-P2`, ...:

```text
❯ /ase-code-analyze --prefix auth src/auth/
```

Analyze only the hunks of the staged Git changes:

```text
❯ /ase-code-analyze --staged
```

Analyze only the hunks of the unstaged changes and the untracked source files below a directory:

```text
❯ /ase-code-analyze --unstaged src/handlers/
```

##  SEE ALSO

[`ase-task-edit`](../ase-task-edit/help.md), [`ase-code-edit`](../ase-code-edit/help.md), [`ase-code-lint`](../ase-code-lint/help.md),
[`ase-code-explain`](../ase-code-explain/help.md), [`ase-arch-analyze`](../ase-arch-analyze/help.md).

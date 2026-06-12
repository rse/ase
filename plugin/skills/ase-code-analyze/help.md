
##  NAME

`ase-code-analyze` - Analyze Source Code

##  SYNOPSIS

`ase-code-analyze`
    [`--help`|`-h`]
    [`--performance`|`-p`]
    [`--security`|`-s`]
    [`--severity`|`-S`=(`LOW`|`MEDIUM`|`HIGH`)]
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
never suppressed. Surviving problems are renumbered contiguously as
`P<n>`.

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

##  SEE ALSO

[`ase-code-resolve`](../ase-code-resolve/help.md), [`ase-code-refactor`](../ase-code-refactor/help.md), [`ase-code-lint`](../ase-code-lint/help.md),
[`ase-code-explain`](../ase-code-explain/help.md), [`ase-arch-analyze`](../ase-arch-analyze/help.md).


##  NAME

`ase-code-analyze` - Analyze Source Code

##  SYNOPSIS

`ase-code-analyze`
    [`--help`|`-h`]
    [`--performance`|`-p`]
    [`--security`|`-s`]
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

##  SEE ALSO

`ase-code-resolve`, `ase-code-refactor`, `ase-code-lint`,
`ase-code-explain`, `ase-arch-analyze`.

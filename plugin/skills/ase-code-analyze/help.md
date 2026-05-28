
##  NAME

`ase-code-analyze` - Analyze Source Code

##  SYNOPSIS

`ase-code-analyze`
    [`--help`|`-h`]
    *source-reference*

##  DESCRIPTION

The `ase-code-analyze` skill analyzes the source code of the referenced
location, and its directly related source code, for problems in its
*logic*, *semantics*, and related *control flow*.

The skill investigates the code base silently, reports each detected
problem as a `PROBLEM` entry with severity (`LOW`, `MEDIUM`, `HIGH`),
inline file/line references, and persists results in the `ase` MCP
key/value store as `ase-issue-P<n>` entries so they can later be
resolved via `ase-code-resolve P<n>`.

##  ARGUMENTS

*source-reference*:
    A file, directory, function, or other reference to the source code
    to analyze.

##  EXAMPLES

Analyze a specific source file:

```text
❯ /ase-code-analyze src/server.ts
```

Analyze a directory of code:

```text
❯ /ase-code-analyze src/handlers/
```

##  SEE ALSO

`ase-code-resolve`, `ase-code-refactor`, `ase-code-lint`,
`ase-code-explain`, `ase-arch-analyze`.

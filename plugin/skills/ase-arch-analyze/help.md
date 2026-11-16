
##  NAME

`ase-arch-analyze` - Review Software Architecture

##  SYNOPSIS

`ase-arch-analyze`
    [`--help`|`-h`]
    [`--prefix`|`-P` *prefix*]
    *source-reference*

##  DESCRIPTION

The `ase-arch-analyze` skill reviews the *software architecture* of
the referenced source code, including *package cohesion* and
*inter-package coupling*, for *potential problems* across component boundaries,
structural organization, architecture principles, interface quality,
quality attributes, and architecture governance.

The skill investigates 21 architecture quality aspects across 7 thematic
blocks (component boundaries, structural organization, architecture
principles, interface quality, quality attributes, architecture
governance, and package cohesion), renders a high-level architecture
diagram, and reports findings as either `PROBLEM` or `TRADEOFF` entries
based on a built-in tension matrix. For a project with `black` boxing,
the analysis is suppressed entirely.

The `--prefix`|`-P` *prefix* option prefixes every reported finding id
with *prefix* and a hyphen, so `P1` becomes `<prefix>-P1` and `T1`
becomes `<prefix>-T1`, with the persisted keys becoming
`ase-issue-<prefix>-P1` and `ase-issue-<prefix>-T1` accordingly. The
purge of stale results is narrowed to the same namespace, so analyses
run under *distinct* prefixes coexist instead of overwriting each other.
Without the option (the default), ids stay unprefixed and the purge
covers the *entire* `ase-issue-*` space, including any prefixed results.

##  ARGUMENTS

-   *source-reference*:
    A file, directory, or other reference to the source code that
    is to be analyzed architecturally.

##  SCENARIOS

-   You want the software architecture of your code base reviewed
-   You want coupling and cohesion problems between packages found
-   You want an architecture diagram plus PROBLEM and TRADEOFF findings
-   You want architecture findings persisted for later resolution

##  EXAMPLES

Analyze architecture of the current project:

```text
❯ /ase-arch-analyze src/
```

Analyze a specific module:

```text
❯ /ase-arch-analyze src/core
```

Analyze a module under its own id namespace, yielding `core-P1`, `core-T1`, ...:

```text
❯ /ase-arch-analyze --prefix core src/core
```

##  SEE ALSO

[`ase-arch-discover`](../ase-arch-discover/help.md), [`ase-code-analyze`](../ase-code-analyze/help.md), [`ase-task-edit`](../ase-task-edit/help.md),
[`ase-code-edit`](../ase-code-edit/help.md), [`ase-code-insight`](../ase-code-insight/help.md).

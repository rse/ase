
##  NAME

`ase-arch-analyze` - Review Software Architecture

##  SYNOPSIS

`ase-arch-analyze`
    [`--help`|`-h`]
    *source-reference*

##  DESCRIPTION

The `ase-arch-analyze` skill reviews the *software architecture* of
the referenced source code, including *package cohesion* and *inter-
package coupling*, for *potential problems* across component boundaries,
structural organization, architecture principles, interface quality,
quality attributes, and architecture governance.

The skill investigates 21 architecture quality aspects across 7 thematic
blocks (component boundaries, structural organization, architecture
principles, interface quality, quality attributes, architecture
governance, and package cohesion), renders a high-level architecture
diagram, and reports findings as either `PROBLEM` or `TRADEOFF` entries
based on a built-in tension matrix.

##  ARGUMENTS

*source-reference*:
    A file, directory, or other reference to the source code that
    is to be analyzed architecturally.

##  EXAMPLES

Analyze architecture of the current project:

```text
❯ /ase-arch-analyze src/
```

Analyze a specific module:

```text
❯ /ase-arch-analyze src/core
```

##  SEE ALSO

[`ase-arch-discover`](../ase-arch-discover/help.md), [`ase-code-analyze`](../ase-code-analyze/help.md), [`ase-code-resolve`](../ase-code-resolve/help.md),
[`ase-code-refactor`](../ase-code-refactor/help.md), [`ase-code-insight`](../ase-code-insight/help.md).

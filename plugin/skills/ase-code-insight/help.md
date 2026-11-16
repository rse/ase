
##  NAME

`ase-code-insight` - Project Insight

##  SYNOPSIS

`ase-code-insight`
    [`--help`|`-h`]
    *code-references*

##  DESCRIPTION

The `ase-code-insight` skill gives high-level *insights* into the
project through the referenced source code. The skill produces four
sections: a *PROJECT ABSTRACT* (summary derived from `README.*` or
source scanning), a *PROJECT AUTHOR* list (from `git shortlog`),
a *SOURCE CHURN* table (most-committed files in the last year), and
a *MODULE STRUCTURE* Mermaid diagram of modules and their imports.

For a project with `black` boxing, the insight gathering is suppressed
entirely.

##  ARGUMENTS

-   *code-references*:
    One or more file or directory references to source code that
    should be inspected for insights.

##  SCENARIOS

-   You want a high-level overview of a project
-   You want to know who wrote the project and which files churn most
-   You want a module structure diagram of the imports
-   You want to get familiar with an unknown code base quickly

##  EXAMPLES

Get insights into the current project:

```text
❯ /ase-code-insight src/
```

Get insights into a specific subsystem:

```text
❯ /ase-code-insight tool/src/
```

##  SEE ALSO

[`ase-code-explain`](../ase-code-explain/help.md), [`ase-code-analyze`](../ase-code-analyze/help.md), [`ase-arch-analyze`](../ase-arch-analyze/help.md).

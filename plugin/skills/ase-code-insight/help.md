
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

##  ARGUMENTS

*code-references*:
    One or more file or directory references to source code that
    should be inspected for insights.

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

`ase-code-explain`, `ase-code-analyze`, `ase-arch-analyze`.

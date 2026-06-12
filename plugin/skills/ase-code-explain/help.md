
##  NAME

`ase-code-explain` - Explain Source Code

##  SYNOPSIS

`ase-code-explain`
    [`--help`|`-h`]
    *source-reference*

##  DESCRIPTION

The `ase-code-explain` skill analyzes and explains the source code of
the referenced location in a *brief*, *standardized*, and *concise*
way along six dimensions: *WHAT* (functionality), *WHY* (rationale),
*ANALOGY* (everyday-life comparison in ELI5 style), *DIAGRAM* (Mermaid
diagram of control flow, data flow, or structure), *CRUXES* (what to
notice), and *GOTCHAS* (what to not stumble over).

##  ARGUMENTS

*source-reference*:
    A file, directory, function, or other reference to the source code
    to explain.

##  EXAMPLES

Explain a single source file:

```text
❯ /ase-code-explain src/parser.ts
```

Explain a specific function:

```text
❯ /ase-code-explain src/parser.ts#parseExpression
```

##  SEE ALSO

[`ase-code-insight`](../ase-code-insight/help.md), [`ase-code-analyze`](../ase-code-analyze/help.md), [`ase-arch-analyze`](../ase-arch-analyze/help.md).

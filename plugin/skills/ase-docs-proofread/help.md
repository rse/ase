
##  NAME

`ase-docs-proofread` - Proofread Documents

##  SYNOPSIS

`ase-docs-proofread`
    [`--help`|`-h`]
    [`--auto`|`-a`]
    *docs-reference*

##  DESCRIPTION

The `ase-docs-proofread` skill analyzes the referenced documents for
*spelling*, *punctuation*, and *grammar* errors and proposes
corrections. The investigation is dispatched to a sub-agent
(`ase:ase-docs-proofread`) so that scanning details do not leak into
the user-visible transcript.

For each detected problem, the skill renders a unified-diff
*CORRECTION* preview and either asks the user to `ACCEPT` or `REJECT`
the proposed correction interactively (or refine it via a free-text
hint, which re-proposes the correction without limit) or - with
`--auto` - applies all corrections automatically.

##  OPTIONS

`--auto`|`-a`:
    Automatically apply every proposed correction without asking the
    user via the interactive dialog.

##  ARGUMENTS

*docs-reference*:
    A file, directory, or other reference to the documents to
    proofread.

##  EXAMPLES

Proofread a single document interactively:

```text
❯ /ase-docs-proofread README.md
```

Proofread an entire documentation directory automatically:

```text
❯ /ase-docs-proofread --auto docs/
```

##  SEE ALSO

[`ase-code-lint`](../ase-code-lint/help.md), [`ase-meta-changelog`](../ase-meta-changelog/help.md).

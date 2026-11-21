
##  NAME

`ase-docs-proofread` - Proofread Documents

##  SYNOPSIS

`ase-docs-proofread`
    [`--help`|`-h`]
    [`--auto`|`-a`]
    *docs-reference*

##  DESCRIPTION

The `ase-docs-proofread` skill analyzes the referenced documents for
*spelling*, *capitalization*, *punctuation*, *word break*, and *grammar*
errors and proposes corrections. The investigation is dispatched to a
sub-agent (`ase:ase-docs-proofread`) so that scanning details do not
leak into the user-visible transcript.

For each detected problem, the skill renders a unified-diff
*CORRECTION* preview and either asks the user to `ACCEPT` or `REJECT`
the proposed correction interactively (or refine it via a free-text
hint, which re-proposes the correction without limit) or - with
`--auto` - applies all corrections automatically. For a project with
`grey` boxing, the preview shows only a condensed one-line form instead
of the full unified diff, and for a project with `black` boxing, the
documents are not proofread at all.

`ase-docs-proofread` is the correctness-fixing member of the document
triple. The recommended order over one document is
[`ase-docs-shorten`](../ase-docs-shorten/help.md) first (cut the bulk),
then [`ase-docs-refine`](../ase-docs-refine/help.md) (polish what
survives), then `ase-docs-proofread` (final correctness pass), so no
correction effort is spent on text which is later dropped.

##  OPTIONS

-   `--auto`|`-a`:
    Automatically apply every proposed correction without asking the
    user via the interactive dialog. A closing *PROOFREAD RESULT* table
    lists every correction with its outcome (`APPLIED` or `FAILED`).

##  ARGUMENTS

-   *docs-reference*:
    A file, directory, or other reference to the documents to
    proofread.

##  SCENARIOS

-   You want documents checked for spelling, capitalization,
    punctuation, word break, and grammar
-   You want inconsistent capitalization of terms and headings unified
-   You want wrong word breaks like "data base" or "check-list" repaired
-   You want corrections proposed which you accept or reject one by one
-   You want a whole documentation directory corrected automatically
-   You want a final language pass over a text before publishing

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

[`ase-docs-shorten`](../ase-docs-shorten/help.md), [`ase-docs-refine`](../ase-docs-refine/help.md), [`ase-docs-distill`](../ase-docs-distill/help.md), [`ase-code-lint`](../ase-code-lint/help.md), [`ase-repo-changelog`](../ase-repo-changelog/help.md).


##  NAME

`ase-docs-shorten` - Shorten a Document to a Target Length

##  SYNOPSIS

`ase-docs-shorten`
    [`--help`|`-h`]
    [`--auto`|`-a`]
    (`--chars`|`-c` *N* | `--words`|`-w` *N*)
    *docs-reference*

##  DESCRIPTION

The `ase-docs-shorten` skill reduces the length of a *single* document
until it reaches a requested *target length*. The investigation is
dispatched to a sub-agent (`ase:ase-docs-shorten`) so that scanning
details do not leak into the user-visible transcript.

The target length is stated either as `--chars` *N* or as `--words` *N*.
The two options are *mutually exclusive*, exactly *one* of them is
*mandatory*, and neither carries a default, because the target length is
the very quantity the shortening optimizes for. A document reference
which expands to *more than one* document is rejected, as it would leave
open whether the target bounds each document or their sum.

The shortening runs as a *three-stage cascade*, and a stage is entered
*only* while the target is still not met:

1.  *Tighten*: shorten individual sentences without losing any content -
    filler words struck, nominal constructions turned into verbs,
    redundant restatements within a sentence cut.

2.  *Drop*: remove low-value content - redundant restatements,
    illustrative examples, asides, parentheticals, and the whole
    sentences or list items which carry the least value for the reader.
    Content is genuinely lost in this stage.

3.  *Compress*: merge and rewrite the remaining content into shorter
    expressions and sentences - related sentences fused, prose
    enumerations turned into compact lists, multi-sentence passages
    re-expressed as single sentences.

The skill never shortens *beyond* the target: it stops at the first
change which reaches it. What *survives* the shortening stays exact -
every surviving fact, number, technical term, qualifier, and negation is
preserved verbatim, nothing is invented, the order of the surviving
argument is kept, and fenced code blocks, inline code spans, link
targets, Markdown frontmatter, and the heading structure are never
touched.

Each proposed change is cut as a *whole block* - a paragraph, a list
item, a blockquote, or a heading with its following paragraph - because
a shortening is only judgeable in the context of the whole block it
rewrites. It is rendered as a *unified diff* with up to two lines of
context, annotated with the length it saves, exactly as in
[`ase-docs-refine`](../ase-docs-refine/help.md) and
[`ase-docs-proofread`](../ase-docs-proofread/help.md). The user
either accepts or rejects each block interactively (or refines it via a
free-text hint, which re-proposes the block without limit) or - with
`--auto` - applies all of them automatically. A closing *LENGTH REPORT*
states the achieved length against the target, so rejected blocks stay
visible in the outcome. A document which already meets the target is
left untouched. For a project with `grey` boxing, each block is shown
only as a condensed, elided two-line diff, and for a project with
`black` boxing, the document is not shortened at all.

`ase-docs-shorten` is the length-reducing member of the document triple.
The recommended order over one document is `ase-docs-shorten` first (cut
the bulk), then [`ase-docs-refine`](../ase-docs-refine/help.md) (polish
what survives), then
[`ase-docs-proofread`](../ase-docs-proofread/help.md) (final correctness
pass), so no polishing effort is spent on text which is later dropped.

##  OPTIONS

-   `--chars`|`-c` *N*:
    Shorten the document to at most *N* characters, counted over the
    entire document content including whitespace and newlines.
    Mutually exclusive with `--words`.

-   `--words`|`-w` *N*:
    Shorten the document to at most *N* whitespace-separated words,
    counted over the entire document content.
    Mutually exclusive with `--chars`.

-   `--auto`|`-a`:
    Automatically apply every proposed shortening without asking the
    user via the interactive dialog.

##  ARGUMENTS

-   *docs-reference*:
    A reference to the *single* document to shorten. A reference
    expanding to more than one document is rejected.

##  SCENARIOS

-   You want a README section cut down to a hard character budget
-   You want an abstract brought under a word limit for a submission
-   You want the least valuable examples and asides dropped first
-   You want to see what a shortening costs before accepting it
-   You want a whole document shortened unattended in one pass
-   You want the achieved length reported against the target

##  EXAMPLES

Shorten a document to at most 4000 characters interactively:

```text
❯ /ase-docs-shorten --chars 4000 README.md
```

Shorten a document to at most 250 words unattended:

```text
❯ /ase-docs-shorten --auto --words 250 docs/abstract.md
```

##  SEE ALSO

[`ase-docs-refine`](../ase-docs-refine/help.md), [`ase-docs-proofread`](../ase-docs-proofread/help.md), [`ase-docs-distill`](../ase-docs-distill/help.md).

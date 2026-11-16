
##  NAME

`ase-docs-refine` - Refine Document Wording

##  SYNOPSIS

`ase-docs-refine`
    [`--help`|`-h`]
    [`--auto`|`-a`]
    *docs-reference*

##  DESCRIPTION

The `ase-docs-refine` skill performs a *light rewriting* of awkward or
unclear sentences in the referenced documents, *without reshaping the
argument*: restructuring sentences for rhythm and clarity, making
enumerations parallel, cutting filler and redundancy, fixing awkward
transitions, and adjusting voice. *Content, numbers, and technical
terms stay exactly as they are.* The investigation is dispatched to a
sub-agent (`ase:ase-docs-refine`) so that scanning details do not leak
into the user-visible transcript.

The checked refinement types are:

1.  *Structure*: overlong, convoluted, or awkwardly built sentences,
    split or restructured for rhythm and clarity.

2.  *Nominalization*: cumbersome nominal constructions, replaced with
    plain verbs.

3.  *Parallelism*: non-parallel enumerations, brought into one
    grammatical shape - a list whose items mix noun phrases,
    imperatives, and full sentences, a heading set mixing gerunds and
    nouns, or an inline series whose members do not share their form.

4.  *Filler*: filler words, empty intensifiers, and redundant
    restatements, struck.

5.  *Transition*: abrupt or misleading transitions between sentences or
    paragraphs, smoothed. An existing transition is only smoothed or
    removed - a connective is *never* inserted where the original
    asserted no such relation, as that would add a logical claim.

6.  *Voice*: needless passive voice turned active, needless hedging
    struck, and shifts in grammatical person or mood aligned with the
    rest of the document.

The rewriting always stays *within* a sentence. Dropping a whole
sentence, paragraph, example, or list item for the sake of brevity is
*length reduction*, not refinement, and belongs to
[`ase-docs-shorten`](../ase-docs-shorten/help.md). The recommended order
over one document is `ase-docs-shorten` first (cut the bulk), then
`ase-docs-refine` (polish what survives), then `ase-docs-proofread`
(final correctness pass), so no polishing effort is spent on text which
is later dropped.

For each detected problem, the skill renders a unified-diff
*REFINEMENT* preview and either asks the user to `ACCEPT` or `REJECT`
the proposed refinement interactively (or refine it via a free-text
hint, which re-proposes the refinement without limit) or - with
`--auto` - applies all refinements automatically. A proposal which
shifts the meaning even slightly - a lost negation, a changed
qualifier, a renamed technical term - is dropped instead of applied.
For a project with `grey` boxing, the preview shows only a condensed
one-line form instead of the full unified diff, and for a project with
`black` boxing, the documents are not refined at all.

##  OPTIONS

-   `--auto`|`-a`:
    Automatically apply every proposed refinement without asking the
    user via the interactive dialog.

##  ARGUMENTS

-   *docs-reference*:
    A file, directory, or other reference to the documents to
    refine.

##  SCENARIOS

-   You want long, convoluted sentences broken into readable ones
-   You want nominal style like "perform a validation of" turned into verbs
-   You want a bullet list of mixed noun phrases and sentences made parallel
-   You want filler words and redundant restatements struck
-   You want abrupt transitions between paragraphs smoothed
-   You want needless passive voice or hedging adjusted
-   You want the wording polished without touching facts or figures

##  EXAMPLES

Refine a single document interactively:

```text
❯ /ase-docs-refine README.md
```

Refine an entire documentation directory automatically:

```text
❯ /ase-docs-refine --auto docs/
```

##  SEE ALSO

[`ase-docs-shorten`](../ase-docs-shorten/help.md), [`ase-docs-proofread`](../ase-docs-proofread/help.md), [`ase-docs-distill`](../ase-docs-distill/help.md).

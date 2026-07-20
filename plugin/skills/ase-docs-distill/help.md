
##  NAME

`ase-docs-distill` - Distill Document Key Points

##  SYNOPSIS

`ase-docs-distill`
    [`--help`|`-h`]
    [`--top`|`-t` *N*]
    *document-reference*

##  DESCRIPTION

The `ase-docs-distill` skill reads a *provided document* and distills it
into a *flat*, *importance-ranked* list of its *key points*. The
*document-reference* is resolved *probe-as-file-first*: if the argument names
a *readable file* it is read from disk, otherwise the argument is taken
*verbatim* as *pasted text*. The document is read *silently* - only the
final ranked list is shown - so even a large document does not flood the
transcript.

Each emitted point is *one atomic claim, decision, or fact* (not a
section-level summary) and carries four things: a *0-10 salience rank*
reflecting its *importance to the reader* (impact and centrality, *not*
its position in the document), a *one-line rationale* justifying *why* it
earns that rank, an exact *line-range citation* (`file:Ls-Le`, or `:Ls-Le`
for pasted text), and a *verbatim evidence* snippet copied from the source
that *proves* the point. The points are emitted as a *bulleted list* -
one block per point, each showing its *LOCATION*, *EVIDENCE*,
*RATIONALE*, and *RANK* - sorted from highest to lowest salience, so the
ranking is *auditable* rather than an opaque ordering.

The `--top`/`-t` *N* option is a *length dial* that bounds the list to at
most *N* points (default *5*). It is an *upper bound only*: when the
document has fewer salient points than *N*, the skill emits only the
points it found and *never pads* the list with filler; a `0`, negative, or
non-numeric value falls back to the default *5*.

##  OPTIONS

`--top`|`-t` *N*:
    Bound the ranked list to at most *N* key points (default *5*). The
    bound is a *cap*, never a *quota* - fewer points are emitted when the
    document does not contain *N* salient ones, and an invalid or
    non-positive *N* reverts to the default.

##  ARGUMENTS

*document-reference*:
    The document to distill - either a *path* to a readable file or the
    *text* itself pasted inline. If it resolves to a readable file the
    file is read; otherwise it is treated verbatim as pasted text.

##  EXAMPLES

Distill the key points of a document file:

```text
❯ /ase-docs-distill doc/architecture.md
```

Distill only the top 3 key points:

```text
❯ /ase-docs-distill --top 3 doc/architecture.md
```

Distill a pasted block of text:

```text
❯ /ase-docs-distill The system shall accept payments in EUR and USD only.
```

##  SEE ALSO

[`ase-meta-search`](../ase-meta-search/help.md), [`ase-docs-proofread`](../ase-docs-proofread/help.md), [`ase-meta-why`](../ase-meta-why/help.md).


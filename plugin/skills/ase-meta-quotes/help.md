
##  NAME

`ase-meta-quotes` - Find Quotes on a Topic

##  SYNOPSIS

`ase-meta-quotes`
    [`--help`|`-h`]
    [`--ground`|`-G`]
    [`--proximity`|`-p`]
    [`--count`|`-c` *count*]
    *topic-keywords*

##  DESCRIPTION

The `ase-meta-quotes` skill finds *quotes* -- sayings, aphorisms,
maxims, proverbs, and citations -- for the supplied *topic-keywords* and
places them into a *2x2 matrix*, reported as four labeled *quadrant*
sections.

Per quote, the skill records its *text*, its *author* (a named person or
organization, if known), its *origin* (a named work, standard, or
document, if known), and the topic it was harvested for (its *source
topic*).

The first dimension of the matrix is the *attribution* of a quote: a
quote is `ATTRIBUTED` when a named author and/or a named origin is known
for it, and `ANONYMOUS` otherwise. The second dimension is the
*literalness* of a quote: a quote is `LITERAL` when its text contains at
least one of the *topic-keywords* as a whole word -- matched
case-insensitively and tolerating inflections (e.g. `architect` and
`architectural` match the keyword `architecture`), but never as a mere
substring (e.g. `art` does not match `architecture`) -- and `THEMATIC`
otherwise. The two dimensions span the quadrants `Q1`
(`ATTRIBUTED`/`LITERAL`), `Q2` (`ATTRIBUTED`/`THEMATIC`), `Q3`
(`ANONYMOUS`/`LITERAL`), and `Q4` (`ANONYMOUS`/`THEMATIC`). A quadrant
without any quote is rendered as `(none)`.

Every quote is rendered on its own line and carries, where applicable,
the suffixes `— <author>, <origin>` (in the two `ATTRIBUTED`
quadrants, omitting whichever part is unknown),
`[from proximity: <source-topic>]` (when the quote was contributed by a
neighborhood topic under `--proximity` instead of by *topic-keywords*
itself), and
`(unverified)` (when the exact wording or the attribution could not be
established with confidence). The `(unverified)` marker is dropped as
soon as the Internet/Web search under `--ground` confirms the wording and
the attribution of the quote.

##  OPTIONS

-   `--ground`|`-G`:
    Gather quotes from the Internet/Web via the `ase-meta-search` skill
    (dispatched in a sub-agent, querying all available search backends)
    *in addition to* -- and never *instead* of -- the model knowledge,
    merge them into the harvest while deduplicating quotes which differ
    only in punctuation, capitalization, or attribution wording, and use
    the search results to confirm the wording and the attribution of the
    found quotes. When combined with `--proximity`, the determination of
    the conceptual neighborhood is grounded in Internet/Web facts as
    well. Should the search return no usable quotes, a warning is emitted
    and the skill falls back to the model knowledge only. Without this
    option, the quotes are derived from model knowledge only.

-   `--proximity`|`-p`:
    Widen the harvest beyond the given topic to its *conceptual
    neighborhood* -- the parent (more general) topic, the four sibling
    (same-level) topics, and the four child (more specialized) topics --
    as determined by the `ase-meta-proximity` agent, which is shared with
    the `ase-meta-proximity` skill. Each of these nine neighborhood
    topics is harvested exactly like the given topic itself. Quotes
    contributed by a neighborhood topic carry that topic in brackets and
    mostly land in the `THEMATIC` quadrants, which is exactly where the
    widening pays off. Should the agent return no usable neighborhood, a
    warning is emitted and the skill continues with the narrow topic
    only. Without this option, only the given topic is harvested.

-   `--count`|`-c` *count*:
    Maximum total number of quotes across all four quadrants (default:
    `8`, i.e. about two quotes per quadrant). The quotes are distributed
    as evenly as possible across the quadrants, preferring the most
    relevant and most well-known quote per quadrant. A non-numeric value
    or a value less than or equal to `0` falls back to the default.

##  ARGUMENTS

-   *topic-keywords*:
    The topic keywords the quotes are searched for. They act both as the
    search query and as the keyword set of the *literalness* dimension of
    the matrix.

##  SCENARIOS

-   You want quotes, sayings, or aphorisms on a topic
-   You want citations arranged by attribution and literalness
-   You want quote wording and attribution verified against the Web
-   You want the quote harvest widened to related topics

##  EXAMPLES

Find quotes from model knowledge:

```text
❯ /ase-meta-quotes software architecture
```

Find a wider set of quotes, grounded in Internet/Web facts and widened
to the conceptual neighborhood of the topic:

```text
❯ /ase-meta-quotes --ground --proximity --count 12 technical debt
```

##  SEE ALSO

[`ase-meta-proximity`](../ase-meta-proximity/help.md), [`ase-meta-search`](../ase-meta-search/help.md), [`ase-meta-eli5`](../ase-meta-eli5/help.md).

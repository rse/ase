
##  NAME

`ase-meta-proximity` - Determine the Conceptual Proximity of a Topic

##  SYNOPSIS

`ase-meta-proximity`
    [`--help`|`-h`]
    [`--ground`|`-g`]
    [`--loop`|`-l`]
    *topic*

##  DESCRIPTION

The `ase-meta-proximity` skill determines the *conceptual proximity* of
the supplied *topic* along three dimensions and reports the neighboring
topics grouped into three labeled sections: *PARENT* (the single broader
topic that *topic* specializes), *SIBLINGS* (the four most relevant
topics on the same level, sharing the same parent), and *CHILDREN* (the
four most relevant narrower topics that specialize *topic*).

By default the proximity is derived from model knowledge only. With the
`--ground`/`-g` option, the skill first searches the Internet/Web for
facts about the topic via the `ase-meta-search` skill (dispatched in a
sub-agent, querying all available search backends) and grounds the
determination in the found facts.

Without the `--loop`/`-l` option, the skill determines and prints the
proximity of the given topic once and then stops. With the `--loop`/`-l`
option, the skill instead presents the nine neighboring topics in an
interactive dialog; selecting one of them makes it the new *current
topic* and restarts the determination from the beginning, so the user
can *navigate* the topic taxonomy up (parent), sideways (siblings), and
down (children). Cancelling the dialog exits the loop. When `--loop` is
combined with `--ground`, each newly selected topic is re-grounded via
the `ase-meta-search` sub-agent before its proximity is re-determined.

##  OPTIONS

`--ground`|`-g`:
    Ground the determination in Internet/Web facts gathered via the
    `ase-meta-search` skill before determining the proximity. Without
    this option, the determination is derived from model knowledge only.
    When combined with `--loop`, every newly navigated-to topic is
    re-grounded.

`--loop`|`-l`:
    Present the neighboring topics in an interactive dialog and, upon
    selection, adopt the picked topic as the new current topic and
    restart the determination. Without this option, the proximity of the
    given topic is printed once and the skill stops.

##  ARGUMENTS

*topic*:
    The topic whose conceptual proximity is to be determined. It may be
    a technical concept, a phenomenon, or any other subject; the skill
    determines its parent, sibling, and child topics.

##  EXAMPLES

Determine the proximity of a topic from model knowledge:

```text
❯ /ase-meta-proximity Fourier transform
```

Interactively navigate the conceptual neighborhood, grounded in
Internet/Web facts:

```text
❯ /ase-meta-proximity --ground --loop Agentic Software Engineering
```

##  SEE ALSO

[`ase-meta-eli5`](../ase-meta-eli5/help.md), [`ase-meta-search`](../ase-meta-search/help.md), [`ase-code-explain`](../ase-code-explain/help.md).

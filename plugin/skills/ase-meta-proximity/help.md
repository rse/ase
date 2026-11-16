
##  NAME

`ase-meta-proximity` - Determine the Conceptual Proximity of a Topic

##  SYNOPSIS

`ase-meta-proximity`
    [`--help`|`-h`]
    [`--ground`|`-G`]
    [`--loop`|`-l`]
    *topic*

##  DESCRIPTION

The `ase-meta-proximity` skill determines the *conceptual proximity* of
the supplied *topic* along three dimensions and reports the neighboring
topics grouped into three labeled sections: *PARENT* (the single broader
topic that *topic* specializes), *SIBLINGS* (the four most relevant
topics on the same level, sharing the same parent), and *CHILDREN* (the
four most relevant narrower topics that specialize *topic*).

The determination itself is delegated to the `ase-meta-proximity` agent,
which is shared with the `ase-meta-quotes` skill. By default the
proximity is derived from model knowledge only. With the `--ground`/`-G`
option, the agent first searches the Internet/Web for facts about the
topic, about its broader topic, and about its narrower topics, and
grounds the determination in the found facts.

Without the `--loop`/`-l` option, the skill determines and prints the
proximity of the given topic once and then stops. With the `--loop`/`-l`
option, the skill instead presents the nine neighboring topics in an
interactive dialog; selecting one of them makes it the new *current
topic* and restarts the determination from the beginning, so the user
can *navigate* the topic taxonomy up (parent), sideways (siblings), and
down (children). Cancelling the dialog exits the loop. When `--loop` is
combined with `--ground`, each newly selected topic is re-grounded by
the `ase-meta-proximity` sub-agent before its proximity is re-determined.

##  OPTIONS

-   `--ground`|`-G`:
    Ground the determination in Internet/Web facts gathered by the
    `ase-meta-proximity` agent before determining the proximity. Without
    this option, the determination is derived from model knowledge only.
    When combined with `--loop`, every newly navigated-to topic is
    re-grounded.

-   `--loop`|`-l`:
    Present the neighboring topics in an interactive dialog and, upon
    selection, adopt the picked topic as the new current topic and
    restart the determination. Without this option, the proximity of the
    given topic is printed once and the skill stops.

##  ARGUMENTS

-   *topic*:
    The topic whose conceptual proximity is to be determined. It may be
    a technical concept, a phenomenon, or any other subject; the skill
    determines its parent, sibling, and child topics.

##  SCENARIOS

-   You want the conceptual neighborhood of a topic explored
-   You want the parent, sibling, and child topics of a subject
-   You want a topic taxonomy navigated interactively
-   You want related topics grounded in Internet/Web facts

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

[`ase-meta-quotes`](../ase-meta-quotes/help.md), [`ase-meta-eli5`](../ase-meta-eli5/help.md), [`ase-meta-search`](../ase-meta-search/help.md), [`ase-code-explain`](../ase-code-explain/help.md).

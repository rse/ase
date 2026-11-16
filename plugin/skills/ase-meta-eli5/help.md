
##  NAME

`ase-meta-eli5` - Explain a Topic Like I'm 5

##  SYNOPSIS

`ase-meta-eli5`
    [`--help`|`-h`]
    [`--ground`|`-G`]
    *topic*

##  DESCRIPTION

The `ase-meta-eli5` skill explains the supplied *topic* in "Explain
Like I'm 5" (ELI5) style, so that even a five-year-old child could
understand it. The explanation uses simple, jargon-free wording --
short sentences, everyday words, and familiar images -- and is
structured into three labeled blocks: *WHAT* (a plain-words summary),
*ANALOGY* (a concrete everyday-life comparison), and *WHY* (why the
topic matters), each kept to a single brief paragraph.

By default the explanation is derived from model knowledge only. With
the `--ground`/`-G` option, the skill first searches the Internet/Web
for facts about the topic via the `ase-meta-search` skill (dispatched
in a sub-agent, querying all available search backends) and grounds
the explanation in the found facts. If the grounding yields no usable
facts, a warning is emitted and the explanation falls back to model
knowledge.

##  OPTIONS

-   `--ground`|`-G`:
    Ground the explanation in Internet/Web facts gathered via the
    `ase-meta-search` skill before explaining. Without this option,
    the explanation is derived from model knowledge only.

##  ARGUMENTS

-   *topic*:
    The topic to be explained. It may be a technical concept, a
    phenomenon, or any other subject; the skill explains it in a
    child-friendly way.

##  SCENARIOS

-   You want a topic explained so simply a child could follow
-   You want a jargon-free summary with an everyday analogy
-   You want a simple explanation grounded in current Internet/Web facts

##  EXAMPLES

Explain a technical concept from model knowledge:

```text
❯ /ase-meta-eli5 What is a Fourier transform?
```

Explain a recent topic grounded in Internet/Web facts:

```text
❯ /ase-meta-eli5 --ground What is Agentic Software Engineering?
```

##  SEE ALSO

[`ase-code-explain`](../ase-code-explain/help.md), [`ase-meta-search`](../ase-meta-search/help.md), [`ase-meta-quotes`](../ase-meta-quotes/help.md), [`ase-docs-distill`](../ase-docs-distill/help.md).

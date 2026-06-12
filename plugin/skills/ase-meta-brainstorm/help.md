
##  NAME

`ase-meta-brainstorm` - Collaboratively Brainstorm a Topic

##  SYNOPSIS

`ase-meta-brainstorm`
    [`--help`|`-h`]
    [`--max-clarify`|`-c=3`]
    [`--min-ideas`|`-i=12`]
    [`--min-rank`|`-r=7`]
    [`--max-shortlist`|`-s=4`]
    *topic*

##  DESCRIPTION

The `ase-meta-brainstorm` skill guides a collaborative ideation
session on a *topic* *before* any implementation begins. It first
*clarifies intent* by exploring the project context and interviewing
the user - one grounded, multiple-choice question at a time - about
purpose, constraints, scope, and success criteria (asking at most
`--max-clarify`, default 3, questions). It then *diverges* into a broad
space of candidate ideas (at least `--min-ideas`, default 12) pursued from
deliberately diverse angles (MVP-first, risk-first, UX-first,
reuse-first, and wildcard), without judging them.

Next it *converges* by clustering the ideas into coherent themes,
pruning speculative or out-of-scope ones via *YAGNI*, and scoring the
survivors on a 0-10 fit scale (keeping only those ranked `--min-rank`,
default 7, or higher). Finally it distills a *shortlist* of the top
`--max-shortlist`, default 4, directions - drawn from distinct clusters
wherever possible - and derives a single *RECOMMENDATION*, being either
the highest-ranked option or a principled synthesis of the shortlist.

##  OPTIONS

`--max-clarify`|`-c=3`:
    The *maximum* number of essential-unknown clarification questions
    asked in the *clarify intent* phase (default: 3). Lower it for a
    faster, leaner intake, raise it for more upfront grounding.

`--min-ideas`|`-i=12`:
    The *minimum* number of candidate ideas to generate in the *diverge*
    phase before converging (default: 12). Raise it for a broader idea
    space, lower it for a quicker, narrower session.

`--min-rank`|`-r=7`:
    The *minimum* 0-10 fit rank an idea must score to survive the
    *converge* phase (default: 7). Raise it for a stricter filter, lower
    it to retain more ideas.

`--max-shortlist`|`-s=4`:
    The *maximum* number of distilled options on the final *shortlist*
    (default: 4). Lower it for a sharper focus, raise it for more
    finalists.

##  ARGUMENTS

*topic*:
    The subject to brainstorm - a feature, component, behavior, or
    design question to explore *what* to build before *how*.

##  EXAMPLES

Brainstorm an approach for a new feature:

```text
❯ /ase-meta-brainstorm an offline-first sync layer for the mobile app
```

Brainstorm with a broader idea space of at least 20 candidates:

```text
❯ /ase-meta-brainstorm --min-ideas 20 an offline-first sync layer
```

Brainstorm quickly with a single clarification, a stricter score floor,
and a tighter shortlist:

```text
❯ /ase-meta-brainstorm --max-clarify 1 --min-rank 8 --max-shortlist 3 an offline-first sync layer
```

##  SEE ALSO

[`ase-meta-evaluate`](../ase-meta-evaluate/help.md), [`ase-meta-quorum`](../ase-meta-quorum/help.md), [`ase-meta-diaboli`](../ase-meta-diaboli/help.md)


##  NAME

`ase-meta-brainstorm` - Collaboratively Brainstorm a Topic

##  SYNOPSIS

`ase-meta-brainstorm`
    [`--help`|`-h`]
    [`--count`|`-c=12`]
    *topic*

##  DESCRIPTION

The `ase-meta-brainstorm` skill guides a collaborative ideation
session on a *topic* *before* any implementation begins. It first
*clarifies intent* by exploring the project context and interviewing
the user - one grounded, multiple-choice question at a time - about
purpose, constraints, scope, and success criteria. It then *diverges*
into a broad space of candidate ideas (at least `--count`, default 12)
pursued from deliberately diverse angles (MVP-first, risk-first,
UX-first, reuse-first, and wildcard), without judging them.

Next it *converges* by clustering the ideas into coherent themes,
pruning speculative or out-of-scope ones via *YAGNI*, and scoring the
survivors on a 0-10 fit scale (keeping only those ranked 7 or higher).
Finally it distills a *shortlist* of the top 3-4 directions - drawn from
distinct clusters wherever possible - and derives a single
*RECOMMENDATION*, being either the highest-ranked option or a principled
synthesis of the shortlist.

On completion the skill offers a *next step*: stop, or hand the
recommended direction off to the `ase-task-edit`, `ase-code-craft`, or
`ase-task-preflight` skills.

##  OPTIONS

`--count`|`-c=12`:
    The *minimum* number of candidate ideas to generate in the *diverge*
    phase before converging (default: 12). Raise it for a broader idea
    space, lower it for a quicker, narrower session.

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
❯ /ase-meta-brainstorm --count 20 an offline-first sync layer
```

##  SEE ALSO

`ase-meta-evaluate`, `ase-meta-quorum`, `ase-meta-diaboli`


##  NAME

`ase-meta-brainstorm` - Collaboratively Brainstorm a Topic

##  SYNOPSIS

`ase-meta-brainstorm`
    [`--help`|`-h`]
    *topic*

##  DESCRIPTION

The `ase-meta-brainstorm` skill guides a collaborative ideation
session on a *topic* *before* any implementation begins. It first
*clarifies intent* by exploring the project context and interviewing
the user — one grounded, multiple-choice question at a time — about
purpose, constraints, scope, and success criteria. It then *diverges*
into a broad space of candidate ideas pursued from deliberately diverse
angles (MVP-first, risk-first, UX-first, reuse-first, and wildcard),
without judging them.

Next it *converges* by clustering the ideas into coherent themes,
pruning speculative or out-of-scope ones via *YAGNI*, and scoring the
survivors on a 0-10 fit scale (keeping only those ranked 7 or higher).
Finally it distills a *shortlist* of the top 3-4 directions — drawn from
distinct clusters wherever possible — and derives a single
*RECOMMENDATION*, being either the highest-ranked option or a principled
synthesis of the shortlist.

On completion the skill offers a *next step*: stop, or hand the
recommended direction off to the `ase-task-edit`, `ase-code-craft`, or
`ase-task-preflight` skills.

##  ARGUMENTS

*topic*:
    The subject to brainstorm — a feature, component, behavior, or
    design question to explore *what* to build before *how*.

##  EXAMPLES

Brainstorm an approach for a new feature:

```text
❯ /ase-meta-brainstorm an offline-first sync layer for the mobile app
```

##  SEE ALSO

`ase-meta-evaluate`, `ase-meta-quorum`, `ase-meta-diaboli`

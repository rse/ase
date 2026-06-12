
##  NAME

`ase-meta-evaluate` - Evaluate Alternatives

##  SYNOPSIS

`ase-meta-evaluate`
    [`--help`|`-h`]
    *request*

##  DESCRIPTION

The `ase-meta-evaluate` skill evaluates two or more *alternatives*
through a *weighted multi-criteria decision matrix*. From the
*request*, the skill derives the reason for the evaluation, the
alternatives, and the criteria, fills in additional criteria up to a
range of 8-12 (using `ase-meta-search` where helpful), assigns weights
from `{ 4.00, 2.00, 1.00, 0.50, 0.25 }`, evaluates each alternative
against each criterion on a `{ -2, -1, 0, +1, +2 }` Likert scale, and
computes the final ratings via the `ase_decision_matrix` MCP tool.

The result is reported as a Markdown decision matrix along with the
single *BEST ALTERNATIVE*, including a warning if multiple
alternatives tie, if the distance to the second best is small, or if
all alternatives rate negatively.

##  ARGUMENTS

*request*:
    A description of what should be evaluated, including the
    alternatives and, optionally, the criteria to consider.

##  EXAMPLES

Compare logging libraries for a TypeScript project:

```text
❯ /ase-meta-evaluate Compare pino, winston, and bunyan as logging libraries.
```

Evaluate database options with hinted criteria:

```text
❯ /ase-meta-evaluate Compare PostgreSQL, MySQL, and SQLite for an
  embedded use case; criteria include footprint and write throughput.
```

##  SEE ALSO

[`ase-meta-quorum`](../ase-meta-quorum/help.md), [`ase-meta-search`](../ase-meta-search/help.md), [`ase-arch-discover`](../ase-arch-discover/help.md),
[`ase-meta-why`](../ase-meta-why/help.md).

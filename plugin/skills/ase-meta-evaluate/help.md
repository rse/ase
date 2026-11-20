
##  NAME

`ase-meta-evaluate` - Evaluate Alternatives

##  SYNOPSIS

`ase-meta-evaluate`
    [`--help`|`-h`]
    [`--ground`|`-G`]
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
all alternatives rate negatively. The skill stops with an error if
fewer than two alternatives are given, or if the alternatives are not
members of a single, mutually comparable class.

##  OPTIONS

-   `--ground`|`-G`:
    Ground the evaluation in facts instead of the world knowledge of
    the model alone: once the alternatives and criteria are known, the
    requirements and the realization of the project (its specification,
    documentation, code, and infrastructure files) are scanned for the
    facts relevant to the evaluation, and the Internet/Web is searched
    for them. Every Likert evaluation is then decided primarily from
    these facts, while the decision matrix itself stays unchanged. If no
    usable facts are found, a warning is shown and the evaluation falls
    back to model knowledge.

##  ARGUMENTS

-   *request*:
    A description of what should be evaluated, including the
    alternatives and, optionally, the criteria to consider.

##  SCENARIOS

-   You want alternatives compared and the best one named
-   You want a weighted multi-criteria decision matrix
-   You want a defensible, criteria-based technology choice
-   You want to know which option out of a list wins and by how much
-   You want the evaluations based on project and Web facts

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

Evaluate alternatives grounded in the project artifacts and the
Internet/Web:

```text
❯ /ase-meta-evaluate --ground Compare Vite and esbuild for bundling our web client.
```

##  SEE ALSO

[`ase-meta-quorum`](../ase-meta-quorum/help.md), [`ase-meta-search`](../ase-meta-search/help.md), [`ase-arch-discover`](../ase-arch-discover/help.md),
[`ase-meta-why`](../ase-meta-why/help.md).

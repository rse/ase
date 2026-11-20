
##  NAME

`ase-meta-why` - Five-Whys Root-Cause Analysis

##  SYNOPSIS

`ase-meta-why`
    [`--help`|`-h`]
    [`--depth`|`-d` *N*]
    [`--width`|`-w` *M*]
    [`--ground`|`-G`]
    *fact*

##  DESCRIPTION

The `ase-meta-why` skill applies the *Five-Whys* *root-cause
analysis* technique to the supplied *fact*. The skill iteratively
asks "why" - up to *N* times (see `--depth`, default five) - to drill
down from surface symptoms to the underlying root cause, considering
technical, domain-specific, process-related, and organizational
causes. By default it walks a *single* causality chain, but with
`--width` *M* (> 1) it walks a *widened* chain: at each level it surfaces
up to *M* candidate sub-causes, descends into the most significant one
with an explicit justification for the choice, and keeps the unchosen
candidates as *fallbacks*. If backward validation later shows the chosen
path was mis-rooted, it *backtracks* into a fallback and re-descends -
guarding against the classic Five-Whys failure of committing early to the
wrong sub-cause. After identifying (and validating) the root cause it
proposes a *SOLUTION* that addresses it, optionally including concrete
source code changes.

By default, the causes are derived from model knowledge only. With the
`--ground`/`-G` option, the skill first gathers facts on the *fact* from
the project artifacts and the Internet/Web, prefers causes backed by
them, and tags every cause with its evidence or as unverified.

##  OPTIONS

-   `--depth`|`-d` *N*:
    The *maximum* number of "why" iterations (the Five-Whys chain
    length), acting as an *upper bound* only - the analysis still stops
    early once the root cause is reached. Defaults to *5*. A non-numeric
    or non-positive value falls back to the default.

-   `--width`|`-w` *M*:
    The *maximum* number of *candidate sub-causes* to surface per "why"
    level. With the default *1*, the skill walks a single causality chain
    (classic Five-Whys); with *M* > 1, each level surfaces up to *M*
    candidate sub-causes, descends into the single most significant one
    (justifying the choice), and retains the rest as *fallbacks*. During
    backward validation a mis-rooted choice is *backtracked* into a fallback
    and re-descended, so the widening actively improves which root cause is
    reached rather than merely listing alternatives. The result is still a
    single, but better-justified, root cause. A non-numeric or non-positive
    value falls back to the default.

-   `--ground`|`-G`:
    Ground the analysis in facts instead of the world knowledge of the
    model alone: once before the first "why", the requirements, the
    realization, and the verification of the project (its specification,
    documentation, code, infrastructure, test, and CI files) are scanned
    for the facts relevant to the *fact*, and the Internet/Web is searched
    for known causes, practices, and pitfalls. Every cause is tagged with
    its evidence (file path or source URL) or as `[unverified]`, a cause
    contradicted by the facts fails the backward validation, and with
    `--width` > 1 an unverified cause is backtracked into an
    evidence-backed fallback. If no usable facts are found, a warning is
    shown and the analysis falls back to model knowledge.

##  ARGUMENTS

-   *fact*:
    The observed *fact* (symptom, problem, or surprising outcome)
    whose root cause should be investigated. The skill implicitly
    prepends "Why" to form the initial question.

##  SCENARIOS

-   You want the root cause of a problem, not just its symptom
-   You want a Five-Whys causality chain walked for an observed fact
-   You want candidate causes weighed with backtracking
-   You want each cause backed by evidence from the project and the Web
-   You want a solution proposed which addresses the root cause

##  EXAMPLES

Investigate the root cause of a build failure:

```text
❯ /ase-meta-why the CI build is intermittently failing on macOS runners
```

Drill down deeper with a tunable chain length of seven:

```text
❯ /ase-meta-why -d 7 the production latency spiked after the last deploy
```

Weigh several candidate sub-causes per level (with backtracking) to avoid
committing early to the wrong root cause:

```text
❯ /ase-meta-why -w 3 the release was delayed by two weeks
```

Back every cause with evidence from the project artifacts and the
Internet/Web:

```text
❯ /ase-meta-why -G -w 2 the CI build is intermittently failing on macOS runners
```

##  SEE ALSO

[`ase-code-analyze`](../ase-code-analyze/help.md), [`ase-task-edit`](../ase-task-edit/help.md), [`ase-arch-analyze`](../ase-arch-analyze/help.md).


##  NAME

`ase-meta-why` - Five-Whys Root-Cause Analysis

##  SYNOPSIS

`ase-meta-why`
    [`--help`|`-h`]
    [`--depth`|`-d` *N*]
    [`--width`|`-w` *M*]
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

##  ARGUMENTS

`--depth`|`-d` *N*:
    The *maximum* number of "why" iterations (the Five-Whys chain
    length), acting as an *upper bound* only - the analysis still stops
    early once the root cause is reached. Defaults to *5*. A non-numeric
    or non-positive value falls back to the default.

`--width`|`-w` *M*:
    The *maximum* number of *candidate sub-causes* to surface per "why"
    level. With the default *1*, the skill walks a single causality chain
    (classic Five-Whys); with *M* > 1, each level surfaces up to *M*
    candidate sub-causes, descends into the single most significant one
    (justifying the choice), and retains the rest as *fallbacks*. During
    backward validation a mis-rooted choice is *backtracked* into a fallback
    and re-descended, so the widening actively improves which root-cause is
    reached rather than merely listing alternatives. The result is still a
    single, but better-justified, root-cause. A non-numeric or non-positive
    value falls back to the default.

*fact*:
    The observed *fact* (symptom, problem, or surprising outcome)
    whose root cause should be investigated. The skill implicitly
    prepends "Why" to form the initial question.

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
committing early to the wrong root-cause:

```text
❯ /ase-meta-why -w 3 the release was delayed by two weeks
```

##  SEE ALSO

`ase-code-analyze`, `ase-code-resolve`, `ase-arch-analyze`.

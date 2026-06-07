
##  NAME

`ase-meta-why` - Five-Whys Root-Cause Analysis

##  SYNOPSIS

`ase-meta-why`
    [`--help`|`-h`]
    [`--depth`|`-d` *N*]
    *fact*

##  DESCRIPTION

The `ase-meta-why` skill applies the *Five-Whys* *root-cause
analysis* technique to the supplied *fact*. The skill iteratively
asks "why" - up to *N* times (see `--depth`, default five) - to drill
down from surface symptoms to the underlying root cause, considering
technical, domain-specific, process-related, and organizational
causes. After identifying the root cause it proposes a *SOLUTION* that
addresses it, optionally including concrete source code changes.

##  ARGUMENTS

`--depth`|`-d` *N*:
    The *maximum* number of "why" iterations (the Five-Whys chain
    length), acting as an *upper bound* only - the analysis still stops
    early once the root cause is reached. Defaults to *5*. A non-numeric
    or non-positive value falls back to the default.

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

##  SEE ALSO

`ase-code-analyze`, `ase-code-resolve`, `ase-arch-analyze`.

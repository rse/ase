
##  NAME

`ase-meta-why` - Five-Whys Root-Cause Analysis

##  SYNOPSIS

`ase-meta-why`
    [`--help`|`-h`]
    *fact*

##  DESCRIPTION

The `ase-meta-why` skill applies the *Five-Whys* *root-cause
analysis* technique to the supplied *fact*. The skill iteratively
asks "why" — up to five times — to drill down from surface symptoms
to the underlying root cause, considering technical, domain-specific,
process-related, and organizational causes. After identifying the
root cause it proposes a *SOLUTION* that addresses it, optionally
including concrete source code changes.

##  ARGUMENTS

*fact*:
    The observed *fact* (symptom, problem, or surprising outcome)
    whose root cause should be investigated. The skill implicitly
    prepends "Why" to form the initial question.

##  EXAMPLES

Investigate the root cause of a build failure:

```text
❯ /ase-meta-why the CI build is intermittently failing on macOS runners
```

##  SEE ALSO

`ase-code-analyze`, `ase-code-resolve`, `ase-arch-analyze`.

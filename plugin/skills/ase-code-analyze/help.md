
##  NAME

`ase-code-analyze` - Analyze Source Code

##  SYNOPSIS

`ase-code-analyze`
    [`--help`|`-h`]
    [`--performance`|`-p`]
    [`--security`|`-s`]
    [`--tests`|`-t`]
    [`--severity`|`-S`=(`LOW`|`MEDIUM`|`HIGH`)]
    [`--prefix`|`-P` *prefix*]
    *source-reference*

##  DESCRIPTION

The `ase-code-analyze` skill analyzes the source code of the referenced
location, and its directly related source code, for problems. It is
*read-only* and advisory: it reports problems but applies *no* changes.

The *analysis lens* depends on the selected options:

- **default** (none of `--performance`, `--security`, and `--tests`):
  problems in its *logic*, *semantics*, and related *control flow*.

- `--performance`|`-p`: problems in *performance* and *efficiency*.

- `--security`|`-s`: problems in *security*.

- `--tests`|`-t`: problems in its *tests*: expected values contradicting
  or lacking an *implementation-independent source* (specification, task
  plan, contract, or standard), and behaviors or edge cases without any
  test. Tests and the code under test are analyzed as pairs.

The `--performance`, `--security`, and `--tests` options are *mutually
exclusive*.

The `--severity`|`-S`=(`LOW`|`MEDIUM`|`HIGH`) option sets a *severity
floor* (default `LOW`): problems below the chosen threshold are silently
suppressed (neither reported nor persisted), ordered `LOW` < `MEDIUM` <
`HIGH`. The default `LOW` keeps all problems; `ACCEPTED` problems are
never suppressed. Surviving problems are reported in *descending
severity* order `HIGH`, `MEDIUM`, `LOW`, `ACCEPTED` - keeping the
`file`/`line` order within the same severity - and are renumbered
contiguously as `P<n>`, so `P1` is the most severe problem.

The `--prefix`|`-P` *prefix* option prefixes every reported problem id
with *prefix* and a hyphen, so `P1` becomes `<prefix>-P1` and its
persisted key becomes `ase-issue-<prefix>-P1`. The purge of stale
results is narrowed to the same namespace accordingly, so analyses run
under *distinct* prefixes coexist instead of overwriting each other.
Without the option (the default), ids stay unprefixed and the purge
covers the *entire* `ase-issue-*` space, including any prefixed results.

The skill investigates the code base silently, reports each detected
problem as a `PROBLEM` entry with severity (`LOW`, `MEDIUM`, `HIGH`) and
inline file/line references (in the performance lens, each entry
additionally carries an *evidence* and a *trade-off* line, and in the
tests lens a *source* line), and persists
results in the `ase` MCP key/value store as `ase-issue-P<n>` entries so
they can later be resolved via `ase-code-resolve P<n>` or directly
fixed via `ase-code-edit P<n>`.

##  ARGUMENTS

-   *source-reference*:
    A file, directory, function, or other reference to the source code
    to analyze.

##  SCENARIOS

-   You want your code checked for logic, semantics, and control-flow problems
-   You want a read-only report of problems without any changes applied
-   You want performance and efficiency opportunities surfaced
-   You want a security-focused inspection of your code
-   You want to know whether your tests are complete and domain-wise correct
-   You want problems persisted as issue ids like `P1` for later resolving

##  EXAMPLES

Analyze a specific source file for logic/semantic problems:

```text
❯ /ase-code-analyze src/server.ts
```

Analyze a directory of code:

```text
❯ /ase-code-analyze src/handlers/
```

Analyze a source file for performance/efficiency opportunities only:

```text
❯ /ase-code-analyze --performance src/server.ts
```

Analyze a source file for security aspects only:

```text
❯ /ase-code-analyze -s src/handlers/
```

Analyze the tests of a module for missing claims, edge cases, and wrong oracles:

```text
❯ /ase-code-analyze --tests src/tax.ts
```

Analyze a directory, reporting only `MEDIUM` and `HIGH` problems:

```text
❯ /ase-code-analyze -S MEDIUM src/handlers/
```

Analyze a directory under its own id namespace, yielding `auth-P1`, `auth-P2`, ...:

```text
❯ /ase-code-analyze --prefix auth src/auth/
```

##  SEE ALSO

[`ase-code-resolve`](../ase-code-resolve/help.md), [`ase-code-refactor`](../ase-code-refactor/help.md), [`ase-code-lint`](../ase-code-lint/help.md),
[`ase-code-explain`](../ase-code-explain/help.md), [`ase-arch-analyze`](../ase-arch-analyze/help.md).

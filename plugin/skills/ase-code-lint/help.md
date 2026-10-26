
##  NAME

`ase-code-lint` - Lint Source Code

##  SYNOPSIS

`ase-code-lint`
    [`--help`|`-h`]
    [`--auto`|`-a`]
    [`--severity`|`-S`=(`AUTO`|`LOW`|`MEDIUM`|`HIGH`)]
    [`--force`|`-f`]
    [`--include`|`-i`=*aspect*[`,`...]]
    [`--exclude`|`-e`=*aspect*[`,`...]]
    [`--staged`]
    [`--unstaged`]
    [*source-reference*]

##  DESCRIPTION

The `ase-code-lint` skill lints the source code of the referenced
location for *potential code quality problems* related to a fixed set
of code quality aspects. The investigation is dispatched to a
sub-agent (`ase:ase-code-lint`) so that scanning details do not leak
into the user-visible transcript.

For each detected problem, the skill renders a unified-diff *SOLUTION*
preview and either asks the user to `ACCEPT` or `REJECT` the proposed
correction interactively (or refine it via a free-text hint, which
re-proposes the correction without limit) or - with `--auto` - applies
all corrections automatically.

By default all twenty-two code quality aspects are checked. The `--include`
and `--exclude` options narrow this to an *effective aspect set*: with
`--include` only, exactly the listed aspects are checked; with
`--exclude` only, all aspects except the listed ones; with both, the
included ones minus the excluded ones. An unknown aspect id, or a
combination which cancels out to an empty set, aborts the skill with an
error. The twenty-two aspect ids are:

```text
A01 FORMATTING     A07 PATTERNS         A13 MEMORY-LEAK    A19 FLOW
A02 COMPREHENSION  A08 COMPLICATEDNESS  A14 CONCURRENCY    A20 DEAD-CODE
A03 CLEANLINESS    A09 CONCISENESS      A15 PERFORMANCE    A21 DOCUMENTATION
A04 SPELLING       A10 SMELLS           A16 SECURITY       A22 TESTING
A05 COMPLEXITY     A11 TYPING           A17 ARCHITECTURE
A06 REDUNDANCY     A12 ERROR-HANDLING   A18 LOGIC
```

The `A21 DOCUMENTATION` aspect checks the code documentation in *both*
directions: it flags functions, methods, classes, and modules - *private
ones included* - which lack a minimal 1-2 line description in the
idiomatic documentation convention of the target language, *and* it
flags excessive comments (narrated decision logs, change history,
line-by-line explanations of the obvious), comments merely restating
the code, and comments contradicting the code.

The `A22 TESTING` aspect checks the *test code* for tests which cannot
fail for the reason they exist: insensitive assertions (none, or a weak
proxy instead of the decisive value), expected values derived from the
code under test itself, assertions echoing a configured mock,
nondeterministic outcomes (clock, locale, randomness, sleeps, ordering),
and leftover focus markers.
It judges the *structure* of a test only -- the *deep* check of test
completeness, edge cases, and the domain correctness of expected values
is `ase-code-analyze --tests`.

##  OPTIONS

-   `--auto`|`-a`:
    Automatically apply every proposed correction without asking the
    user via the interactive dialog.

-   `--severity`|`-S`=(`AUTO`|`LOW`|`MEDIUM`|`HIGH`):
    Set the *severity floor* (default `AUTO`): findings below the chosen
    threshold are silently suppressed, ordered `LOW` < `MEDIUM` <
    `HIGH`. The default `AUTO` means `MEDIUM` for a project with `grey`
    boxing (unless `--force` is given) and `LOW` (keep all findings)
    otherwise; an explicitly given floor always wins over the `grey`
    boxing, i.e. e.g. with `LOW`, it acts on all findings of a project
    with `grey` boxing. `ACCEPTED` findings are never suppressed.
    Surviving findings are reported in *descending severity* order
    `HIGH`, `MEDIUM`, `LOW`, `ACCEPTED`, keeping the `file`/`line` order
    within the same severity.

-   `--force`|`-f`:
    Ignore the project boxing entirely: lint a project with `black`
    boxing (which is otherwise not linted at all), and show the full
    unified diffs and the default `LOW` severity floor for a project
    with `grey` boxing (which otherwise shows only condensed one-line
    diffs and defaults to the `MEDIUM` severity floor).

-   `--include`|`-i`=*aspect*[`,`...]:
    Restrict the checked code quality aspects to the given
    comma-separated list of aspect ids (e.g. `A01,A04`). Without this
    option, all twenty-two aspects are checked.

-   `--exclude`|`-e`=*aspect*[`,`...]:
    Remove the given comma-separated list of aspect ids from the checked
    code quality aspects. Applied *after* `--include`, so
    `-i A01,A02 -e A02` checks `A01` only.

-   `--staged`:
    Restrict the linting to the source files with *staged* Git changes.
    Deleted files are skipped, and the files are linted in their current
    working copy state. Combined with `--unstaged`, lint the source
    files with *any* uncommitted Git changes.

-   `--unstaged`:
    Restrict the linting to the source files with *unstaged* Git changes
    plus the *untracked* source files. Deleted files are skipped.
    Combined with `--staged`, lint the source files with *any*
    uncommitted Git changes.

##  ARGUMENTS

-   *source-reference*:
    A file, directory, or other reference to the source code to lint.
    Optional only under `--staged` or `--unstaged`: with it, only the
    changed files within it are linted; without it, all changed files
    of the repository are linted.

##  SCENARIOS

-   You want your code checked for code quality problems
-   You want corrections proposed which you accept or reject one by one
-   You want all quality corrections applied automatically
-   You want only specific quality aspects like formatting or spelling checked
-   You want missing or excessive code documentation flagged
-   You want only your staged or unstaged changes linted before committing
-   You want tests flagged which cannot fail

##  EXAMPLES

Lint a source file interactively:

```text
❯ /ase-code-lint src/server.ts
```

Lint a directory and automatically apply all corrections:

```text
❯ /ase-code-lint --auto src/handlers/
```

Lint a directory, reporting only `MEDIUM` and `HIGH` findings:

```text
❯ /ase-code-lint -S MEDIUM src/handlers/
```

Lint a directory regardless of the project boxing:

```text
❯ /ase-code-lint --force src/handlers/
```

Lint a source file for the formatting and spelling aspects only:

```text
❯ /ase-code-lint -i A01,A04 src/server.ts
```

Lint a directory for all aspects except dead code:

```text
❯ /ase-code-lint --exclude A20 src/handlers/
```

Lint a directory for the documentation aspect only:

```text
❯ /ase-code-lint -i A21 src/handlers/
```

Lint only the source files with staged Git changes:

```text
❯ /ase-code-lint --staged
```

Lint only the unstaged and untracked source files and apply all corrections:

```text
❯ /ase-code-lint --auto --unstaged
```

Lint a test directory for the testing aspect only:

```text
❯ /ase-code-lint -i A22 test/
```

##  SEE ALSO

[`ase-code-analyze`](../ase-code-analyze/help.md), [`ase-code-edit`](../ase-code-edit/help.md), [`ase-task-edit`](../ase-task-edit/help.md),
[`ase-docs-proofread`](../ase-docs-proofread/help.md).

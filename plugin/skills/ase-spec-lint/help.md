
##  NAME

`ase-spec-lint` - Lint Specification

##  SYNOPSIS

`ase-spec-lint`
    [`--help`|`-h`]
    [`--auto`|`-a`]
    [`--severity`|`-S`=(`AUTO`|`LOW`|`MEDIUM`|`HIGH`)]
    [`--force`|`-f`]
    [`--include`|`-i`=*aspect*[`,`...]]
    [`--exclude`|`-e`=*aspect*[`,`...]]
    [`--staged`]
    [`--unstaged`]
    [*spec-reference*]

##  DESCRIPTION

The `ase-spec-lint` skill lints the *SpecBook*-based specification
(SPEC) for *potential quality problems* related to a fixed set of
specification quality aspects: from its syntax and formatting, over
its individual statements, up to the logical gaps of its model and its
completeness for an implementation. The investigation is dispatched to
sub-agents (`ase:ase-spec-lint`) so that scanning details do not leak
into the user-visible transcript.

For each detected problem, the skill renders a unified-diff *SOLUTION*
preview and either asks the user to `ACCEPT` or `REJECT` the proposed
correction interactively (or refine it via a free-text hint, which
re-proposes the correction without limit) or - with `--auto` - applies
all corrections automatically. Every applied correction refreshes the
`Modified:` timestamp of the changed specification files.

By default all ten specification quality aspects are checked. The
`--include` and `--exclude` options narrow this to an *effective aspect
set*: with `--include` only, exactly the listed aspects are checked;
with `--exclude` only, all aspects except the listed ones; with both,
the included ones minus the excluded ones. An unknown aspect id, or a
combination which cancels out to an empty set, aborts the skill with an
error. The ten aspect ids are:

```text
S01 SYNTAX      S04 AMBIGUITY     S07 REDUNDANCY    S10 COMPLETENESS
S02 FORMAT      S05 ATOMICITY     S08 CONSISTENCY
S03 RATIONALE   S06 REALIZATION   S09 LOGIC
```

The `S01 SYNTAX` aspect reports the diagnostics of the specification
linting against the *SpecBook* schema configuration of the project and
of the generic Markdown linting via *markdownlint* (both as with `ase
spec lint --markdown`), mapping the severity `error` onto `HIGH` and
`warning` onto `MEDIUM`. The `S02 FORMAT` aspect checks the formatting
against the *SpecBook* format variants and the prevailing conventions
of the specification itself. The aspects `S03 RATIONALE` up to `S07
REDUNDANCY` check the statements against the *Specifying Tenets* of
*ASE*: a `, BECAUSE` rationale per statement, unambiguous and
verifiable statements, atomic statements, intent instead of
realization, and a single source of truth per fact.

The *model-wide* aspects `S07 REDUNDANCY` up to `S10 COMPLETENESS` are
judged on the *entire* specification, even if only parts of it are
linted: `S08 CONSISTENCY` checks for contradictions and drifting
terminology, `S09 LOGIC` for logical gaps in the specification model
(like unreachable states or entities without any relationship), and
`S10 COMPLETENESS` for open ends which would force an implementer to
guess. As the corrections of `S09 LOGIC` and `S10 COMPLETENESS` fill
gaps with *best-guess* content, they are proposed for review only and
are *never* applied under `--auto`.

##  OPTIONS

-   `--auto`|`-a`:
    Automatically apply every proposed correction without asking the
    user via the interactive dialog, except for the best-guess
    corrections of the aspects `S09 LOGIC` and `S10 COMPLETENESS`,
    which are only reported.

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
    Restrict the checked specification quality aspects to the given
    comma-separated list of aspect ids (e.g. `S01,S02`). Without this
    option, all ten aspects are checked.

-   `--exclude`|`-e`=*aspect*[`,`...]:
    Remove the given comma-separated list of aspect ids from the checked
    specification quality aspects. Applied *after* `--include`, so
    `-i S09,S10 -e S10` checks `S09` only.

-   `--staged`:
    Restrict the linting to the specification files with *staged* Git
    changes, and report (resp. correct) only the problems within their
    changed hunks. Deleted files are skipped, and the files are linted
    in their current working copy state, so for a file with additional
    unstaged changes, these hunks count as changed, too. Combined with
    `--unstaged`, lint the hunks of *any* uncommitted Git changes.

-   `--unstaged`:
    Restrict the linting to the specification files with *unstaged* Git
    changes plus the *untracked* specification files, and report (resp.
    correct) only the problems within their changed hunks, where an
    untracked file counts as changed entirely. Deleted files are
    skipped. Combined with `--staged`, lint the hunks of *any*
    uncommitted Git changes.

##  ARGUMENTS

-   *spec-reference*:
    A file, directory, or wildcard reference to the specification files
    to lint. Without it, the *entire* specification is linted, resp.
    under `--staged` or `--unstaged` all changed specification files.
    To lint changed files entirely instead of their hunks only, give
    them without these options.

##  SCENARIOS

-   You want your specification checked for specification quality problems
-   You want to know whether your specification is sufficient for an implementation
-   You want logical gaps in your specification model detected
-   You want corrections proposed which you accept or reject one by one
-   You want all mechanical corrections applied automatically
-   You want only your staged or unstaged specification changes linted before committing

##  EXAMPLES

Lint the entire specification interactively:

```text
❯ /ase-spec-lint
```

Lint a single specification file and automatically apply all corrections:

```text
❯ /ase-spec-lint --auto docs/spec/data-model.md
```

Lint the specification for its syntax and formatting only:

```text
❯ /ase-spec-lint -i S01,S02
```

Check the specification model for logical gaps and completeness only:

```text
❯ /ase-spec-lint -i S09,S10
```

Lint the specification, reporting only `MEDIUM` and `HIGH` findings:

```text
❯ /ase-spec-lint -S MEDIUM
```

Lint the specification regardless of the project boxing:

```text
❯ /ase-spec-lint --force
```

Lint only the hunks of the staged specification changes:

```text
❯ /ase-spec-lint --staged
```

##  SEE ALSO

[`ase-spec-edit`](../ase-spec-edit/help.md), [`ase-spec-activate`](../ase-spec-activate/help.md),
[`ase-code-lint`](../ase-code-lint/help.md), [`ase-sync-export`](../ase-sync-export/help.md).

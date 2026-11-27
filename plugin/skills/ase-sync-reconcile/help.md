
##  NAME

`ase-sync-reconcile` - Reconcile Artifact Set to Artifact Set

##  SYNOPSIS

`ase-sync-reconcile`
    [`--help`|`-h`]
    [`--bidirectional`|`-b`]
    [`--operation`|`-o` *op*[,...]]
    [`--dry`|`-d`]
    [`--target`|`-t` *target*[,...]]
    [`--source`|`-s` *source*[,...]]
    [*hint*]

##  DESCRIPTION

The `ase-sync-reconcile` skill reconciles one set of artifact kinds (the
*target*) to *reflect* the *current state* of another set of artifact
kinds (the *source*). It reads the source artifacts and then adjusts the
target artifacts *directly* and *surgically* to match the source state,
while optionally honoring a filtering *hint*.

Both *target* and *source* are comma-separated lists over the six
recognized artifact kinds `SPEC` (Specification, covering both
requirements and architecture), `CODE` (Source Code), `DOCS`
(Documentation), `TASK` (Task Plans), `INFR` (Infrastructure), and
`OTHR` (catch-all). When *source* is `AUTO`, it resolves to all six
kinds *minus* the kinds listed in *target*. Unless `--bidirectional` is
given, a kind present in *target* is never used as its own source.

While reconciling, the skill honors the artifact formats of `SPEC` (the
*SpecBook* models and formats plus the *SpecBook* schema configuration)
and `TASK`; the kinds `CODE`, `DOCS`, `INFR`, and `OTHR` have no
dedicated format contract and are treated as free-form. Changed `SPEC`
artifacts are validated via *SpecBook* linting and the reported
diagnostics are fixed in at most three rounds; any remaining diagnostics
are surfaced.

The changes on the *target* side are the three *operations* `add`
(create content and files the source warrants but the target lacks),
`update` (change existing content the source contradicts), and `remove`
(delete content and files the source no longer supports). The
`--operation` option restricts which of them are applied; whatever an
excluded operation would have changed stays untouched. With `--dry`, no
target artifact is modified at all and the intended changes are shown as
a unified diff instead.

##  OPTIONS

-   `--bidirectional`|`-b`:
    Reconcile the *target* and *source* artifacts so that they
    faithfully reflect the current state of *each other*, instead of
    only updating the *target* from the *source*. With this flag, a kind
    present in *target* is *not* removed from *source*, and the
    `--operation` restriction applies to both directions.

-   `--operation`|`-o` *op*[,...]:
    The comma-separated list of operations to apply on the target side,
    each one of `add`, `update`, or `remove`. The special value `all`
    (the default) selects all three operations.

-   `--dry`|`-d`:
    Perform the regular reconciliation, but do *not* modify any target
    artifact (neither files nor task plans). Instead, show the intended
    changes as a single unified diff. The SpecBook validation is skipped,
    as nothing is written to disk.

-   `--target`|`-t` *target*[,...]:
    The comma-separated list of artifact kinds to update (default:
    `CODE,DOCS,INFR,OTHR`). An empty target lets the skill error out.

-   `--source`|`-s` *source*[,...]:
    The comma-separated list of artifact kinds to update *from*. The
    special value `AUTO` (the default) resolves to all recognized kinds
    except those in *target*.

##  ARGUMENTS

-   *hint*:
    An optional free-form filtering hint that narrows the source and/or
    target artifacts, or the aspects of those artifacts to take into
    account during reconciliation. A file named explicitly by the hint
    is included, even if its artifact kind is not among the target
    resp. source kinds.

##  SCENARIOS

-   You want one artifact set updated to reflect another one
-   You want code and docs aligned with the specification
-   You want the specification recovered from the code base
-   You want spec and code bidirectionally synchronized
-   You want only missing parts added to the documentation, never anything removed
-   You want to preview the reconciliation as a diff before applying it

##  EXAMPLES

Reconcile the code and documentation
to reflect the current specification
in a "forward engineering" approach:

```text
❯ /ase-sync-reconcile -t CODE,DOCS -s SPEC
```

Reconcile the specification from everything else
in a "reverse engineering" approach:

```text
❯ /ase-sync-reconcile -t SPEC -s CODE,DOCS
```

Bidirectionally reconcile specification and code against
each other, limited to the authentication aspect:

```text
❯ /ase-sync-reconcile -b -t SPEC -s CODE authentication
```

Add missing and update outdated parts of the documentation
from the code, but never remove anything:

```text
❯ /ase-sync-reconcile -o add,update -t DOCS -s CODE
```

Preview the reconciliation of the code from the
specification as a unified diff, without applying it:

```text
❯ /ase-sync-reconcile -d -t CODE -s SPEC
```

##  SEE ALSO

[`ase-repo-changelog`](../ase-repo-changelog/help.md),
[`ase-repo-agents`](../ase-repo-agents/help.md),
[`ase-task-implement`](../ase-task-implement/help.md).

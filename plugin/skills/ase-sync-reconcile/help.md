
##  NAME

`ase-sync-reconcile` - Reconcile Artifacts from Artifacts

##  SYNOPSIS

`ase-sync-reconcile`
    [`--help`|`-h`]
    *target*[,...]
    [*source*[,...]]

##  DESCRIPTION

The `ase-sync-reconcile` skill reconciles one set of artifact kinds (the
*target*) to *reflect* the *current state* of another set of artifact
kinds (the *source*). It reads the source artifacts and then adjusts the
target artifacts *directly* and *surgically* to match the source state.

Both *target* and *source* are comma-separated lists over the seven
recognized artifact kinds `SPEC` (Specification), `ARCH` (Architecture),
`CODE` (Source Code), `DOCS` (Documentation), `TASK` (Task Plans), `INFR`
(Infrastructure), and `OTHR` (catch-all). When *source* is omitted, it
defaults to all seven kinds *minus* the kinds listed in *target*. A kind
present in *target* is never used as its own source.

The file lists for the kinds `SPEC`, `ARCH`, `CODE`, `DOCS`, `INFR`, and
`OTHR` are resolved via the `ase_artifact_list` MCP tool; the `TASK` kind
is resolved generically from the `.ase/task/*/plan.md` task plans. While
reconciling, the skill honors the artifact-format conventions of
`ase-format-meta.md`, `ase-format-spec.md`, `ase-format-arch.md`, and
`ase-format-task.md`; the kinds `CODE`, `DOCS`, `INFR`, and `OTHR` are
treated as free-form.

##  ARGUMENTS

*target*[,...]:
    The comma-separated list of artifact kinds to update.

*source*[,...]:
    The comma-separated list of artifact kinds to update *from*. When
    omitted, it defaults to all recognized kinds except those in *target*.

##  EXAMPLES

Reconcile the code and documentation
to reflect the current specification and architecture
in a "forward engineering" approach:

```text
❯ /ase-sync-reconcile CODE,DOCS SPEC,ARCH
```

Reconcile specification and architecture from everything else
in a "reverse engineering" approach:

```text
❯ /ase-sync-reconcile SPEC,ARCH CODE,DOCS
```

##  SEE ALSO

[`ase-meta-changelog`](../ase-meta-changelog/help.md),
[`ase-task-implement`](../ase-task-implement/help.md)

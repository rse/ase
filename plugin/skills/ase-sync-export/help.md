
##  NAME

`ase-sync-export` - Export Artifact Set to Side-by-Side Files

##  SYNOPSIS

`ase-sync-export`
    [`--help`|`-h`]
    [`--source`|`-s` *source*[,...]]
    [*filter*]

##  DESCRIPTION

The `ase-sync-export` skill exports the content of a set of artifact
kinds (the *source*) into *derived*, ready-to-consume files placed
*side-by-side* with the artifacts themselves. For every source artifact
that declares an *export* in its format definition, the skill builds the
declared rendering and writes it to a sibling file.

The *source* is a comma-separated list over the seven recognized
artifact kinds `SPEC` (Specification), `ARCH` (Architecture), `CODE`
(Source Code), `DOCS` (Documentation), `TASK` (Task Plans), `INFR`
(Infrastructure), and `OTHR` (catch-all). The file lists for the
involved kinds are resolved via the `ase_artifact_list` MCP tool of the
`ase` MCP server.

An *export* is declared by a `-   Export:` bullet point in an artifact's
format definition (see `ase-format-meta.md`, `ase-format-spec.md`, and
`ase-format-arch.md`); an artifact *without* such a bullet is *not*
exported. Each exported file is named
`<set>-<no>-<id>-<slug>-<export-name>.<ext>` (e.g.
`SPEC-07-DM-Data-Model-export.svg`) and stored in the artifact's own
base directory. Initially, the *Data Model* (`SPEC-DM`) exports as a
Mermaid UML diagram converted to SVG, and the *Technology Stack*
(`ARCH-TS`) exports as a compact Markdown table.

##  OPTIONS

`--source`|`-s` *source*[,...]:
    The comma-separated list of artifact kinds to export. Defaults to
    `SPEC,ARCH` (the skill errors out on an empty source).

##  ARGUMENTS

*filter*:
    An optional free-form filtering hint that narrows the source
    artifacts, or the aspects of those artifacts, to take into account
    when materializing the exports. If omitted, every export declared by
    a source artifact is materialized.

##  EXAMPLES

Export the specification and architecture artifacts to their
side-by-side files (the default):

```text
❯ /ase-sync-export
```

Export only the specification artifacts:

```text
❯ /ase-sync-export -s SPEC
```

Export only the data-model artifact:

```text
❯ /ase-sync-export -s SPEC data model
```

##  SEE ALSO

[`ase-sync-reconcile`](../ase-sync-reconcile/help.md),
[`ase-sync-import`](../ase-sync-import/help.md)


##  NAME

`ase-sync-import` - Import Foreign Sources into Artifact Set

##  SYNOPSIS

`ase-sync-import`
    [`--help`|`-h`]
    [`--target`|`-t` *target*[,...]]
    *hint*

##  DESCRIPTION

The `ase-sync-import` skill imports information from *foreign sources*
into a set of artifact kinds (the *target*), generating or updating the
target artifacts so they faithfully *reflect* the imported information.
Unlike `ase-sync-reconcile`, which syncs *between* existing ASE artifact
kinds, `ase-sync-import` brings in information from *external* sources
that live outside the ASE artifact sets.

The *foreign sources* are named by the free-form *hint* argument and may
be local files or directories, remote URLs, pasted text passages, or
references to other documents. Local files are read via the `Read` tool
and remote URLs are fetched via the available web tools.

The *target* is a comma-separated list over the seven recognized
artifact kinds `SPEC` (Specification), `ARCH` (Architecture), `CODE`
(Source Code), `DOCS` (Documentation), `TASK` (Task Plans), `INFR`
(Infrastructure), and `OTHR` (catch-all). It defaults to `SPEC,ARCH`.
The file lists for the involved kinds are resolved via the
`ase_artifact_list` MCP tool of the `ase` MCP server.

While importing, the skill honors the artifact-format conventions of
`ase-format-meta.md`, `ase-format-spec.md`, `ase-format-arch.md`, and
`ase-format-task.md`; the kinds `CODE`, `DOCS`, `INFR`, and `OTHR` have
no dedicated format contract and are treated as free-form. A target
artifact that does not yet exist but is warranted by the imported
information is *generated* from scratch, while an existing target
artifact is *surgically updated* to reflect the imported information.

##  OPTIONS

`--target`|`-t` *target*[,...]:
    The comma-separated list of artifact kinds to generate or update.
    Defaults to `SPEC,ARCH`. The skill errors out on an empty target or
    an unknown/unsupported kind.

##  ARGUMENTS

*hint*:
    The mandatory free-form description of the foreign sources to import
    from (e.g. a file path, directory, URL, or pasted text). The skill
    errors out on an empty hint.

##  EXAMPLES

Import a foreign requirements document into the specification:

```text
❯ /ase-sync-import -t SPEC docs/legacy/requirements.txt
```

Import an external design write-up into the architecture, defaulting to
both specification and architecture as targets:

```text
❯ /ase-sync-import https://example.com/design-notes.html
```

Import a pasted feature description into a task plan:

```text
❯ /ase-sync-import -t TASK the new export feature must support CSV and JSON
```

##  SEE ALSO

[`ase-sync-reconcile`](../ase-sync-reconcile/help.md),
[`ase-sync-export`](../ase-sync-export/help.md),
[`ase-task-implement`](../ase-task-implement/help.md)

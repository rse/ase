
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
references to other documents.

The *target* is a comma-separated list over the six recognized
artifact kinds `SPEC` (Specification, covering both requirements and
architecture), `CODE` (Source Code), `DOCS` (Documentation), `TASK`
(Task Plans), `INFR` (Infrastructure), and `OTHR` (catch-all). It
defaults to `SPEC`.

While importing, the skill honors the artifact formats of `SPEC` (the
*SpecBook* models and formats plus the *SpecBook* schema configuration)
and `TASK`; the kinds `CODE`, `DOCS`, `INFR`, and `OTHR` have
no dedicated format contract and are treated as free-form. A target
artifact that does not yet exist but is warranted by the imported
information is *generated* from scratch, while an existing target
artifact is *surgically updated* to reflect the imported information.
Generated or updated `SPEC` artifacts are validated via *SpecBook*
linting and the reported diagnostics are fixed in at most three rounds;
any remaining diagnostics are surfaced.

##  OPTIONS

-   `--target`|`-t` *target*[,...]:
    The comma-separated list of artifact kinds to generate or update.
    Defaults to `SPEC`. The skill errors out on an empty target or
    an unknown/unsupported kind.

##  ARGUMENTS

-   *hint*:
    The mandatory free-form description of the foreign sources to import
    from (e.g. a file path, directory, URL, or pasted text). The skill
    errors out on an empty hint.

##  SCENARIOS

-   You want external sources brought into the project artifacts
-   You want a foreign document, URL, or pasted text reflected in the `SPEC`
-   You want requirements from outside imported into a task plan
-   You want legacy material ingested into the specification

##  EXAMPLES

Import a foreign requirements document into the specification:

```text
❯ /ase-sync-import -t SPEC docs/legacy/requirements.txt
```

Import an external design write-up into the specification (the default
target), which covers the architecture, too:

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
[`ase-task-implement`](../ase-task-implement/help.md).

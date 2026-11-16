
##  NAME

`ase-sync-export` - Export Specification into Rendered Files

##  SYNOPSIS

`ase-sync-export`
    [`--help`|`-h`]
    [`--output`|`-o` *output*[,...]]

##  DESCRIPTION

The `ase-sync-export` skill exports the `SPEC` artifact set -- the
*SpecBook*-based specification of the project, located via the
`project.artifact.spec.basedir` configuration -- into *derived*,
ready-to-consume renderings. The specification is first validated
against the *SpecBook* schema configuration; on any error diagnostic
the skill errors out and exports nothing, as a partial or invalid
specification must never be rendered. Otherwise every requested
*output* is rendered via the *SpecBook* export.

Each *output* is an `[<format>:]<file>` entry, where the format is one
of `json`, `json5`, `yaml`, `toon` (the specification object model),
`html` (self-contained single document with table of contents, full-text
search, and light/dark theme), `pdf` (paginated print document), or `md`
(normalized single Markdown document). The format is inferred from the
filename extension unless it is explicitly given as a prefix. The
standard output sentinel `-` is not supported.

The `pdf` format is the only one with an external prerequisite: it
prints the rendering through a Chromium-class browser. Neither `npm
install -g @rse/ase` nor `ase setup install` downloads one, so unless a
*Google Chrome* is installed system-wide, the Playwright Chromium has to
be fetched once via `npx playwright install chromium`. Without any such
browser the export fails up-front, before the specification is parsed,
and reports that very command; when it falls back onto a system-installed
*Google Chrome*, the skill reports this as an environment notice.

##  OPTIONS

-   `--output`|`-o` *output*[,...]:
    The comma-separated list of `[<format>:]<file>` entries to render,
    with each file path relative to the project root. Defaults to the
    single HTML rendering `index.html` inside the `SPEC` base directory
    (e.g. `docs/specbook/index.html`).

##  SCENARIOS

-   You want the specification rendered as HTML, PDF, Markdown, or JSON
-   You want a shareable, ready-to-consume export of the `SPEC` artifacts
-   You want the specification validated and then materialized into files

##  EXAMPLES

Export the specification to its default HTML rendering:

```text
❯ /ase-sync-export
```

Export the specification as HTML and PDF:

```text
❯ /ase-sync-export -o docs/spec.html,docs/spec.pdf
```

Export the specification object model as YAML into a file without a
telling extension:

```text
❯ /ase-sync-export -o yaml:docs/spec.model
```

##  SEE ALSO

[`ase-sync-reconcile`](../ase-sync-reconcile/help.md),
[`ase-sync-import`](../ase-sync-import/help.md).

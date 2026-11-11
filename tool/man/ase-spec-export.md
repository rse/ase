# ase-spec-export(1) -- Export the Project Specification

## SYNOPSIS

`ase spec export`
\[`-h`|`--help`\]
\[`-o`|`--output` \[*format*`:`\]*file*\] \[...\]
\[`-w`|`--watch`\]
\[`-S`|`--schema`\]
\[`-O`|`--omit` *aspect*\[`,`...\]\] \[...\]
\[`-F`|`--fetch` *mode*\]

## DESCRIPTION

**ase spec export** exports the *SpecBook*-based specification Markdown
files below `project.artifact.spec.basedir` (see `ase-spec`(1)) into one
or more output files. The supported formats are:

- `json`, `json5`, `yaml`, `toon`:
  The specification object model in the respective serialization.
- `html`:
  A self-contained single HTML document.
- `pdf`:
  A paginated print document.
- `md`:
  A normalized single Markdown document.

The specification is parsed once, and each distinct format is exported
once, even if requested for multiple outputs. Each written file is
logged at the `info` level. The export fails on any lint diagnostic
of `error` severity (see `ase-spec-lint`(1)), while warnings are only
logged, so a partial or invalid specification is never emitted.

The `pdf` format additionally requires a Chromium-class browser, which
neither `npm install -g @rse/ase` nor `ase setup install` provides:
unless a *Google Chrome* is installed system-wide, fetch the
*Playwright* Chromium once via `npx playwright install chromium`.
Without any such browser, the export fails before the specification is
even parsed and reports that very command.

The MCP tool `ase_specbook_export` provides the same to the skills.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-o`|`--output` \[*format*`:`\]*file*\]:
  Write the export into *file*, or to standard output for `-`. The
  option is repeatable, so multiple outputs (of the same or different
  formats) are written in a single run. The *format* is inferred from
  the filename extension (`json`, `json5`, `yaml` or `yml`, `toon`,
  `html` or `htm`, `pdf`, and `md` or `markdown`, case-insensitive)
  unless explicitly given as a prefix of at least two characters (out
  of the same names), where a plain `-` defaults to `json`.

  The log is written to standard error (see `ase`(1)), so it never
  mixes into the export on standard output. An unknown format prefix and
  a not inferable format are errors. A relative *file* is relative to the
  current working directory. Default: the HTML rendering into
  `index.html` (resp. `schema.html` under `--schema`) inside the
  specification base directory (e.g., `docs/specbook/index.html`).
  A `md` output inside the specification base directory is refused,
  as it would be parsed as a specification file itself.

- \[`-w`|`--watch`\]:
  Do not terminate after the initial export, but keep the outputs in
  sync by re-exporting on every change of a configuration file, an
  artifact file, or one of its embedded assets (bursts of changes are
  coalesced). A transiently failing re-export leaves the watch intact.
  As a re-export has to land somewhere it can be picked up again,
  `--watch` rejects the `-` standard output. The command then runs
  until it is interrupted (e.g., via `CTRL+C`).

- \[`-S`|`--schema`\]:
  Export the effective schema configuration `project.artifact.spec.schema`
  itself, rendered as a *SpecBook* document, instead of the specification.

- \[`-O`|`--omit` *aspect*\[`,`...\]\]:
  Omit content aspects from the `html` and `pdf` outputs instead of
  just leaving them foldable in the browser, while the AST outputs
  (`json`, `json5`, `yaml`, and `toon`) drop the omitted diagrams only,
  and the `md` output ignores the option. The option is repeatable and
  takes comma-separated lists. The *aspect* is one of:

  - `diagram:graph`, `diagram:hub`, `diagram:grid`, `diagram:state`,
    `diagram:layer`, `diagram:slice`, `diagram:tree`, `diagram:matrix`,
    `diagram:sequence`, `diagram:petri`, `diagram:gantt`, `diagram:code`
    (Mermaid/D2), `diagram:image` (images and PDF pages), and
    `diagram:listing` (code listings): all diagrams of the type.
  - `diagram:1` (alias: `diagram`), `diagram:2`, and `diagram:3`: all
    diagrams from the object tree nesting level on (level `1` hence all,
    including the "Diagram of Contents" page).
  - `text:long`: every table cell towering over all other cells of its
    row, cut at a word boundary and ended with a grey `[...]`.

- \[`-F`|`--fetch` *mode*\]:
  When to fetch the remote schemas of the schema configuration through
  the network: `never`, `auto` (the default), or `always` (see `ase-spec`(1)).

## EXIT STATUS

Exits with status `0` on success, and with status `1` on any lint
diagnostic of `error` severity, an invalid output specification, an
unknown omit aspect, a missing browser for `pdf`, an unwritable output
file, or `--watch` combined with `-`.

## EXAMPLES

```sh
# export the specification as HTML into its default location
$ ase spec export

# export the specification as PDF and as JSON in a single run
$ ase spec export -o spec.pdf -o spec.json

# export the normalized Markdown to standard output
$ ase spec export -o md:-

# keep an HTML export in sync with the sources
$ ase spec export -o /tmp/spec.html -w

# export the schema configuration as PDF
$ ase spec export -S -o schema.pdf

# export the specification as PDF without any diagrams
$ ase spec export -O diagram -o spec.pdf
```

## SEE ALSO

`ase`(1), `ase-spec`(1), `ase-spec-lint`(1), `ase-spec-query`(1),
`ase-spec-preview`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

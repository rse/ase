# ase-spec-lint(1) -- Lint the Project Specification

## SYNOPSIS

`ase spec lint`
\[`-h`|`--help`\]
\[`-m`|`--markdown`\]
\[`-v`|`--verbose`\]
\[`-F`|`--fetch` *mode*\]

## DESCRIPTION

**ase spec lint** lints the *SpecBook*-based specification Markdown
files below `project.artifact.spec.basedir` against the *SpecBook*
schema configuration `project.artifact.spec.schema` (see `ase-spec`(1)),
and optionally for their generic Markdown formatting via *markdownlint*.

Every diagnostic is logged to standard error as a single message
`lint: `*linter*`: `*file*`:`*line*`:`*column*`: `*message* of the
log level `error` resp. `warning` of its severity, where *linter* is
`specbook` or `markdownlint`, and *file* is relative to the project
root (a file outside the project, like the bundled standard schema, is
kept as-is). Without any diagnostic, nothing is logged.

The MCP tool `ase_specbook_lint` provides the same to the skills.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-m`|`--markdown`\]:
  Additionally lint the specification Markdown files for their generic
  Markdown formatting via *markdownlint*, with the rules conflicting
  with the *SpecBook* format (like mixed ATX and Setext headings, free
  ordered list numbering, padded list markers and headings, unwrapped
  lines, images without alternate text, and multiple artifacts per file)
  disabled. Its findings are diagnostics of `warning` severity, so they
  never fail the linting.

- \[`-v`|`--verbose`\]:
  Instead of logging each diagnostic, print it to standard output as a
  multi-line message with the affected source snippet (with an `ERROR`
  resp. `WARNING` type, and a message prefixed by `markdownlint: ` for a
  *markdownlint* diagnostic), colorized if standard output is a
  terminal. If the source file is unreadable or empty, the single-line
  message *file*`:`*line*`:`*column*`: `*message* is printed instead.

- \[`-F`|`--fetch` *mode*\]:
  When to fetch the remote schemas of the schema configuration through
  the network: `never`, `auto` (the default), or `always` (see `ase-spec`(1)).

## EXIT STATUS

Exits with status `0` if there is no diagnostic of `error` severity
(warnings alone do not fail), and with status `1` if there is any
diagnostic of `error` severity or the linting itself failed (e.g., an
unreadable schema configuration).

## EXAMPLES

```sh
# lint the specification
$ ase spec lint

# lint the specification, showing the affected source snippets
$ ase spec lint -v

# lint the specification, including its generic Markdown formatting
$ ase spec lint -m
```

## SEE ALSO

`ase`(1), `ase-spec`(1), `ase-spec-export`(1), `ase-spec-query`(1),
`ase-spec-preview`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

# ase-spec(1) -- Initialize, Lint, Export, Query, and Preview the Project Specification

## SYNOPSIS

`ase spec`
\[`-h`|`--help`\]

`ase spec init`
\[`-s`|`--sample`\]

`ase spec lint`
\[`-m`|`--markdown`\]
\[`-v`|`--verbose`\]

`ase spec export`
\[`-o`|`--output` \[*format*`:`\]*file*\] \[...\]
\[`-w`|`--watch`\]
\[`-S`|`--schema`\]

`ase spec query`
\[`-P`|`--param` *name*`=`*value*\] \[...\]
\[`-f`|`--format` *format*\]
\[`-o`|`--output` \[*format*`:`\]*file*\]
\[`-S`|`--schema`\]
*selector*

`ase spec preview`
\[`-a`|`--addr` *ip-addr*\]
\[`-p`|`--port` *tcp-port*\]
\[`-S`|`--schema`\]

## DESCRIPTION

**ase spec** is the entry point group for initializing, linting,
exporting, querying, and previewing the *SpecBook*-based project
specification (SPEC), i.e., the Markdown files (plus their embedded
assets) of the artifact kind `spec` below the base directory
`project.artifact.spec.basedir` (default: `docs/specbook`, relative to
the project root). Every `.md` file below the base directory
(recursively, except below `.`-prefixed entries), whatever its name,
is taken as a specification file.

The specification is governed by the *SpecBook* YAML schema
configuration `project.artifact.spec.schema`: a whitespace-separated
list of schema files, merged in the given order, where the entry `std`
names the full standard schema bundled with *SpecBook* (not its
compressed variant `ase-format-specbook.yaml` bundled with the plugin
for the agents, see `ase-util-meta`(1)), the entries `meta` and `pm`
name the meta and project management schemas bundled with *SpecBook*,
the entries prefixed with `npm:`, `github:`, `http://`, or `https://`
name remote schemas (fetched and cached by *SpecBook*), and every other
entry is a file path or glob pattern relative to the project root. An
unset or empty value means `std`.

All reading specification commands honor the Git exclude rules exactly
like `ase artifact list` does (see `ase-artifact`(1)): an artifact file
Git excludes from the project counts as an *absent* one, so both
resolvers always see the very same specification.

The *SpecBook* processing information is logged at the `info` level
and its tracing details at the `debug` level (see the global option
`--log-level` of `ase`(1)).

Without a sub-command, the usage information is shown and the command
exits with status `1`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

## COMMANDS

- `ase spec init` \[`-s`|`--sample`\]:
  Initialize the absent specification Markdown files of the schema
  configuration. See `ase-spec-init`(1).

- `ase spec lint` \[`-m`|`--markdown`\] \[`-v`|`--verbose`\]:
  Lint the specification against the schema configuration, and
  optionally for its generic Markdown formatting. See `ase-spec-lint`(1).

- `ase spec export` \[`-o`|`--output` \[*format*`:`\]*file*\] \[...\] \[`-w`|`--watch`\] \[`-S`|`--schema`\]:
  Export the specification as JSON, JSON5, YAML, TOON, HTML, PDF, or
  normalized Markdown. See `ase-spec-export`(1).

- `ase spec query` \[`-P`|`--param` *name*`=`*value*\] \[...\] \[`-f`|`--format` *format*\] \[`-o`|`--output` \[*format*`:`\]*file*\] \[`-S`|`--schema`\] *selector*:
  Query the specification with an *ASTq* selector, writing the matched
  nodes as JSON, JSON5, YAML, or TOON. See `ase-spec-query`(1).

- `ase spec preview` \[`-a`|`--addr` *ip-addr*\] \[`-p`|`--port` *tcp-port*\] \[`-S`|`--schema`\]:
  Serve the HTML export of the specification as a live preview. See
  `ase-spec-preview`(1).

## EXIT STATUS

The group command without a sub-command exits with status `1`.

## SEE ALSO

`ase`(1), `ase-spec-init`(1), `ase-spec-lint`(1), `ase-spec-export`(1),
`ase-spec-query`(1), `ase-spec-preview`(1), `ase-artifact`(1),
`ase-config`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

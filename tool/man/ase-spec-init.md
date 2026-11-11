# ase-spec-init(1) -- Initialize the Project Specification

## SYNOPSIS

`ase spec init`
\[`-h`|`--help`\]
\[`-s`|`--sample`\]
\[`-F`|`--fetch` *mode*\]

## DESCRIPTION

**ase spec init** initializes the *SpecBook*-based specification below
`project.artifact.spec.basedir` (see `ase-spec`(1)): it creates every
specification Markdown file which the *SpecBook* schema configuration
`project.artifact.spec.schema` assigns artifacts onto and which does
not exist yet, creating the base directory on demand. Each created file
carries a frontmatter with the `Created` and `Modified` timestamps and
the level 1 headings of all artifacts assigned onto it, in the order of
the schema configuration. An already existing file is never touched.

The created files are printed to standard output as a single line
`initialized artifact file(s): `*file*\[`, `*file*\] \[...\], where each
*file* is relative to the project root, or as the line `no artifact
files were created` if all files already exist.

Unlike `specbook init`, no *SpecBook* project configuration file
`.specbook.yaml` is created, as the base directory and the schema
configuration are taken from the *ASE* configuration (see
`ase-config`(1)).

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-s`|`--sample`\]:
  Additionally scaffold one lint-clean sample object per allowed object
  kind into the created files, with placeholder values satisfying the
  schema configuration, so the format is learnable from them.

- \[`-F`|`--fetch` *mode*\]:
  When to fetch the remote schemas of the schema configuration through
  the network: `never`, `auto` (the default), or `always` (see `ase-spec`(1)).

## EXIT STATUS

Exits with status `0` on success, and with status `1` if the
initialization failed (e.g., an invalid schema configuration).

## EXAMPLES

```sh
# initialize the specification
$ ase spec init

# initialize and then lint the specification
$ ase spec init && ase spec lint

# initialize the specification with sample objects
$ ase spec init -s
```

## SEE ALSO

`ase`(1), `ase-spec`(1), `ase-spec-lint`(1), `ase-spec-export`(1),
`ase-spec-query`(1), `ase-spec-preview`(1), `ase-config`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>


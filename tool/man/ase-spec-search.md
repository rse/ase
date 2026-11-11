# ase-spec-search(1) -- Search for Shareable Schema Configurations

## SYNOPSIS

`ase spec search`
\[`-h`|`--help`\]
\[`-F`|`--fetch` *mode*\]
\[*term* ...\]

## DESCRIPTION

**ase spec search** searches the *SpecBook* schema configurations
bundled with *SpecBook* (`std`, `meta`, and `pm`, always listed first),
and the shareable ones of the npm registry (packages with the keyword
`specbook-schema`) and of GitHub (repositories with the topic
`specbook-schema`), for those carrying all words of the *term*s.

Each hit is printed to standard output as a single line of its reference
(usable as an entry of `project.artifact.spec.schema`, see `ase-spec`(1)),
its version, and its description, or as the line `no matching schema
configurations found` if there is no hit.

The MCP tool `ase_specbook_search` provides the same to the skills.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-F`|`--fetch` *mode*\]:
  When to search through the network: `never` (the bundled schema
  configurations only), `auto` (the default), or `always`.

## EXIT STATUS

Exits with status `0` on success, and with status `1` if the search
failed (e.g., an unreachable registry).

## EXAMPLES

```sh
# list all schema configurations
$ ase spec search

# search for schema configurations on project management
$ ase spec search project management

# list the bundled schema configurations only
$ ase spec search -F never
```

## SEE ALSO

`ase`(1), `ase-spec`(1), `ase-spec-init`(1), `ase-config`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>


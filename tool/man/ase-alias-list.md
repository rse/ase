# ase-alias-list(1) -- List the Skill Command Aliases

## SYNOPSIS

`ase alias list`
\[`-h`|`--help`\]
\[`-s`|`--scope` `user`|`project`\]
\[`-k`|`--skill` *skill*\]
\[`-T`|`--tuned`\]

## DESCRIPTION

**ase alias list** lists the effective full aliases, option aliases, and
option defaults as a table of their kind (`alias`, `option`, or
`default`), their name (the alias name, resp. the skill name), their
option alias, their value, and their supplying scope. See `ase-alias`(1)
for the kinds of aliases and for how the scopes override each other.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-s`|`--scope` `user`|`project`\]:
  List the entries of a single scope only. Default: both scopes.

- \[`-k`|`--skill` *skill*\]:
  List the entries of a single *skill* only, i.e., its option aliases,
  its option defaults, and the full aliases resolving to it.

- \[`-T`|`--tuned`\]:
  List just the names of the skills with option aliases or option
  defaults, separated by spaces, instead of the table and regardless of
  `--scope` and `--skill`.

## EXIT STATUS

`0` on success, `1` on any error.

## EXAMPLES

```sh
# list all effective aliases
$ ase alias list

# list the entries of the project only
$ ase alias list --scope project

# list the effective aliases of a skill
$ ase alias list --skill ase-code-lint

# list the skills with option aliases or option defaults
$ ase alias list --tuned
```

## SEE ALSO

`ase`(1), `ase-alias`(1), `ase-alias-set`(1), `ase-alias-expand`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

# ase-alias-expand(1) -- Expand a Skill Command Line

## SYNOPSIS

`ase alias expand`
\[`-h`|`--help`\]
*command-line* \[...\]

## DESCRIPTION

**ase alias expand** expands the skill *command-line* through the full
aliases, the option aliases, and the option defaults of both scopes, and
prints the expanded command line, the option defaults, the resulting
options, and the resulting arguments of the skill. This is intended for
testing aliases. See `ase-alias`(1) for the expansion order.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

## ARGUMENTS

- *command-line*:
  The skill command line, i.e., a full alias or a skill, followed by its
  options and arguments, given either as a single (quoted) argument or
  as multiple arguments.

## EXIT STATUS

`0` on success, `1` on any error, like an unknown alias or skill.

## EXAMPLES

```sh
# expand a full alias, followed by an argument
$ ase alias expand /lint-sec src/

# check the expansion, where "--no-approach" drops the option default again
$ ase alias expand /ase-task-edit --no-approach foo
```

## SEE ALSO

`ase`(1), `ase-alias`(1), `ase-alias-list`(1), `ase-alias-set`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

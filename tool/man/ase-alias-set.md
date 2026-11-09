# ase-alias-set(1) -- Set a Skill Command Alias

## SYNOPSIS

`ase alias set`
\[`-h`|`--help`\]
\[`-s`|`--scope` `user`|`project`\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]
*name*
*command-line* \[...\]

`ase alias set`
\[`-s`|`--scope` `user`|`project`\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]
`-o`|`--option`
*skill*
*option*
*expansion* \[...\]

`ase alias set`
\[`-s`|`--scope` `user`|`project`\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]
`-d`|`--default`
*skill*
*options* \[...\]

## DESCRIPTION

**ase alias set** sets an entry in the alias file of the scope: without
option the full alias *name*, with `--option` an option alias of the
*skill*, and with `--default` the option defaults of the *skill*. See
`ase-alias`(1) for the kinds of aliases.

The *value* (the *command-line*, the *expansion*, resp. the *options*)
is given either as a single (quoted) argument or as multiple arguments,
which are joined by single spaces (with the arguments containing
whitespace or quotes quoted). All options after the *name* belong to the
*value*.

The changed alias file is validated, and every option alias and the
option defaults of the *skill* are checked against the options of the
*skill*. On any failure, the previous alias file is kept. Afterwards,
the shim skills of the scope are synchronized (see `ase-alias-sync`(1)).

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-s`|`--scope` `user`|`project`\]:
  The scope of the alias file. Default: `project` inside a project (a
  Git working tree or a directory with a `.ase` directory), else `user`.

- \[`-t`|`--tool` `claude`|`copilot`|`codex`\]:
  The agent tool to write the shim skills for. Default: `$ASE_TOOL`,
  else `claude`.

- \[`-o`|`--option`\]:
  Set the option alias *option* of the *skill* to the *expansion*.
  Excludes `--default`.

- \[`-d`|`--default`\]:
  Set the option defaults of the *skill* to the *options*. Excludes
  `--option`.

## ARGUMENTS

- *name*:
  The name of the full alias, consisting of up to 64 lower-case letters,
  digits, and dashes, and not starting with `ase-`.

- *command-line*:
  The command line of the full alias, where the first token is the
  target skill or full alias, with an optional leading `/` (resp. `$`),
  and with an optional `ase:` prefix.

- *skill*:
  The name of the skill of the option alias resp. the option defaults.

- *option*:
  The option alias, like `--custom`, which must not shadow a real option
  of the *skill*.

- *expansion*:
  The options the option alias is expanded into.

- *options*:
  The options applied on every invocation of the *skill*.

## EXIT STATUS

`0` on success, `1` on any error, like an invalid alias file, an unknown
target, or an option unknown to the *skill*.

## EXAMPLES

```sh
# define a full alias, invoked as "/lint-sec"
$ ase alias set lint-sec /ase-code-lint --include=A05,A06 -S HIGH

# define an option alias "--sec" of a skill
$ ase alias set --option ase-code-lint --sec --include=A05,A06 -S HIGH

# always compose new task plans along proposed approaches (for yourself only)
$ ase alias set --scope user --default ase-task-edit --approach
```

## SEE ALSO

`ase`(1), `ase-alias`(1), `ase-alias-delete`(1), `ase-alias-edit`(1),
`ase-alias-expand`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

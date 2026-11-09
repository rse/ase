# ase-alias-delete(1) -- Delete a Skill Command Alias

## SYNOPSIS

`ase alias delete`
\[`-h`|`--help`\]
\[`-s`|`--scope` `user`|`project`\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]
\[`-o`|`--option`|`-d`|`--default`\]
*name*
\[*option*\]

## DESCRIPTION

**ase alias delete** deletes an entry from the alias file of the scope:
without option the full alias *name*, with `--option` the option alias
*option* of the skill *name*, and with `--default` the option defaults
of the skill *name*. Afterwards, the shim skills of the scope are
synchronized (see `ase-alias-sync`(1)).

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
  Delete an option alias of a skill. Excludes `--default`.

- \[`-d`|`--default`\]:
  Delete the option defaults of a skill. Excludes `--option`.

## ARGUMENTS

- *name*:
  The name of the full alias, resp. of the skill (with `--option` or
  `--default`).

- \[*option*\]:
  The option alias to delete, required with `--option`.

## EXIT STATUS

`0` on success, `1` on any error, like a missing *option* or an entry
not existing in the scope.

## EXAMPLES

```sh
# remove a full alias
$ ase alias delete lint-sec

# remove an option alias
$ ase alias delete --option ase-code-lint --sec

# remove the option defaults of a skill (for yourself only)
$ ase alias delete --scope user --default ase-task-edit
```

## SEE ALSO

`ase`(1), `ase-alias`(1), `ase-alias-set`(1), `ase-alias-edit`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

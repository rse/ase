# ase-alias-edit(1) -- Edit the Alias File

## SYNOPSIS

`ase alias edit`
\[`-h`|`--help`\]
\[`-s`|`--scope` `user`|`project`\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]

## DESCRIPTION

**ase alias edit** edits the alias file of the scope with the text
editor, creating the file if it does not exist yet. Afterwards, the
alias file is validated (and on failure, re-edited on request), and the
shim skills of the scope are synchronized (see `ase-alias-sync`(1)). See
`ase-alias`(1) for the format of the alias file.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-s`|`--scope` `user`|`project`\]:
  The scope of the alias file. Default: `project` inside a project (a
  Git working tree or a directory with a `.ase` directory), else `user`.

- \[`-t`|`--tool` `claude`|`copilot`|`codex`\]:
  The agent tool to write the shim skills for. Default: `$ASE_TOOL`,
  else `claude`.

## ENVIRONMENT

- `VISUAL`, `EDITOR`:
  The text editor, in this order of precedence, falling back to `vi`.

## EXIT STATUS

`0` on success, `1` on any error, like a declined re-edit of an invalid
alias file or the scope `project` without a project.

## EXAMPLES

```sh
# edit the alias file of the project
$ ase alias edit

# edit the alias file of the user
$ ase alias edit --scope user
```

## SEE ALSO

`ase`(1), `ase-alias`(1), `ase-alias-set`(1), `ase-alias-delete`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

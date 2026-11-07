# ase-alias-sync(1) -- Synchronize the Shim Skills

## SYNOPSIS

`ase alias sync`
\[`-h`|`--help`\]
\[`-s`|`--scope` `user`|`project`\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]

## DESCRIPTION

**ase alias sync** synchronizes the shim skills of the full aliases for
the agent tool (see **SHIM SKILLS** of `ase-alias`(1)). This also
happens automatically on every change through `ase alias`, and at the
start of every agent tool session (see `ase-hook-session-start`(1)),
e.g., after a pull of a changed project alias file.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-s`|`--scope` `user`|`project`\]:
  Synchronize the shim skills of a single scope only. Default: both
  scopes.

- \[`-t`|`--tool` `claude`|`copilot`|`codex`\]:
  The agent tool to write the shim skills for. Default: `$ASE_TOOL`,
  else `claude`.

## EXIT STATUS

`0` on success, `1` on any error, like an unmarked skill having the same
name as a shim skill.

## EXAMPLES

```sh
# synchronize the shim skills of both scopes
$ ase alias sync

# synchronize the shim skills of the project only
$ ase alias sync --scope project
```

## SEE ALSO

`ase`(1), `ase-alias`(1), `ase-alias-set`(1), `ase-hook-session-start`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

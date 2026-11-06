# ase-config-init(1) -- Initialize Configuration with Preset Values

## SYNOPSIS

`ase config`
\[`--scope` *scope*\]
`init`
\[`-h`|`--help`\]
*type*

## DESCRIPTION

**ase config init** initializes the configuration file of the target
scope (the strongest scope of the scope chain, by default `project`
inside a project, else `user`) with the preset values of *type*. The
file (and its parent directories) are created if missing. Already
existing keys of the file which the preset does not cover are kept,
while those covered by the preset are overwritten.

Keys of the preset which are not writable on the target scope (e.g.,
all `project.task.*`, `project.artifact.*`, and `board.*` keys on a
`task` or `session` scope, or `telemetry.prices.ai` on the `project`
scope) are silently skipped. The file is written under an advisory
file lock and atomically.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`--scope` *scope*\]:
  Select the scope chain, whose strongest scope is the target scope
  written by this command. As an option of `ase config`, it has to be
  given *before* `init`. The *scope* value is a comma-separated list
  of the terms `user`, `project`, `task:`*id*, and `session:`*id*
  (with *id* matching `[A-Za-z0-9._-]+`), at most one per kind and in
  any order, canonicalized into the order `user` < `project` < `task`
  < `session`.

  `user` is always added implicitly, and `project` is added implicitly
  whenever a project context (a Git working tree or a `.ase` directory
  at or above the current directory) exists, but never above the
  strongest explicitly requested term. An explicit `project` without a
  project context is an error. Default: `project` inside a project
  context, else `user`. See `ase-config`(1) for details.

## ARGUMENTS

- *type*:
  The preset to apply, one of:

    - `default`:
      The complete baseline of the built-in `default` scope:
      `agent.persona` `engineer`, `agent.guidance` `normal`,
      `project.name` `Example Project`, `project.boxing` `white`,
      `project.task.lifecycle` `solo`, `project.task.idscheme` `slug`,
      `project.task.store.url` `ase:./.ase/task`,
      `project.task.default.source` `worktree`,
      `project.task.default.changeset` `worktree`,
      `project.task.default.target` `source`,
      `project.task.effort.scale` `15,60,240,960`,
      `project.task.effort.factor` `1`, `project.task.effort.file` `1`,
      `project.task.effort.line` `0.025`,
      `project.task.effort.iteration` `2.5`, the full set of
      `project.artifact.*` globs, the `board.tui.color.*`,
      `board.web.color.*`, `board.web.editor.keymap`, and
      `board.web.theme` defaults, and
      `telemetry.enabled` `false`, `telemetry.prices.ai`
      `*=4.00/20.00/0.20/5.00`, and `telemetry.prices.hr` `*=110`.
    - `vibe`:
      `agent.persona` `writer`, `project.name` `Example Project`, and
      `project.boxing` `black`.
    - `pro`:
      `agent.persona` `engineer`, `project.name` `Example Project`, and
      `project.boxing` `white`.
    - `industry`:
      `agent.persona` `engineer`, `project.name` `Example Project`, and
      `project.boxing` `grey`.

  Any other *type* is an error.

## FILES

The configuration file of the target scope: *per-user configuration
directory*`/config.yaml` (`user`), `.ase/config.yaml` (`project`),
`.ase/task/`*id*`/config.yaml` (`task:`*id*), or *per-user state
directory*`/session/`*id*`/config.yaml` (`session:`*id*). See
`ase-config`(1).

## EXIT STATUS

`0` on success, `1` on an unknown *type*, an invalid *scope*, or a
target file carrying invalid content.

## EXAMPLES

```sh
# initialize the project configuration for an industrial project
$ ase config init industry

# write the entire baseline into the user configuration
$ ase config --scope user init default
```

## SEE ALSO

`ase`(1), `ase-config`(1), `ase-config-list`(1), `ase-config-set`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

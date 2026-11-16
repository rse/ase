# ase-config-list(1) -- List the Effective Configuration

## SYNOPSIS

`ase config`
\[`--scope` *scope*\]
`list`
\[`-h`|`--help`\]

## DESCRIPTION

**ase config list** lists all configuration keys known to the
configuration schema, plus all further leaf keys found in the files of
the scope chain, with their effective values, rendered as a table with
the three columns `KEY`, `VALUE`, and `SCOPE`, sorted by key.

The `SCOPE` column names the scope which supplied the value: `default`
(the built-in defaults), `user`, `project`, `task:`*id*, `override`,
or `session:`*id*. For a key set on multiple scopes, only the value of the
strongest scope is shown. A key which is not set on any scope is shown
with an empty `VALUE` and the `SCOPE` `-`. The values of the secret keys
`project.task.store.token`, `project.relay.token`, and
`telemetry.service.token` are masked as `***`.

Invalid entries of the configuration files are warned about and
skipped.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`--scope` *scope*\]:
  Select the scope chain whose values are cascaded. As an option of
  `ase config`, it has to be given *before* `list`. The *scope* value
  is a comma-separated list of the terms `user`, `project`, `task:`*id*,
  and `session:`*id* (with *id* matching `[A-Za-z0-9._-]+`), at most
  one per kind and in any order, canonicalized into the order `user` <
  `project` < `task` < `session`.

  `user` is always added implicitly, and `project` is added implicitly
  whenever a project context (a Git working tree or a `.ase` directory
  at or above the current directory) exists, but never above the
  strongest explicitly requested term. An explicit `project` without a
  project context is an error. Default: `project` inside a project
  context, else `user`. See `ase-config`(1) for details.

## EXIT STATUS

`0` on success, `1` on an invalid *scope*.

## EXAMPLES

```sh
# list the effective project configuration
$ ase config list

# list the configuration as seen by a particular task
$ ase config --scope task:json-export list
```

## SEE ALSO

`ase`(1), `ase-config`(1), `ase-config-get`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

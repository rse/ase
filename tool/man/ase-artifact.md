# ase-artifact(1) -- Resolve Project Artifact Kinds to File Lists

## SYNOPSIS

`ase artifact`
\[`-h`|`--help`\]

`ase artifact list`
\[`--kind` *kinds*\]

`ase artifact name`
\[`--kind` *kind*\]
*filename*

## DESCRIPTION

**ase artifact** is the entry point group for resolving the *artifact
kinds* of a project to project-relative file lists. The *ASE* skills
use it (and the MCP tools `ase_artifact_list` and `ase_artifact_name`,
which provide the same) to locate the files of a kind. The recognized
kinds are:

- `spec`: the specification (by default below `docs/specbook`,
  the files `**/*.{md,txt,svg,png,jpg}`).
- `code`: the source code (by default below `src`, all files
  except `**/etc/**` and `**/{.gitignore,.npmignore,package.json}`).
- `docs`: the documentation (by default below `doc`, all files plus
  `**/{README,LICENSE,CHANGELOG}.{md,txt}`, except `{spec,arch}/**`).
- `infr`: the infrastructure (by default below the project root, the
  files `**/{.github,.claude*,etc}/**` and
  `**/{AGENTS.md,{package,tsconfig*}.json,.{git,npm}ignore}`).
- `othr`: the implicit catch-all of all other files.

The first four kinds are configured by the configuration keys
`project.artifact.`*kind*`.basedir` (the base directory, relative to
the project root, where an empty value denotes the project root itself,
and which must not escape the project root via `..`) and
`project.artifact.`*kind*`.files` (a *miniglob* specification, resolved
relative to the base directory), with the defaults given above (see
`ase-config`(1)).

A *miniglob* specification is a whitespace-separated list of glob
patterns (in the syntax of *picomatch*, with dot files matched), each
optionally negated by a `!` prefix. The tokens are applied in order:
the resulting set starts empty (or with all files, if the first token
is negated), a plain pattern adds all files matching it, and a negated
pattern removes all files matching it.

The file universe is the set of all files below the project root (the
Git top-level directory, else the current working directory), except
the `.git` directories and all files excluded by the Git exclude rules:
the global excludes file (`core.excludesFile`, else
`$XDG_CONFIG_HOME/git/ignore`, falling back to
`~/.config/git/ignore`), the repository-local `info/exclude`, and the
`.gitignore` files from the project root downwards, with the last
matching rule winning.

The universe is partitioned among the kinds by descending precedence
`spec`, `code`, `docs`, and `infr`: a file matched by multiple kinds
belongs to the first one only, and every file matched by none of them
belongs to `othr`.

Without a sub-command, the usage information is shown and the command
exits with status `1`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

## COMMANDS

- `ase artifact list` \[`--kind` *kinds*\]:
  Resolve one or more artifact kinds to project-relative file paths.
  See `ase-artifact-list`(1).

- `ase artifact name` \[`--kind` *kind*\] *filename*:
  Resolve a base-relative filename within an artifact kind to a
  project-relative path. See `ase-artifact-name`(1).

## EXIT STATUS

The group command without a sub-command exits with status `1`.

## SEE ALSO

`ase`(1), `ase-artifact-list`(1), `ase-artifact-name`(1),
`ase-config`(1), `ase-spec`(1), `gitignore`(5).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

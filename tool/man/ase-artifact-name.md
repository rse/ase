# ase-artifact-name(1) -- Resolve a Filename within an Artifact Kind

## SYNOPSIS

`ase artifact name`
\[`-h`|`--help`\]
\[`--kind` *kind*\]
*filename*

## DESCRIPTION

**ase artifact name** resolves a *filename*, given relative to the base
directory of an artifact *kind*, to a project-relative (POSIX-style)
path by prefixing it with the first configured base directory of
`project.artifact.`*kind*`.basedir` (see `ase-artifact`(1)), and prints
it. The file does not have to exist. The skills use it to name a new
file of a kind, e.g., a new specification or source code file.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`--kind` *kind*\]:
  The artifact kind whose base directory is used: `spec`, `code`,
  `docs`, or `infr` (default: `code`). The implicit catch-all kind
  `othr` has no base directory and is rejected.

## ARGUMENTS

- *filename*:
  The filename, relative to the base directory of the kind. Backslashes
  are converted to slashes and leading slashes are stripped. It must
  not be empty and must not contain any `..` segment.

## EXIT STATUS

Exits with status `0` on success, and with status `1` on an unknown
or unsupported kind, an empty filename, or a filename with a `..`
segment.

## EXAMPLES

```sh
# resolve a source file name (with the default "project.artifact.code.basedir" of "src")
$ ase artifact name --kind code lib/util.ts
src/lib/util.ts
```

## SEE ALSO

`ase`(1), `ase-artifact`(1), `ase-artifact-list`(1), `ase-config`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

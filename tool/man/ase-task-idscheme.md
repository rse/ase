# ase-task-idscheme(1) -- Get or Set the Task Id Scheme

## SYNOPSIS

`ase task idscheme`
\[`-h`|`--help`\]
\[*scheme*\]

## DESCRIPTION

**ase task idscheme** gets or sets the task id scheme of the current
project in the task store (see `ase-task`(1)), i.e., the scheme after
which `ase-task-newid`(1) generates new task ids (see **TASK ID
SCHEMES** in `ase-task`(1)).

Without *scheme*, the effective scheme is printed: for a local task
store (`ase:`, `github:`, `gitlab:`, or `gitea+`*scheme*`:`), which
always follows the configuration, the `project.task.idscheme`
configuration (default: `slug`); for a remote task store (`ase://` or
`ases://`), the scheme the project is registered under in the task
store, which is shared by all clients of the project and hence
registered under `project.task.idscheme` on first use only.

A configured `project.task.idscheme` deviating from the scheme of a
remote task store is warned about once per deviation only (tracked in
the *per-user state directory* as `task-lifecycle.json`).

With *scheme*, the project in the task store is explicitly switched to
this scheme: for a local task store by setting `project.task.idscheme`
on the `project` scope (see `ase-config`(1)), for a remote task store
by re-registering the project there. The existing task ids are not
changed, but ids not conforming to the new scheme are warned about on
their next save, rename, and switch. The switch is logged as `task:
set task id scheme of project from "`*from*`" to "`*scheme*`"`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

## ARGUMENTS

- \[*scheme*\]:
  The task id scheme to switch to:
    - `slug`\[`:`*words*\]: the slug of the first *words* (`1`-`16`,
      default: `2`) words of the task title, e.g., `json-export`.
    - `seq`\[`:`*template*\]: a continuously increasing sequence number,
      rendered through the sprintf-style *template* (default: `%d`) with
      exactly one `%d` or `%0`*width*`d` (*width* `0`-`16`) and otherwise
      only the characters `A-Z`, `a-z`, `#`, `_`, and `-` (but not
      starting with `_` or `-`), e.g., `FOO-%03d` or `#%d`. This scheme
      is required by the GitHub, GitLab, and Gitea task stores, as their
      task ids are the issue numbers (e.g., `seq:#%d`).
    - `flex`\[`:`*template*\]: like `seq`, but the *template* (default:
      `%d-%s`) additionally contains exactly one `%s`, the slug of the
      task title as for `slug:2`, before or after the number (if before,
      separated from it by at least one character), e.g., `%d-%s` or
      `%s-%d`.
    - `any`: an arbitrary id, as proposed by the caller.

## FILES

- `.ase/config.yaml`:
  The `project` scope configuration receiving `project.task.idscheme`
  on a switch of a local task store.

- *per-user state directory*`/task-lifecycle.json`:
  The deviations of the configured task id scheme (and lifecycle
  model) from the ones of a remote task store already warned about.

## EXIT STATUS

`0` on success, `1` on an invalid *scheme* or an unreachable task
store.

## EXAMPLES

```sh
# print the effective task id scheme
$ ase task idscheme
slug

# switch to sequence numbers like "ASE-007"
$ ase task idscheme "seq:ASE-%03d"

# switch to issue numbers like "#42" (quoted, as "#" starts a comment)
$ ase task idscheme "seq:#%d"

# switch to sequence numbers plus title slugs like "50-fleet-files"
$ ase task idscheme "flex:%d-%s"
```

## SEE ALSO

`ase`(1), `ase-task`(1), `ase-task-newid`(1), `ase-task-lifecycle`(1),
`ase-config`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

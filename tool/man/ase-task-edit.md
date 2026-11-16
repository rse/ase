# ase-task-edit(1) -- Edit a Task Plan in the Editor

## SYNOPSIS

`ase task edit`
\[`-h`|`--help`\]
*id*

## DESCRIPTION

**ase task edit** opens the task plan with the given *id* of the task
store (see `ase-task`(1)) in the editor defined by `$EDITOR`, else
`$VISUAL` (falling back to `vi`), run through the shell (so a value
with arguments is supported). As the task store is not necessarily
local, the plan is round-tripped through a temporary file
`ase-task-`*XXXXXX*`/`*id*`.md` below the system temporary directory.
A not yet existing plan starts as its minimal frontmatter (just the
`Type` and `Id` keys).

After the editor exits, an unchanged text is not saved at all. A
changed text is saved like by `ase-task-save`(1), i.e., checked
against the task lifecycle model, where the save is *conditional* on
the plan as loaded (resp. create-only for a not yet existing plan), so
a change of the task in the meantime (e.g., by an agent) is never
overwritten, but merged with the edits (reported as `task: "`*id*`" was
changed in the meantime -- edits merged`).

A changed `Id` frontmatter key renames the task after the save, like
`ase-task-rename`(1), where an already existing target id is refused
before anything is saved. An id not conforming to the task id scheme
of the project is warned about.

If the save fails because the task was changed in the meantime and
both changed the same part, the edits are not saved, but kept in the
temporary file, whose path is reported. On any other failure (e.g., an unreachable status), the
error is reported and, on a terminal, `re-edit? [Y/n]` is asked: by
default the editor is opened again on the edited text, while `n` (and
a non-interactive standard input) gives up, keeping the edits in the
temporary file, too.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

## ARGUMENTS

- *id*:
  The id of the task, matching `[A-Za-z0-9#][A-Za-z0-9#_-]*`.

## ENVIRONMENT

- `EDITOR`, `VISUAL`:
  The editor command (default: `vi`).

## EXIT STATUS

`0` on success (also for an unchanged text), `1` if the edits could
not be saved.

## EXAMPLES

```sh
$ EDITOR="code --wait" ase task edit json-export
```

## SEE ALSO

`ase`(1), `ase-task`(1), `ase-task-save`(1), `ase-task-rename`(1),
`ase-task-view`(1), `ase-task-board`(1), `vi`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

# ase-task-newid(1) -- Print the Next Free Task Id

## SYNOPSIS

`ase task newid`
\[`-h`|`--help`\]
\[`-p`|`--proposal` *id*\]
\[`-t`|`--taken` *ids*\]
\[`-v`|`--verbose`\]
\[*title*\]

## DESCRIPTION

**ase task newid** prints the next free task id according to the
effective task id scheme of the project (see `ase-task-idscheme`(1)
and **TASK ID SCHEMES** in `ase-task`(1)), determined by searching all
existing task ids of the project in the task store, plus the ids given
via `--taken`, plus the reserved id `default`:

- `slug`\[`:`*words*\]:
  The slug of the first *words* words of *title* (starting with the
  first word beginning with a letter, with diacritics stripped,
  lower-cased, and joined with `-`).

- `seq`\[`:`*template*\]:
  The highest sequence number of all ids matching *template* plus one,
  but at least the high-water mark of all ids ever removed (deleted,
  purged, or renamed) or allocated plus one, so the number of such a
  task is never reused. Ids not matching the current *template* (e.g.,
  after a template change) are ignored.

  The allocated number is *reserved* by raising the high-water mark
  atomically, so a concurrent allocation never yields the same id. The
  *title* is not used.

- `flex`\[`:`*template*\]:
  The sequence number as for `seq`, plus the slug of the first two
  words of *title* for the `%s` of *template* (e.g., `flex:%d-%s`
  yields `50-fleet-files` and `flex:%s-%d` yields `fleet-files-50`).

- `any`:
  The proposed id of `--proposal`, sanitized (whitespace runs replaced
  by `-`, all characters other than `A-Z`, `a-z`, `0-9`, `#`, `_`, and
  `-` removed, and leading `_` and `-` stripped), else the slug of the
  first two words of *title*.

A slug or proposed id which is already taken gets a numeric suffix
`-2`, `-3`, etc. As only a `seq` or `flex` id is reserved, the first save of the
new task should be a create-only one (`ase task save --create`, see
`ase-task-save`(1)), which fails instead of overwriting a concurrently
created task of the same id.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-p`|`--proposal` *id*\]:
  The proposed task id, honored for the task id scheme `any` only
  (default: none).

- \[`-t`|`--taken` *ids*\]:
  A comma-separated list of task ids to consider as taken in addition
  to the existing ones (default: none), e.g., the ids planned for
  further tasks not yet saved. Whitespace around the ids is ignored.

- \[`-v`|`--verbose`\]:
  Instead of the id only, print the three lines `scheme:` (the
  effective task id scheme), `id:` (the new id), and `match:` (the
  regular expression matching all ids conforming to the scheme).

## ARGUMENTS

- \[*title*\]:
  The title of the new task, from which the id is derived for the
  schemes `slug` and `any` (default: empty). For `slug` (and for `any`
  without `--proposal`), a title without any word beginning with a
  letter is an error.

## EXIT STATUS

`0` on success, `1` if no id can be derived (e.g., a missing title)
or the task store is unreachable.

## EXAMPLES

```sh
# derive an id from a title under the "slug" scheme
$ ase task newid "Export the Tasks as JSON"
export-the

# show the details of the allocation under the "seq:#%d" scheme
$ ase task newid -v
scheme: seq:#%d
id:     #43
match:  ^#([0-9]+)$
```

## SEE ALSO

`ase`(1), `ase-task`(1), `ase-task-idscheme`(1), `ase-task-save`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>


##  NAME

`ase-repo-changelog` - Update ChangeLog Entries

##  SYNOPSIS

`ase-repo-changelog`
    [`--help`|`-h`]

##  DESCRIPTION

The `ase-repo-changelog` skill helps to *complete*, *consolidate*, and
*sort* the entries of the most recent section of a `CHANGELOG.md`
file, based on the underlying *Git* commits and the currently staged
changes in the Git *index*.

Each entry starts with `<change-type> [<artifact-kind>]: <summary>`
where *change-type* is one of `FEATURE`, `IMPROVEMENT`, `BUGFIX`,
`UPDATE`, `CLEANUP`, or `REFACTOR`, and *artifact-kind* is one or more
comma-separated *artifact class* tags out of `spec`, `code`, `docs`,
`infr`, or `othr`. Entries are grouped and sorted by this
prefix. The date in the section header is also updated to the current
date.

The layout of the entries follows the style of the existing entries
of the file (e.g. a single line, a title line plus an explaining body,
or a wrapped sentence), and each entry is kept within about 5 lines.

##  SCENARIOS

-   You want the `CHANGELOG.md` brought up to date with recent commits
-   You want changelog entries completed, consolidated, and sorted
-   You want a tidy changelog section before a release

##  EXAMPLES

Update the most recent ChangeLog section:

```text
❯ /ase-repo-changelog
```

##  SEE ALSO

[`ase-repo-commit`](../ase-repo-commit/help.md), [`ase-docs-proofread`](../ase-docs-proofread/help.md).

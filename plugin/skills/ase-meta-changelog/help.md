
##  NAME

`ase-meta-changelog` - Update ChangeLog Entries

##  SYNOPSIS

`ase-meta-changelog`
    [`--help`|`-h`]

##  DESCRIPTION

The `ase-meta-changelog` skill helps to *complete*, *consolidate*, and
*sort* the entries of the most recent section of a `CHANGELOG.md`
file, based on the underlying *Git* commits and the currently staged
changes in the Git *index*.

Each entry is formatted as `<change-type> [<artifact-kind>]: <summary>`
where *change-type* is one of `FEATURE`, `IMPROVEMENT`, `BUGFIX`,
`UPDATE`, `CLEANUP`, or `REFACTOR`, and *artifact-kind* is one or more
comma-separated *artifact class* tags out of `spec`, `arch`, `code`,
`docs`, `infr`, or `othr`. Entries are grouped and sorted by this
prefix. The date in the section header is also updated to the current
date.

##  EXAMPLES

Update the most recent ChangeLog section:

```text
❯ /ase-meta-changelog
```

##  SEE ALSO

[`ase-meta-commit`](../ase-meta-commit/help.md), [`ase-docs-proofread`](../ase-docs-proofread/help.md).

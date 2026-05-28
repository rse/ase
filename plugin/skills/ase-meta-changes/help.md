
##  NAME

`ase-meta-changes` - Update ChangeLog Entries

##  SYNOPSIS

`ase-meta-changes`
    [`--help`|`-h`]

##  DESCRIPTION

The `ase-meta-changes` skill helps to *complete*, *consolidate*, and
*sort* the entries of the most recent section of a `CHANGELOG.md`
file, based on the underlying *Git* commits and the currently staged
changes in the Git *index*.

Each entry is formatted as `<prefix>: <summary>` where *prefix* is
one of `FEATURE`, `IMPROVEMENT`, `BUGFIX`, `UPDATE`, `CLEANUP`, or
`REFACTOR`. Entries are grouped and sorted by this prefix. The
date in the section header is also updated to the current date.

##  EXAMPLES

Update the most recent ChangeLog section:

```text
❯ /ase-meta-changes
```

##  SEE ALSO

`ase-meta-commit`, `ase-docs-proofread`.

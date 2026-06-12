
##  NAME

`ase-meta-commit` - Git Commit Message

##  SYNOPSIS

`ase-meta-commit`
    [`--help`|`-h`]

##  DESCRIPTION

The `ase-meta-commit` skill helps to *craft* a *concise commit
message* for the currently staged Git changes. It inspects the
output of `git diff --cached` and produces a single-line message of
the form `<type>: <summary>` where *type* is one of `FEATURE`,
`IMPROVEMENT`, `BUGFIX`, `UPDATE`, `CLEANUP`, or `REFACTOR`, and
*summary* is a 60-80 character imperative-mood summary without
trailing period or Markdown formatting.

##  EXAMPLES

Craft a commit message for the currently staged changes:

```text
❯ /ase-meta-commit
```

##  SEE ALSO

[`ase-meta-changelog`](../ase-meta-changelog/help.md).

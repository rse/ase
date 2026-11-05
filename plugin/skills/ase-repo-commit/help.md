
##  NAME

`ase-repo-commit` - Git Commit Message

##  SYNOPSIS

`ase-repo-commit`
    [`--help`|`-h`]

##  DESCRIPTION

The `ase-repo-commit` skill helps to *craft* a *concise commit
message* for the currently staged Git changes. It inspects the
output of `git diff --cached` and produces a single-line message of
the form `<type>: <summary>` where *type* is one of `FEATURE`,
`IMPROVEMENT`, `BUGFIX`, `UPDATE`, `CLEANUP`, or `REFACTOR`, and
*summary* is a 60-80 character imperative-mood summary without
trailing period or Markdown formatting.

##  SCENARIOS

-   You want a commit message for the currently staged changes
-   You want a typed one-line summary derived from the staged diff
-   You want to commit but cannot phrase what changed

##  EXAMPLES

Craft a commit message for the currently staged changes:

```text
❯ /ase-repo-commit
```

##  SEE ALSO

[`ase-repo-changelog`](../ase-repo-changelog/help.md), [`ase-repo-qa-commit`](../ase-repo-qa-commit/help.md).

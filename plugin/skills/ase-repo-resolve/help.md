
##  NAME

`ase-repo-resolve` - Resolve Merge Conflicts

##  SYNOPSIS

`ase-repo-resolve`
    [`--help`|`-h`]
    [`--dir`|`-d` *dir*]
    [`--safe`|`-s`]
    [`--interactive`|`-i`]
    [*path* ...]

##  DESCRIPTION

The `ase-repo-resolve` skill *resolves* the Git merge conflicts of a
working directory and reports the result as a *resolve verdict*:
`RESOLVED`, `PARTIAL`, `NONE`, or `FAILED`.

It handles every *unmerged* state of the Git index -- left by an
in-progress `git merge`, `git rebase`, `git cherry-pick`, `git revert`,
or by `git stash apply` -- and additionally files carrying conflict
markers *without* an unmerged index entry, e.g., left by `patch
--merge`. Reject files (`*.rej`) of `patch` are escalated, but never
touched.

Every conflict hunk is resolved *semantically*: the intents of both
sides are determined from the commits, the base version, and the
surrounding code, and the hunk is resolved so that *both* intents are
honored. Trivial, independent, and compatible changes are combined,
while a hunk whose intents *contradict* each other, or for which no
confident resolution exists, is *kept as-is* including its conflict
markers and *escalated* to the user. Files with only some unresolvable
hunks are resolved *partially* and stay unmerged. Non-content conflicts
(binary, submodule, modify/delete, rename, delete/delete) are resolved
only if their intent is unambiguous.

The skill is very careful to *never lose* any change: every touched
file is first backed up into the `ase-resolve` directory inside the Git
directory, and every resolved hunk is checked to still reflect all
changes of both sides relative to the base; a hunk failing this check
is restored with its conflict markers and escalated. The backups are
removed on a `RESOLVED` verdict and kept otherwise.

Fully resolved unmerged files are staged. On a `RESOLVED` verdict, the
in-progress operation is *continued* (e.g., `git merge --continue`),
and, if this stops at the next conflicting commit of a rebase,
cherry-pick, or revert, those conflicts are resolved, too. The skill
does *not* build or test the result, so the resolved conflicts still
deserve a review.

The same resolution procedure is used by `ase-repo-merge` for the
conflicts of its merge and by `ase-repo-import` for the conflicts of
its import.

##  OPTIONS

-   `--dir`|`-d` *dir*:
    The Git working directory whose conflicts are resolved (default:
    `.`, the current working directory).

-   `--safe`|`-s`:
    Never touch non-content conflicts (binary, submodule,
    modify/delete, rename, delete/delete), but always escalate them.

-   `--interactive`|`-i`:
    Instead of directly escalating an unresolvable hunk, show it and
    let the user choose `OURS`, `THEIRS`, `BOTH`, `KEEP` (escalate), or
    describe a manual resolution. Ignored when running headless.

##  ARGUMENTS

-   *path* ...:
    Restrict the resolution to the conflicted files equal to or below
    the given paths. The in-progress operation is then continued only
    if no conflicted files remain elsewhere.

##  SCENARIOS

-   You ran into merge conflicts during a merge, rebase, or cherry-pick
-   You applied a stash or a patch and got conflict markers
-   You want conflicts resolved without risking the loss of any change

##  EXAMPLES

Resolve all conflicts of the current working directory:

```text
❯ /ase-repo-resolve
```

Resolve the conflicts below `src/`, deciding unresolvable hunks
interactively:

```text
❯ /ase-repo-resolve --interactive src/
```

##  SEE ALSO

[`ase-repo-merge`](../ase-repo-merge/help.md), [`ase-repo-import`](../ase-repo-import/help.md), [`ase-repo-review`](../ase-repo-review/help.md),
[`ase-repo-commit`](../ase-repo-commit/help.md), [`ase-repo-diff`](../ase-repo-diff/help.md).


##  NAME

`ase-repo-import` - Import a Change Set

##  SYNOPSIS

`ase-repo-import`
    [`--help`|`-h`]
    [`--safe`|`-s`]
    [`--interactive`|`-i`]
    *url*|`#`*number*|*patch-file*

##  DESCRIPTION

The `ase-repo-import` skill *imports* a change set into the current Git
working copy as *unstaged* and *untracked* files, so nothing gets staged
or committed, and reports the result as an *import verdict*: `IMPORTED`,
`CONFLICT`, or `FAILED`.

The change set of a pull or merge request consists of all its commits,
flattened into one change, relative to its fork point from the default
branch of the remote. Hence, a request targeting another branch also
carries the commits this branch has on top of the default branch.

Local changes are preserved: a file with local changes also receives
the imported changes, and its staged state stays as it is. Files without
local changes get a 3-way merge. Hunks which do not apply, e.g., for
lack of the base version in a foreign patch file, become conflicts.

Conflicts are *resolved semantically* through the same procedure as
`ase-repo-resolve`, *never* losing any change. A conflict without a
confident resolution *keeps its conflict markers* in the file and is
listed at the end as the *TODO*, together with the changes which cannot
be expressed as conflict markers (e.g., of a file missing locally). The
verdict is then `CONFLICT`. On a `FAILED` verdict, the working copy is
left untouched. The skill does *not* build or test the result, so the
imported changes still deserve a review.

Unless the verdict is `FAILED`, the skill finally summarizes briefly
what the change set does and reports its files in a table with the type
of change (added, modified, renamed, or removed), the file path relative
to the root of the working copy, and a summary of the change.

##  OPTIONS

-   `--safe`|`-s`:
    Never touch non-content conflicts (binary, submodule,
    modify/delete, rename, delete/delete), but always list them in the
    TODO.

-   `--interactive`|`-i`:
    Instead of directly listing an unresolvable hunk in the TODO, show
    it and let the user choose `OURS`, `THEIRS`, `BOTH`, `KEEP`, or
    describe a manual resolution. Ignored when running headless.

##  ARGUMENTS

-   *url*:
    The URL of a pull or merge request (`.../pull/103` of GitHub,
    `.../pulls/103` of Gitea, or `.../-/merge_requests/103` of GitLab)
    or of a commit (`.../commit/<sha>` or `.../-/commit/<sha>`).

-   `#`*number*:
    The number of a pull or merge request on the forge of the remote
    `upstream`, or `origin` if it does not exist. It is never a task id
    of ASE. On GitLab, it denotes the merge request `!`*number*.

-   *patch-file*:
    The path of a diff or patch file, in the format of `git diff`,
    `git format-patch`, or `diff -u`.

##  SCENARIOS

-   You want to try out a pull request without checking out its branch
-   You want a change of another repository on top of your local changes
-   You received a patch file which no longer applies cleanly

##  EXAMPLES

Import a pull request by its URL:

```text
❯ /ase-repo-import https://github.com/rse/ase/pull/103
```

Import a pull request by its number, deciding unresolvable hunks
interactively:

```text
❯ /ase-repo-import --interactive #103
```

Import a patch file:

```text
❯ /ase-repo-import ../fix-crash.patch
```

##  SEE ALSO

[`ase-repo-resolve`](../ase-repo-resolve/help.md), [`ase-repo-merge`](../ase-repo-merge/help.md),
[`ase-repo-review`](../ase-repo-review/help.md), [`ase-repo-stage`](../ase-repo-stage/help.md),
[`ase-sync-import`](../ase-sync-import/help.md).

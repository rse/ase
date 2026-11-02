
##  NAME

`ase-repo-stage` - Stage a Part of the Changes

##  SYNOPSIS

`ase-repo-stage`
    [`--help`|`-h`]
    [`--entry`|`-e`]
    [`--turn`|`-t`]
    [`--session`|`-s`]
    [`--merge`|`-m`]
    [`--no-verify`|`-V`]
    [`--worktree`|`-w`]
    [`--changelog`|`-c`]
    [`--commit`|`-C`]
    [*topic*]

##  DESCRIPTION

The `ase-repo-stage` skill stages only the *part* of the current Git working copy changes which
belongs to a *selection*, so a mixed change set can be committed in cohesive portions without
hand-crafted partial patches.

The selection is either a free-text *topic*, the *last* `CHANGELOG.md` entry (`--entry`), the
changes of the *last turn* (`--turn`), or all changes of the current *session* (`--session`).
Without an option, the selection is inferred from the *topic* text, so `stage the last turn`
works, too. An explicitly given option overrides the inference, and a remaining *topic* narrows
the entry, turn, and session selections.

The changes are picked at the granularity of individual *lines*: hunks which belong to the
selection only partially are *split*, and untracked files are selectable, even partially.
Mutually dependent changes, like a use and its import, are kept together. Unless `--merge` is
given, the selection *replaces* the current index content. Only the Git index is changed, never
the content of a working copy file.

After staging, the skill checks that the *staged state alone builds*, with the build command
auto-detected from the project. By default, the remaining unstaged changes are temporarily
stashed for this, or -- under `--worktree` -- the staged state is built in a temporary worktree.
A failed build keeps the staged selection and is reported with its essential error lines.

Finally, the skill optionally chains into the ChangeLog updating and the commit message
crafting, both for the staged selection.

##  OPTIONS

-   `--entry`|`-e`:
    Select the changes which realize the *last* `CHANGELOG.md` entry, i.e. the entry added or
    modified by the uncommitted change of `CHANGELOG.md`, plus the entry itself.

-   `--turn`|`-t`:
    Select the changes made by the agent in the *last turn* before the skill invocation.

-   `--session`|`-s`:
    Select all changes made by the agent in the current *session*.

-   `--merge`|`-m`:
    Stage the selection *on top* of the already staged changes, instead of replacing them.

-   `--no-verify`|`-V`:
    Skip the check that the staged state builds on its own.

-   `--worktree`|`-w`:
    Check the build in a *temporary Git worktree* holding only the staged state, instead of
    temporarily stashing the unstaged changes of the working copy.

-   `--changelog`|`-c`:
    Afterwards, update the `CHANGELOG.md` entries via `ase-repo-changelog` and stage exactly the
    entries it added or updated.

-   `--commit`|`-C`:
    Afterwards, craft the commit message of the staged selection via `ase-repo-commit`.

The options `--entry`, `--turn`, and `--session` are mutually exclusive.

##  ARGUMENTS

-   *topic*:
    A free-text description of the changes to stage, or -- without an option -- a reference
    like `last turn` or `last changelog entry` the selection is inferred from.

##  SCENARIOS

-   You want only the hunks related to a certain topic staged
-   You want only the changes of the last turn or of the session staged
-   You want the changes behind a `CHANGELOG.md` entry staged and committed
-   You want to be sure the staged part builds without the rest of the changes

##  EXAMPLES

Stage only the hunks related to a topic:

```text
❯ /ase-repo-stage the getopt negation handling
```

Stage the changes of the last turn, checking the build in a temporary worktree:

```text
❯ /ase-repo-stage --turn --worktree
```

Stage the changes of the last ChangeLog entry and craft its commit message:

```text
❯ /ase-repo-stage --entry --commit
```

Add the session changes related to a topic to the already staged ones:

```text
❯ /ase-repo-stage --session --merge task board
```

##  SEE ALSO

[`ase-repo-dissect`](../ase-repo-dissect/help.md), [`ase-repo-diff`](../ase-repo-diff/help.md),
[`ase-repo-review`](../ase-repo-review/help.md), [`ase-repo-commit`](../ase-repo-commit/help.md),
[`ase-repo-changelog`](../ase-repo-changelog/help.md).

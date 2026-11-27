
##  NAME

`ase-repo-changelog` - Update ChangeLog Entries

##  SYNOPSIS

`ase-repo-changelog`
    [`--help`|`-h`]
    [`--staged`|`-s`]
    [`--unstaged`|`-u`]
    [`--file`|`-f` *path*]
    [`--format`|`-F` `AUTO`|`RSE`|`KAC`|`CCL`]

##  DESCRIPTION

The `ase-repo-changelog` skill helps to *complete*, *consolidate*, and
*sort* the entries of the most recent section of a `CHANGELOG.md`
file, based on the underlying *Git* commits and the currently staged
changes in the Git *index*.

By default, the skill operates on the nearest `CHANGELOG.md` file in
the current directory or one of its parent directories. With `--file`,
it operates on an explicitly given file instead, e.g. on the
`CHANGELOG.md` of a sub-project in a monorepo.

With `--staged` and/or `--unstaged`, the skill instead creates entries
just for the current, *uncommitted* change set: it skips the scan of
the Git commits since the last tag and leaves all other entries of the
section unchanged. This is cheap and fast for the usual "stage →
changelog → commit" flow.

If the most recent section is already released, i.e., a Git tag
`N.M.K` (or `vN.M.K`) of its version exists, it is left untouched and
a new section for the next patch version is inserted above it instead,
which then receives the new entries.

The skill knows the following *ChangeLog formats*, guesses the format
of the file from its content, and writes the entries in its vocabulary:

-   `RSE`: the own format of *ASE*, where each entry starts with
    `<change-type> [<artifact-kind>]: <summary>`, *change-type* is one of
    `FEATURE`, `IMPROVEMENT`, `BUGFIX`, `UPDATE`, `CLEANUP`, or
    `REFACTOR`, and *artifact-kind* is one or more comma-separated
    *artifact class* tags out of `spec`, `code`, `docs`, `infr`, or
    `othr`. Entries are grouped and sorted by this prefix. A breaking
    change is marked as in `<change-type> [<artifact-kind>]: **BREAKING**: <summary>`.

-   `KAC`: *Keep a Changelog*, where the entries are collected in a
    `## [Unreleased]` section, below the headers `### Added`,
    `### Changed`, `### Deprecated`, `### Removed`, `### Fixed`, and
    `### Security`. A breaking change is marked as in
    `- **BREAKING**: <summary>`.

-   `CCL`: *Conventional Changelog*, where the entries are placed below
    headers like `### Features` and `### Bug Fixes`, and the breaking
    changes below `### ⚠ BREAKING CHANGES`.

An empty file gets the `RSE` format, while the style of a file in an
unrecognized format is mimicked. The date in a dated section header is
also updated to the current date.

The layout of the entries follows the style of the existing entries
of the file (e.g. a single line, a title line plus an explaining body,
or a wrapped sentence), and each entry is kept within about 5 lines.

Every entry is backed by a Git commit or uncommitted change, and none is
invented. Merge commits and changes without a notable effect for the
users (like version bumps, typo fixes, or test-only and CI-only changes)
get no entry. Breaking changes, indicated by a Conventional Commits `!`
marker or `BREAKING CHANGE:` footer or evident from the diff, are marked
and come first within their group. References to pull requests or issues
in the commit messages are never taken over.

The updated `CHANGELOG.md` is left *unstaged*, as it may carry further
unrelated changes. Stage the new entry yourself (e.g. via `git add -p`),
or use `ase-repo-stage --changelog` to update and stage it together
with a selection of changes.

##  OPTIONS

-   `--staged`|`-s`:
    Create entries just for the *staged* changes in the Git *index*,
    instead of for the Git commits since the last tag plus the staged
    changes. Combined with `--unstaged`, create entries for *all*
    uncommitted changes.

-   `--unstaged`|`-u`:
    Create entries just for the *unstaged* changes and the *untracked*
    files of the working copy (except *ASE*'s own state below `.ase/`),
    instead of for the Git commits since the last tag plus the staged
    changes. Combined with `--staged`, create entries for *all*
    uncommitted changes.

-   `--file`|`-f` *path*:
    Operate on the given *ChangeLog* file *path* (relative to the
    current directory) instead of the nearest `CHANGELOG.md` in the
    current directory or one of its parent directories, e.g. on the
    `CHANGELOG.md` of a sub-project like `tool/` or `pages/` in a
    monorepo.

-   `--format`|`-F` `AUTO`|`RSE`|`KAC`|`CCL`:
    Use the given *ChangeLog* format instead of guessing it from the
    file content (`AUTO`, the default), e.g. to start an empty
    `CHANGELOG.md` of a foreign repository in the *Keep a Changelog*
    format `KAC`.

##  SCENARIOS

-   You want the `CHANGELOG.md` brought up to date with recent commits
-   You want changelog entries completed, consolidated, and sorted
-   You want a tidy changelog section before a release
-   You want an entry just for the staged changes before committing them
-   You want the changelog of a particular sub-project of a monorepo updated
-   You want the changelog of a foreign repository updated in its own format

##  EXAMPLES

Update the most recent ChangeLog section:

```text
❯ /ase-repo-changelog
```

Create entries just for the staged changes:

```text
❯ /ase-repo-changelog --staged
```

Create entries for all uncommitted changes:

```text
❯ /ase-repo-changelog -s -u
```

Create entries for the staged changes in the ChangeLog of a sub-project:

```text
❯ /ase-repo-changelog --staged --file tool/CHANGELOG.md
```

Create entries in the *Keep a Changelog* format:

```text
❯ /ase-repo-changelog --format KAC
```

##  SEE ALSO

[`ase-repo-commit`](../ase-repo-commit/help.md),
[`ase-repo-stage`](../ase-repo-stage/help.md),
[`ase-repo-agents`](../ase-repo-agents/help.md),
[`ase-docs-proofread`](../ase-docs-proofread/help.md).

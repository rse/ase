
ChangeLog Format
================

A *ChangeLog* is a Markdown formatted file named `CHANGELOG.md`, which
records the notable changes of a project per release version, the most
recent version first. **ASE** knows the following *ChangeLog formats*,
each identified by a unique <changelog-format-id/>:

-   `RSE`: the own format of **ASE** (and of the other projects of
    *Dr. Ralf S. Engelschall*).

-   `KAC`: the foreign format *Keep a Changelog*
    (`https://keepachangelog.com/`).

-   `CCL`: the foreign format *Conventional Changelog*, usually
    generated from *Conventional Commits* by tools like
    `conventional-changelog`, `standard-version`, or `release-please`.

Format `RSE`
------------

-   *Sections*: below a Setext-style level-1 title `ChangeLog`, one
    Setext-style level-2 section per release version, with a header
    `N.M.K (YYYY-MM-DD)`. The first section is still *unreleased* as
    long as no Git tag `N.M.K` or `vN.M.K` exists for it. Otherwise, a
    new section for the next patch version is inserted above it. The
    date of the unreleased section is the date of its last change.

-   *Entries*: each entry is a list item starting with:

        <change-type/> [<artifact-kind/>]: <summary/>

    The <change-type/> is one of the following tags and their usual
    related changes:

        -   `FEATURE`:     new        functionality or configuration
        -   `IMPROVEMENT`: improved   functionality or configuration
        -   `BUGFIX`:      corrected  functionality or configuration
        -   `UPDATE`:      updated    functionality or configuration
        -   `CLEANUP`:     cleaned up functionality or configuration
        -   `REFACTOR`:    refactored functionality or configuration

    The <artifact-kind/> is one or more of the following *artifact*
    tags, classifying which kind of artifact the change primarily
    touches, comma-separated if multiple apply (e.g. `[code, docs]`).
    New entries always carry it, even if older entries lack it:

        -   `spec`:  requirement/specification artifacts
        -   `code`:  source code artifacts
        -   `docs`:  documentation artifacts
        -   `infr`:  infrastructure/build/tooling artifacts
        -   `othr`:  any other artifacts

-   *Order*: the entries of a section are grouped and sorted according
    to the above <change-type/> list.

Format `KAC`
------------

-   *Sections*: below a level-1 title, a level-2 section
    `## [Unreleased]` collects the not yet released changes, above the
    released level-2 sections `## [N.M.K] - YYYY-MM-DD`. If missing,
    the `## [Unreleased]` section is created directly above the first
    released section. Released sections and the link reference
    definitions at the end of the file (like `[unreleased]: <url/>`)
    are *never* touched.

-   *Entries*: each entry is a plain list item `- <summary/>`, *without*
    any change-type or artifact-kind tags, below the level-3 header of
    its change type:

        -   `### Added`:      new features
        -   `### Changed`:    changes in existing functionality
        -   `### Deprecated`: soon-to-be removed features
        -   `### Removed`:    now removed features
        -   `### Fixed`:      bug fixes
        -   `### Security`:   vulnerability fixes

-   *Order*: the change type headers of a section follow the above
    list, where empty ones are omitted.

Format `CCL`
------------

-   *Sections*: one section per release version, with a header like
    `## [N.M.K](<compare-url/>) (YYYY-MM-DD)` (some tools use level-1
    resp. level-3 headers for major resp. patch releases). There is no
    unreleased section: like for `RSE`, the first section is still
    *unreleased* as long as no Git tag `N.M.K` or `vN.M.K` exists for
    it. Otherwise, a new section for the next patch version is inserted
    above it, in the header style of the existing sections, but without
    any compare link.

-   *Entries*: each entry is a list item `* **<scope/>:** <subject/>`
    (the scope is optional), *without* artifact-kind tags, optionally
    followed by a commit reference like `([<hash/>](<url/>))`, which
    entries for uncommitted changes omit. The entries are placed below
    the level-3 header of their change type:

        -   `### ⚠ BREAKING CHANGES`:       incompatible changes
        -   `### Features`:                 new features
        -   `### Bug Fixes`:                bug fixes
        -   `### Performance Improvements`: performance improvements
        -   `### Reverts`:                  reverted changes

    Further headers (like `### Documentation` or `### Code
    Refactoring`) are used only if the file already uses them.

-   *Order*: the change type headers of a section follow the above
    list, where empty ones are omitted.

Format Detection
----------------

The format of an existing `CHANGELOG.md` file is *detected* from its
content, where the first matching rule wins:

1.  `RSE`: section headers `N.M.K (YYYY-MM-DD)` or entries starting
    with one of the `RSE` <change-type/> tags.

2.  `KAC`: a reference to `keepachangelog.com`, a `## [Unreleased]`
    section, or sections `## [N.M.K] - YYYY-MM-DD` with the `KAC`
    change type headers.

3.  `CCL`: a reference to *Conventional Commits* or *Conventional
    Changelog*, or the `CCL` change type headers like `### Features`
    and `### Bug Fixes`.

4.  `RSE`: a file without any entries yet.

5.  `OTHER`: a file with entries in an unrecognized style. New entries
    *mimic* its existing section headers, change type vocabulary, and
    layout as closely as possible.

Entry Quality
-------------

For all formats, a decent *ChangeLog* entry follows these rules:

-   *Layout*: the entry follows the *style* of the existing entries of
    the file, especially its list item marker and indentation, its blank
    lines between entries, its line width, and its entry shape, e.g. a
    single-line <summary/>, a short <summary/> title line followed by an
    indented body of explaining sentences, or a <summary/> sentence
    wrapped over multiple indented lines. Only if the file contains no
    entries yet, use a single-line <summary/> of about 60-80 characters.

-   *Length*: each entry, including all its title and body lines, is
    kept within about *5 lines* in total.

-   *Content*: the entry describes *what* changed and *why* from the
    perspective of the users of the project, not *how*, and names the
    affected command, module, or component as essential context.

-   *Granularity*: one entry per logical change, where closely related
    changes are merged into a single entry.

-   *Editing*: an existing `CHANGELOG.md` is *changed* in place with the
    `Edit` tool and *never* re-written with the `Write` tool, and its
    released sections are *never* modified.


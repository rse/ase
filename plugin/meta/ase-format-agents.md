
Agent Guidance Format
=====================

An *agent guidance file* is a Markdown formatted file named `AGENTS.md`,
which guides AI coding agents through a repository, like a "README for
agents". It is read directly by *OpenAI Codex CLI* and *GitHub Copilot
CLI*, and by *Anthropic Claude Code CLI* through a `CLAUDE.md` which
imports it with a line `@AGENTS.md` (resp. `@../AGENTS.md` from
`.claude/CLAUDE.md`). The format prescribes no structure: it is plain
Markdown with arbitrary headings. A monorepo may additionally carry
nested `AGENTS.md` files in its sub-packages, where the file nearest to
an edited file takes precedence, so a nested file covers just its own
sub-package.

Managed Sections
----------------

**ASE** *manages* the following sections of an agent guidance file, each
identified by a unique <agents-section-id/>, in this *canonical order*:

-   `ABOUT`: canonical heading `About` (synonyms: `About Project`,
    `Project`, `Overview`, `Project Overview`): what the project is and
    for whom, its deliverables, and its primary languages, runtimes,
    and frameworks, in one to three short paragraphs.

-   `LAYOUT`: canonical heading `Repository Layout` (synonyms: `Layout`,
    `Project Layout`, `Structure`, `Project Structure`, `Directory
    Structure`): the roles of the top-level directories and, where not
    evident from their names, of their notable sub-directories,
    modules, and files, as a (nested) list of backticked paths, each
    with a short description, but *never* a complete file tree.

-   `BUILD`: canonical heading `Build System` (synonyms: `Build`,
    `Commands`, `Build and Test`, `Development`): the build tool and
    the exact, copy-pasteable commands for installing, building,
    linting, type-checking, and testing (including a single test, if
    supported), as fenced code blocks with aligned `# <comment/>`
    explanations, plus an explicit statement if no test target exists.

-   `STYLE`: canonical heading `Code Style` (synonyms: `Style`,
    `Conventions`, `Coding Conventions`, `Code Conventions`): the
    coding conventions which no linter or formatter enforces (like
    naming, formatting peculiarities, comment style, error handling
    idiom, and file organization), plus the names of the linter and
    formatter configurations which enforce the rest.

All other sections (like `Setup`, `CLI Commands`, `Testing`, `Security`,
or `Boundaries`) are *unmanaged*: they are hand-written and *never*
touched.

Section Detection
-----------------

The sections of an existing agent guidance file are *detected* from its
headings, where lines inside fenced code blocks are never headings: a
level-1 heading is the document title (and ignored) only if it is the
first heading and the only level-1 heading of the file, and only the
headings of the *section level* -- the level of the first heading which
is not this title, resp. level 2 if there is none -- start a section,
which extends up to the next heading of this or a shallower level,
while deeper headings belong to their enclosing section, and a
shallower heading (of an irregular file) starts a section as well. For
each such heading, the first matching rule wins:

1.  A heading whose text equals the canonical heading or one of the
    synonyms of a managed section (case-insensitively and ignoring
    inline markup, a leading numbering or emoji, and trailing
    punctuation), which is not yet detected, starts this *managed*
    section, but for a synonym only if its content stays within the
    scope of this managed section.

2.  Every other heading starts an *unmanaged* section.

A managed section which is *missing* in an existing file is *inserted*
directly after the nearest preceding managed section of the canonical
order, or, if there is none, before the first section, but after any
introductory text below the document title, resp. at the end of the
file if it has no section at all, with the heading level and style of
the existing sections (resp. of the section level), but *only* if it
receives at least one fact.

Content Quality
---------------

For all managed sections, a decent agent guidance file follows these
rules:

-   *Grounding*: every fact traces back to the *current* content of the
    repository, like its manifests, build configurations, linter
    configurations, CI workflows, sources, and `README.md`. Facts are
    *never* invented or taken from general knowledge: if the repository
    is silent on something, it is left out, except for the absence of a
    test target, which the lack of any test script or target in all
    manifests and build configurations confirms.

-   *Read-Only Verification*: every command is verified by locating the
    definition of its script or target in its manifest or build
    configuration (like the `scripts` of a `package.json`, the targets
    of a `stx.conf`, `Makefile`, or `justfile`), resp., for a built-in
    command of the build tool itself (like `npm install` or `npm ci`),
    by the presence of its manifest (like a `package.json`). A command
    with ad-hoc arguments (like a single test via `npx vitest run
    <file>`) is verified by the presence of its tool in the manifest
    (like a `vitest` dependency) and states its arguments as
    placeholders. Commands of
    the repository are *never* executed for this, and nothing which
    installs, builds, or writes into the working tree is ever run.

    Every path is verified by its presence in the output of `git ls-files`
    (expanding brace and glob notation like `ase-{foo,bar}.md`, and
    taking placeholders like `ase-xxx-xxx/` or `ase-<command>.ts` as
    wildcards), as an untracked but not ignored file, or as the output
    of a verified build target (like a `dst/` directory), where a path
    of a nested file is resolved against its directory first and against
    the repository root second. A path ignored by Git (like a `.env`
    file) is neither confirmed nor contradicted by this, and hence kept
    (see *Preservation*).

-   *Surgical Drift*: an update changes only *drifted* facts: stale
    commands, targets, and paths (renamed or removed ones), and notable
    new ones (like a new module, target, or linter) which are missing,
    where long-standing omissions of a hand-written file count as a
    deliberate level of detail and not as missing facts. The wording,
    structure, and level of detail of all still valid facts stay
    unchanged, so a re-run without any repository change yields *no*
    change at all. If a changed line of an aligned code block overflows
    its comment column, a single space separates its `#` comment.

-   *Preservation*: the unmanaged sections, and the statements of the
    managed sections which the repository can neither confirm nor
    contradict (like a rationale or a maintenance rule as "keep both in
    sync"), are kept *verbatim*.

-   *Layout*: new content follows the *style* of the existing file,
    especially its heading level and style, its list item marker and
    indentation, its line width, its code block style, and its emphasis
    conventions. Only for a *new* file, use ATX-style level-2 headings
    (`## `) without a level-1 document title, `-   ` list items with
    4-space indentation, and lines wrapped at about 76 characters.

-   *Conciseness*: a *new* file stays within about *150 lines*, omits
    empty sections, and states only what an agent cannot easily infer
    from the code, without any generic best-practice prose. An existing
    file keeps its level of detail.

-   *Non-Duplication*: new content does not restate rules enforced by a
    linter or formatter, but names the enforcing configuration instead,
    and does not restate a fact already stated in another section,
    managed or unmanaged, or in the introductory text. Existing
    duplicates are kept as they are.

-   *Privacy*: no secrets, credentials, internal hostnames or URLs, and
    no personal data not already present in the file.

-   *Editing*: an existing agent guidance file is *changed* in place
    with the `Edit` tool, section by section, and *never* re-written
    with the `Write` tool, while a new one is created with the `Write`
    tool.


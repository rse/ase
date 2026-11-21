---
name: ase-repo-changelog
argument-hint: "[--help|-h] [--staged|-s] [--unstaged|-u]"
description: >
    Update ChangeLog entries in CHANGELOG.md files, optionally just for the
    staged and/or unstaged changes. Use when the user wants to
    "add a changelog entry", or to "update", "complete", or "consolidate" the
    "changelog", "ChangeLog", or "CHANGELOG.md", e.g. before committing or releasing.
user-invocable: true
disable-model-invocation: false
model: sonnet
effort: high
allowed-tools:
    - "Bash(git log *)"
    - "Bash(git diff *)"
    - "Bash(git show *)"
    - "Bash(git tag --list *)"
    - "Bash(git ls-files *)"
    - "Read"
    - "Write"
    - "Edit"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-repo-changelog">
Update ChangeLog Entries
</purpose>

<expand name="getopt"
    arg1="ase-repo-changelog"
    arg2="--staged|-s --unstaged|-u">
    $ARGUMENTS
</expand>

<objective>
Help to complete, consolidate and sort *ChangeLog* entries of the most
recent, still unreleased *ChangeLog* section (created anew if the most
recent one is already released), based on underlying *Git* commits and
staged changes, or, with `--staged` and/or `--unstaged`, based on just
the uncommitted change set.
</objective>

Format
------

The *ChangeLog* file is a Markdown formatted file named `CHANGELOG.md`,
and contains sections with headers in the style `N.M.K (YYYY-MM-DD)`.

Each *ChangeLog* entry always starts with a line formatted as...

    `<change-type/> [<artifact-kind/>]: <summary/>`

...where the <change-type/> is one of the following tags and their usual
related changes:

    -   `FEATURE`:     new        functionality or configuration
    -   `IMPROVEMENT`: improved   functionality or configuration
    -   `BUGFIX`:      corrected  functionality or configuration
    -   `UPDATE`:      updated    functionality or configuration
    -   `CLEANUP`:     cleaned up functionality or configuration
    -   `REFACTOR`:    refactored functionality or configuration

The <artifact-kind/> is one or more of the following *artifact* tags,
classifying which kind of artifact the change primarily touches. If
multiple artifact kinds apply, comma-separate them
(e.g. `[code, docs]`):

    -   `spec`:  requirement/specification artifacts
    -   `code`:  source code artifacts
    -   `docs`:  documentation artifacts
    -   `infr`:  infrastructure/build/tooling artifacts
    -   `othr`:  any other artifacts

The *layout* of the entries *MUST* follow the *style* of the existing
entries of the *ChangeLog* file, especially its list item marker and
indentation, its blank lines between entries, its line width, and its
entry shape, e.g. a single-line <summary/>, a short <summary/> title
line followed by an indented body of explaining sentences, or a
<summary/> sentence wrapped over multiple indented lines. Only if the
file contains no entries yet, use a single-line <summary/> of about
60-80 characters.

Each entry, including all its title and body lines, *MUST* be kept
within about *5 lines* in total. The *ChangeLog* entries for a single
product release version are also always grouped and sorted according
to the above <change-type/> list.

Processing
----------

<flow>

1.  <step id="STEP 1: Locate and read ChangeLog entries">

    The *ChangeLog* file `CHANGELOG.md` is located in the *current*
    directory or one of the *parent* directories of the current project.
    Locate and read this file. Store its relative path in <filename/>.

    <if condition="no `CHANGELOG.md` file can be located">
    Only output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-repo-changelog**, ▶ ERROR: no `CHANGELOG.md` file found
    </template>
    </if>

    Then determine the *release state* of the *first* (most recent)
    level-2 section: take its `N.M.K` and check whether a corresponding
    Git tag already exists with the command `git tag --list N.M.K vN.M.K`.

    <if condition="this command produces output">
    The first section is already *released*: it *MUST* *NOT* be
    modified at all. Store the output tag name in <baseline/>, and
    store the next patch version (`N.M.K` with `K` incremented by one)
    in <version/>. A *new*, still-unreleased level-2 section for
    <version/>, with the current date and in the header style of the
    existing sections, has to be inserted *above* the released one, and
    becomes the *current section* all subsequent steps operate on.
    </if>
    <else>
    The first section is still *unreleased*: store its `N.M.K` in
    <version/> and leave <baseline/> empty. This first section is the
    *current section* all subsequent steps operate on.
    </else>

    You *MUST* *NOT* output anything, except the result with the
    following <template/>:

    <template>
    ⧉ **ASE**: **CHANGELOG FILE:** `<filename/>`, **SECTION:** `<version/>` (<state/>)
    </template>

    ...where <state/> is `new, as <baseline/> is already released` for
    a new section, or `unreleased` otherwise.

    </step>

2.  <step id="STEP 2: Determine artifact changes">

    You *MUST* *NOT* output anything, except introduce the current
    operation with an output based on the following <template/>:

    <template>
    ⧉ **ASE**: **DETERMINE ARTIFACT CHANGES:**
    </template>

    Set <changes/> to the *uncommitted* change set to consider: to
    `staged and unstaged` if both <getopt-option-staged/> and
    <getopt-option-unstaged/> are equal `true`, to `staged` if only
    <getopt-option-staged/> is equal `true`, to `unstaged` if only
    <getopt-option-unstaged/> is equal `true`, and to empty otherwise.

    <if condition="<changes/> is not empty">
    To update the entries of the current section, consult *only* the
    <changes/> changes, where the `unstaged` changes always include the
    *untracked* files, and *skip* the scan of the Git *commits* entirely.
    Find these changes with the following command(s), but silently skip
    already existing changes to the `CHANGELOG.md` file itself and every
    untracked entry below the `.ase/` directory (*ASE*'s own state):

    -   `staged`: `git diff --cached --numstat`

    -   `unstaged`: `git diff --numstat` and
        `git ls-files --others --exclude-standard`

    -   `staged and unstaged`: `git diff HEAD --numstat` and
        `git ls-files --others --exclude-standard`

    If still no corresponding *ChangeLog* entry exists for these
    changes, derive a meaningful one from the same `git diff` command
    without `--numstat` and from the untracked files.

    <if condition="there are no such changes">
    Only output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-repo-changelog**, ▶ NOTICE: no <changes/> changes
    </template>
    </if>
    </if>
    <else>
    To update the entries of the current section, consult the Git
    *commits* plus the currently already staged changes in the Git
    *index*, but *ignore* the Git *stash* and still unstaged changes.

    For finding the corresponding Git *commits*, first determine the
    correct baseline Git tag:

    -   If <baseline/> is not empty (new section), use it as the
        baseline tag.

    -   Otherwise (unreleased first section), take the `N.M.K` from the
        *second* level-2 header and check for its Git tag with the
        command `git tag --list N.M.K vN.M.K`, and use the output tag
        name as the baseline tag.

    Then check all Git commits between `HEAD` and this baseline tag with
    the command `git log <baseline/>..HEAD --numstat --pretty=format:'%h: %s'`.

    If *no* second level-2 header exists (very first, still untagged
    release), skip the baseline tag and check *all* Git commits with the
    command `git log HEAD --numstat --pretty=format:'%h: %s'` instead.
    If the second level-2 header has no corresponding Git tag either,
    use the commit which introduced the `N.M.K` of the *first* level-2
    header instead, determined with the command
    `git log -1 --format=%h -S 'N.M.K (' -- <filename/>`, and check all
    Git commits from it on with the command
    `git log <commit/>^..HEAD --numstat --pretty=format:'%h: %s'`.

    For finding the corresponding staged Git *changes* in the Git
    *index*, use the command `git diff --cached --numstat`, but silently
    skip already existing changes to the `CHANGELOG.md` file itself. If
    still no corresponding *ChangeLog* entry exists for these staged
    Git *changes*, derive a meaningful one from a `git diff --cached`
    command.

    <if condition="<baseline/> is not empty, and there are neither Git commits nor staged changes">
    Do not insert an empty new section. Only output the following
    <template/> and then immediately *STOP* processing the entire
    current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-repo-changelog**, ▶ NOTICE: no changes since released `<baseline/>`
    </template>
    </if>
    </else>

    </step>

3.  <step id="STEP 3: Complete ChangeLog entries">

    You *MUST* *NOT* output anything, except introduce the current
    operation with an output based on the following <template/>:

    <template>
    ⧉ **ASE**: **COMPLETE ENTRIES:**
    </template>

    Without immediately modifying the `CHANGELOG.md` file, *complete*
    the entries in the current section only, by adding the
    corresponding (most recent) Git *commits* and *staged* changes only,
    resp. just the <changes/> changes if <changes/> is not empty.

    For each Git commit, reduce the Git commit messages to an entry in
    the *style* of the existing entries, kept within about *5 lines*
    (see section *Format* above).

    For each entry, also determine the <artifact-kind/> *artifact kind*
    tag(s) from the paths of the changed files. To classify a changed
    file to its artifact class, call the `ase_artifact_list(kind: [
    ... ])` tool of the `ase` MCP server *once*, passing the `kind`
    tokens (`spec`, `code`, `docs`, `infr`, `othr`), and read
    the returned `artifacts` array of `{ kind, files }` objects to match
    each changed file to its kind. Use the matched lower-cased kind
    directly as its <artifact-kind/> tag, and comma-separate multiple
    tags when more than one artifact class applies.

    If a <summary/> is too short or especially is not comprehensible
    enough because of too little context information, add some essential
    context, especially references to the class/module/package, etc.
    For this, if necessary, read the related source files with a
    corresponding `git show` command (resp. directly, for unstaged
    changes) to get a better understanding of this context.

    </step>

4.  <step id="STEP 4: Consolidate and sort ChangeLog entries">

    You *MUST* *NOT* output anything, except introduce the current
    operation with an output based on the following <template/>:

    <template>
    ⧉ **ASE**: **CONSOLIDATE ENTRIES:**
    </template>

    Without immediately modifying the `CHANGELOG.md` file, *consolidate*
    the entries in the current section only, by summarizing
    and merging closely related entries. Perform the entry consolidation
    per <change-type/> group only. Also condense any entry of this
    section, which exceeds about *5 lines*, by compressing its wording.

    Without immediately modifying the `CHANGELOG.md` file, *sort* the
    entries in the current section only. Instead of the
    chronological commit order, group the entries by the <change-type/>s.

    <if condition="<changes/> is not empty">
    Restrict the consolidation and sorting to the entries added or
    updated in STEP 3: merge them only into closely related existing
    entries, insert them into their <change-type/> group, and leave all
    other entries of the current section unchanged, so the resulting
    diff carries just the entries of the change set.
    </if>

    </step>

5.  <step id="STEP 5: Write modified ChangeLog entries">

    You *MUST* *NOT* output anything, except introduce the current
    operation with an output based on the following <template/>:

    <template>
    ⧉ **ASE**: **UPDATING CHANGELOG:**
    </template>

    Finally, *update* the `CHANGELOG.md` file with the completed,
    consolidated and sorted *ChangeLog* entries. Also, update the date
    `YYYY-MM-DD` in the `N.M.K (YYYY-MM-DD)` header of the current
    section to the current date.

    For this, you *MUST* use the `Edit` tool, replacing just the current
    section, resp. for a new section, inserting it *above* the header of
    the released section (keeping the released section unchanged),
    instead of re-writing the entire file with the `Write` tool, so that
    the resulting changes are shown to the user as a diff by the agent
    tool itself.

    You *MUST* *NOT* output the resulting entries a second time, any
    further summary, or any further explanations.

    The `CHANGELOG.md` file is deliberately left *unstaged*, as it may
    carry further unrelated changes. Finally, give the closing hint by
    expanding the following (which, depending on the configured
    <ase-guidance-level/>, may expand into nothing and hence emit no
    output at all):

    <if condition="
        there are staged changes in the Git index, and this skill was
        *not* invoked by the `ase-repo-stage` skill (which stages the
        entries itself)
    ">
    <ase-tpl-hint level="minimal">
    The updated `CHANGELOG.md` is still unstaged -- use `git add -p CHANGELOG.md` or `/ase-repo-stage --entry` to stage it before `/ase-repo-commit`.
    </ase-tpl-hint>
    </if>

    </step>

</flow>


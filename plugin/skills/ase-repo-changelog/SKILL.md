---
name: ase-repo-changelog
argument-hint: "[--help|-h] [--staged|-s] [--unstaged|-u] [--file|-f <path>] [--format|-F AUTO|RSE|KAC|CCL]"
description: >
    Update ChangeLog entries in CHANGELOG.md files, optionally just for the
    staged and/or unstaged changes, in the own ASE format or in foreign
    formats like Keep a Changelog. Use when the user wants to
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
@${CLAUDE_SKILL_DIR}/../../meta/ase-format-changelog.md

<purpose name="ase-repo-changelog">
Update ChangeLog Entries
</purpose>

<expand name="getopt"
    arg1="ase-repo-changelog"
    arg2="--staged|-s --unstaged|-u --file|-f= --format|-F=(AUTO|RSE|KAC|CCL)">
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

The *ChangeLog* formats (`RSE`, `KAC`, `CCL`, and the unrecognized
`OTHER`), their detection, and the *Entry Quality* rules of their
entries are defined by the *ChangeLog Format* above, which you *MUST*
strictly honor for the format <format/> determined in STEP 1. In the
following, a *change type* is the <change-type/> tag of `RSE`, resp. the
level-3 change type header of `KAC` and `CCL`, resp. the change type
vocabulary of `OTHER`.

Processing
----------

<flow>

1.  <step id="STEP 1: Locate and read ChangeLog entries">

    <if condition="<getopt-option-file/> is not empty">
    The *ChangeLog* file is explicitly given as <getopt-option-file/>,
    relative to the current directory. Read this file and store
    <getopt-option-file/> in <filename/>.

    <if condition="this file cannot be read">
    Only output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-repo-changelog**, ▶ ERROR: ChangeLog file **<getopt-option-file/>** not found
    </template>
    </if>
    </if>
    <else>
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
    </else>

    Then determine the *ChangeLog* format: if <getopt-option-format/> is
    equal `AUTO`, *detect* it from the file content according to the
    *Format Detection* rules of the *ChangeLog Format* above and store
    it in <format/>. Otherwise, store <getopt-option-format/> in
    <format/>, as the format is explicitly forced.

    <if condition="<format/> is equal `KAC`">
    The *current section* all subsequent steps operate on is the
    `## [Unreleased]` section: store `Unreleased` in <version/>. If this
    section exists, leave <baseline/> empty. Otherwise, a *new*
    `## [Unreleased]` section has to be inserted *above* the first
    released section, and, for the `N.M.K` of this released section,
    store the output of the command `git tag --list N.M.K vN.M.K` in
    <baseline/> (empty if there is no such tag).
    </if>
    <else>
    Determine the *release state* of the *first* (most recent) version
    section: take its `N.M.K` and check whether a corresponding Git tag
    already exists with the command `git tag --list N.M.K vN.M.K`.

    <if condition="this command produces output">
    The first section is already *released*: it *MUST* *NOT* be
    modified at all. Store the output tag name in <baseline/>, and
    store the next patch version (`N.M.K` with `K` incremented by one)
    in <version/>. A *new*, still-unreleased version section for
    <version/>, with the current date and in the header style of the
    existing sections, has to be inserted *above* the released one, and
    becomes the *current section* all subsequent steps operate on.
    </if>
    <else>
    The first section is still *unreleased*: store its `N.M.K` in
    <version/> and leave <baseline/> empty. This first section is the
    *current section* all subsequent steps operate on.
    </else>
    </else>

    You *MUST* *NOT* output anything, except the result with the
    following <template/>:

    <template>
    ⧉ **ASE**: **CHANGELOG FILE:** `<filename/>`, **FORMAT:** `<format/>`, **SECTION:** `<version/>` (<state/>)
    </template>

    ...where <state/> is `new, as <baseline/> is already released` for
    a new section with a non-empty <baseline/>, `new` for a new section
    with an empty <baseline/>, or `unreleased` otherwise.

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

    -   Otherwise, take the `N.M.K` from the *version section* directly
        *below* the current section (for a new section, the first
        existing version section) and check for its Git tag with the
        command `git tag --list N.M.K vN.M.K`, and use the output tag
        name as the baseline tag.

    Then check all Git commits between `HEAD` and this baseline tag with
    the command `git log <baseline/>..HEAD --numstat --pretty=format:'%h: %s'`.

    If *no* such version section exists (very first, still untagged
    release), skip the baseline tag and check *all* Git commits with the
    command `git log HEAD --numstat --pretty=format:'%h: %s'` instead.
    If this version section has no corresponding Git tag either,
    use the commit which introduced the header text <header/> of the
    *first* section instead (like `N.M.K (` for `RSE`, or
    `## [Unreleased]` for `KAC`), determined with the command
    `git log -1 --format=%h -S '<header/>' -- "<filename/>"`, and check
    all Git commits from it on with the command
    `git log <commit/>^..HEAD --numstat --pretty=format:'%h: %s'`, resp.
    *all* Git commits if no such commit exists.

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
    the format <format/>, following the *Entry Quality* rules of the
    *ChangeLog Format* above, and determine its *change type*.

    <if condition="<format/> is equal `RSE`">
    For each entry, also determine the <artifact-kind/> *artifact kind*
    tag(s) from the paths of the changed files. To classify a changed
    file to its artifact class, call the `ase_artifact_list(kind: [
    ... ])` tool of the `ase` MCP server *once*, passing the `kind`
    tokens (`spec`, `code`, `docs`, `infr`, `othr`), and read
    the returned `artifacts` array of `{ kind, files }` objects to match
    each changed file to its kind. Use the matched lower-cased kind
    directly as its <artifact-kind/> tag, and comma-separate multiple
    tags when more than one artifact class applies.
    </if>

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
    per *change type* group only. Also condense any entry of this
    section, which exceeds about *5 lines*, by compressing its wording.

    Without immediately modifying the `CHANGELOG.md` file, *sort* the
    entries in the current section only. Instead of the
    chronological commit order, group the entries by their *change
    types*, in the order and with the grouping of the format <format/>
    (e.g. below the level-3 change type headers for `KAC` and `CCL`).

    <if condition="<changes/> is not empty">
    Restrict the consolidation and sorting to the entries added or
    updated in STEP 3: merge them only into closely related existing
    entries, insert them into their *change type* group, and leave all
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
    consolidated and sorted *ChangeLog* entries. Also, if the header of
    the current section carries a date `YYYY-MM-DD` (like the
    `N.M.K (YYYY-MM-DD)` header of `RSE`, but unlike the
    `## [Unreleased]` header of `KAC`), update it to the current date.

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


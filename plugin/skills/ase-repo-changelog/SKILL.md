---
name: ase-repo-changelog
argument-hint: "[--help|-h]"
description: >
    Update ChangeLog entries in CHANGELOG.md files. Use when the user wants to
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

<expand name="getopt" arg1="ase-repo-changelog">
    $ARGUMENTS
</expand>

<objective>
Help to complete, consolidate and sort *ChangeLog* entries of the most
recent *ChangeLog* section, based on underlying *Git* commits and staged
changes.
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

    You *MUST* *NOT* output anything, except the result with the
    following <template/>:

    <template>
    <ase-tpl-bullet-normal/> **CHANGELOG FILE:** `<filename/>`
    </template>

    </step>

2.  <step id="STEP 2: Determine artifact changes">

    You *MUST* *NOT* output anything, except introduce the current
    operation with an output based on the following <template/>:

    <template>
    <ase-tpl-bullet-normal/> **DETERMINE ARTIFACT CHANGES:**
    </template>

    To update the entries of the most recent *ChangeLog* section, consult
    the Git *commits* plus the currently already staged changes in the Git
    *index*, but *ignore* the Git *stash* and still unstaged changes.

    For finding the corresponding Git *commits*, first determine the
    correct baseline Git tag. Take the `N.M.K` from the *first* (most
    recent) level-2 header in the *ChangeLog* file and check whether a
    corresponding Git tag already exists with the command `git tag --list
    N.M.K`. If this command *does* produce output, the first section is
    already released/tagged, so use the `N.M.K` from the *first* level-2
    header as the baseline tag and *insert* a new, still-unreleased
    level-2 section (next patch version, current date) *above* it, which
    then becomes the *first* (most recent) section all subsequent steps
    operate on - the already released section *MUST* *NOT* be modified.
    If this command produces *no* output, the first section is still
    in-progress/untagged, so use the `N.M.K` from the *second* level-2
    header as the baseline tag instead. Then check all Git commits
    between `HEAD` and this baseline tag with the command
    `git log N.M.K..HEAD --numstat --pretty=format:'%h: %s'`. If *no*
    second level-2 header exists (very first, still untagged release),
    skip the baseline tag and check *all* Git commits with the command
    `git log HEAD --numstat --pretty=format:'%h: %s'` instead.

    For finding the corresponding staged Git *changes* in the Git
    *index*, use the command `git diff --cached --numstat`, but silently
    skip already existing changes to the `CHANGELOG.md` file itself. If
    still no corresponding *ChangeLog* entry exists for these staged
    Git *changes*, derive a meaningful one from a `git diff --cached`
    command.

    </step>

3.  <step id="STEP 3: Complete ChangeLog entries">

    You *MUST* *NOT* output anything, except introduce the current
    operation with an output based on the following <template/>:

    <template>
    <ase-tpl-bullet-normal/> **COMPLETE ENTRIES:**
    </template>

    Without immediately modifying the `CHANGELOG.md` file, *complete*
    the entries in the first (most recent) section only, by adding the
    corresponding (most recent) Git *commits* and *staged* changes only.

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
    corresponding `git show` command to get a better understanding of
    this context.

    </step>

4.  <step id="STEP 4: Consolidate and sort ChangeLog entries">

    You *MUST* *NOT* output anything, except introduce the current
    operation with an output based on the following <template/>:

    <template>
    <ase-tpl-bullet-normal/> **CONSOLIDATE ENTRIES:**
    </template>

    Without immediately modifying the `CHANGELOG.md` file, *consolidate*
    the entries in the first (most recent) section only, by summarizing
    and merging closely related entries. Perform the entry consolidation
    per <change-type/> group only. Also condense any entry of this
    section, which exceeds about *5 lines*, by compressing its wording.

    Without immediately modifying the `CHANGELOG.md` file, *sort* the
    entries in the first (most recent) section only. Instead of the
    chronological commit order, group the entries by the <change-type/>s.

    </step>

5.  <step id="STEP 5: Write modified ChangeLog entries">

    You *MUST* *NOT* output anything, except introduce the current
    operation with an output based on the following <template/>:

    <template>
    <ase-tpl-bullet-signal/> **UPDATING CHANGELOG:**
    </template>

    Finally, *update* the `CHANGELOG.md` file with the completed,
    consolidated and sorted *ChangeLog* entries. Also, update the date
    `YYYY-MM-DD` in the `N.M.K (YYYY-MM-DD)` header of the *first* (most
    recent) section.

    For this, you *MUST* use the `Edit` tool, replacing just the *first*
    (most recent) section, instead of re-writing the entire file with
    the `Write` tool, so that the resulting changes are shown to the
    user as a diff by the agent tool itself.

    You *MUST* *NOT* output the resulting entries a second time, any
    further summary, or any further explanations.

    </step>

</flow>


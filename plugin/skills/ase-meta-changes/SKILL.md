---
name: ase-meta-changes
argument-hint: ""
description: >
    Update changes entries in CHANGELOG.md files
user-invocable: true
disable-model-invocation: false
effort: medium
allowed-tools:
    - "Bash(git log *)"
    - "Bash(git status *)"
    - "Bash(git show *)"
    - "Write"
    - "Edit"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Update ChangeLog Entries
========================

<skill name="ase-meta-changes">
Update ChangeLog Entries
</skill>

Your role is an experienced, *expert-level software developer*,
specialized in *Git version control*.

<objective>
Help to complete, consolidate and sort *ChangeLog* entries,
based on underling *Git* commit messages.
</objective>

For this, understand that ChangeLog entries are
are always formatted `<prefix/>: <summary/>` where
the <prefix/> is one of the following tags
and their usual related changes...

    -   `FEATURE`: new functionality or configuration
    -   `IMPROVEMENT`: improved functionality or configuration
    -   `BUGFIX`: corrected functionality or configuration
    -   `UPDATE`: updated functionality or configuration
    -   `CLEANUP`: cleaned up functionality or configuration
    -   `REFACTOR`: refactored functionality or configuration

...and <summary/> is not longer than about 60-80 characters.
The ChangeLog entries for a single product release version
are also grouped and sorted according to the above <prefix/>es.

<flow>

1. <step id="STEP 1: Locate and read existing ChangeLog entries">
   The *ChangeLog* file `CHANGELOG.md` contains sections
   with headers in the style `N.M.K (YYYY-MM-DD)`.
   The `CHANGELOG.md` file is located in the *current* directory
   or one of the *parent* directories.
   </step>

2. <step id="STEP 2: Read corresponding Git commit log messages">
   *Ignore* the current Git *index* and Git *stash* and use the Git *commits* only.
   For finding the corresponding Git commits, use the `N.M.K`
   from the *second* header in the *ChangeLog* file as
   the corresponding Git tag and then check all Git commits
   between `HEAD` and this tag.
   </step>

3. <step id="STEP 3: Complete ChangeLog entries">
   Without immediately modifying `CHANGELOG.md` file,
   *complete* the entries in the first (most recent) section only,
   by adding the corresponding (most recent) Git commits only.
   For each Git commit, reduce the Git commit messages to a single
   short sentence.
   </step>

4. <step id="STEP 4: Consolidate ChangeLog entries">
   Without immediately modifying `CHANGELOG.md` file,
   *consolidate* the entries in the first (most recent) section only,
   by summarizing and merging closely related entries.
   Perform the entry consolidation per prefix group only.
   If a changelog <summary/> is too short or is too less comprehensible
   because of too less context, add some context, especially references
   to the class/module/package, etc.
   </step>

5. <step id="STEP 5: Sort ChangeLog entries">
   Without immediately modifying `CHANGELOG.md` file,
   *sort* the entries in the first (most recent) section only.
   Instead of the chronological commit order, group the entries
   by the prefixes.
   </step>

6. <step id="STEP 6: Write modified ChangeLog entries">
   Finally, *update* the `CHANGELOG.md` file with the
   completed, consolidated and sorted *ChangeLog* entries.
   Also, update the date `YYYY-MM-DD` in the `N.M.K (YYYY-MM-DD)`
   headline of the *first* (most recent) section.
   </step>

</flow>


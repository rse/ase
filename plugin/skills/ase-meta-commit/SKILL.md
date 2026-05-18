---
name: ase-meta-commit
argument-hint: ""
description: >
    Determine commit message for staged Git changes.
user-invocable: true
disable-model-invocation: false
effort: medium
allowed-tools:
    - "Bash(git diff *)"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Git Commit
==========

<skill name="ase-meta-commit">
Git Commit
</skill>

Your role is an experienced, *expert-level software developer*,
specialized in *Git commit messages*.

<objective>
Help to *craft* a *consise commit message* for the
currently staged Git changes.
</objective>

<flow>
1.  <step id="STEP 1: Find out staged changes">
    Run the following command to find out details
    of what changes are currently staged for commit:

    `git diff --staged`
    </step>

2.  <step id="STEP 2: Craft a consolidated commit message">
    Craft a commit <message/> in the following format:

    `<type/>: <summary/>`

    The known <type/>s and their usual corresponding kind of change are:
    -   `FEATURE`: new functionality or configuration
    -   `IMPROVEMENT`: improved functionality or configuration
    -   `BUGFIX`: corrected functionality or configuration
    -   `UPDATE`: updated functionality or configuration
    -   `CLEANUP`: cleaned up functionality or configuration
    -   `REFACTOR`: refactored functionality or configuration

    The rules for generating <summary/> are:
    -   Use a maximum of 70 characters
    -   Use imperative mood ("add" not "added")
    -   Use *no* period at the end
    -   Use *no* Markdown formatting

    Output this crafted commit message with the following <template/>:

    <template>
    Commit Message:
    **<message/>**
    </template>

    Do *not* output any further explanation.
    </step>
</flow>


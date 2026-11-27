---
name: ase-repo-commit
argument-hint: "[--help|-h]"
description: >
    Determine commit message for staged Git changes. Use when the user
    asks to "give", "write", "craft", "suggest", or "propose" a "commit
    message", or wants to know how to "describe" or "phrase" the staged
    changes for a commit.
user-invocable: true
disable-model-invocation: false
effort: medium
allowed-tools:
    - "Bash(git diff *)"
    - "Bash(git ls-files *)"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-repo-commit">
Git Commit
</purpose>

<expand name="getopt" arg1="ase-repo-commit">
    $ARGUMENTS
</expand>

<objective>
Help to *craft* a *concise commit message* for the
currently staged Git changes.
</objective>

<flow>

1.  <step id="STEP 1: Find out staged changes">

    Run the following command to find out the overview of what changes
    are currently staged in the Git *index* for commit, capturing its
    output into <stat/>:

    `git diff --cached --stat`

    <if condition="<stat/> is empty">
    Only output the following <template/>, then expand the following
    hint, and then *STOP* immediately:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-repo-commit**, ▶ status: **no changes to commit**
    </template>

    <ase-tpl-hint level="normal">
    Nothing is staged -- use `git add -p` or `/ase-repo-stage` to stage the intended changes first.
    </ase-tpl-hint>
    </if>

    Then capture the staged changes themselves into <diff/>: if <stat/>
    reports a total of up to about 1000 changed lines, run `git diff
    --cached`, otherwise run `git diff --cached -- <path/>` only for
    the (up to) 5 files with the most changed lines, and rely on <stat/>
    for the remaining files.

    </step>

2.  <step id="STEP 2: Craft a consolidated commit message">

    Craft a commit <message/> in the following format:

    `<type/>: <summary/>`

    The known <type/>s (kept deliberately in sync with the intent groups
    of the `ase-repo-diff` and `ase-repo-changelog` skills) and their
    usual corresponding kind of change are:

    -   `FEATURE`:     new        functionality or configuration
    -   `IMPROVEMENT`: improved   functionality or configuration
    -   `BUGFIX`:      corrected  functionality or configuration
    -   `UPDATE`:      updated    functionality or configuration
    -   `CLEANUP`:     cleaned up functionality or configuration
    -   `REFACTOR`:    refactored functionality or configuration

    The rules for generating <summary/> are:

    -   Use a maximum of 60-80 characters
    -   Use imperative mood ("add" not "added")
    -   Use *no* period at the end
    -   Use *no* Markdown formatting
    -   Never add `Co-Authored-By` trailers to commit messages
    -   Derive it *exclusively* from <stat/> and <diff/>, and never from
        the recollection of edits of the session, as these may be still
        unstaged or belong to a parallel session
    -   Never include secrets, tokens, credentials, or internal URLs

    <if condition="
        the staged changes clearly span *multiple* <type/>s or unrelated
        concerns, so that the single <type/> chosen for <message/> covers
        them only partially
    ">
    Set <mixed/> to a comma-separated list of the spanned <type/>s.
    </if>
    <else>
    Set <mixed/> to empty.
    </else>

    Output this crafted commit message with the following <template/>:

    <template>
    Commit Message:
    **<message/>**
    </template>

    Do *not* output any further explanation.

    Finally, give the closing hint by expanding the following (which,
    depending on the configured <ase-guidance-level/>, may expand into
    nothing and hence emit no output at all):

    <if condition="<mixed/> is not empty">
    <ase-tpl-hint level="minimal">
    The staged changes mix <mixed/> -- consider splitting them into separate commits with `/ase-repo-dissect --sequential` or `/ase-repo-stage`.
    </ase-tpl-hint>
    </if>

    <if condition="
        a `CHANGELOG.md` file exists in the project (or in any affected
        sub-package), is *not* itself part of the staged changes, but
        carries *unstaged* changes (check with the command
        `git diff --name-only -- <changelog-path/>`)
    ">
    <ase-tpl-hint level="minimal">
    The `CHANGELOG.md` changes are still unstaged -- use `git add -p CHANGELOG.md` or `/ase-repo-stage --entry` to stage them before committing.
    </ase-tpl-hint>
    </if>
    <elseif condition="
        a `CHANGELOG.md` file exists in the project (or in any affected
        sub-package) and is *not* itself part of the staged changes
    ">
    <ase-tpl-hint level="normal">
    The staged changes do not touch `CHANGELOG.md` -- use `/ase-repo-changelog` to update its entries before committing.
    </ase-tpl-hint>
    </elseif>

    </step>

</flow>


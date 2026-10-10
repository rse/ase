---
name: ase-task-condense
argument-hint: "[--help|-h] [--next|-n <option>[,...]] [<id>]"
description: >
    Condense the current or given task plan by compressing its wording.
    Use when the user calls to "condense", "compress", "shrink" or
    "shorten" the "task", "plan", "spec", or "specification".
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-task-condense">
Condense a Task Plan
</purpose>

<expand name="getopt"
    arg1="ase-task-condense"
    arg2="--next|-n=(none|DONE|EDIT|IMPLEMENT|DRAFT)... --int-reuse-task">
    $ARGUMENTS
</expand>

<objective>
*Condense* the task plan by removing fluff while preserving all
semantics exactly.
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-format-task.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-common-task.md

Procedure
---------

<define name="handoff-args">
Set <args></args> (set args to empty).
<if condition="the condensed plan was saved via `ase_task_save` in step 3">
    Set <args>--int-reuse-task</args>.
</if>
<if condition="<getopt-option-next/> is not equal `none`">
    Set <args><args/> --next <getopt-option-next/></args>
</if>
</define>

1.  **Determine Task:**

    1.  Set <instruction><getopt-arguments/></instruction> initially, with any
        leading and trailing whitespace stripped.
        Inherit the always existing <ase-task-id/> from the current context.
        Inherit the always existing <ase-session-id/> from the current context.
        Do not output anything.

    2.  React on task id:

        <expand name="task-react-id" arg1="ase-task-condense"></expand>

2.  **Determine Operation:**

    1.  Determine the current task plan content:

        <expand name="task-load-content"></expand>

        Set <content-before><task-content/></content-before> (remember the
        loaded plan content for the strictly-shorter check in step 3).

        <if condition="the frontmatter of <task-content/> carries a `Created: <text/>` key">
        Set <timestamp-created><text/></timestamp-created> (extract the
        original creation timestamp so it can be re-inserted unchanged
        into the condensed <task-content/> in step 3).
        </if>

    2.  <if condition="<task-content/> is empty">
        Complain and tell the user to use the `ase-code-resolve`,
        `ase-code-refactor`, `ase-code-craft`, or `ase-task-edit` skills
        first to create a task plan. Then immediately stop processing
        this skill.
        </if>

3.  **Condense Task Plan:**

    1.  *Apply the condense ruleset* to <task-content/>, producing a shorter
        <task-content/>. The goal is to make the plan require as *little
        reading* as possible while all semantics remain *fully preserved
        and unchanged*. Honor the following ruleset *strictly*:

        1.  *Preserve-exactly (never alter)*: the plan <format/>
            structure (the entire frontmatter block with all of its keys,
            the headings `#`/`##`, all three `##  SPECIFICATION (WHAT)`,
            `##  DESIGN (HOW)`, and `##  VERIFICATION (WHEN)` sections,
            the `-   <box/> <type/>:` bullet-point prefixes with their
            checkbox states, and the entire "backmatter" with all of its
            attachment blocks), all *code spans* and code blocks,
            technical terms, file paths, identifiers, numbers,
            severities (`LOW`/`MEDIUM`/`HIGH`/`ACCEPTED`), and the
            `*<aspect/>*` emphasis highlighting convention.

        2.  *Compress free-text only* (each bullet-point's <text/>):
            -   *Drop* filler ("just", "really", "basically", "simply"),
                pleasantries, and hedging ("I think", "maybe", "perhaps").
            -   *Use* shorter synonyms and common abbreviations.
            -   *Use* `→` for causality and `-` for short subsequent facts.
            -   *Drop* articles ("a", "an", "the") and *replace*
                conjunctions with short separate clauses where this
                shortens the text without introducing ambiguity.
            -   *Re-wrap* the shortened free-text to the ~100-character-
                per-line convention of the plan <format/>, but *never*
                break a line *inside* an inline code span.
            -   *Merge* genuinely-redundant bullets (the same aspect
                restated) and *drop* pure duplication -- but *only* when
                truly redundant; *never* lose a distinct aspect.

        3.  *Persona override*: this condense ruleset *always wins* for
            the plan content. This ruleset-based compression is applied
            *regardless* of the currently active session persona style.

        4.  *Hard guardrail -- semantics preserved EXACTLY*: condensing
            *only* shortens wording. It *MUST NOT* drop, merge (except
            truly-redundant bullets per sub-item 2), reorder, or alter
            *any* factual claim, requirement, file path, rule, or
            example. If a shortening would change meaning, *keep the
            longer wording*.

    2.  *Persist only if smaller*: call the `ase_text_metric(text:
        "<text/>")` tool of the `ase` MCP server once for the condensed
        <task-content/> and once for <content-before/>, and take the
        `chars` field of each result, so the comparison rests on a
        *measured* length instead of an estimate.

        -   <if condition="the condensed <task-content/> has strictly fewer `chars` than <content-before/>">
            <expand name="task-save-content" arg1="plan condensed"></expand>
            </if>

        -   <if condition="the condensed <task-content/> has NOT strictly fewer `chars` than <content-before/>">
            Do *not* save and do *not* bump the timestamp. Set
            <task-content><content-before/></task-content> (keep the
            *unchanged* stored plan, discard the condensed one).
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan already condensed**
            </template>
            </if>

4.  **Decide Next Step:**

    1.  *Determine next step*:

        <expand name="task-next-select"
            arg1="ase-task-condense"
            arg2="DONE|EDIT|IMPLEMENT|DRAFT">
            Next Step: How would you like to proceed with the plan?
            DONE: Stop processing.
            EDIT: Hand off plan to editing.
            DRAFT: Hand off plan to implementation drafting.
            IMPLEMENT: Hand off plan to implementation.
        </expand>

    2.  Check the tool <result/> and dispatch accordingly:

        -   If <result/> is `DONE` or `CANCEL`:
            Only output the following <template/> and then *STOP*.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan condensed -- done**
            </template>

        -   If <result/> is `EDIT`:
            <expand name="handoff-args"/>
            Only output the following <template/> and then call the
            tool `Skill(skill: "ase:ase-task-edit", args: "<args/>")`
            to invoke the `ase:ase-task-edit` skill in order to *edit*
            the condensed plan. Immediately stop processing the current
            skill once the `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan condensed -- hand-off to edit**
            </template>

        -   If <result/> is `IMPLEMENT`:
            <expand name="handoff-args"/>
            Only output the following <template/> and then call the
            `Skill(skill: "ase:ase-task-implement", args: "<args/>")` tool
            to *apply* the plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan condensed -- hand-off to implementation**
            </template>

        -   If <result/> is `DRAFT`:
            <expand name="handoff-args"/>
            Set <args><args/> --draft</args>. Only output the following
            <template/> and then call the
            `Skill(skill: "ase:ase-task-implement", args: "<args/>")` tool
            to *draft* the implementation of the plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan condensed -- hand-off to implementation draft**
            </template>

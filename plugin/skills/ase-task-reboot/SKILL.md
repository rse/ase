---
name: ase-task-reboot
argument-hint: "[--help|-h] [--next|-n <option>[,...]] [<id>]"
description: >
    Reboot the current or given task plan by re-creating it from scratch.
    Use when the user calls to "reboot", "recreate" or "refresh"
    the "task", "plan", "spec", or "specification".
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-task-reboot">
Reboot a Task Plan
</purpose>

<expand name="getopt"
    arg1="ase-task-reboot"
    arg2="--next|-n=(none|DONE|EDIT|IMPLEMENT|DRAFT)... --int-reuse-task">
    $ARGUMENTS
</expand>

<objective>
*Reboot* the task plan by crafting it from scratch,
based on the existing `SPECIFICATION (WHAT)`.
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-format-task.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-common-task.md

Procedure
---------

1.  **Determine Task:**

    1.  Set <instruction><getopt-arguments/></instruction> initially, with any
        leading and trailing whitespace stripped.
        Inherit the always existing <ase-task-id/> from the current context.
        Inherit the always existing <ase-session-id/> from the current context.
        Do not output anything.

    2.  React on task id:

        <expand name="task-react-id" arg1="ase-task-reboot"></expand>

2.  **Determine Operation:**

    1.  Determine the current task plan content:

        <expand name="task-load-content"></expand>

    2.  <if condition="<task-content/> is empty">
        Complain and tell the user to use the `ase-code-resolve`,
        `ase-code-refactor`, `ase-code-craft`, or `ase-task-edit` skills
        first to create a task plan. Then immediately stop processing
        this skill.
        </if>

3.  **Reboot Task Plan:**

    1.  Start with <instruction></instruction> (set instruction to empty).
        Do not output anything.

    2.  <if condition="the `##  SPECIFICATION (WHAT)` section of <task-content/> contains at least one `DOM` or `IFC` bullet-point">
        Set <mode>structured</mode>. Extract the <text/> of *every*
        `DOM` and `IFC` bullet-point of the `##  SPECIFICATION (WHAT)`
        section, in their original order, each with its
        `-   <box/> <type/>:` prefix stripped and its wording kept
        *verbatim*. Set <instruction/> to these texts, joined by a
        blank line (set instruction to the extracted specification).
        The `##  DESIGN (HOW)` and `##  VERIFICATION (WHEN)` sections
        are *deliberately* ignored, as the reboot re-derives them from
        scratch.
        </if>

    3.  <if condition="<instruction/> is still empty">
        Set <mode>unstructured</mode>. The plan does not follow the
        <format/> (or carries no `DOM` or `IFC` bullet-point), so the
        reboot has to *file* its entire existing content into the
        <format/> instead. Set <instruction/> to the full previous plan
        "body" (the second block of <task-content/>, without frontmatter
        and backmatter), with its wording kept *verbatim*.
        </if>

    4.  <if condition="the frontmatter of <task-content/> carries a `Created: <text/>` key">
        Set <timestamp-created><text/></timestamp-created> (set
        timestamp-created to extracted text).
        </if>

    5.  <if condition="<instruction/> is empty or contains only whitespace">
        There is nothing to reboot from. Only output the following
        <template/> and then immediately *STOP* processing the entire
        current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-task-reboot**, ▶ ERROR: empty instruction -- nothing to reboot from
        </template>
        </if>

    6.  Only output the following <template/> and continue processing:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
        </template>

    7.  Create a new plan from scratch and store the result as
        <task-content/> by closely following the defined plan format
        <format/> and injecting into it all the information from
        the <instruction/> and all decisions you derived from the
        <instruction/>, where:

        -   <if condition="<mode/> is `structured`">
            the `##  SPECIFICATION (WHAT)` section is *seeded* by the
            extracted `DOM` and `IFC` bullet-points, re-phrased and
            re-structured where the <instruction/> demands it, and the
            `##  DESIGN (HOW)` and `##  VERIFICATION (WHEN)` sections
            are *re-derived* from scratch,
            </if>
        -   <if condition="<mode/> is `unstructured`">
            *all* existing content of the <instruction/> is *filed* into
            the `##  SPECIFICATION (WHAT)`, `##  DESIGN (HOW)`, and
            `##  VERIFICATION (WHEN)` sections: classify each existing
            statement, prose paragraph, bullet, or list item by its
            nature into a `DOM`, `IFC`, `ARC`, `IMP`, `REG`, or `CON`
            bullet-point, keep its wording as *verbatim* as the
            bullet-point <text/> conventions allow, *never* drop a
            distinct statement, and *add* missing `DOM`/`IFC`,
            `ARC`/`IMP`, and `REG`/`CON` bullet-points *derived* from
            the existing content where a section would otherwise stay
            empty,
            </if>
        -   every bullet-point starts in the `[ ]` todo state,
        -   the `Status:` frontmatter key is *reset* to the *default*
            state of the task lifecycle model
            <ase-project-task-lifecycle/>, as the rebooted plan starts
            its lifecycle anew,
        -   the frontmatter keys `Group:`, `Phase:`, `After:`, `Kind:`,
            and `Tags:` are taken over from the previous plan *verbatim*
            where present, except that all `grilled:` tags
            are *dropped* from `Tags:` (the whole key is dropped if no
            other tag remains), as the grilled plan content is gone,
        -   the frontmatter keys `Source:`, `Changeset:`, and `Target:`
            are *dropped*, so they are *reset* to their configured
            defaults according to the plan <format/>, as the rebooted
            plan starts its change set flow anew, and
        -   the entire "backmatter" of the previous plan is passed
            through *verbatim*.

    8.  <expand name="task-save-content" arg1="plan rebooted"></expand>

4.  **Decide Next Step:**

    1.  *Determine next step*:

        <expand name="task-next-select"
            arg1="ase-task-reboot"
            arg2="DONE|EDIT|IMPLEMENT|DRAFT">
            Next Step: How would you like to proceed with the plan?
            DONE: Stop processing.
            EDIT: Hand off plan to editing.
            IMPLEMENT: Hand off plan to implementation.
            DRAFT: Hand off plan to implementation drafting.
        </expand>

    2.  Check the tool <result/> and dispatch accordingly:

        -   If <result/> is `DONE` or `CANCEL`:
            Only output the following <template/> and then *STOP*.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan rebooted -- done**
            </template>

        -   If <result/> is `EDIT`:
            <expand name="task-next-handoff" arg1="ase-task-edit"
                arg2="plan rebooted -- hand-off to edit"></expand>

        -   If <result/> is `IMPLEMENT`:
            <expand name="task-next-handoff" arg1="ase-task-implement"
                arg2="plan rebooted -- hand-off to implementation"></expand>

        -   If <result/> is `DRAFT`:
            <expand name="task-next-handoff" arg1="ase-task-implement"
                arg2="plan rebooted -- hand-off to implementation draft"
                arg3="--draft"></expand>


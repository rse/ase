---
name: ase-code-craft
argument-hint: "[--help|-h] [--auto|-a] [--dry|-d] [--direct|-D] [--interactive|-i] [--quick|-Q] [--next|-n <option>[,...]] [<task-id>:] <feature>"
description: >
    Craft Source Code:
    Use when user wants to "create", "add", or "craft" a new feature from scratch.
user-invocable: true
disable-model-invocation: false
effort: xhigh
allowed-tools:
    - "Skill"
    - "Agent"
    - "Read"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-code-craft">
Craft Source Code
</purpose>

<expand name="getopt"
    arg1="ase-code-craft"
    arg2="--auto|-a --dry|-d --direct|-D --interactive|-i --quick|-Q --next|-n=(none|DONE|EDIT|GRILL|DRAFT|IMPLEMENT)...">
    $ARGUMENTS
</expand>

<if condition="<getopt-option-quick/> is equal `true`">
The `--quick`/`-Q` flag is a *shorthand alias*: set <getopt-option-auto/>
to `true`, <getopt-option-dry/> to `true`, and <getopt-option-next/> to
`IMPLEMENT,DELETE`. Do not output anything.
</if>

<if condition="<getopt-option-interactive/> is equal `true`">
The `--interactive`/`-i` flag *implies* the `--direct`/`-D` mode: set
<getopt-option-direct/> to `true`. Do not output anything.
</if>

<objective>
From scratch *craft* the following feature:
<feature><getopt-arguments/></feature>
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-format-task.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-tenets.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-common-code.md

Procedure
---------

<if condition="<getopt-option-direct/> is not equal to 'true'">
You *MUST* *NOT* call `Edit`, `Write`, `NotebookEdit`, or any
filesystem-modifying tool, nor execute any filesystem-modifying
shell command, during this entire skill. The *only* permitted way
to persist artifacts is via the `ase_task_save(...)` MCP tool.
</if>
<else>
The `--direct`/`-D` mode applies the crafting *in place*, so STEP 4
below *requires* `Edit` and `Write` to modify the affected artifacts.
Every modification *MUST* still stay restricted to the artifacts the
crafting actually demands, and you *MUST* *NOT* call
`ase_task_save(...)`, as no task plan is composed at all.
</else>

<flow>

1.  <step id="STEP 1: Reason About Feature">

    1.  <if condition="
            <feature/> matches the regexp `^[a-zA-Z0-9#][a-zA-Z0-9#_-]*$`
        ">
        Set <ase-task-id><feature/></ase-task-id> (set task id to feature)
        and <feature></feature> (set feature empty), call the
        `ase_task_id(id: "<ase-task-id/>", session: "<ase-session-id/>")` tool
        from the `ase` MCP server to switch the task, and then only
        output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
        </template>
        </if>

    2.  <if condition="
            <feature/> has the format `<id/>: <text/>` AND
            <id/> matches the regexp `^[a-zA-Z0-9#][a-zA-Z0-9#_-]*$`
        ">
        Set <feature><text/></feature> and
        <ase-task-id><id/></ase-task-id> and call the `ase_task_id(id:
        "<ase-task-id/>", session: "<ase-session-id/>")` tool from the
        `ase` MCP server to implicitly switch the task. Do not output
        anything.
        </if>

    3.  <if condition="<feature/> is empty">
        Ask the user interactively, without a special tool, for the
        initial feature with a single question:

        `**No feature known yet. What is the feature you want to craft?**`

        Then set <feature/> to the response of the user.
        </if>

    4.  <if condition="
            <ase-task-id/> is equal `default` and
            <feature/> is not empty
        ">
        Call the `ase_task_newid(title: "<title/>", proposal:
        "<proposal/>")` tool from the `ase` MCP server, where <title/> is
        a brief title summarizing <feature/> and <proposal/> is a task id
        derived from <feature/>, which consists of two lower-case words
        concatenated with a `-` character, and set <ase-task-id/> to the
        `id` field of its response -- the tool derives the id according
        to the task id scheme of the project, so you *MUST* *NEVER*
        assemble it yourself. Then call the `ase_task_id(id:
        "<ase-task-id/>", session: "<ase-session-id/>")` tool from the
        `ase` MCP server to implicitly switch the task. Do not output
        anything.
        </if>

    5.  Report the task and feature with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**
        ⧉ **ASE**: ⇌ feature: **<feature/>**
        </template>

    6.  Figure out what the requested <feature/> to be crafted is about.

    7.  Ask the user for clarification if the goal of this crafting is too
        unclear.

    8.  Do not output anything else in this step, unless you asked the user.

    </step>

2.  <step id="STEP 2: Investigate Code Base">

    1.  Check the existing source files for all code which is related to the
        requested new <feature/>.

    2.  Check the architecture of the existing code base to understand the
        overall structures and dynamics.

    3.  Do not output anything in this STEP 2.

    </step>

3.  <step id="STEP 3: Internalize Crafting Tenets">

    1.  <task-kind>CRAFTING</task-kind>

    2.  <expand name="code-tenets" arg1="<task-kind/>"></expand>

    3.  Do not output anything in this STEP 3.

    </step>

4.  <if condition="<getopt-option-direct/> is equal to 'true'">

    <step id="STEP 4: Direct Feature Crafting">

    1.  Directly craft the <feature/> by modifying the affected
        *artifacts* with a corresponding, complete *change set*,
        based on your gathered knowledge about the code base and your
        internalized crafting tenets. Also, if a CHANGELOG.md
        file exists, make an appropriate entry there, too.

    2.  Output only the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **changes directly applied**
        </template>

    3.  <if condition="<getopt-option-interactive/> is equal `true`">
        Enter the *interactive crafting loop*:

        <while condition="`true`">

        1.  In the following, you *MUST* *NOT* use your built-in
            <user-dialog-tool/> tool! Instead, you *MUST* just show a
            custom dialog according to the expanded `custom-dialog`
            definition. You *MUST* closely follow this definition.

            Ask the user for the next change with the following
            custom dialog:

            <expand name="custom-dialog" arg1="--other">
                Next Change: What is the next change to craft?
                DONE: Finish the interactive crafting loop
            </expand>

        2.  If <result/> is `DONE` or `CANCEL`, <break/>.

        3.  Otherwise <result/> has the format `OTHER: <text/>`: set
            <feature/> to <text/>, then directly craft it and report
            it exactly as specified by the items 1 and 2 above
            (including the CHANGELOG.md entry).

        </while>
        </if>

    4.  Then *IMMEDIATELY* *STOP* all further skill processing. You
        *MUST* *NOT* output anything else in this STEP 4 or after it --
        *independent* of <ase-project-boxing/>, whose exposure rules
        are explicitly *overridden* here. Especially, do not output a
        change summary, a list of modified artifacts, a rationale, or
        a unified diff of the changes.

    </step>

    </if>
    <else>

    <step id="STEP 4: Choose Feature Crafting Approaches">

    <expand name="code-approaches" arg1="feature" arg2="crafting"></expand>

    </step>

    <step id="STEP 5: Compose Feature Crafting Plan">

    1.  *Compose a feature plan* for the chosen feature A<n/> by
        closely aligning to the existing architecture and the existing
        code base. Use the <format/> defined for a task plan and inject
        the information from feature A<n/> and all derived realization
        decisions into it. Store the resulting task plan in <task-content/>.

        If a `CHANGELOG.md` file exists in the project (or in any
        affected sub-package), the plan *MUST* include, as an `IMP`
        bullet-point of its `##  DESIGN (HOW)` section, an explicit
        bullet-point describing the addition of a corresponding new entry
        to that `CHANGELOG.md` file, aligned with its existing style and
        conventions.

        <if condition="<getopt-option-dry/> is equal `true`">
        You *MUST* completely omit the `##  VERIFICATION (WHEN)` section
        (including its heading and all of its bullet points) from
        <task-content/>.
        </if>

        You *MUST* *NOT* call `Edit`, `Write`, `NotebookEdit`, or any
        filesystem-modifying tool during this step.

    2.  Call the `ase_timestamp(format: "yyyy-LL-dd HH:mm")` tool of the
        `ase` MCP server and use the `text` field of its response for
        <timestamp-created/> and <timestamp-modified/> information. Then
        insert the current <ase-task-id/>, <timestamp-created/>,
        <timestamp-modified/>, and <task-kind/> information.

    3.  You then *MUST* *save* the resulting plan content with the
        `ase_task_save(id: "<ase-task-id/>", text: "<task-content/>",
        create: <create/>)` MCP tool call only -- *NEVER* by executing
        a shell command -- where <create/> is `true` if <ase-task-id/>
        was allocated via `ase_task_newid` in STEP 1, else `false`. If
        this call fails because the task already exists (a concurrent
        session took the same id), allocate and switch to a new
        <ase-task-id/> exactly as in STEP 1, re-insert it, and save again.

    4.  Output a hint with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan created**
        </template>

    5.  Directly pass-through control to the next skill:

        <expand name="code-next-dispatch"></expand>

    </step>

    </else>

</flow>

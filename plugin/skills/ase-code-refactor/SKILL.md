---
name: ase-code-refactor
argument-hint: "[--help|-h] [--auto|-a] [--dry|-d] [--direct|-D] [--quick|-Q] [--next|-n <option>[,...]] [<task-id>:] <request>"
description: >
    Refactor Code:
    Use when user wants to "refactor" or "change" the code base.
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

<purpose name="ase-code-refactor">
Refactor Source Code
</purpose>

<expand name="getopt"
    arg1="ase-code-refactor"
    arg2="--auto|-a --dry|-d --direct|-D --quick|-Q --next|-n=(none|DONE|EDIT|GRILL|DRAFT|IMPLEMENT)...">
    $ARGUMENTS
</expand>

<if condition="<getopt-option-quick/> is equal `true`">
The `--quick`/`-Q` flag is a *shorthand alias*: set <getopt-option-auto/>
to `true`, <getopt-option-dry/> to `true`, and <getopt-option-next/> to
`IMPLEMENT,DELETE`. Do not output anything.
</if>

<objective>
*Refactor* existing artifacts the following way:
<request><getopt-arguments/></request>
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
The `--direct`/`-D` mode applies the refactoring *in place*, so STEP 4
below *requires* `Edit` and `Write` to modify the affected artifacts.
Every modification *MUST* still stay restricted to the artifacts the
refactoring actually demands, and you *MUST* *NOT* call
`ase_task_save(...)`, as no task plan is composed at all.
</else>

<flow>

1.  <step id="STEP 1: Reason About Refactoring">

    1.  <if condition="
            <request/> matches the regexp `^[a-zA-Z0-9#][a-zA-Z0-9#_-]*$`
        ">
        Set <ase-task-id><request/></ase-task-id> (set task id to request)
        and <request></request> (set request empty), call the
        `ase_task_id(id: "<ase-task-id/>", session: "<ase-session-id/>")` tool
        from the `ase` MCP server to switch the task, and then only
        output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
        </template>
        </if>

    2.  <if condition="
            <request/> has the format `<id/>: <text/>` AND
            <id/> matches the regexp `^[a-zA-Z0-9#][a-zA-Z0-9#_-]*$`
        ">
        Set <request><text/></request> and
        <ase-task-id><id/></ase-task-id> and call the `ase_task_id(id:
        "<ase-task-id/>", session: "<ase-session-id/>")` tool from the
        `ase` MCP server to implicitly switch the task. Do not output
        anything.
        </if>

    3.  <if condition="<request/> is empty">
        Ask the user interactively, without a special tool, for the
        initial request with a single question:

        `**No refactoring details known yet. What is the refactoring you want to request?**`

        Then set <request/> to the response of the user.
        </if>

    4.  <if condition="
            <ase-task-id/> is equal `default` and
            <request/> is not empty
        ">
        Call the `ase_task_newid(title: "<title/>", proposal:
        "<proposal/>")` tool from the `ase` MCP server, where <title/> is
        a brief title summarizing <request/> and <proposal/> is a task id
        derived from <request/>, which consists of two lower-case words
        concatenated with a `-` character, and set <ase-task-id/> to the
        `id` field of its response -- the tool derives the id according
        to the task id scheme of the project, so you *MUST* *NEVER*
        assemble it yourself. Then call the `ase_task_id(id:
        "<ase-task-id/>", session: "<ase-session-id/>")` tool from the
        `ase` MCP server to implicitly switch the task. Do not output
        anything.
        </if>

    5.  Report the task and request with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**
        ⧉ **ASE**: ⇌ request: **<request/>**
        </template>

    6.  Figure out what the artifact refactoring <request/> is about.

    7.  Ask the user for clarification if the goal of this refactoring is
        too unclear.

    8.  Do not output anything else in this step, unless you asked the user.

    </step>

2.  <step id="STEP 2: Investigate Code Base">

    1.  Check the existing source files for all code which is related to the
        refactoring <request/>.

    2.  Check the architecture of the existing code base to understand the
        overall structures and dynamics.

    3.  Do not output anything in this STEP 2.

    </step>

3.  <step id="STEP 3: Internalize Refactoring Tenets">

    1.  <task-kind>REFACTORING</task-kind>

    2.  <expand name="code-tenets" arg1="<task-kind/>"></expand>

    3.  Do not output anything in this STEP 3.

    </step>

4.  <if condition="<getopt-option-direct/> is equal to 'true'">

    <step id="STEP 4: Direct Refactoring">

    1.  Directly apply the refactoring <request/> by modifying the
        affected *artifacts* with a corresponding, complete *change set*,
        based on your gathered knowledge about the code base and your
        internalized refactoring tenets. Also, if a CHANGELOG.md
        file exists, make an appropriate entry there, too.

    2.  Output only the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **changes directly applied**
        </template>

    3.  Then *IMMEDIATELY* *STOP* all further skill processing. You
        *MUST* *NOT* output anything else in this STEP 4 or after it --
        *independent* of <ase-project-boxing/>, whose exposure rules
        are explicitly *overridden* here. Especially, do not output a
        change summary, a list of modified artifacts, a rationale, or
        a unified diff of the changes.

    </step>

    </if>
    <else>

    <step id="STEP 4: Choose Refactoring Approaches">

    <expand name="code-approaches" arg1="refactoring" arg2="refactoring"></expand>

    </step>

    <step id="STEP 5: Compose Refactoring Plan">

    1.  *Compose a refactoring plan* for the chosen refactoring A<n/> by
        closely aligning to the existing architecture and the existing
        code base. Use the <format/> defined for a task plan and inject
        the information from refactoring A<n/> and all derived realization
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

    5.  Directly pass through control to the next skill:

        <expand name="code-next-dispatch"></expand>

    </step>

    </else>

</flow>


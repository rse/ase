---
name: ase-code-resolve
argument-hint: "[--help|-h] [--auto|-a] [--dry|-d] [--direct|-D] [--quick|-Q] [--next|-n <option>[,...]] [<task-id>:] <problem>"
description: >
    Resolve Problem:
    Use when user wants to "bugfix" or "fix" code or "resolve" a problem.
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

<purpose name="ase-code-resolve">
Resolve Problem
</purpose>

<expand name="getopt"
    arg1="ase-code-resolve"
    arg2="--auto|-a --dry|-d --direct|-D --quick|-Q --next|-n=(none|DONE|EDIT|GRILL|DRAFT|IMPLEMENT)...">
    $ARGUMENTS
</expand>

<if condition="<getopt-option-quick/> is equal `true`">
The `--quick`/`-Q` flag is a *shorthand alias*: set <getopt-option-auto/>
to `true`, <getopt-option-dry/> to `true`, and <getopt-option-next/> to
`IMPLEMENT,DELETE`. Do not output anything.
</if>

<objective>
*Resolve* the following problem:
<problem><getopt-arguments/></problem>
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
The `--direct`/`-D` mode applies the resolution *in place*, so STEP 4
below *requires* `Edit` and `Write` to modify the affected artifacts.
Every modification *MUST* still stay restricted to the artifacts the
resolution actually demands, and you *MUST* *NOT* call
`ase_task_save(...)`, as no task plan is composed at all.
</else>

<flow>

1.  <step id="STEP 1: Reason About Problem">

    1.  If <problem/> matches the regexp `^[PT]\d+$` (i.e. a bare issue
        identifier like `P1`, `P2`, `T1`, `T2`, ...),
        set <problem-id><problem/></problem-id> and
        <ase-task-id><problem/></ase-task-id>, then call the
        `ase_kv_get(key: "ase-issue-<problem-id/>")` tool of
        the `ase` MCP server to retrieve the previously persisted
        problem description. If the returned `text` is non-empty, set
        <problem><text/></problem> and call the `ase_task_id(id:
        "<ase-task-id/>", session: "<ase-session-id/>")` tool from the
        `ase` MCP server to implicitly switch the task, otherwise
        complain to the user that no analyzer result exists for
        <problem-id/> and stop processing.

    2.  <if condition="
            <problem-id/> is not set AND
            <problem/> matches the regexp `^[a-zA-Z0-9#][a-zA-Z0-9#_-]*$`
        ">
        Set <ase-task-id><problem/></ase-task-id> (set task id to problem)
        and <problem></problem> (set problem empty), call the
        `ase_task_id(id: "<ase-task-id/>", session: "<ase-session-id/>")` tool
        from the `ase` MCP server to switch the task, and then only
        output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
        </template>
        </if>

    3.  <if condition="
            <problem-id/> is not set AND
            <problem/> has the format `<id/>: <text/>` AND
            <id/> matches the regexp `^[a-zA-Z0-9#][a-zA-Z0-9#_-]*$`
        ">
        Set <problem><text/></problem> and
        <ase-task-id><id/></ase-task-id> and call the `ase_task_id(id:
        "<ase-task-id/>", session: "<ase-session-id/>")` tool from the
        `ase` MCP server to implicitly switch the task. Do not output
        anything.
        </if>

    4.  <if condition="<problem/> is empty">
        Ask the user interactively, without a special tool, for the
        initial problem with a single question:

        `**No problem details known yet. What is the problem you want to resolve?**`

        Then set <problem/> to the response of the user.
        </if>

    5.  <if condition="
            <ase-task-id/> is equal `default` and
            <problem/> is not empty
        ">
        Call the `ase_task_newid(title: "<title/>", proposal:
        "<proposal/>")` tool from the `ase` MCP server, where <title/> is
        a brief title summarizing <problem/> and <proposal/> is a task id
        derived from <problem/>, which consists of two lower-case words
        concatenated with a `-` character, and set <ase-task-id/> to the
        `id` field of its response -- the tool derives the id according
        to the task id scheme of the project, so you *MUST* *NEVER*
        assemble it yourself. Then call the `ase_task_id(id:
        "<ase-task-id/>", session: "<ase-session-id/>")` tool from the
        `ase` MCP server to implicitly switch the task. Do not output
        anything.
        </if>

    6.  Report the task and problem with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**
        ⧉ **ASE**: ⇌ problem: **<problem/>**
        </template>

    </step>

2.  <step id="STEP 2: Investigate Code Base">

    1.  Check the existing source files for all code which is related to the
        requested <problem/> resolution.

    2.  Check the architecture of the existing code base to understand the
        overall structures and dynamics.

    3.  Investigate and *figure out details* related to this problem.

        <if condition="<getopt-option-direct/> is not equal to 'true'">
        Report those details with the following <template/>:

        <template>
        <ase-tpl-bullet-signal/> **PROBLEM CONTEXT**: *<context/>*
        <affected-code-excerpt/>
        <optional-diagram/>

        <ase-tpl-bullet-signal/> **PROBLEM DETAILS**: *<summary/>*
        ● [...]
        ● [...]
        ● [...]
        </template>

        Hints:

        - Give a short one-sentence <context/> of the <problem/> plus
          a short excerpt of the affected code <affected-code-excerpt/>.

        - Give a short one-sentence <summary/> of the <problem/> plus *precise*
          but *brief* code processing information to understand the problem.
          Try to keep the number of bullet points (●) in the range of 1-4.

        - In case of a *complex context situation* with complex *structure*
          (layout, components, dependencies, etc.), complex *control flow*
          (branching, concurrency, etc.), complex *state machine* (states,
          transitions, etc.), complex *data flow* (actors, messages, etc.), or
          complex *data structure* (classes, entities, relationships, etc.),
          visualize it with an optional diagram <optional-diagram/> by
          building a Mermaid specification <mermaid-spec/> (e.g. `flowchart
          TB`, `stateDiagram-v2`, `sequenceDiagram`, `classDiagram`, or
          `erDiagram`, depending on intent) and dispatching the rendering
          to the `ase-meta-diagram` sub-agent by calling the tool
          `Agent(description: "Diagram Rendering", subagent_type:
          "ase:ase-meta-diagram", prompt: <mermaid-spec/>,
          run_in_background: false)`, reproducing its
          returned fenced code block verbatim. Omit <optional-diagram/>
          entirely for simple or purely local situations.
        </if>

    4.  Do not output anything else in this STEP 2.

    </step>

3.  <step id="STEP 3: Internalize Problem Resolution Tenets">

    1.  <task-kind>RESOLVING</task-kind>

    2.  <expand name="code-tenets" arg1="<task-kind/>"></expand>

    3.  Do not output anything in this STEP 3.

    </step>

4.  <if condition="<getopt-option-direct/> is equal to 'true'">

    <step id="STEP 4: Direct Problem Resolution">

    1.  Directly resolve the <problem/> by modifying the affected
        *artifacts* with a corresponding, complete *change set*,
        based on your gathered knowledge about the code base and your
        internalized problem resolution tenets. Also, if a CHANGELOG.md
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

    <step id="STEP 4: Choose Problem Resolution Approaches">

    <expand name="code-approaches" arg1="resolution" arg2="resolution"></expand>

    </step>

    <step id="STEP 5: Compose Problem Resolution Plan">

    1.  *Compose a plan* with code references, a precise description of the
        problem, the chosen resolution approach, a preview of the *unified
        diff* of the necessary code changes, and a possible way to verify
        the success of the resolution, by using the <format/> defined for a
        task plan. Store the resulting task plan in <task-content/>.

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

    4.  If <problem-id/> is set (i.e. the <problem/> was retrieved from
        `ase_kv_get` in STEP 1.1 via key `ase-issue-<problem-id/>`),
        you *MUST* additionally call the `ase_kv_delete(key:
        "ase-issue-<problem-id/>")` tool of the `ase` MCP
        server to remove the now-resolved analyzer result from the
        in-memory key/value store.

    5.  Output a hint with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan created**
        </template>

    6.  Directly pass through control to the next skill:

        <expand name="code-next-dispatch"></expand>

    </step>

    </else>

</flow>


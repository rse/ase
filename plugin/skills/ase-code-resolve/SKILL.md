---
name: ase-code-resolve
argument-hint: "[--help|-h] [--auto|-a] [--dry|-d] [--quick|-Q] [--next|-n <option>[,...]] [<task-id>:] <problem>"
description: >
    Resolve Problem:
    Use when user wants a bug fixed or problem resolved.
user-invocable: true
disable-model-invocation: false
effort: xhigh
allowed-tools:
    - "Skill"
    - "Agent"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<skill name="ase-code-resolve">
Resolve Problem
</skill>

<expand name="getopt"
    arg1="ase-code-resolve"
    arg2="--auto|-a --dry|-d --quick|-Q --next|-n=(none|DONE|EDIT|PREFLIGHT|IMPLEMENT)...">
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

Procedure
---------

You *MUST* follow the following numbered items *strictly* *sequentially*!
You *MUST* not skip any numbered item during processing!

You *MUST* *NOT* output anything in this entire procedure, *except* when
explicitly requested by this procedure via outputs based on a <template/>!

You *MUST* *NOT* call `Edit`, `Write`, `NotebookEdit`, or any
filesystem-modifying tool during this entire skill. The *only*
permitted way to persist artifacts is via `ase_task_save(...)`.

1.  **Reason About Problem**:

    1.  If <problem/> matches the regexp `^[PT]\d+$` (i.e. a bare issue
        identifier like `P1`, `P2`, `T1`, `T2`, ...),
        set <problem-id><problem/></problem-id> and
        <ase-task-id><problem/></ase-task-id>, call the `ase_task_id(id:
        "<ase-task-id/>", session: "<ase-session-id/>")` tool from the
        `ase` MCP server to implicitly switch the task, and then
        call the `ase_kv_get(key: "ase-issue-<problem-id/>")` tool of
        the `ase` MCP server to retrieve the previously persisted
        problem description. If the returned `text` is non-empty, set
        <problem><text/></problem>, otherwise complain to the user that
        no analyzer result exists for <problem-id/> and stop processing.

    2.  <if condition="
            <problem/> matches the regexp `^[a-zA-Z][a-zA-Z0-9_-]*$`
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

    3.  If <problem/> has the format `<id/>: <text/>` where <id/> matches
        the regexp `^[a-zA-Z][a-zA-Z0-9_-]*$`, then set
        <problem><text/></problem> and <ase-task-id><id/></ase-task-id>
        and call the `ase_task_id(id: "<ase-task-id/>", session:
        "<ase-session-id/>")` tool from the `ase` MCP server to
        implicitly switch the task. Do not output anything.

    4.  If <problem/> is empty,
        ask the user interactively, without a special tool, for the
        initial problem with a single question:

        `**No problem details known yet. What is the problem you want to resolve?**`

        Then set <problem/> to the response of the user.

    5.  <if condition="
            <ase-task-id/> is equal `default` and
            <problem/> is not empty
        ">
        Set <ase-task-id/> to a unique task id, derived from <problem/>,
        which consists of two lower-case words concatenated with a
        `-` character. Then call the `ase_task_id(id: "<ase-task-id/>",
        session: "<ase-session-id/>")` tool from the `ase` MCP server to
        implicitly switch the task. Do not output anything.
        </if>

    6.  Report the task and problem with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**
        ⧉ **ASE**: ⇌ problem: **<problem/>**
        </template>

    7.  Figure out what the requested <problem/> is about.

    8.  Ask the user for clarification if the goal of this resolution is
        too unclear.

    9.  Do not output anything in this step, unless you asked the user.

    10. Investigate and *figure out details* related to this problem.
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
          (layout, components, dependencies, etc), complex *control flow*
          (branching, concurrency, etc), complex *state machine* (states,
          transitions, etc), complex *data flow* (actors, messages, etc), or
          complex *data structure* (classes, entities, relationships, etc),
          visualize it with an optional diagram <optional-diagram/> by
          building a Mermaid specification <mermaid-spec/> (e.g. `flowchart
          TB`, `stateDiagram-v2`, `sequenceDiagram`, `classDiagram`, or
          `erDiagram`, depending on intent) and dispatching the rendering
          to the `ase-meta-diagram` sub-agent by calling the tool
          `Agent(name: "ase-meta-diagram", description: "Diagram
          Rendering", subagent_type: "ase:ase-meta-diagram", prompt:
          <mermaid-spec/>)`, reproducing its returned fenced code block
          verbatim. Omit <optional-diagram/> entirely for simple or
          purely local situations.

2.  **Investigate Code Base**:

    1.  Check the existing source files for all code which is related to the
        requested <problem/> resolution.

    2.  Check the architecture of the existing code base to understand the
        overall structures and dynamics.

    3.  Do not output anything in this step.

3.  **Internalize Problem Resolution Tenets**:

    You *MUST* internalize and honor the following tenets when resolving the problem.
    Do not output anything.

    1.  Generic Tenets:

        -   **Separation of Concerns**:
            Clearly separate all individual concerns as well as possible.

        -   **Code Base Alignment**:
            Strictly align with the existing source code base by exactly
            following its coding style, its structure, its naming
            conventions, etc.

    2.  Specific Tenets:

        -   **Surgical Changes**:
            Keep source code changes always as small as possible.

        -   **No Cleanups**:
            Strictly focus on resolving the problem and do not mix this
            task with any other necessary code cleanups, unless they are
            really necessary for resolving the task.

        -   **Minimum Flags**:
            Use the absolute minimum total number of flags (boolean
            variables) to span the entire space of scenarios. Prefer the
            adjustment of existing flags over the introduction of new
            flags.

        -   **Code Adequacy**:
            As little increase in overall source code complexity as
            possible, as much new problem resolution source code as
            necessary.

        -   **Origin Proximity**:
            Problems for *obvious, particular, or expected* errors
            *should* be handled *near the origin*. Problems for
            *theoretical, fictive, or unexpected* errors *should* be
            handled more generally and in parent scopes.

4.  **Find Problem Resolution Approaches**:

    You *MUST* perform the following sub-steps *internally* and *without
    any output* until and including the recommendation decision. Only
    sub-steps 4-6 below are allowed to produce output, and only if
    <getopt-option-auto/> is equal `false`. If <getopt-option-auto/> is
    equal `true`, *skip* the reporting sub-steps 4-6 entirely (perform
    no output at all) to speed up processing.

    1.  *Propose* corresponding *resolution approach*, including optionally,
        some *alternative* resolution approaches. Do *not* output anything
        in this sub-step.

    2.  *Reflect* on and *critique* the proposed approaches by deriving,
        per approach, a small set of concrete *pros* and *cons*. Do
        *not* output anything in this sub-step.

    3.  Based on the reflection, *decide* which approach to recommend
        and annotate it with an <annotation/> of
        ` ⚝ **RECOMMENDATION** ⚝`. All other approaches receive an
        empty <annotation/>. Do *not* output anything in this sub-step.

    4.  Indicate start of reporting by showing the following <template/>:

        <template>
        <ase-tpl-head title="APPROACHES"/>
        </template>

    5.  Now report each approach with the following <template/>,
        inlining its pros/cons derived in sub-step 2, and do not output
        anything else in this step:

        <template>
        ● **APPROACH A<n/>**<annotation/>: *<summary/>*
        ○ [...]
        ○ [...]
        ○ [...]
        ⊕ *pro*: [...]
        ⊖ *con*: [...]
        <optional-diagram/>
        </template>

        Hints:

        -   Give a short one-sentence <summary/> of the resolution
            approach plus *precise* and *ultra brief and concise*
            resolution information. Try to keep the number of bullet
            points (●) in the range of 1-4.

        -   In case of a *complex resolution situation* only,
            visualize it with an optional diagram <optional-diagram/>
            by building a Mermaid specification <mermaid-spec/>
            (e.g. `flowchart TB`, `stateDiagram-v2`, `sequenceDiagram`,
            `classDiagram`, or `erDiagram`, depending on intent) and
            dispatching the rendering to the `ase-meta-diagram`
            sub-agent by calling the tool `Agent(name: "ase-meta-diagram",
            description: "Diagram Rendering", subagent_type:
            "ase:ase-meta-diagram", prompt: <mermaid-spec/>)`, reproducing
            its returned fenced code block verbatim. For *current
            vs. proposed* comparisons, render each side as a *separate*
            `ase-meta-diagram` invocation and stack the rendered blocks
            *vertically* (labels `**Before:**` / `**After:**`); never
            side-by-side. Omit <optional-diagram/> entirely for simple
            or purely local situations.

    6.  Indicate end of reporting by showing the following <template/>:

        <template>
        <ase-tpl-foot title="APPROACHES"/>
        </template>

5.  **Choose Problem Resolution Approach**:

    1.  If <getopt-option-auto/> is equal `false`:
        Let the *user interactively choose* the preferred resolution
        approach A<n/> with the help of the <user-dialog-tool/> tool.
        Use the header `Select Approach`, use `A<n/>: <short-summary/>`
        for the option (where <short-summary/> is an ultra brief summary
        of the approach A<n/>), and *single-selection* only and provide
        small *code change previews*. Mark your recommended resolution
        approach with ` ⚝ **RECOMMENDATION** ⚝` here again.

    2.  If <getopt-option-auto/> is equal `true`:
        Set <n/> to the number of the resolution approach A<n/> you recommend.
        Output a hint with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **auto-chosen approach A<n/>**
        </template>

6.  **Compose Problem Resolution Plan**:

    1.  *Compose a plan* with code references, a precise description of the
        problem, the chosen resolution approach, a preview of the *unified
        diff* of the necessary code changes, and a possible way to verify
        the success of the resolution, by using the <format/> defined for a
        task plan. Store the resulting task plan in <content/>.

        If a `CHANGELOG.md` file exists in the project (or in any
        affected sub-package), the plan *MUST* include, as part of its
        `## ※ CHANGES` section, an explicit bullet point describing
        the addition of a corresponding new entry to that `CHANGELOG.md`
        file, aligned with its existing style and conventions.

        <if condition="<getopt-option-dry/> is equal `true`">
        You *MUST* completely omit the `##  VERIFICATION` section
        (including its heading and all of its bullet points) from
        <content/>.
        </if>

        You *MUST* *NOT* call `Edit`, `Write`, `NotebookEdit`, or any
        filesystem-modifying tool during this step.

    2.  Call the `ase_timestamp(format: "yyyy-LL-dd HH:mm")` tool of the
        `ase` MCP server and use the `text` field of its response for
        <timestamp-created/> and <timestamp-modified/> information. Then
        insert the current <ase-task-id/>, <timestamp-created/>, and
        <timestamp-modified/> information and calculate the number of
        words <words/> of <content/>.

    3.  You then *MUST* *save* the resulting plan content with the
        `ase_task_save(id: "<ase-task-id/>", text: "<content/>")`.

    4.  If <problem-id/> is set (i.e. the <problem/> was retrieved from
        `ase_kv_get` in STEP 1.3 via key `ase-issue-<problem-id/>`),
        you *MUST* additionally call the `ase_kv_delete(key:
        "ase-issue-<problem-id/>")` tool of the `ase` MCP
        server to remove the now-resolved analyzer result from the
        in-memory key/value store.

    5.  Output a hint with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan created**
        </template>

    6.  Directly pass-through control to the next skill:

        Treat <getopt-option-next/> as a comma-separated chronological
        list of pre-selected next-step tokens. *Peek* the *first* token
        as <head/> (or `none` if the list is `none`/empty).

        1.  <if condition="<head/> is equal `IMPLEMENT`">
            Consume the head: set <getopt-option-next/> to the remaining
            tokens (joined back with `,`, or `none` if empty). Set
            <args></args> (empty).
            <if condition="<getopt-option-next/> is not equal `none`">
            Set <args>--next <getopt-option-next/></args> (forward
            remaining list tokens to the downstream skill).
            </if>
            Call the tool `Skill(skill: "ase:ase-task-implement", args: <args/>)`
            to *implement* the freshly composed plan, bypassing `ase-task-edit`.
            </if>

        2.  <if condition="<head/> is equal `PREFLIGHT`">
            Consume the head: set <getopt-option-next/> to the remaining
            tokens (joined back with `,`, or `none` if empty). Set
            <args></args> (empty).
            <if condition="<getopt-option-next/> is not equal `none`">
            Set <args>--next <getopt-option-next/></args> (forward
            remaining list tokens to the downstream skill).
            </if>
            Call the tool `Skill(skill: "ase:ase-task-preflight", args: <args/>)`
            to *preflight* the freshly composed plan, bypassing `ase-task-edit`.
            </if>

        3.  <if condition="
                <head/> is not equal `IMPLEMENT` AND
                <head/> is not equal `PREFLIGHT`
            ">
            Forward the *entire* (unshifted) list to `ase-task-edit`, which
            will consume its head itself. Set <args></args> (empty).
            <if condition="<getopt-option-next/> is not equal `none`">
            Set <args>--next <getopt-option-next/></args> (append to args).
            </if>
            Then call the tool `Skill(skill: "ase:ase-task-edit", args: <args/>)`.
            </if>


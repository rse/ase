---
name: ase-code-resolve
argument-hint: "[<task-id>:] <problem>"
description: >
    Resolve Problem:
    Use when user wants a bug fixed or problem resolved.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Skill"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

Resolve Problem
===============

<skill name="ase-code-resolve">
Resolve Problem
</skill>

<expand name="getopt"
    arg1="ase-code-resolve"
    arg2="--auto|-a --next|-n=(none|DONE|EDIT|PREFLIGHT|IMPLEMENT)">
    $ARGUMENTS
</expand>

<role>
Your role is an experienced, *expert-level software developer*.
</role>

<objective>
*Resolve* the following problem:
<problem><getopt-arguments/></problem>
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-plan.md

Procedure
---------

You *MUST* follow the following numbered items *strictly* *sequentially*!
You *MUST* not skip any numbered item during processing!

You *MUST* *NOT* output anything in this entire procedure, *except* when
explicitly requested by this procedure via outputs based on a <template/>!

You *MUST* *NOT* call `Edit`, `Write`, `NotebookEdit`, or any
filesystem-modifying tool during this entire skill. The *only*
permitted way to persist artifacts is via `task_save(...)`.

1.  **Reason About Problem**:

    1.  If <problem/> matches the regexp `^[PT]\d+$` (i.e. a bare issue
        identifier like `P1`, `P2`, `T1`, `T2`, ...),
        set <problem-id><problem/></problem-id> and
        <ase-task-id><problem/></ase-task-id>, call the `task_id(id:
        <ase-task-id/>, session: <ase-session-id/>)` tool from the
        `ase` MCP service to implicitly switch the task, and then
        call the `kv_get(key: "ase-issue-<problem-id/>")` tool of
        the `ase` MCP service to retrieve the previously persisted
        problem description. If the returned `text` is non-empty, set
        <problem><text/></problem>, otherwise complain to the user that
        no analyzer result exists for <problem-id/> and stop processing.

    2.  <if condition="
            <problem/> matches the regexp `^[a-zA-Z][a-zA-Z0-9_-]*$`
        ">
        Set <ase-task-id><problem/></ase-task-id> (set task id to problem)
        and <problem></problem> (set problem empty), call the
        `task_id(id: <ase-task-id/>, session: <ase-session-id/>)` tool
        from the `ase` MCP service to switch the task, and then only
        output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
        </template>
        </if>

    3.  If <problem/> has the format `<id/>: <text/>` where <id/> matches
        the regexp `^[a-zA-Z][a-zA-Z0-9_-]+$`, then set
        <problem><text/></problem> and <ase-task-id><id/></ase-task-id>
        and call the `task_id(id: <ase-task-id/>, session:
        <ase-session-id/>)` tool from the `ase` MCP service to
        implicitly switch the task.

    4.  If <problem/> is empty,
        ask the user interactively, without a special tool, for the
        initial problem with a single question:

        `**No problem details known yet. What is the problem you want to resolve?**`

        Then set <problem/> to the response of the user.

    5.  Report the task and problem with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**
        ⧉ **ASE**: ⇌ problem: **<problem/>**
        </template>

    6.  Figure out what the requested <problem/> is about.

    7.  Ask the user for clarification if the goal of this resolution is
        too unclear.

    8.  Do not output anything in this step, except you asked the user.

    9.  Investigate and *figure out details* related to this problem.
        Report those details with the following <template/>:

        <template>
        &#x1F7E0; **PROBLEM CONTEXT**: *<context/>*
        <affected-code-excerpt/>
        <optional-diagram/>

        &#x1F7E0; **PROBLEM DETAILS**: *<summary/>*
        - [...]
        - [...]
        - [...]
        </template>

        Hints:

        - Give a short one-sentence <context/> of the <problem/> plus
          a short excerpt of the affected code <affected-code-excerpt/>.

        - Give a short one-sentence <summary/> of the <problem/> plus *precise*
          but *brief* code processing information to understand the problem.
          Try to keep the number of bullet points in the range of 1-4.

        - In case of a *complex context situation* with complex *structure*
          (layout, components, dependencies, etc), complex *control flow*
          (branching, concurrency, etc), complex *state machine* (states,
          transitions, etc), complex *data flow* (actors, messages, etc), or
          complex *data structure* (classes, entities, relationships, etc),
          visualize it with an optional diagram <optional-diagram/> by
          invoking the `ase-meta-diagram` skill via the `Skill` tool. Omit
          <optional-diagram/> entirely for simple or purely local situation.

2.  **Investigate Code Base**:

    1.  Check the existing source files for all code which is related to the
        requested <problem/> resolution.

    2.  Check the architecture of the existing code base to understand the
        overall structures and dynamics.

    3.  Do not output anything in this step.

3.  **Find Problem Resolution Approaches**:

    1.  *Propose* corresponding *resolution approach*, including optionally,
        some *alternative* resolution approaches.

    2.  Annotate the approach you recommend with an <annotation/> of
        ` ⚝ **RECOMMENDATION** ⚝`.

    3.  Report each approach with the following <template/>
        and do not output anything else in this step:

        <template>
        &#x1F535; **APPROACH A<n/>**<annotation/>: *<summary/>*
        - [...]
        - [...]
        - [...]
        <optional-diagram/>
        </template>

        Hints:

        -   Give a short one-sentence <summary/> of the resolution approach plus
            *precise* and *brief* resolution information. Try to keep the
            number of bullet points in the range of 1-4.

        -   Focus on resolution approaches for *practically relevant* cases and do *not*
            investigate on theoretical or fictive cases. This is especially the case
            for error handling cases and race condition cases.

        -   In case of resolution approaches for problems related to *obvious or
            expected* errors, they *should* be handled *near the origin*.

        -   In case of resolution approaches for problems related to *theoretical
            or unexpected* errors, they *should* be handled in parent scopes to
            avoid cluttering the source code with too much error handling at all.

        -   In case of a *complex resolution situation* only, visualize it with
            an optional diagram <optional-diagram/> by invoking the
            `ase-meta-diagram` skill via the `Skill` tool. For *current vs.
            proposed* comparisons, render each side as a *separate*
            `ase-meta-diagram` invocation and stack the rendered blocks
            *vertically* (labels `**Before:**` / `**After:**`); never
            side-by-side. Omit <optional-diagram/> entirely for simple or
            purely local situation.

        *Recommended* Tenets (generic):

        -   **Surgical Changes**:
            Keep source code changes always as small as possible.

        -   **Separation of Concerns**:
            Clearly separate all individual concerns as good as possible.

        -   **Single Responsibility Principle**:
            Every module, class, or function should have only one reason to change.

        -   **Behavior Preservation**:
            Refactoring changes only re-structure, never change any observable behavior.

        -   **Align with Code Base**:
            Strictly align with the existing code base by exactly following its
            coding style, its structure, its naming conventions, etc.

        *Essential* Tenets (specific):

        -   **No Cleanups**:
            Strictly focus on resolving the problem and do not mix this task
            with any other necessary code cleanups, except they are really
            necessary for resolving the task.

4.  **Choose Problem Resolution Approach**:

    1.  If <getopt-option-auto/> is equal `false`:
        Let the *user interactively choose* the preferred resolution
        approach A<n/> with the help of the <user-dialog-tool/> tool.
        Use the header `Select Approach` and *single-selection* only
        and provide small *code change previews*. Mark your recommended
        resolution approach with ` ⚝ **RECOMMENDATION** ⚝` here again.

    2.  If <getopt-option-auto/> is equal `true`:
        Set <n/> to the number of the resolution approach A<n/> you recommend.
        Output a hint with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **auto-chosen approach A<n/>**
        </template>

5.  **Compose Problem Resolution Plan**:

    1.  *Compose a plan* with code references, a precise description of the
        problem, the chosen resolution approach, a preview of the *unified
        diff* of the necessary code changes, and a possible way to verify
        the success of the resolution, by using the <format/> defined for a
        task plan. Store the resulting task plan in <content/>.

        You *MUST* *NOT* call `Edit`, `Write`, `NotebookEdit`, or any
        filesystem-modifying tool during this step.

    2.  Call the `timestamp(format: "yyyy-LL-dd HH:mm")` tool of the
        `ase` MCP service and use the `text` field of its response for
        <timestamp-created/> and <timestamp-modified/> information. Then
        insert the current <ase-task-id/>, <timestamp-created/>, and
        <timestamp-modified/> information and calculate the number of
        words <words/> of <content/>.

    3.  You then *MUST* *save* the resulting plan content with the
        `task_save(id: <ase-task-id/>, text: <content/>)`.

    4.  If <problem-id/> is set (i.e. the <problem/> was retrieved from
        `kv_get` in STEP 1.3 via key `ase-issue-<problem-id/>`),
        you *MUST* additionally call the `kv_delete(key:
        "ase-issue-<problem-id/>")` tool of the `ase` MCP
        service to remove the now-resolved analyzer result from the
        in-memory key/value store.

    5.  Output a hint with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan created**
        </template>

    6.  *Determine next step*:

        -   If <getopt-option-next/> matches the regex `^(DONE|EDIT|PREFLIGHT|IMPLEMENT)$`:
            Honor the pre-selection what to do as the next step.
            Set <result><getopt-option-next/></result>.

        -   If <getopt-option-next/> is equal to `none`:
            Let the *user interactively choose* what to do as the next step.

            <expand name="user-dialog">
                Next Step: How would you like to proceed with the plan?
                DONE: Stop processing.
                EDIT: Hand processing off to editing.
                PREFLIGHT: Hand processing off to preflighting.
                IMPLEMENT: Hand processing off to implementation.
            </expand>

    7.  Check the tool <result/> and dispatch accordingly:

        -   If <result/> is `DONE` or `CANCEL`:
            Only output the following <template/> and then *STOP*.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **done**
            </template>

        -   If <result/> is `EDIT`:
            Only output the following <template/> and then use the
            `Skill` tool to invoke the `ase:ase-task-edit` skill in
            order to edit the plan. Immediately stop processing the
            current skill once the `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **hand off to edit**
            </template>

        -   If <result/> is `PREFLIGHT`:
            Only output the following <template/> and then use the
            `Skill` tool to invoke the `ase:ase-task-preflight` skill in
            order to preflight the plan. Immediately stop processing the
            current skill once the `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **hand off to preflight**
            </template>

        -   If <result/> is `IMPLEMENT`:
            Only output the following <template/> and then use the
            `Skill` tool to invoke the `ase:ase-task-implement` skill in
            order to implement the plan. Immediately stop processing the
            current skill once the `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **hand off to implement**
            </template>

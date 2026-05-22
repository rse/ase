---
name: ase-code-refactor
argument-hint: "[<task-id>:] <request>"
description: >
    Refactor Code Base:
    Use when user wants to refactor the code base.
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

Refactor Artifacts
==================

<skill name="ase-code-refactor">
Refactor Artifacts
</skill>

<expand name="getopt"
    arg1="ase-code-refactor"
    arg2="--auto|-a --next|-n=(none|DONE|EDIT|PREFLIGHT|IMPLEMENT)">
    $ARGUMENTS
</expand>

<role>
Your role is an experienced, *expert-level software developer*.
</role>

<objective>
*Refactor* existing artifacts the following way:
<request><getopt-arguments/></request>
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

1.  **Reason About Refactoring**:

    1.  <if condition="
            <request/> matches the regexp `^[a-zA-Z][a-zA-Z0-9_-]*$`
        ">
        Set <ase-task-id><request/></ase-task-id> (set task id to request)
        and <request></request> (set request empty), call the
        `task_id(id: <ase-task-id/>, session: <ase-session-id/>)` tool
        from the `ase` MCP service to switch the task, and then only
        output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
        </template>
        </if>

    2.  If <request/> has the format `<id/>: <text/>` where <id/> matches
        the regexp `^[a-zA-Z][a-zA-Z0-9_-]*$`, then set
        <request><text/></request> and <ase-task-id><id/></ase-task-id>
        and call the `task_id(id: <ase-task-id/>, session:
        <ase-session-id/>)` tool from the `ase` MCP service to
        implicitly switch the task.

    3.  If <request/> is empty,
        ask the user interactively, without a special tool, for the
        initial request with a single question:

        `**No refactoring details known yet. What is the refactoring you want to request?**`

        Then set <request/> to the response of the user.

    4.  <if condition="
            <ase-task-id/> is equal `default` and
            <request/> is not empty
        ">
        Set <ase-task-id/> to a unique task id, derived from <request/>,
        which consists of two lower-case words concatenated with a
        `-` character. Then call the `task_id(id: <ase-task-id/>,
        session: <ase-session-id/>)` tool from the `ase` MCP service to
        implicitly switch the task.
        </if>

    5.  Report the task and request with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**
        ⧉ **ASE**: ⇌ request: **<request/>**
        </template>

    6.  Figure out what the artifact refactoring <request/> is about.

    7.  Ask the user for clarification if the goal of this refactoring is
        too unclear.

    8.  Do not output anything in this step, except you asked the user.

2.  **Investigate Code Base**:

    1.  Check the existing source files for all code which is related to the
        refactoring <request/>.

    2.  Check the architecture of the existing code base to understand the
        overall structures and dynamics.

    3.  Do not output anything in this step.

3.  **Find Refactoring Approaches**:

    1.  *Propose* corresponding *refactoring approach*, including
        optionally, some *alternative* refactoring approaches.

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

        -   Give a short one-sentence <summary/> of the refactoring approach plus
            *precise* and *brief* refactoring information. Try to keep the
            number of bullet points in the range of 1-4.

        -   In case of a *complex refactoring situation* only, visualize it with
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

        -   **Boy Scout Rule**:
            After the refactoring, leave the code base cleaner than you found it.

        -   **High Cohesion, Low Coupling**:
            Strike for a set of small, focused parts (high cohesion) connected by
            thin, explicit wires (low coupling).

4.  **Choose Refactoring Approach**:

    1.  If <getopt-option-auto/> is equal `false`:
        Let the *user interactively choose* the preferred refactoring
        approach A<n/> with the help of the <user-dialog-tool/> tool.
        Use the header `Select Approach` and *single-selection* only
        and provide small *code change previews*. Mark your recommended
        refactoring approach with ` ⚝ **RECOMMENDATION** ⚝` here again.
        Except for the interactive selection, do not output anything in
        this step.

    2.  If <getopt-option-auto/> is equal `true`:
        Set <n/> to the number of the refactoring approach A<n/> you recommend.
        Output a hint with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **auto-chosen approach A<n/>**
        </template>

5.  **Compose Refactoring Plan**:

    1.  *Compose a refactoring plan* for the chosen refactoring A<n/> by
        closely aligning to the existing architecture and the existing
        code base. Use the <format/> defined for a task plan and inject
        the information from refactoring A<n/> and all derived realization
        decisions into it. Store the resulting task plan in <content/>.

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

    4.  Output a hint with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan created**
        </template>

    5.  *Determine next step*:

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

    6.  Check the tool <result/> and dispatch accordingly:

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

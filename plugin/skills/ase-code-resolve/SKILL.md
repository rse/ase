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
    - "AskUserQuestion"
    - "Skill(ase:ase-meta-diagram)"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Resolve Problem
===============

Your role is an experienced, *expert-level software developer*.

<objective>
*Resolve* the following problem:
<problem>$ARGUMENTS</problem>
</objective>

<flow>
1.  <step id="STEP 1: Reason About Problem">
    1.  Enter *Plan Mode* with the `EnterPlanMode` tool.

    2.  Clear any old plans of the *Plan Mode* and start planning from
        scratch with an empty plan.

    3.  If <problem/> has the format `<id/>: <text/>` where <id/> matches
        the regexp `^[a-zA-Z][a-zA-Z0-9_-]+$`, then set
        <problem><text/></problem> and <ase-task-id><id/></ase-task-id>
        and call the `task_id(id: <ase-task-id/>, session:
        <ase-session-id/>)` tool from the `ase` MCP service to
        implicitly switch the task.

    4.  Report the task and problem with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**
        ⧉ **ASE**: ◉ problem: **<problem/>**
        </template>

    5.  Figure out what the requested <problem/> is about.

    6.  Ask the user for clarification if the goal of this resolution is
        too unclear.

    7.  Do not output anything in this step, except you asked the user.

    8.  Investigate and *figure out details* related to this problem.
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
    </step>

2.  <step id="STEP 2: Investigate Code Base">
    1.  Check the existing source files for all code which is related to the
        requested <problem/> resolution.

    2.  Check the architecture of the existing code base to understand the
        overall structures and dynamics.

    3.  Do not output anything in this step.
    </step>

3.  <step id="STEP 3: Find Problem Resolution Approaches">
    *Propose* corresponding *resolution approach*, including optionally,
    some *alternative* resolution approaches.

    Annotate the approach you recommend with an <annotation/> of ` ⚝
    **RECOMMENDATION** ⚝`. Report each approach with the following
    <template/>:

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
    </step>

4.  <step id="STEP 4: Choose Problem Resolution Approach">
    Let the *user interactively choose* the preferred resolution approach A<n/>
    with the help of the `AskUserQuestion` tool. Use *single-selection* only
    and provide small *code change previews*. Mark your recommended
    resolution approach with ` ⚝ **RECOMMENDATION** ⚝` here again.
    </step>

5.  <step id="STEP 5: Write Problem Resolution Plan">
    *Write a plan* with code references, a precise description of the
    problem, the chosen resolution approach, a preview of the *unified
    diff* of the necessary code changes, and a possible way to verify the
    success of the resolution, by using the following <template/> for the
    plan:

    <template>
    # ✪ RESOLUTION: **<title/>**

    ⚑ task id: **<ase-task-id/>** | ✳ created: **<timestamp-created/>** | ✎ modified: **<timestamp-modified/>**

    ## PROBLEM: *<problem-summary/>*

    - [...]

    - [...]

    - [...]

    ## SOLUTION: *<solution-summary/>*

    - [...]

    - [...]

    - [...]

    ## CHANGES:

    <unified-diff-preview-of-changes/>

    ## VERIFICATION:

    - [...]

    - [...]

    - [...]
    </template>

    Hints:

    -   In all descriptions, highlight *code* as
        <template>`<code/>`</template> and *key aspects* as
        <template>*<aspect/>*</template>.

    -   For <problem-summary/> and <solution-summary/> use *ultra brief* but
        as *very precise* as possible description of the overall change.

    -   The <timestamp-created/> is the timestamp when this problem resolution specification
        was created. The <timestamp-modified/> is the timestamp when
        this feature specification was last modified. Both use a
        ISO-style format value, which has to be determined by calling
        the `timestamp(format: "yyyy-LL-dd HH:mm")` tool of the `ase`
        MCP service and use the `text` field of its response.

    -   The <title/> is a short summary of the <problem-summary/>, no longer than
        50 characters.

    -   The sections `PROBLEM`, `SOLUTION`, and `VERIFICATION` all are
        just a short list of 1-5 bullet points. Each bullet points is
        formatted as `- **<aspect/>**: <specification/>` where <aspect/>
        indicates the aspect of the section and <specification/> is 1-3
        sentences giving a *ultra precise* but also *ultra brief* and
        *ultra concise* description of the aspect.

    -   In the section `CHANGES`:
        Show complete change set. Avoid introducing dedicated state
        variables for individual error cases. If state variables are
        needed to detect error cases, at least use minimum number of
        those variables only. In general, use minimum number of state
        variables to span the maximum of error space.

    -   In all sections except `CHANGES`, break all lines with a newline
        character after about 120 characters per line.

    You then *MUST* *save* the resulting plan content with the
    `task_save` tool (`id` set to <ase-plan-id/>, `text` set to the
    plan content) and then you *MUST* exit the *Plan Mode* with the
    `ExitPlanMode` tool.

    Finally, output a final hint with the following <template/>
    and do not output anything else in this step:

    <template>
    ✔ **RESULT**: Problem Resolving Plan Created.
    ▶ **NEXT**: `ase-task-edit`, `ase-task-preflight`, or `ase-task-implement`.
    </template>
    </step>
</flow>

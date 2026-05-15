---
name: ase-code-craft
argument-hint: "[<task-id>:] <feature>"
description: >
    Craft Source Code:
    Use when user wants to create or craft a new feature from scratch.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "AskUserQuestion"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Craft Feature
=============

Your role is an experienced, *expert-level software developer*.

<objective>
From scratch *craft* the following feature:
<feature>$ARGUMENTS</feature>
</objective>

<flow>
1.  <step id="STEP 1: Reason About Feature">
    1.  Enter *Plan Mode* with the `EnterPlanMode` tool.

    2.  Clear any old plans of the *Plan Mode* and start planning from
        scratch with an empty plan.

    3.  If <feature/> has the format `<id/>: <text/>` where <id/> matches
        the regexp `^[a-zA-Z][a-zA-Z0-9_-]+$`, then set
        <feature><text/></feature> and <ase-task-id><id/></ase-task-id>
        and call the `task_id(id: <ase-task-id/>, session:
        <ase-session-id/>)` tool from the `ase` MCP service to
        implicitly switch the task.

    4.  Report the task and feature with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**
        ⧉ **ASE**: ◉ feature: **<feature/>**
        </template>

    5.  Figure out what the requested <feature/> to be crafted is about.

    6.  Ask the user for clarification if the goal of this crafting is too
        unclear.

    7.  Do not output anything in this step, except you asked the user.
    </step>

2.  <step id="STEP 2: Investigate Code Base">
    1.  Check the existing source files for all code which is related to the
        requested new <feature/>.

    2.  Check the architecture of the existing code base to understand the
        overall structures and dynamics.

    3.  Do not output anything in this step.
    </step>

3.  <step id="STEP 3: Find Feature Crafting Approaches">
    *Propose* corresponding *feature approach*, including optionally,
    some *alternative* feature approaches.

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

    -   Give a short one-sentence <summary/> of the feature approach plus
        *precise* and *brief* feature information. Try to keep the
        number of bullet points in the range of 1-4.

    -   In case of a *complex feature situation* only, visualize it with
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

    -   **High Cohesion, Low Coupling**:
        Strike for a set of small, focused parts (high cohesion) connected by
        thin, explicit wires (low coupling).
    </step>

4.  <step id="STEP 4: Choose Feature Crafting Approach">
    Let the *user interactively choose* the preferred feature approach A<n/>
    with the help of the `AskUserQuestion` tool. Use *single-selection* only
    and provide small *code change previews*. Mark your recommended
    feature approach with ` ⚝ **RECOMMENDATION** ⚝` here again.
    </step>

5.  <step id="STEP 5: Write Feature Crafting Plan">
    *Write a feature plan* for the chosen feature A<n/> by
    closely aligning to the existing architecture and the existing
    code base. Use the following <template/> for the plan and inject
    the information from feature A<n/> and all derived realization
    decisions into it:

    <template>

    # ✪ FEATURE: **<title/>**

    ⚑ task id: **<ase-task-id/>** | ✳ created: **<timestamp-created/>** | ✎ modified: **<timestamp-modified/>**

    ## CONTEXT

    - **WHAT**: <summary-what/>

    - **WHY**: <summary-why/>

    ## CHANGES:

    - [...]

    - [...]

    - [...]

    ## VERIFICATION:

    - [...]

    - [...]

    - [...]
    </template>

    Hints:

    -   In all descriptions, highlight *code* as
        <template>`<code/>`</template> and *key aspects* as
        <template>*<aspect/>*</template>.

    -   For <summary-what/> and <summary-why/> use *ultra brief* but
        as *very precise* as possible description of the overall change. In
        <summary-what/> tell what is changed. In <summary-why/> tell why it
        is changed, or what benefit results.

    -   The <timestamp-created/> is the timestamp when this feature crafting specification
        was created. The <timestamp-modified/> is the timestamp when
        this feature specification was last modified. Both use a
        ISO-style format value, which has to be determined by calling
        the `timestamp(format: "yyyy-LL-dd HH:mm")` tool of the `ase`
        MCP service and use the `text` field of its response.

    -   The <title/> is a short summary of the <summary-what/>, no longer than
        50 characters.

    -   The sections `CHANGES` and `VERIFICATION` all are just a short
        list of 1-5 bullet points. Each bullet points is formatted as
        `- **<aspect/>**: <specification/>` where <aspect/> indicates
        the aspect of the section and <specification/> is 1-3 sentences
        giving a *ultra precise* but also *ultra brief* and *ultra concise*
        description of the aspect.

    -   In all sections, break all lines with a newline character
        after about 120 characters per line.

    You then *MUST* *save* the resulting plan content with the
    `task_save` tool (`id` set to <ase-plan-id/>, `text` set to the
    plan content) and then you *MUST* exit the *Plan Mode* with the
    `ExitPlanMode` tool.

    Finally, output a final hint with the following <template/>
    and do not output anything else in this step:

    <template>
    ✔ **RESULT**: Feature Crafting Plan Created.
    ▶ **NEXT**: `ase-task-edit`, `ase-task-preflight`, or `ase-task-implement`.
    </template>
    </step>
</flow>


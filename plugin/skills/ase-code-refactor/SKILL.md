---
name: ase-code-refactor
argument-hint: "<request>"
description: >
    Refactor Code Base:
    Use when user wants to refactor the code base.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Bash(date)"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Refactor Artifacts
==================

Your role is an experienced, *expert-level software developer*.

<objective>
*Refactor* existing artifacts the following way:
<request>$ARGUMENTS</request>
</objective>

<flow>
1.  <step id="STEP 1: Reason About Refactoring">
    -   Enter *Plan Mode* with the `EnterPlanMode` tool.

    -   Clear any old plans of the *Plan Mode* and start planning from
        scratch with an empty plan.

    -   Figure out what the artifact refactoring <request/> is about.

    -   Ask the user for clarification if the goal of this refactoring is
        too unclear.

    -   Do not output anything in this step, except you asked the user.
    </step>

2.  <step id="STEP 2: Investigate Code Base">
    -   Check the existing source files for all code which is related to the
        refactoring <request/>.

    -   Check the architecture of the existing code base to understand the
        overall structures and dynamics.

    -   Do not output anything in this step.
    </step>

3.  <step id="STEP 3: Find Refactoring Approaches">
    *Propose* corresponding *refactoring approach*, including
    optionally, some *alternative* refactoring approaches.

    Annotate the approach you recommend with an <annotation/> of ` ⚝
    **RECOMMENDATION** ⚝`. Report each approach with the following
    <template/> and do not output anything else in this step:

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

    Tenets (generic):

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

    Tenets (specific, *ESSENTIAL*):

    -   **Boy Scout Rule**:
        After the refactoring, leave the code base cleaner than you found it.

    -   **High Cohesion, Low Coupling**:
        Strike for a set of small, focused parts (high cohesion) connected by
        thin, explicit wires (low coupling).
    </step>

4.  <step id="STEP 4: Choose Refactoring Approach">
    Let the *user interactively choose* the preferred refactoring approach A<n/>
    with the help of the `AskUserQuestion` tool. Use *single-selection* only
    and provide small *code change previews*. Mark your recommended
    refactoring approach with ` ⚝ **RECOMMENDATION** ⚝` here again.
    Except for the interactive selection to do output anything in this step.
    </step>

5.  <step id="STEP 5: Write Refactoring Plan">
    *Write a refactoring plan* for the chosen refactoring A<n/> by
    closely aligning to the existing architecture and the existing
    code base. Use the following <template/> for the plan and inject
    the information from refactoring A<n/> and all derived realization
    decisions into it:

    <template>

    # ✪ REFACTORING: **<title/>**

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

    -   The <timestamp-created/> is the timestamp when this feature specification
        was created. The <timestamp-modified/> is the timestamp when this
        feature specification was last modified. Both use the ISO-style format
        `YYYY-mm-dd HH:MM` which should be determined with `date "+%Y-%m-%d %H:%M"`.

    -   The <title/> is a short summary of the <summary/>, no longer than
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
    ✔ **RESULT**: Artifact Refactoring Plan Created.
    ▶ **NEXT**: `ase-spec-edit`, `ase-spec-preflight`, or `ase-spec-implement`.
    </template>
    </step>
</flow>

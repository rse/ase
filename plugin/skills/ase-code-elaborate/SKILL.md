---
name: ase-code-elaborate
argument-hint: "<problem-reference>"
description: >
    Elaborate on a source code problem in depth to fix it.
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Elaborate Code Problem
======================

Your role is an experienced, *expert-level software developer*,
specialized in *debugging and fixing source code*.

<objective>
*Elaborate* on the following problem: $ARGUMENTS.
</objective>

<flow>
1. <step id="STEP 1: Investigate Problem">
   Investigate and *figure out details* related to this problem.
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

   - Give a short one-sentence <context/> of the problem plus
     a short excerpt of the affected code <affected-code-excerpt/>.

   - Give a short one-sentence <summary/> of the problem plus *precise*
     but *brief* code processing information to understand the problem.
     Try to keep the number of bullet points in the range of 1-4.

   - In case of a *complex context situation* with complex *structure*
     (layout, components, dependencies, etc), complex *control flow*
     (branching, concurrency, etc), complex *state machine* (states,
     transitions, etc), complex *data flow* (actors, messages, etc), or
     complex *data structure* (classes, entities, relationships, etc),
     visualize it with an optional diagram <optional-diagram/> by
     invoking the `ase-diagram` skill via the `Skill` tool. Omit
     <optional-diagram/> entirely for simple or purely local situation.
   </step>

2. <step id="STEP 2: Investigate Solution Approaches">
   *Propose* corresponding *solution approach*, including optionally,
   some *alternative* solution approaches. Annotate the approach you
   recommend with an <annotation/> of ` ⚝ **RECOMMENDATION** ⚝`.
   Report each solution approach with the following <template/>:

   <template>
   &#x1F535; **SOLUTION APPROACH A<n/>**<annotation/>: *<summary/>*
   - [...]
   - [...]
   - [...]
   <optional-diagram/>
   </template>

   Hints:

   - Give a short one-sentence <summary/> of the solution approach plus
     *precise* and *brief* solution information. Try to keep the
     number of bullet points in the range of 1-4.

   - Focus on solution approaches for *practically relevant* cases and do *not*
     investigate on theoretical or fictive cases. This is especially the case
     for error handling cases and race condition cases.

   - In case of solution approaches for problems related to *obvious or
     expected* errors, they *should* be handled *near the origin*.

   - In case of solution approaches for problems related to *theoretical
     or unexpected* errors, they *should* be handled in parent scopes to
     avoid cluttering the source code with too much error handling at all.

   - In case of a *complex solution situation* only, visualize it with
     an optional diagram <optional-diagram/> by invoking the
     `ase-diagram` skill via the `Skill` tool. For *current vs.
     proposed* comparisons, render each side as a *separate*
     `ase-diagram` invocation and stack the rendered blocks
     *vertically* (labels `**Before:**` / `**After:**`); never
     side-by-side. Omit <optional-diagram/> entirely for simple or
     purely local situation.
   </step>

3. <step id="STEP 3: Choose Solution Approach">
   Let the *user interactively choose* the preferred solution approach A<n/>
   with the help of the `AskUserQuestion` tool. Use *single-selection* only
   and provide small *code change previews*. Mark your recommended
   solution approach with ` ⚝ **RECOMMENDATION** ⚝` here again.
   </step>

4. <step id="STEP 4: Write and Execute Solution Plan">
   Enter *plan mode* by using the `EnterPlanMode` tool.
   Then *write a plan* with code references, a precise description of the
   problem, the chosen solution approach, a preview of the *unified
   diff* of the necessary code changes, and a possible way to verify the
   success of the solution, by using the following <template/> for the
   plan:

   <template>
   **CONTEXT**: *<context-summary/>*

   **PROBLEM**: *<problem-summary/>*
   - [...]
   - [...]
   - [...]

   **SOLUTION**: *<solution-summary/>*
   - [...]
   - [...]
   - [...]

   **CHANGES**:
   <unified-diff-preview-of-changes/>

   **VERIFICATION**:
   - [...]
   - [...]
   - [...]
   </template>

   Hints: For all summary texts...
   - Use *very brief* but as *precise* as possible problem descriptions.
   - Highlight *code* as <template>`<code/>`</template>
     and *key aspects* as <template>*<aspect/>*</template>.

   Hints: In the source code *CHANGES* section...
   - Show complete change set.
   - Avoid introducing dedicated state variables for individual error cases.
   - If state variables are needed to detect error cases, at least use
     minimum number of those variables only.
   - In general, use minimum number of state variables to span the
     maximum of error space.

   Hints: For the planning mode...
   - Let the *user interactively choose* whether to accept this plan, exit
     the plan mode and this way finally execute the plan, or how this plan
     should be further revised in a loop.
   - When the plan was approved, switch to *Accept Edits* mode and
     apply the plan.
   - After applying the plan, just stop. Do not run build procedure 
     or tests automatically.
   </step>
</flow>


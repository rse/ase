
Code Skill Common Steps
=======================

<define name="code-tenets">

You *MUST* internalize and strictly honor the **GENERIC TENETS** and
the **<arg1/> TENETS** of the **ASE Tenets** in the following creation
and updating of code. Do not output anything.

</define>

<define name="code-tenets-from-plan">

Determine the *kind of change* the task plan describes and internalize
the corresponding tenet sets:

-   If the frontmatter of <task-content/> carries a `Kind: <text/>` key
    and <text/> is one of `CRAFTING`, `REFACTORING`, or `RESOLVING`:
    Set <task-kind><text/></task-kind> (set task kind to the stated kind).

-   Else:
    The plan states no kind at all, or an unrecognized one, so *infer*
    the kind from the plan content itself: `RESOLVING` if the plan
    predominantly fixes a defect, `REFACTORING` if it predominantly
    re-structures existing artifacts without changing their observable
    behavior, and `CRAFTING` otherwise. Set <task-kind/> to the inferred
    kind, defaulting to `CRAFTING` if the inference stays inconclusive.

Then honor the tenet sets of <task-kind/>:

<expand name="code-tenets" arg1="<task-kind/>"></expand>

</define>

<define name="code-approaches">

You *MUST* perform the following sub-steps *internally* and *without
any output* until and including the recommendation decision. Only
sub-steps 4-7 below are allowed to produce output; sub-steps 4-6 only if
<getopt-option-auto/> is equal `false` *and* <ase-project-boxing/>
is *not* equal `black`.

If <getopt-option-auto/> is equal `true` or <ase-project-boxing/> is
equal `black`, *skip* the reporting sub-steps 4-6 entirely (they
perform no output at all) to speed up processing.

1.  *Propose* a corresponding *<arg1/> approach*, optionally including
    some *alternative* <arg1/> approaches. Do *not* output anything
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
    ●   **APPROACH A<n/>**<annotation/>: **<summary/>**
    ○   [...]
    ⊕   *PRO*: [...]
    ⊖   *CON*: [...]
    </template>

    Hints:

    -   Give a short one-sentence <summary/> of the <arg1/> approach
        plus *precise* and *ultra brief and concise* <arg1/>
        information. Try to keep the number of bullet points
        (`○ [...]`) in the range of 1-4.

6.  Indicate end of reporting by showing the following <template/>:

    <template>
    <ase-tpl-foot title="APPROACHES"/>
    </template>

7.  <if condition="<getopt-option-auto/> is not equal `true` and <ase-project-boxing/> is not equal `black`">

    In the following, you *MUST* *NOT* use your built-in
    <user-dialog-tool/> tool! Instead, you *MUST* just show a
    custom dialog according to the expanded `custom-dialog`
    definition. You *MUST* closely follow this definition.

    Let the user choose the preferred approach A<n/> by raising
    a question with the following custom dialog, where per
    approach A<n/>, you determine an ultra brief summary
    <short-summary/> and then use the answer option `A<n/>:
    ⚝ **RECOMMENDATION** ⚝ - <short-summary/>` for your
    recommended approach plus zero or more answer options `A<n/>:
    <short-summary/>` for all other approaches:

    <expand name="custom-dialog" arg1="--no-other">
        Select Approach: Select your preferred <arg2/> approach to follow?
        A<n/>: <short-summary/>
        [...]
    </expand>

    </if>
    <else>

    Set <n/> to the number of the <arg1/> approach A<n/> you recommend.
    Output a hint with the following <template/>:

    <template>
    ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **auto-chosen approach A<n/>**
    </template>

    </else>

</define>

<define name="code-next-dispatch">

Treat <getopt-option-next/> as a comma-separated chronological
list of pre-selected next-step tokens. *Peek* the *first* token
as <head/> (or `none` if the list is `none`/empty).
Set <args>--int-reuse-task</args>.

1.  <if condition="<head/> is equal `DONE`">
    Consume the head: set <getopt-option-next/> to the remaining
    tokens (joined back with `,`, or `none` if empty). `DONE`
    means the freshly composed plan is finalized as-is, so do
    *not* hand off to `ase-task-edit`. Only output the following
    <template/> and then *STOP*. Do *not* implement the plan.

    <template>
    ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan finalized -- done**
    </template>
    </if>

2.  <elseif condition="<head/> is equal `IMPLEMENT`">
    Consume the head: set <getopt-option-next/> to the remaining
    tokens (joined back with `,`, or `none` if empty).
    <if condition="<getopt-option-next/> is not equal `none`">
        Set <args><args/> --next <getopt-option-next/></args>
    </if>
    <if condition="<getopt-option-quick/> is equal `true`">
        Set <args><args/> --mode all</args>
    </if>
    Call the tool `Skill(skill: "ase:ase-task-implement", args: "<args/>")`
    to *implement* the freshly composed plan, bypassing `ase-task-edit`.
    The `--quick`/`-Q` one-shot forwards `--mode all` so
    `ase-task-implement` runs the plan in a single pass, without
    the interactive step-mode dialog.
    </elseif>

3.  <elseif condition="<head/> is equal `PREFLIGHT`">
    Consume the head: set <getopt-option-next/> to the remaining
    tokens (joined back with `,`, or `none` if empty).
    <if condition="<getopt-option-next/> is not equal `none`">
        Set <args><args/> --next <getopt-option-next/></args>
    </if>
    Call the tool `Skill(skill: "ase:ase-task-preflight", args: "<args/>")`
    to *preflight* the freshly composed plan, bypassing `ase-task-edit`.
    </elseif>

4.  <elseif condition="<head/> is equal `GRILL`">
    Consume the head: set <getopt-option-next/> to the remaining
    tokens (joined back with `,`, or `none` if empty). `GRILL`
    is this skill's own dispatch token, *not* part of
    `ase-task-grill`'s `--next` vocabulary, so it must be
    stripped here rather than forwarded. All remaining tokens are
    `ase-task-grill`'s own vocabulary and are forwarded verbatim.
    <if condition="<getopt-option-next/> is not equal `none`">
        Set <args><args/> --next <getopt-option-next/></args>
    </if>
    Call the tool `Skill(skill: "ase:ase-task-grill", args: "<args/>")`
    to *grill* the freshly composed plan, bypassing `ase-task-edit`.
    </elseif>

5.  <else>
    Hand off to `ase-task-edit`.
    <if condition="<head/> is equal `EDIT`">
        Consume the head: set <getopt-option-next/> to the remaining
        tokens (joined back with `,`, or `none` if empty). `EDIT`
        is this skill's own dispatch token, *not* part of
        `ase-task-edit`'s `--next` vocabulary, so it must be
        stripped here rather than forwarded.
    </if>
    All remaining tokens are `ase-task-edit`'s own vocabulary
    and are forwarded verbatim, so `ase-task-edit` consumes its
    own head itself.
    <if condition="<getopt-option-next/> is not equal `none`">
        Set <args><args/> --next <getopt-option-next/></args>
    </if>
    Then call the tool `Skill(skill: "ase:ase-task-edit", args: "<args/>")`.
    </else>

6.  In every branch above which invoked the `Skill` tool, you *MUST*
    immediately stop processing the current skill once the `Skill`
    tool was used.

</define>

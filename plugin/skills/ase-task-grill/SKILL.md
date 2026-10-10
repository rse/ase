---
name: ase-task-grill
argument-hint: "[--help|-h] [--rounds|-r <n>] [--until|-u MUST|SHOULD|MAY] [--focus|-f <section>[,...]] [--next|-n <option>[,...]] [<id>]"
description: >
    Interview the user relentlessly about the task plan until reaching a
    shared understanding, resolving each branch of the question decision
    tree. Use when the user wants to stress-test a plan, get grilled on
    their plan, or mentions "grill me" or "grill plan".
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-task-grill">
Iteratively Grill a Task Plan
</purpose>

<expand name="getopt"
    arg1="ase-task-grill"
    arg2="--rounds|-r=1 --until|-u=(MUST|SHOULD|MAY) --focus|-f=(all|SPECIFICATION|SPEC|DESIGN|DES|VERIFICATION|VER)... --next|-n=(none|DONE|EDIT|IMPLEMENT|DRAFT)... --int-reuse-task">
    $ARGUMENTS
</expand>

<objective>
Interview the user relentlessly about every essential aspect of the
task plan until reaching a shared understanding.
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-format-task.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-common-task.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-common-grill.md

Procedure
---------

<define name="handoff-args">
Set <args>--int-reuse-task</args>.
<if condition="<getopt-option-next/> is not equal `none`">
    Set <args><args/> --next <getopt-option-next/></args>
</if>
</define>

1.  **Determine Task:**

    1.  Set <instruction><getopt-arguments/></instruction> initially, with any
        leading and trailing whitespace stripped.
        Inherit the always existing <ase-task-id/> from the current context.
        Inherit the always existing <ase-session-id/> from the current context.
        Do not output anything.

    2.  If <getopt-option-rounds/> is not a positive integer,
        only output the following <template/> and then immediately
        *STOP* processing the entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-task-grill**, ▶ ERROR: invalid `--rounds` value: **<getopt-option-rounds/>**
        </template>

    3.  Treat <getopt-option-focus/> as a comma-separated list of
        *section tokens*. Trim and upper-case every token, then expand
        the abbreviations `SPEC`, `DES`, and `VER` to `SPECIFICATION`,
        `DESIGN`, and `VERIFICATION`, and expand the sentinel `ALL`
        (the default) to `SPECIFICATION,DESIGN,VERIFICATION`. Set
        <sections/> to the resulting list, *keeping the given order*.
        The getopt parser validates only the *first* token, so you
        *MUST* validate each token yourself: if any token is *empty*,
        *not* one of the recognized sections or abbreviations, or
        results in a section already present in <sections/>, bind
        <token/> to that offending token, then only output the
        following <template/> and immediately *STOP* processing the
        entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-task-grill**, ▶ ERROR: invalid `--focus` token: **<token/>**
        </template>

        Each section in <sections/> selects its *focus areas* of the
        grilling: `SPECIFICATION` selects `DOMAIN` and `INTERFACE`,
        `DESIGN` selects `ARCHITECTURE` and `IMPLEMENTATION`, and
        `VERIFICATION` selects `REGRESSION` and `CONFIRMATION`. Do not
        output anything.

    4.  React on task id:

        <expand name="task-react-id" arg1="ase-task-grill"></expand>

2.  **Determine Task Plan:**

    1.  Determine the current task plan content:

        <expand name="task-load-content"></expand>

    2.  <if condition="<task-content/> is empty">
        Complain and tell the user to use the `ase-code-resolve`,
        `ase-code-refactor`, `ase-code-craft`, or `ase-task-edit` skills
        first to create a task plan. Then immediately stop processing
        this skill.
        </if>

    3.  Determine the *grilling scope* of each section in <sections/>,
        in order to grill an *already grilled* section again *only* where
        questions are still *open*:

        -   If the `Tags:` frontmatter key of <task-content/> carries
            the tag `grilled:<section/>` (with <section/> being the
            *lower-case* name of the section) and the section contains
            *no* bullet-point in checkbox state `[?]`, the section is
            *already grilled* and nothing is open: *remove* it from
            <sections/> and only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **section <section/> already grilled -- skipped**
            </template>

        -   If the `Tags:` frontmatter key carries the tag
            `grilled:<section/>` and the section contains *at least one*
            bullet-point in checkbox state `[?]`, *restrict* the scope of
            the section to *exactly* these `[?]` bullet-points, so the
            grilling re-asks only the *still open* questions.

        -   Otherwise, the scope of the section is the *entire* section.

        Independent of the scope, bullet-points in checkbox state `[-]`
        (cancelled) or `[>]` (deferred) are *inert*: they are *never*
        subject of a question and their checkbox is *never* changed.

        <if condition="<sections/> is empty afterwards">
        Skip the entire step 3 below -- the plan is *neither* updated
        *nor* saved -- and continue directly with step 4.
        </if>

3.  **Iterate Over Task Plan Aspects:**

    1.  Understand what "grilling" is about:

        <expand name="grill-understanding" arg1="the task plan in <task-content/>"></expand>

    2.  <if condition="the frontmatter of <task-content/> carries a `Created: <text/>` key">
        Set <timestamp-created><text/></timestamp-created> (set
        timestamp-created to extracted text).
        </if>

    3.  Perform *at most* <getopt-option-rounds/> grilling *rounds*,
        numbered <m/> (1-<getopt-option-rounds/>) -- the round count is
        a *maximum* only, as every round can *stop* the grilling *early*
        in its item 2 below.

        For each round:

        1.  INITIALIZE ROUND:

            Explicitly start *from scratch* from *only* the *current*
            <task-content/> -- as updated by all previous rounds -- and
            *forget* all questions and answers gathered in previous
            rounds. Set <round-id/> to
            `GRILLING ROUND <m/>/<getopt-option-rounds/>` if
            <getopt-option-rounds/> is greater than 1, or to
            `GRILLING` otherwise (a single round needs no round
            numbering). Do not output anything.

        2.  DETERMINE QUESTIONS:

            <expand name="grill-questions"
                arg1="<getopt-option-until/>"
                arg2="◉ task: **<ase-task-id/>**"
                arg3="file and directory paths, identifiers, symbols, types, commands, options, configuration keys, and literal values"
                arg4="the <task-content/>, the code base,"
                arg5=", and *finally* by the decision tree order, which *overrides* the impact order wherever a decision has to be asked *after* the decisions it depends on">
                Focus *only* on the *Focus Areas* selected by
                <sections/> -- the *themes* of the focused sections,
                *within* the *grilling scope* of each section as
                determined in step 2.3, while the *entire*
                <task-content/> stays the context -- and check the
                mentioned *Indicators*. For a section restricted to its
                `[?]` bullet-points, derive the questions from *exactly*
                these bullet-points only. Never raise a question about a
                `[-]` or `[>]` bullet-point. Create a decisions/questions
                tree for the questions, capturing the dependencies
                between the decisions.

                For each question, set <items-N/> to the bullet-points of
                <task-content/> the question is about -- possibly *none*,
                if the question concerns an aspect the plan does not
                cover yet.
            </expand>

            If <grill-stop/> is `true`, skip the items 3, 4, and 6 of
            this round, perform item 5 of this round (as the focused
            sections are clear, they are tagged as grilled), then skip
            all remaining rounds and continue with step 4.

        3.  INTERACTIVE DIALOG:

            In the following, you *MUST* *NOT* use your built-in
            <user-dialog-tool/> tool! Instead, you *MUST* just show a
            custom dialog according to the expanded `custom-dialog`
            definition. You *MUST* closely follow this definition. The
            dialog below carries the fixed answer option
            `SKIP GRILLING`, dispatched as follows:

            -   If a <result/> is `SKIP GRILLING`, ask no further
                questions -- *all* questions of this round stay
                *unanswered* --, continue with items 4 to 6 below
                (updating and saving the plan with the answers of the
                previous rounds), and afterwards skip all remaining
                rounds and continue with step 4.

            -   If a <result/> is `CANCEL`, only output the following
                <template/> and then immediately *STOP* processing the
                entire current skill, *not* updating the plan with the
                current round (the plan updates saved by previous
                rounds are kept):

                <template>
                ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **grilling stopped**
                </template>

            Show a custom dialog. Its only answer option is the fixed
            one, so the user normally answers all aspects in *one*
            free-text reply:

            <expand name="custom-dialog" arg1="--other">
                <round-id/>: What is your (combined) answer to all (or a subset) of the above questions? (keywords or `nX` short responses are sufficient)
                SKIP GRILLING: skip all remaining grilling and continue with the plan update
            </expand>

            Dispatch `SKIP GRILLING` and `CANCEL` as defined above.
            Otherwise, strip any leading `OTHER: ` prefix from
            <result/> and treat the remainder as the combined free-text
            answers to all questions of the round.

        4.  MERGE ANSWERS INTO PLAN:

            Merge all gathered answers in <result/> of the round -- the
            combined reply -- *exclusively* back into <task-content/>.

            <expand name="grill-short-responses"></expand>

            A question *not* addressed by the combined reply accepts its
            answer marked with `⚑` (the current plan) if one exists, and
            otherwise stays *unanswered*. Additionally, record the
            *open* questions in the checkboxes of the body
            bullet-points, changing *only* checkboxes in state `[ ]` or
            `[?]` and leaving every `[/]`, `[x]`, `[-]`, and `[>]`
            checkbox *untouched*:

            -   For each *answered* question, set the checkbox of every
                bullet-point in <items-N/> to `[ ]`, as the question is
                resolved now.

            -   For each *unanswered* question, set the checkbox of every
                bullet-point in <items-N/> to `[?]`, as the question is
                still open. If <items-N/> is *empty*, *add* a new `[?]`
                bullet-point to the section of the question's focus area
                <context-N-focus/>, with the corresponding <type/>, a
                <summary/> derived from <context-N-topic/>, and a <text/>
                stating the open <question-N-text/>, so a later grilling
                can re-ask it.

            Set <changes/> to all bullet-points of <task-content/> which
            were changed or added in this round. Do not output anything.

        5.  SAVE PLAN:

            For each section in <sections/>, *set* the tag
            `grilled:<section/>` -- with <section/> being the
            *lower-case* name of the section (`specification`,
            `design`, or `verification`) -- in the `Tags:` frontmatter
            key of <task-content/>: keep an already present identical
            tag as is, otherwise append it, keeping all other already
            present tags (including `grilled:` tags of other sections)
            and *creating* the whole key at its position in the key
            order of the plan <format/> if the plan carries none. A
            fully grilled plan hence carries the tags
            `grilled:specification, grilled:design,
            grilled:verification`.

            <expand name="task-save-content" arg1="plan updated"></expand>

        6.  SHOW PLAN CHANGES:

            Set <round-suffix/> to
            ` round <m/>/<getopt-option-rounds/>` if
            <getopt-option-rounds/> is greater than 1, or to empty
            otherwise, and only output the following <template/>, which
            shows every bullet-point of <changes/> in its plan format
            `-   <box/> <type/>: **<summary/>**: <text/>`, grouped below
            a `**<SECTION>**:` line per plan section, where an empty
            <changes/> renders as `(none)` -- this intentionally closes
            *every* round, so the intermediate plan changes stay
            visible:

            <template>
            <ase-tpl-head title="PLAN CHANGES" subtitle="after grilling<round-suffix/>"/>

            <changes/>

            <ase-tpl-foot title="PLAN CHANGES" subtitle="after grilling<round-suffix/>"/>
            </template>

4.  **Decide Next Step:**

    1.  *Determine next step*:

        <expand name="task-next-select"
            arg1="ase-task-grill"
            arg2="DONE|EDIT|IMPLEMENT|DRAFT">
            Next Step: How would you like to proceed with the plan?
            DONE: Stop processing.
            EDIT: Hand off plan to editing.
            DRAFT: Hand off plan to implementation drafting.
            IMPLEMENT: Hand off plan to implementation.
        </expand>

    2.  Check the tool <result/> and dispatch accordingly:

        -   If <result/> is `DONE` or `CANCEL`:
            Only output the following <template/> and then *STOP*,
            without output of any further information.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan updated -- done**
            </template>

        -   If <result/> is `EDIT`:
            <expand name="handoff-args"/>
            Only output the following <template/> and then call the
            tool `Skill(skill: "ase:ase-task-edit", args: "<args/>")`
            to invoke the `ase:ase-task-edit` skill in order to *edit*
            the updated plan. Immediately stop processing the current
            skill once the `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan updated -- hand-off to edit**
            </template>

        -   If <result/> is `DRAFT`:
            <expand name="handoff-args"/>
            Set <args><args/> --draft</args>. Only output the following
            <template/> and then call the
            `Skill(skill: "ase:ase-task-implement", args: "<args/>")` tool
            to *draft* the implementation of the plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan updated -- hand-off to implementation draft**
            </template>

        -   If <result/> is `IMPLEMENT`:
            <expand name="handoff-args"/>
            Only output the following <template/> and then call the
            `Skill(skill: "ase:ase-task-implement", args: "<args/>")` tool
            to *apply* the plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan updated -- hand-off to implementation**
            </template>


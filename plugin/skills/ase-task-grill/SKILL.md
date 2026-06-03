---
name: ase-task-grill
argument-hint: "[--help|-h] [--next|-n <option>[,...]] [<id>]"
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

<skill name="ase-task-grill">
Iteratively Grill a Task Plan
</skill>

<expand name="getopt"
    arg1="ase-task-grill"
    arg2="--next|-n=(none|DONE|EDIT)...">
    $ARGUMENTS
</expand>

<objective>
Interview the user relentlessly about every essential aspect of the
task plan until reaching a shared understanding.
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-format-plan.md

Procedure
---------

1.  **Determine Task:**

    1.  Set <id>$ARGUMENTS</id> initially.
        Inherit the always existing <ase-task-id/> from the current context.
        Inherit the always existing <ase-session-id/> from the current context.
        Do not output anything.

    2.  React on task id:

        1.  <if condition="
                <id/> matches the regexp `^[a-zA-Z][a-zA-Z0-9_-]*$`
            ">
            Set <ase-task-id><id/></ase-task-id> (set task id) and
            call the `ase_task_id(id: "<ase-task-id/>", session:
            "<ase-session-id/>")` tool from the `ase` MCP server
            to switch the task, and then only output the following
            <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
            </template>
            </if>

        2.  else <if condition="<id/> is NOT empty">
            The argument is neither empty nor a valid task id. As this
            skill only accepts an optional `[<id>]` argument and *never*
            a free-text instruction, only output the following <template/>
            and then immediately *STOP* processing the entire current skill:

            <template>
            ⧉ **ASE**: ☻ skill: **ase-task-grill**, ▶ **ERROR**: expected single `[<id>]` argument
            </template>
            </if>

2.  **Determine Task Plan:**

    1.  Call the `ase_task_load(id: "<ase-task-id/>")` tool of the `ase` MCP
        server to load the current task plan content and set <text/> to
        the `text` output field of the `ase_task_load` tool call.

        -   If <text/> starts with `ERROR:` or `WARNING:`:
            Output the following <template/> and then immediately *STOP*
            processing the entire current skill:

            <template>
            ⧉ **ASE**: ☻ skill: **ase-task-grill**, ▶ **<text/>**
            </template>

        -   If <text/> starts NOT with `ERROR:` and NOT with `WARNING:`:
            Set <plan><text/></plan> (set plan to text).
            Calculate the number of words <words/> of <plan/>.

        Output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan loaded**
        </template>

    2.  <if condition="<plan/> is empty">
        Complain and tell the user to use the `ase-code-resolve`,
        `ase-code-refactor`, `ase-code-craft`, or `ase-task-edit` skills
        first to create a task plan. Then immediately stop processing
        this skill.
        </if>

3.  **Iterate Over Task Plan Aspects:**

    Interactively interview the user *relentlessly* about every
    *essential aspect* of the task plan in <plan/> *until* reaching a
    shared understanding and no decisions/questions are left open.

    For this process, determine the <n/> essential aspects <aspect-N/>
    (a one or two word long short identifier like `Foo` or `Bar-Baz`)
    and the corresponding decision/question <question-N/> where a shared
    understanding is required upon.

    Honor also the following checks for identifying the problematic
    aspects:

    -   **Fuzzy Language**:
        When the user uses vague or overloaded terms instead of a precise
        or canonical terms.

    -   **Conflicting Terminology**:
        When the user uses a term that conflicts with the existing
        terminology in the code base.

    -   **Conflicting Code**:
        When the user states how something works, check whether the
        current code state really agrees.

    -   **Non-Concrete Scenarios**:
        When domain relationships are being discussed, stress-test them
        with specific scenarios. Invent scenarios that probe edge cases
        and force the user to be precise about the boundaries between
        concepts.

    Then create a decisions/questions tree for them. Walk down each
    branch of this decision tree, resolving dependencies between
    decisions one-by-one. Ask the questions <question-N/> and determine
    corresponding answer <answer-N/>, one at a time.

    1.  For each question <question-N/> in the iteration circle <N/>:

        1.  Output the following <template/>:

            <template>
            <ase-tpl-bullet-signal/> ASPECT <N/>/<n/>: **<aspect-N/>**, QUESTION: **<question-N/>**
            </template>

        2.  Determine the answer alternatives:

            1.  Check the <plan/> for the answer <answer-N-1/>.

            2.  Check the code base and your world knowledge and
                use this information to find *up to three* grounded
                alternative answers <answer-N-K/> (K={2,3,4}).

            3.  Use an interactive user dialog
                with header <aspect-N/> and question <question-N/>, and
                let the user select the <answer-N/> out of <answer-N-K/>
                (K={1..4}). In this dialog, mark the <answer-N-1/> by
                appending ` ⚝ **CURRENT PLAN** ⚝` to its option name (not the
                description).

            4.  Output the following <template/>:

                <template>
                <ase-tpl-bullet-normal/> ASPECT <N/>/<n/>: **<aspect-N/>**, ANSWER: **<answer-N/>**
                </template>

    3.  Finally, update the in <plan/> based on all answers <answer-N/>.

    4.  Call the `ase_timestamp(format: "yyyy-LL-dd HH:mm")` tool of the
        `ase` MCP server and use the `text` field of its response for
        <timestamp-modified/> information. Then insert the current
        <ase-task-id/>, previous <timestamp-created/>, and refreshed
        <timestamp-modified/> information and calculate the number of
        words <words/> of <plan/>.

    5.  Call the `ase_task_save(id: "<ase-task-id/>",
        text: "<plan/>")` of the `ase` MCP server to save the updated
        task plan content. Do not output anything related to this MCP
        call.

    6.  Only output the following <template/> and continue processing:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan updated**
        </template>

4.  **Decide Next Step:**

    1.  *Determine next step*:

        -   If <getopt-option-next/> is not equal to `none`:
            Treat <getopt-option-next/> as a comma-separated chronological
            list of pre-selected next-step tokens. *Split* it on `,`,
            take the *first* token as <head/>, and store the remaining
            tokens (joined back with `,`, or `none` if empty) into
            <getopt-option-next/> so downstream skills can consume the tail.

            -   If <head/> matches the regex `^(DONE|EDIT|IMPLEMENT|PREFLIGHT)$`:
                Honor the pre-selected token.
                Set <result><head/></result>.

            -   else:
                Only output the following <template/> and then immediately
                *STOP* processing the entire current skill:

                <template>
                ⧉ **ASE**: ☻ skill: **ase-task-grill**, ▶ ERROR: invalid `--next` token: **<head/>**
                </template>

        -   If <getopt-option-next/> is equal to `none`:
            Let the *user interactively choose* what to do as the next step.

            <expand name="user-dialog">
                Next Step: How would you like to proceed with the plan?
                DONE: Stop processing.
                EDIT: Hand off plan to editing.
                PREFLIGHT: Hand off plan to pre-flighting.
                IMPLEMENT: Hand off plan to implementation.
            </expand>

    2.  Check the tool <result/> and dispatch accordingly:

        -   If <result/> is `DONE` or `CANCEL`:
            Only output the following <template/> and then *STOP*.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan updated -- done**
            </template>

        -   If <result/> is `EDIT`:
            Set <args></args> (empty).
            <if condition="<getopt-option-next/> is not equal `none`">
            Set <args>--next <getopt-option-next/></args> (forward
            remaining list tokens to the downstream skill).
            </if>
            Only output the following <template/> and then call the
            tool `Skill(skill: "ase:ase-task-edit", args: <args/>)`
            to invoke the `ase:ase-task-edit` skill in order to *edit*
            the updated plan. Immediately stop processing the current
            skill once the `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan updated -- hand-off to edit**
            </template>

        -   If <result/> is `PREFLIGHT`:
            Set <args></args> (empty).
            <if condition="<getopt-option-next/> is not equal `none`">
            Set <args>--next <getopt-option-next/></args> (forward
            remaining list tokens to the downstream skill).
            </if>
            Only output the following <template/> and then call the
            `Skill(skill: "ase:ase-task-preflight", args: <args/>)` tool
            to *apply* the plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan updated -- hand-off to pre-flight**
            </template>

        -   If <result/> is `IMPLEMENT`:
            Set <args></args> (empty).
            <if condition="<getopt-option-next/> is not equal `none`">
            Set <args>--next <getopt-option-next/></args> (forward
            remaining list tokens to the downstream skill).
            </if>
            Only output the following <template/> and then call the
            `Skill(skill: "ase:ase-task-implement", args: <args/>)` tool
            to *apply* the plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **plan updated -- hand-off to implementation**
            </template>

---
name: ase-task-dissect
argument-hint: "[--help|-h] [--max-parts|-m <count>] [--dry|-d] [--force|-f] [<task-id>[:]] [<dissect-hint>]"
description: >
    Dissect the current or given task plan, treated as an epic,
    domain-wise and logically into cohesive parts and materialize each
    part as its own separate task plan. Use when the user calls to
    "dissect", "split", "break up", or "decompose" a large "task" or
    "plan".
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-task-dissect">
Dissect a Task Plan
</purpose>

<expand name="getopt"
    arg1="ase-task-dissect"
    arg2="--max-parts|-m=8 --dry|-d --force|-f --int-reuse-task">
    $ARGUMENTS
</expand>

<objective>
*Dissect* a task plan, treated as an *epic*, domain-wise and logically
into *cohesive parts*, and materialize every part as its own separate
*task plan*.
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-format-task.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-common-task.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-common-dissect.md

Procedure
---------

1.  **Determine Task and Hint:**

    1.  Set <instruction><getopt-arguments/></instruction> initially,
        with any leading and trailing whitespace stripped. Inherit the
        always existing <ase-task-id/> from the current context. Inherit
        the always existing <ase-session-id/> from the current context.
        Do not output anything.

    2.  React on the task id:

        <if condition="
            <instruction/> matches the regexp `^[a-zA-Z0-9#][a-zA-Z0-9#_-]*:?$`
        ">
        The lone token is the *task id* (with an optional and ignored
        trailing `:`), never a hint. Set
        <ase-task-id><instruction/></ase-task-id> (set task id to
        instruction, with any trailing `:` stripped) and
        <instruction></instruction> (set instruction empty), call the
        `ase_task_id(id: "<ase-task-id/>", session: "<ase-session-id/>")`
        tool from the `ase` MCP server to switch the task, and then only
        output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
        </template>
        </if>

        <elseif condition="
            <instruction/> has the format `<id/>: <text/>` where
            <id/> matches the regexp `^[a-zA-Z0-9#][a-zA-Z0-9#_-]*$`
        ">
        Set <instruction><text/></instruction> (set instruction to
        text) and <ase-task-id><id/></ase-task-id> (set task id to
        id), call the `ase_task_id(id: "<ase-task-id/>", session:
        "<ase-session-id/>")` tool from the `ase` MCP server to switch
        the task, and then only output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
        </template>
        </elseif>

    3.  React on the dissection hint:

        Set <dissect-hint><instruction/></dissect-hint> (set the
        dissection hint to the *remaining* instruction), with any
        leading and trailing whitespace stripped.

        <if condition="<dissect-hint/> is not empty">
        Only output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ hint: **<dissect-hint/>**
        </template>
        </if>
        <else>
        No dissection hint was given, so the parts are derived from the
        plan alone. Do not output anything.
        </else>

2.  **Determine Operation:**

    1.  Determine the current task plan content:

        <expand name="task-load-content"></expand>

    2.  If the <task-content/> is still empty, complain and tell
        the user to use the `ase-code-resolve`, `ase-code-refactor`,
        `ase-code-craft`, or `ase-task-edit` skills first to create a
        task plan. Then immediately stop processing this skill.

3.  **Dissect Task Plan:**

    1.  *Derive the parts* of the epic:

        <expand
            name="dissect-derive"
            arg1="ase-task-dissect"
            arg2="<dissect-hint/>"
            arg3="<ase-task-id/>"
        >
        the individual bullet points of the `##  SPECIFICATION (WHAT)`,
        `##  DESIGN (HOW)`, and `##  VERIFICATION (WHEN)` sections of the
        loaded plan <task-content/>
        </expand>

        Each `##  DESIGN (HOW)` bullet point *MUST* land in the very part
        which carries the `##  SPECIFICATION (WHAT)` bullet points it
        realizes, and each `##  VERIFICATION (WHEN)` bullet point *MUST*
        land in the very part which carries the `##  SPECIFICATION (WHAT)`
        and `##  DESIGN (HOW)` bullet points it verifies.

        A *single* bullet point is *not* the smallest unit here: a bullet
        point which itself covers *multiple* domains or concerns *MAY* be
        *split* per rule 3 into two or more *bullet point fragments*,
        each of which is a complete bullet point of its own, is formed
        *exclusively* from the wording of the original bullet point, and
        is then assigned to a part like an ordinary bullet point. A split
        `##  DESIGN (HOW)` or `##  VERIFICATION (WHEN)` bullet point
        follows the bullet points its fragments realize or verify, so its
        fragments *MAY* land in *different* parts.

    2.  *Identify the parts* according to the task id scheme of the
        project: for *every* part in <parts/>, in their derived order,
        call the `ase_task_newid(title: "<scope/>", proposal:
        "<part-id/>", taken: [ <previous/> ])` tool of the `ase` MCP
        server, where <previous/> lists the already re-identified
        <part-id/> of all preceding parts (as the tool reserves ids for
        scheme `seq` only), and replace the <part-id/> of the part with the `id` field
        of its response -- you *MUST* *NEVER* assemble such an id
        yourself. Do not output anything related to these MCP tool calls.

    3.  *Report the parts*:

        <expand name="dissect-report" arg1="<ase-task-id/>"></expand>

4.  **Materialize Sub-Task Plans:**

    You *MUST* *NOT* modify, re-save, or delete the epic plan
    <task-content/> of <ase-task-id/> itself -- it always stays
    *untouched*.

    1.  <if condition="<getopt-option-dry/> is equal `true`">
        The dissection is *reported only*, so no artifacts are created at
        all. Only output the following <template/> and then *SKIP* the
        remaining sub-steps 4.2 to 4.4 and continue with step 5:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ dissection: **<n/>** parts, ▶ status: **dry-run -- no sub-task plans created**
        </template>
        </if>

    2.  *Detect target collisions*, strictly *before* writing anything:

        Call the `ase_task_list(verbose: false)` tool of the `ase` MCP
        server and set <existing/> to the `id` fields of the returned
        `tasks` array. Do not output anything related to this MCP tool
        call. Set <collisions/> to all <part-id/> of <parts/> which are
        already present in <existing/>.

        <if condition="<collisions/> is not empty AND <getopt-option-force/> is not equal `true`">
        Only output the following <template/> -- with <collisions/>
        rendered as a comma-separated list of code spans -- and then
        immediately *STOP* processing the entire current skill, leaving
        *all* existing task plans untouched:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⊘ collisions: <collisions/>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ dissection: **<n/>** parts, ▶ status: **targets exist**
        </template>

        Directly *after* this <template/>, and *before* stopping, give
        the corrective hint by expanding the following (which, depending
        on the configured <ase-guidance-level/>, may expand into nothing
        and hence emit no output at all):

        <ase-tpl-hint level="minimal">
        Re-run `/ase-task-dissect --force` to overwrite the colliding sub-task plans.
        </ase-tpl-hint>
        </if>

        <if condition="<collisions/> is not empty AND <getopt-option-force/> is equal `true`">
        The colliding sub-task plans are *overwritten* in sub-step 4.3
        below. Do not output anything.
        </if>

    3.  *Compose and persist one sub-task plan per part*:

        Call the `ase_timestamp(format: "yyyy-LL-dd HH:mm")` tool of the
        `ase` MCP server *once* and use the `text` field of its response
        for both the <timestamp-created/> and <timestamp-modified/>
        information of *all* parts.

        Then, for *every* part in <parts/>, in their derived order:

        1.  Compose a *complete* task plan <part-content/> by closely
            following the plan <format/>, where:

            -   the <task-id/> is <part-id/>,
            -   the <task-status/> is the *default* state of the task
                lifecycle model <ase-project-task-lifecycle/>, as every
                part is a *newly created* plan,
            -   the `Group:` key carries <ase-task-id/>, the id of the
                epic, so all parts are grouped under it,
            -   the `Kind:`, `Phase:`, `Tags:`, `Source:`, `Changeset:`,
                and `Target:` keys are taken over from the epic
                *verbatim* (the kind being
                inferred from the part content if the epic carries no
                `Kind:` key), while the `After:` key of a part lists the
                parts it depends on, if any,
            -   the <task-title/> is derived from the part's <scope/>,
            -   the `##  SPECIFICATION (WHAT)` section carries *exactly*
                the `DOM` and `IFC` bullet points assigned to this part,
            -   the `##  DESIGN (HOW)` section carries *exactly* the
                `ARC` and `IMP` bullet points assigned to this part, and
            -   the `##  VERIFICATION (WHEN)` section carries *exactly*
                the `REG` and `CON` bullet points assigned to this part,

            all bullet points keeping their original wording, checkbox
            state, and type, and no "backmatter" being carried over from
            the epic.

            For a bullet point which was *split* into fragments, the part
            carries *only* its own fragment: the <text/> keeps the
            *original* wording of the portion this fragment covers, with
            *no* re-interpretation and *no* added scope, and the
            `<box/> <type/>:` prefix is kept *unchanged*. Across all
            parts, the fragments of a split bullet point *MUST* still
            reproduce the original bullet point *completely* and
            *without* duplication.

            <if condition="<task-content/> does NOT contain a `##  VERIFICATION (WHEN)` section heading">
            The epic itself deliberately *omits* the `##  VERIFICATION
            (WHEN)` section, so you *MUST* omit this section (including
            its heading) from <part-content/>, too.
            </if>
            <elseif condition="no `##  VERIFICATION (WHEN)` bullet point was assigned to this part">
            This part carries *no* verification of its own, so you *MUST*
            omit the `##  VERIFICATION (WHEN)` section (including its
            heading) from <part-content/>, too -- an *empty* section
            would violate the plan <format/>, and rule 5 forbids
            inventing a bullet point.
            </elseif>

        2.  Call the `ase_task_save(id: "<part-id/>", text:
            "<part-content/>", create: true)` tool of the `ase` MCP server to persist
            the sub-task plan -- this MCP tool call is the *only*
            permitted way to persist it, *NEVER* write the plan file
            via `Write`/`Edit` or by executing a shell command. If this
            call fails because the task already exists (a concurrent
            session took the same id), re-identify this part as in step
            3.2, replace its <part-id/> in <part-content/>, and save
            again. Do not
            output anything related to this MCP tool call except the
            following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<part-id/>**, ▶ status: **sub-task plan created**
            </template>

    4.  *Report the overall result* with the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ dissection: **<n/>** parts, ▶ status: **epic dissected**
        </template>

5.  **Give Final Hints:**

    Finally, give the closing hints by expanding the following (which,
    depending on the configured <ase-guidance-level/>, may each expand
    into nothing and hence emit no output at all):

    <if condition="<getopt-option-dry/> is not equal `true`">
    <ase-tpl-hint level="minimal">
    Use `/ase-task-id <id>` to switch to one of the created sub-task plans and `/ase-task-implement` to implement it.
    </ase-tpl-hint>
    </if>
    <else>
    <ase-tpl-hint level="minimal">
    Re-run `/ase-task-dissect` without `--dry` to actually create the reported sub-task plans, optionally with a `<dissect-hint>` argument if the reported split is not the intended one.
    </ase-tpl-hint>
    </else>

    <ase-tpl-hint level="normal">
    Use `/ase-task-list` to see the epic plan and all of its sub-task plans side by side.
    </ase-tpl-hint>

    <ase-tpl-hint level="verbose">
    Use `/ase-task-dissect --max-parts <count>` to bound the number of parts, `/ase-task-dissect --force` to overwrite already existing sub-task plans, and `/ase-task-dissect <task-id>: <dissect-hint>` to address another task and steer its split.
    </ase-tpl-hint>

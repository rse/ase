---
name: ase-task-edit
argument-hint: "[--help|-h] [--plan|-p <option>] [--dry|-d] [--next|-n <option>[,...]] [<id> | <id>: <instruction> | <instruction>]"
description: >
    Iteratively edit and refine a named plan for a task through a
    conversational loop. Each round, the current plan is shown and the
    user is asked whether to keep refining, mark the plan as done, or
    proceed to the implementation or draft. Use when the user wants
    to plan a task purely through chat-driven refinement.
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-task-edit">
Iteratively Edit a Task Plan
</purpose>

<expand name="getopt"
    arg1="ase-task-edit"
    arg2="--plan|-p=(none|OVERWRITE|REFINE|PRESERVE) --dry|-d --next|-n=(none|DONE|GRILL|DRAFT|IMPLEMENT)... --int-reuse-task">
    $ARGUMENTS
</expand>

<objective>
Establish and refine the *task plan* purely through a *chat-driven
loop*. The user steers each round via an interactive dialog that offers
continued refinement, finalization, or hand-off to implementation or
draft.
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-format-task.md

Procedure
---------

<define name="apply-refinement">
Treat the <instruction/> as a *refinement instruction* for
the plan, and update <task-content/> in-place by *applying* the
requested <instruction/> to the *plan*.

When refining the plan this way, preserve the overall structure of the
plan and only modify what the user actually requested. Do *not* rewrite
unrelated sections of the plan.

Attachment blocks of the "backmatter" are *never* dropped by a
refinement. Instead, *remember* every attachment block whose content the
applied <instruction/> changed as *touched*, so its `Modified` key is
refreshed together with the frontmatter in step 3.1. An attachment the
<instruction/> did not change stays *verbatim* -- an implementation
draft attachment (`Type` key value `text/x-diff; charset=utf-8;
kind="draft"`, from `ase-task-implement --draft`) hence
turns *stale* through a "body" change by its `Modified` key falling
behind the frontmatter, which step 3.3 reports.

Set <task-content-dirty>true</task-content-dirty>.
</define>

<define name="generate-plan">
Create a new plan from scratch and store the result as
<task-content/> by closely following the defined plan format
<format/> and injecting into it all the information from
the <instruction/> and all decisions you derived from the
<instruction/>.

If a `CHANGELOG.md` file exists in the project (or in any
affected sub-package), the plan *MUST* include, as an `IMP`
bullet-point of its `##  DESIGN (HOW)` section, an explicit
bullet-point describing the addition of a corresponding new
entry to that `CHANGELOG.md` file, aligned with its existing
style and conventions.

<if condition="<getopt-option-dry/> is equal `true`">
You *MUST* completely omit the `##  VERIFICATION (WHEN)` section
(including its heading and all of its bullet points) from
<task-content/>.
</if>

Call the `ase_timestamp(format: "yyyy-LL-dd HH:mm")` tool of the
`ase` MCP server and use the `text` field of its response
for fresh <timestamp-created/> and <timestamp-modified/>
information. Then insert the current <ase-task-id/>,
<timestamp-created/>, and <timestamp-modified/> information.
Set <task-content-dirty>true</task-content-dirty>.
</define>

<define name="handoff-args">
Set <args></args> (set args to empty).
<if condition="the plan was saved via `ase_task_save` in step 3.2">
    Set <args>--int-reuse-task</args>.
</if>
<if condition="<getopt-option-next/> is not equal `none`">
    Set <args><args/> --next <getopt-option-next/></args>
</if>
</define>

1.  **Determine Task and Instruction:**

    1.  Set <instruction><getopt-arguments/></instruction> initially.
        Inherit the always existing <ase-task-id/> from the current context.
        Inherit the always existing <ase-session-id/> from the current context.
        Do not output anything.

    2.  React on task and/or instruction:

        1.  <if condition="
                <instruction/> matches the regexp `^[a-zA-Z0-9#][a-zA-Z0-9#_-]*$`
            ">
            Set <ase-task-id><instruction/></ase-task-id> (set task
            id to instruction) and <instruction></instruction> (set
            instruction empty), call the `ase_task_id(id: "<ase-task-id/>",
            session: "<ase-session-id/>")` tool from the `ase` MCP
            server to switch the task, and then only output the
            following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
            </template>
            </if>

        2.  <elseif condition="
                <instruction/> has the format `<id/>: <text/>` where
                <id/> matches the regexp `^[a-zA-Z0-9#][a-zA-Z0-9#_-]*$` and
                <text/> is *empty*
            ">
            Set <instruction></instruction> (set instruction to empty)
            and <ase-task-id><id/></ase-task-id> (set task id to
            id) and call the `ase_task_id(id: "<ase-task-id/>", session:
            "<ase-session-id/>")` tool from the `ase` MCP server to
            switch the task, and then only output the following
            <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
            </template>
            </elseif>

        3.  <elseif condition="
                <instruction/> has the format `<id/>: <text/>` where
                <id/> matches the regexp `^[a-zA-Z0-9#][a-zA-Z0-9#_-]*$` and
                <text/> is *not empty*
            ">
            Set <instruction><text/></instruction> (set instruction to
            text) and <ase-task-id><id/></ase-task-id> (set task id
            to id) and call the `ase_task_id(id: "<ase-task-id/>", session:
            "<ase-session-id/>")` tool from the `ase` MCP server to
            switch the task, and then only output the following
            <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task given**
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
            </template>
            </elseif>

        4.  <elseif condition="
                <instruction/> is not empty
            ">
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task inherited**
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
            </template>
            </elseif>

        5.  <elseif condition="
                <instruction/> is empty
            ">
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **task inherited**
            </template>
            </elseif>

2.  **Determine Plan:**

    1.  Determine any existing plan content:

        <if condition="
            <getopt-option-int-reuse-task/> is equal `true`
            *and* an `ase_task_save(id: '<ase-task-id/>', ...)` tool call
            exists earlier in the current session
        ">
            Set <text/> to the `text` *argument* of the most recent
            `ase_task_save(id: '<ase-task-id/>', ...)` tool call -- this
            is the *authoring form* of the plan and *MUST NOT* be
            confused with the `text` *output* field of that call --
            *without* calling `ase_task_load` again. Set
            <task-render></task-render> (set the rendering-prepared plan
            to empty, as it is re-derived in step 3.2 or 3.3). Set
            <status>plan reused</status>. Do not output anything.
        </if>
        <else>
            Call the `ase_task_load(id: "<ase-task-id/>", variant:
            "both")` tool of the `ase` MCP server to load any existing
            plan content in *both* of its forms. From the `text` output
            field of this `ase_task_load` tool call, set <text/> to the
            content enclosed in the `<task-plan-source>` delimiter lines
            (the *authoring form*, the only form which is ever edited and
            persisted) and set <task-render/> to the content enclosed in
            the `<task-plan-render>` delimiter lines (the
            *rendering-prepared* form, used for *display only*). The
            delimiter lines themselves are *never* part of either form.
            Do not output anything related to this MCP tool call. Set
            <status>plan loaded</status>.
        </else>

        Set <task-content-dirty>false</task-content-dirty>.

        -   If <text/> starts with `ERROR:` or `WARNING:`:
            Silently ignore the MCP error.
            Set <task-content/> to empty.
            Set <task-render/> to empty.
            Do not output anything.

        -   If <text/> starts NOT with `ERROR:` and NOT with `WARNING:`:
            Set <task-content><text/></task-content> (set task content to text).
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **<status/>**
            </template>

    2.  <if condition="<task-content/> is empty AND <instruction/> is empty">
        Ask the user interactively, without a special tool, for the
        initial plan content with a single question:

        `**No plan content yet. What is the task you want to plan?**`

        Then set <instruction/> to the response of the user and only
        output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
        </template>
        </if>

    3.  <if condition="<task-content/> is not empty AND
            <instruction/> is not empty AND
            <instruction/> is not equal <task-content/>">
        *Determine previous-plan handling*:

        -   If <getopt-option-plan/> matches the regex `^(OVERWRITE|REFINE|PRESERVE)$`:
            Honor the pre-selection of what to do with the previous plan.
            Set <result><getopt-option-plan/></result>.

        -   If <getopt-option-plan/> is equal to `none`:

            In the following, you *MUST* *NOT* use your built-in
            <user-dialog-tool/> tool! Instead, you *MUST* just show a
            custom dialog according to the expanded `custom-dialog`
            definition. You *MUST* closely follow this definition:

            <expand name="custom-dialog" arg1="--other">
                Previous Plan: Should the previous plan content be overwritten, refined, or preserved?
                OVERWRITE: Continue operation, overwrite previous plan.
                REFINE: Continue operation, refine previous plan.
                PRESERVE: Cancel operation, preserve previous plan.
            </expand>

        Check the tool <result/> and dispatch accordingly:

        -   If <result/> is `CANCEL` or `PRESERVE`:

            Only output the following <template/> and then immediately
            *STOP* processing this skill:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan preserved**
            </template>

        -   If <result/> is `OVERWRITE`:

            <expand name="generate-plan"/>

            Only output the following <template/> and continue processing:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan overwritten**
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
            </template>

        -   If <result/> is `REFINE`:

            <expand name="apply-refinement"/>

            Only output the following <template/> and continue processing:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan refined**
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
            </template>

        -   If <result/> matches `OTHER: <text/>`:

            Set <instruction><instruction/> <text/></instruction> (append
            the user's free-text hint to the existing instruction).

            <expand name="apply-refinement"/>

            Only output the following <template/> and continue processing:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan refined**
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
            </template>
        </if>

    4.  <if condition="no line of <task-content/> matches the case-insensitive regex `^\s*#+\s*TASK\b` AND <instruction/> is empty">
        Set <instruction><task-content/></instruction> (set instruction to task content).
        Set <task-content></task-content> (set task content to empty).
        Set <task-content-dirty>true</task-content-dirty>.
        Do not output anything.
        </if>

    5.  <if condition="<task-content/> is empty AND <instruction/> is not empty">
        <expand name="generate-plan"/>

        Only output the following <template/> and continue processing:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **instruction given**
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan generated**
        </template>
        </if>

3.  **Iterative Plan Refinement Loop:**

    *REPEAT* the following steps from 3.1 up to and including 3.4 in
    a *LOOP* until the user selects `DONE`, `GRILL`, `IMPLEMENT`, or
    `DRAFT`, or declines/cancels in the dialog of step 3.4:

    1.  *Update timestamp*:
        <if condition="<task-content-dirty/> is 'true'">
        Update <timestamp-modified/> with the current time in
        ISO-style format, which has to be determined by calling the
        `ase_timestamp(format: "yyyy-LL-dd HH:mm")` tool of the `ase`
        MCP server and using the `text` field of its response. If the
        frontmatter of <task-content/> carries a `Modified:` key *and*
        the refinement changed the "body" (not only frontmatter keys or
        attachments), update it with the new <timestamp-modified/>
        value, as the key tracks "body" changes only. Then set the
        `Modified:` key of every attachment block *touched* by the
        refinement (see `apply-refinement`) to the very same
        <timestamp-modified/> value -- *creating* the key at its position
        in the key order of the plan <format/> if the block does not
        carry it yet -- and forget the touched marks again, so a changed
        attachment never falls behind the frontmatter.
        Do not output anything.
        </if>

    2.  *Persist plan*:
        <if condition="<task-content-dirty/> is 'true'">
        Call the `ase_task_save(id: "<ase-task-id/>", text:
        "<task-content/>", render: true)` tool of the `ase` MCP server to
        persist the current plan -- <task-content/> always is the
        *authoring form* of the plan and hence is persisted *as is* --
        and then set <task-content-dirty>false</task-content-dirty>
        again. This `ase_task_save` MCP tool call is the *only*
        permitted way to persist the plan -- *NEVER* write the plan
        file via `Write`/`Edit` or by executing a shell command.
        Finally, set <task-render/> to the `text` *output* field
        of this `ase_task_save` tool call -- the rendering-prepared form
        of the just-persisted plan, which is for *display only* and
        *MUST NOT* be confused with the `text` *argument* passed into
        that call -- so the rendering in step 3.3 stays consistent across
        all loop rounds. Do not output anything related to this MCP tool
        call except the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan saved**
        </template>
        </if>

    3.  *Render plan*:
        <if condition="<task-render/> is empty">
        Call the `ase_markdown_prepare(text: "<task-content/>")` tool of
        the `ase` MCP server and set <task-render/> to the `text` output
        field of this tool call. Do not output anything related to this
        MCP tool call.
        </if>

        Treat <task-render/> as *verbatim* Markdown.

        For the *rendering only*, drop the leading *frontmatter* block --
        both `---` delimiters and all of their keys -- and instead place
        the following column-aligned glyph lines *before* the
        `#   TASK: <title/>` heading, separated from it by an empty line,
        omitting the line of every key absent from the frontmatter and
        always omitting the `Type` key. The glyph lines *MUST* stay
        *above* the heading, exactly where the frontmatter block sits in
        the plan file, and *MUST NOT* be moved below it. This keeps the
        `---` delimiters from rendering as a horizontal rule plus a
        *setext heading*. This rewrite is *display-only* and *MUST NOT*
        change <task-render/> or <task-content/> itself:

        <format>
        ◉   **Id:**        <task-id/>
        ⎈   **Created:**   <timestamp-created/>
        ⚙   **Modified:**  <timestamp-modified/>
        ⊞   **Group:**     <task-group/>
        ◷   **Phase:**     <task-phase/>
        ⇢   **After:**     <task-after/>
        ◐   **Status:**    <task-status/>
        ☯   **Kind:**      <task-kind/>
        ⚑   **Tags:**      <task-tags/>
        ⇤   **Source:**    <task-source/>
        ⇢   **Changeset:** <task-changeset/>
        ⇥   **Target:**    <task-target/>
        </format>

        Only output the following <template/>, so the user
        can read the plan and react to it. If <task-render/> is longer
        than 90 lines and the backmatter contains an attachment block
        with the `Type` key value `text/x-diff; charset=utf-8; kind="draft"` (the
        implementation draft from `ase-task-implement --draft`), replace the entire payload of the `Data`
        key of this attachment block with `[...]`. Else, do *not*
        truncate, summarize, or partially show the plan. Use the
        following <template/>:

        <template>
        <ase-tpl-head title="TASK" subtitle="<task-id/>"/>
        <task-render/>
        <ase-tpl-foot title="TASK" subtitle="<task-id/>"/>
        </template>

        <if condition="the backmatter of <task-content/> contains an attachment
            block with the `Type` key value `text/x-diff; charset=utf-8; kind="draft"`
            which is *stale* according to the plan <format/> (its `Modified` key
            is absent or older than the `Modified` key of the frontmatter)">
        Directly *after* this <template/>, only output the following
        <template/> and then give the corrective hint by expanding the
        subsequent construct (which, depending on the configured
        <ase-guidance-level/>, may expand into nothing and hence emit
        no output at all):

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ WARNING: implementation draft attachment is **stale** (older than the plan)
        </template>

        <ase-tpl-hint level="minimal">
        Run `/ase-task-implement --draft` again to re-create the implementation draft for the changed plan, as `/ase-task-integrate --draft` refuses a stale draft.
        </ase-tpl-hint>
        </if>

    4.  *Determine next step*:

        -   If <getopt-option-next/> is not equal to `none`:
            Treat <getopt-option-next/> as a comma-separated chronological
            list of pre-selected next-step tokens. *Split* it on `,`,
            take the *first* token as <head/>, and store the remaining
            tokens (joined back with `,`, or `none` if empty) into
            <getopt-option-next/> so subsequent loop iterations or
            downstream skills can consume the tail.

            -   If <head/> matches the regex `^(DONE|GRILL|IMPLEMENT|DRAFT)$`:
                Honor the pre-selected token.
                Set <result><head/></result>.

                Set <instruction></instruction> (clear the instruction, as
                any instruction carried in via the arguments was already
                applied to the plan in step 2 before this loop), so that a
                later `OTHER: <text/>` refinement correctly starts from a
                *fresh* refinement instruction below.

            -   else:
                Only output the following <template/> and then immediately
                *STOP* processing the entire current skill:

                <template>
                ⧉ **ASE**: ☻ skill: **ase-task-edit**, ▶ ERROR: invalid `--next` token: **<head/>**
                </template>

        -   If <getopt-option-next/> is equal to `none`:

            In the following, you *MUST* *NOT* use your built-in
            <user-dialog-tool/> tool! Instead, you *MUST* just show a
            custom dialog according to the expanded `custom-dialog`
            definition. You *MUST* closely follow this definition:

            <expand name="custom-dialog" arg1="--other">
                Next Step: How would you like to proceed with the plan?
                DONE: Mark plan finalized, exit planning loop.
                GRILL: Hand off plan to grilling.
                DRAFT: Hand off plan to implementation drafting.
                IMPLEMENT: Hand off plan to implementation.
            </expand>

        Check the tool <result/> and dispatch accordingly:

        -   If <result/> is `DONE`:

            *Break* out of the *loop*, only output the following <template/>
            and then *STOP*. Do *not* implement the plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan finalized -- done**
            </template>

        -   If <result/> is `GRILL`:

            *Break* out of the *loop*.
            <expand name="handoff-args"/>
            Only output the following <template/> and then call the
            `Skill(skill: "ase:ase-task-grill", args: "<args/>")` tool
            to *grill* the finalized plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan finalized -- hand-off to grilling**
            </template>

        -   If <result/> is `DRAFT`:

            *Break* out of the *loop*.
            <expand name="handoff-args"/>
            Set <args><args/> --draft</args>. Only output the following
            <template/> and then call the
            `Skill(skill: "ase:ase-task-implement", args: "<args/>")` tool
            to *draft* the implementation of the finalized plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan finalized -- hand-off to implementation draft**
            </template>

        -   If <result/> is `IMPLEMENT`:

            *Break* out of the *loop*.
            <expand name="handoff-args"/>
            Only output the following <template/> and then call the
            `Skill(skill: "ase:ase-task-implement", args: "<args/>")` tool
            to *apply* the finalized plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan finalized -- hand-off to implementation**
            </template>

        -   If <result/> matches `OTHER: <text/>`:

            Set <instruction><text/></instruction> (replace existing instruction).

            <expand name="apply-refinement"/>

            Finally, only output the following <template/> and then
            *continue* the *loop* at step **3.1**!

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇌ instruction: **<instruction/>**, ▶ status: **plan refined**
            </template>

        -   If <result/> is `CANCEL`:

            *Break* out of the *loop*, only output the following <template/>
            and then *STOP*. Do *not* implement the plan.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan refinement cancelled**
            </template>


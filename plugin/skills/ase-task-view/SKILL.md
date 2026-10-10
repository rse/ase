---
name: ase-task-view
argument-hint: "[--help|-h] [--full|-f] [<id>]"
description: >
    View current or given task plan.
    Use when the user calls to "view", "show" or "see" the
    "task", "plan", "spec", or "specification".
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-task-view">
View a Task Plan
</purpose>

<expand name="getopt"
    arg1="ase-task-view"
    arg2="--full|-f">
    $ARGUMENTS
</expand>

<objective>
*View* the task plan.
</objective>

Procedure
---------

1.  **Determine Task:**

    1.  Set <id><getopt-arguments/></id> initially, with any leading and trailing
        whitespace stripped.
        Inherit the always existing <ase-task-id/> from the current context.
        Do not output anything.

    2.  <if condition="<id/> is empty">
        Set <id><ase-task-id/></id>
        Do not output anything.
        </if>

    3.  <if condition="<id/> does NOT match the regexp `^[a-zA-Z0-9#][a-zA-Z0-9#_-]*$`">
        Only output the following <template/> and then immediately
        *STOP* processing the entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-task-view**, ▶ ERROR: expected single `[<id>]` argument
        </template>
        </if>

2.  **Perform Operation**:

    1.  Call the `ase_task_load(id: "<id/>", variant: "render")` tool
        of the `ase` MCP server to load the task plan content in its
        *rendering-prepared* form -- this skill is *display-only* and
        hence never persists the plan again -- and set <text/> to the
        `text` output field of this `ase_task_load` tool call. Do not
        output anything related to this MCP tool call.

        -   If <text/> starts with `ERROR:` or `WARNING:`:
            Set <task-content></task-content> (set task content to empty).
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<id/>**, ▶ status: **<text/>**
            </template>

        -   If <text/> starts NOT with `ERROR:` and NOT with `WARNING:`:
            Set <task-content><text/></task-content> (set task content to text).
            Only output the following <template/>:

            <template>
            ⧉ **ASE**: ◉ task: **<id/>**, ▶ status: **plan loaded**
            </template>

    2.  <if condition="<task-content/> is not empty">
        Treat <task-content/> as *verbatim* Markdown.

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
        change <task-content/> itself:

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

        *Render plan*: Only output the following <template/>. If
        <getopt-option-full/> is *not* `true`, <task-content/> is longer than
        90 lines, and the backmatter contains an attachment block with the
        `Type` key value `text/x-diff; charset=utf-8; kind="draft"` (the implementation
        draft from `ase-task-implement --draft`), replace the
        entire payload of the `Data` key of this attachment block with
        `[...]`. Else, do *not* truncate, summarize, or partially show the
        plan. Use the following <template/>:

        <template>
        <ase-tpl-head title="TASK" subtitle="<task-id/>"/>
        <task-content/>
        <ase-tpl-foot title="TASK" subtitle="<task-id/>"/>
        </template>

        <if condition="the backmatter of <task-content/> contains an attachment
            block with the `Type` key value `text/x-diff; charset=utf-8; kind="draft"`
            which is *stale*, i.e. its `Modified` key is absent or older
            than the `Modified` key of the frontmatter">
        Directly *after* this <template/>, only output the following
        <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<task-id/>**, ▶ WARNING: implementation draft attachment is **stale** (older than the plan)
        </template>
        </if>
        </if>

    3.  Finally, give the closing hints by expanding the following (which,
        depending on the configured <ase-guidance-level/>, may each
        expand into nothing and hence emit no output at all):

        <if condition="<task-content/> is not empty">
        <ase-tpl-hint level="normal">
        Use `/ase-task-edit` or `/ase-task-grill` to refine this plan, `/ase-task-implement --draft` to draft its implementation, `/ase-task-implement` to realize it, and `/ase-task-integrate` to deliver it.
        </ase-tpl-hint>

        <if condition="<getopt-option-full/> is not equal `true` and the payload of the implementation draft attachment block was replaced with `[...]`">
        <ase-tpl-hint level="verbose">
        Use `/ase-task-view --full` to show the elided implementation draft attachment, too.
        </ase-tpl-hint>
        </if>

        <if condition="the implementation draft attachment block was reported as *stale* above">
        <ase-tpl-hint level="minimal">
        Run `/ase-task-implement --draft` again to re-create the implementation draft for the changed plan, as `/ase-task-integrate --draft` refuses a stale draft.
        </ase-tpl-hint>
        </if>
        </if>
        <else>
        <ase-tpl-hint level="normal">
        No plan exists under this task id -- use `/ase-task-list` to see the available tasks and `/ase-task-edit` to create a plan.
        </ase-tpl-hint>
        </else>


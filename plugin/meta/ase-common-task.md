
Task Skill Common Steps
=======================

<define name="task-react-id">

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

3.  <elseif condition="<instruction/> is NOT empty">
    The argument is neither empty nor a valid task id. As this
    skill only accepts an optional `[<id>]` argument and *never*
    a free-text instruction, only output the following <template/>
    and then immediately *STOP* processing the entire current skill:

    <template>
    ⧉ **ASE**: ☻ skill: **<arg1/>**, ▶ ERROR: expected single `[<id>]` argument
    </template>

    Directly *after* this error <template/>, and *before* stopping,
    give the corrective hint by expanding the following (which,
    depending on the configured <ase-guidance-level/>, may expand into
    nothing and hence emit no output at all):

    <ase-tpl-hint level="verbose">
    Run `/<arg1/> --help` for the accepted arguments of this skill, or use `/ase-help-intent` to have a fitting command proposed for a free-text intent.
    </ase-tpl-hint>
    </elseif>

</define>

<define name="task-load-content">

<if condition="
    <getopt-option-int-reuse-task/> is equal `true`
    *and* an `ase_task_save(id: '<ase-task-id/>', ...)` tool call
    exists earlier in the current session
">
    Set <text/> to the `text` *argument* of the most recent
    `ase_task_save(id: '<ase-task-id/>', ...)` tool call -- this is
    the *authoring form* of the plan and *MUST NOT* be confused
    with the `text` *output* field of that call -- *without*
    calling `ase_task_load` again. Set <status>plan
    reused</status>. Do not output anything.
</if>
<else>
    Call the `ase_task_load(id: "<ase-task-id/>")` tool of the
    `ase` MCP server to load the current task plan content in its
    *authoring form* -- the `variant` argument defaults to `source`
    -- and set <text/> to the `text` output field of this
    `ase_task_load` tool call. Do not output anything related to
    this MCP tool call. Set <status>plan loaded</status>.
</else>

-   If <text/> starts with `ERROR:` or `WARNING:`:
    Set <task-content></task-content> (set task content to empty).

-   If <text/> does NOT start with `ERROR:` and NOT with `WARNING:`:
    Set <task-content><text/></task-content> (set task content to text).

Only output the following <template/>:

<template>
⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **<status/>**
</template>

</define>

<define name="task-ground-plan">

Before deriving any plan content from the <instruction/>, *ground* the
plan in the *current state* of the project, instead of deriving it from
the <instruction/> alone. Do not output anything during this grounding.

1.  Call the `ase_artifact_list(kind: [ "spec", "code", "infr" ])` tool
    of the `ase` MCP server *once* and read the returned `artifacts`
    array of `{ kind, files }` objects to obtain the project-relative
    file lists of the **Artifact Set**s `SPEC` (specification), `CODE`
    (source code), and `INFR` (infrastructure, like build, deployment,
    and operations configuration).

2.  From these file lists, determine the files which the <instruction/>
    *affects* or *depends on* -- the specification parts it touches or
    which constrain it, the source code modules, interfaces, and symbols
    it changes or uses, and the build, lint, test, packaging, and
    deployment configuration it relies on -- and *read* them. Read only
    the relevant files (or their relevant parts), not all files, but
    always consider all three **Artifact Set**s.

3.  Build a precise understanding of the *current state* and the
    *conventions* of the project (structure, naming, coding style, build,
    lint, and test procedures) from them.

Then derive the plan from this grounding, where:

-   the `##  SPECIFICATION (WHAT)` bullet-points are *consistent* with the
    existing specification, and explicitly state any intended deviation
    from it,
-   the `##  DESIGN (HOW)` bullet-points name the *actual* files, modules,
    interfaces, symbols, and configuration items to change, and place new
    ones according to the existing structure and conventions, instead of
    naming hypothetical ones,
-   the `##  VERIFICATION (WHEN)` bullet-points (if any) refer to the
    *actual* build, lint, and test procedures of the project, and
-   if a `CHANGELOG.md` file exists in the project (or in any affected
    sub-package), the `##  DESIGN (HOW)` section *MUST* include an
    explicit `IMP` bullet-point describing the addition of a
    corresponding new entry to that `CHANGELOG.md` file, aligned with
    its existing style and conventions.

</define>

<define name="task-save-content">

Update <timestamp-modified/> with the current time in ISO-style
format, which has to be determined by calling the
`ase_timestamp(format: "yyyy-LL-dd HH:mm")` tool of the `ase`
MCP server and using the `text` field of its response. If
<timestamp-created/> is still unset (because the plan content
had no `Created:` frontmatter key), set
<timestamp-created><timestamp-modified/></timestamp-created>
(fall back to the modified timestamp). Re-insert the current
<ase-task-id/>, the original <timestamp-created/>, and the
refreshed <timestamp-modified/> into the frontmatter keys `Id:`,
`Created:`, and `Modified:` of <task-content/>.

Call the `ase_task_save(id: "<ase-task-id/>", text:
"<task-content/>")` tool of the `ase` MCP server to save the task
plan content in its *authoring form*. This `ase_task_save` MCP
tool call is the *only* permitted way to persist the task plan --
you *MUST* *NEVER* write the plan file via `Write`/`Edit` or by
executing a shell command. Do not output anything
related to this MCP call except the following <template/>:

<template>
⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **<arg1/>**
</template>

</define>

<define name="task-next-select">

-   If <getopt-option-next/> is not equal to `none`:
    Treat <getopt-option-next/> as a comma-separated chronological
    list of pre-selected next-step tokens. *Split* it on `,`,
    take the *first* token as <head/>, and store the remaining
    tokens (joined back with `,`, or `none` if empty) into
    <getopt-option-next/> so downstream skills can consume the tail.

    -   If <head/> matches the regex `^(<arg2/>)$`:
        Honor the pre-selected token.
        Set <result><head/></result>.

    -   else:
        Only output the following <template/> and then immediately
        *STOP* processing the entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **<arg1/>**, ▶ ERROR: invalid `--next` token: **<head/>**
        </template>

-   Else, i.e. <getopt-option-next/> was *originally* equal to `none`:

    In the following, you *MUST* *NOT* use your built-in
    <user-dialog-tool/> tool! Instead, you *MUST* just show a
    custom dialog according to the expanded `custom-dialog`
    definition. You *MUST* closely follow this definition:

    <expand name="custom-dialog" arg1="--no-other">
        <content/>
    </expand>

</define>

<define name="task-next-handoff">

Set <args>--int-reuse-task</args>.
<if condition="<getopt-option-next/> is not equal `none`">
    Set <args><args/> --next <getopt-option-next/></args>
</if>
<if condition="<arg3/> is given and not empty">
    Set <args><args/> <arg3/></args>
</if>
Only output the following <template/> and then call the tool
`Skill(skill: "ase:<arg1/>", args: "<args/>")` to invoke the
`ase:<arg1/>` skill to continue with the updated plan. Immediately
stop processing the current skill once the `Skill` tool was used.

<template>
⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **<arg2/>**
</template>

</define>

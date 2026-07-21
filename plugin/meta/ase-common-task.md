
Task Skill Common Steps
=======================

<define name="task-react-id">

1.  <if condition="
        <instruction/> matches the regexp `^[a-zA-Z][a-zA-Z0-9_-]*$`
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
        <id/> matches the regexp `^[a-zA-Z][a-zA-Z0-9_-]*$` and
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
    </elseif>

</define>

<define name="task-load-content">

<if condition="
    <getopt-option-int-reuse-task/> is equal `true`
    *and* a `ase_task_save(id: '<ase-task-id/>', ...)` tool call
    exists earlier in the current session
">
    Set <text/> to the `text` argument of the most recent
    `ase_task_save(id: '<ase-task-id/>', ...)` tool call,
    *without* calling `ase_task_load` again. Set <status>plan
    reused</status>. Do not output anything.
</if>
<else>
    Call the `ase_task_load(id: "<ase-task-id/>")` tool of the
    `ase` MCP server to load the current task plan content and
    set <text/> to the `text` output field of this `ase_task_load`
    tool call. Do not output anything related to this MCP tool
    call. Set <status>plan loaded</status>.
</else>

-   If <text/> starts with `ERROR:` or `WARNING:`:
    Set <task-content></task-content> (set task content to empty).
    Set <words/> to "0".

-   If <text/> starts NOT with `ERROR:` and NOT with `WARNING:`:
    Set <task-content><text/></task-content> (set task content to text).
    Calculate the number of words <words/> of <task-content/>.

Only output the following <template/>:

<template>
⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **<status/>**
</template>

</define>

<define name="task-save-content">

Update <timestamp-modified/> with the current time in ISO-style
format, which has to be determined by calling the
`ase_timestamp(format: "yyyy-LL-dd HH:mm")` tool of the `ase`
MCP server and use the `text` field of its response. If
<timestamp-created/> is still unset (because the plan content
had no `Created:` line), set
<timestamp-created><timestamp-modified/></timestamp-created>
(fall back to the modified timestamp). Re-insert the current
<ase-task-id/>, the original <timestamp-created/>, and the
refreshed <timestamp-modified/> into <task-content/> and calculate
the number of words <words/> of <task-content/>.

Call the `ase_task_save(id: "<ase-task-id/>", text:
"<task-content/>")` tool of the `ase` MCP server to save the task
plan content. Do not output anything related to this MCP call
except the following <template/>:

<template>
⧉ **ASE**: ◉ task: **<ase-task-id/>**, ✪ plan: **<words/>** words, ▶ status: **<arg1/>**
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

-   If <getopt-option-next/> is equal to `none`:

    In the following, you *MUST* *NOT* use your built-in
    <user-dialog-tool/> tool! Instead, you *MUST* just show a
    custom dialog according to the expanded `custom-dialog`
    definition. You *MUST* closely follow this definition:

    <expand name="custom-dialog" arg1="--no-other">
        <content/>
    </expand>

</define>

---
name: ase-task-dashboard
argument-hint: "[--help|-h] [--web|-w] [<number>]"
description: >
    Show the task dashboard: all task plans in the lanes of the configured
    task lifecycle model, with sticky display numbers, or open the web dashboard.
    Use when the user wants to see the "dashboard", "board", "lanes", or "kanban"
    of the tasks, or refers to a task by its dashboard number (e.g. "open 7").
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-task-dashboard">
Show the Task Dashboard
</purpose>

<expand name="getopt"
    arg1="ase-task-dashboard"
    arg2="--web|-w">
    $ARGUMENTS
</expand>

<objective>
*Show* the *task dashboard* of the current project, open its *web* variant,
or *resolve* a dashboard *display number* to its task.
</objective>

Procedure
---------

1.  Set <instruction><getopt-arguments/></instruction>, with any leading
    and trailing whitespace stripped. Do not output anything.

2.  <if condition="<instruction/> is not empty and does NOT match the regexp `^[1-9][0-9]*$`">
    Only output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-task-dashboard**, ▶ ERROR: expected an optional display `<number>`, got: **<instruction/>**
    </template>
    </if>

3.  <if condition="<instruction/> is not empty">
    Resolve the display number by running the command
    `ase dashboard --resolve <instruction/>` (taken exactly as given) and
    capturing its standard output, with surrounding whitespace stripped,
    into <id/>.

    -   If the command fails, only output the following <template/> and
        then immediately *STOP* processing the entire current skill:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-task-dashboard**, ▶ ERROR: no task with display number **<instruction/>**
        </template>

    -   Otherwise, only output the following <template/> and then call the
        tool `Skill(skill: "ase:ase-task-view", args: "<id/>")` to show the
        plan of the resolved task. Immediately stop processing the current
        skill once the `Skill` tool was used.

        <template>
        ⧉ **ASE**: ◉ task: **<id/>**, ▶ status: **display number <instruction/> resolved**
        </template>
    </if>

4.  <if condition="<getopt-option-web/> is equal `true`">
    Run the command `ase dashboard --web` (taken exactly as given), which
    starts the ASE service of the project if necessary, opens the web
    dashboard in the browser, and prints its URL. Capture the standard
    output, with surrounding whitespace stripped, into <url/>. If the
    command fails, set <url/> to the first line of its error output and
    only output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-task-dashboard**, ▶ ERROR: web dashboard failed: **<url/>**
    </template>

    Otherwise, only output the following <template/> and then *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: ◉ dashboard: **<url/>**, ▶ status: **web dashboard opened**
    </template>
    </if>

5.  Run the command `ase dashboard --text` (taken exactly as given) and
    capture its standard output into <board/>. As the agent tool offers no
    interactive terminal, this plain text rendering stands in for the
    interactive terminal dashboard. If the command fails, set <board/> to
    the first line of its error output and only output the following
    <template/> and then immediately *STOP* processing the entire current
    skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-task-dashboard**, ▶ ERROR: dashboard failed: **<board/>**
    </template>

    Otherwise, output the following <template/>, reproducing <board/>
    *verbatim*:

    <template>
    ⧉ **ASE**: ◉ dashboard:

    ```text
    <board/>
    ```

    </template>

6.  Finally, give the closing hints by expanding the following (which,
    depending on the configured <ase-guidance-level/>, may each expand
    into nothing and hence emit no output at all):

    <ase-tpl-hint level="normal">
    Use `/ase-task-dashboard <number>` to open a task by its display number, or type `! ase dashboard` for the interactive terminal dashboard.
    </ase-tpl-hint>

    <ase-tpl-hint level="verbose">
    Use `/ase-task-dashboard --web` to open the live web dashboard in the browser.
    </ase-tpl-hint>


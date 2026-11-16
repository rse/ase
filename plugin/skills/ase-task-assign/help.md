
##  NAME

`ase-task-assign` - Assign a Task Plan

##  SYNOPSIS

`ase-task-assign`
    [`--help`|`-h`]
    [*id*`:`] *assignee*

##  DESCRIPTION

The `ase-task-assign` skill assigns a *task plan* to an *assignee*, i.e.
sets its `Assignee:` frontmatter key, leaving its `Modified:` key alone,
as that key tracks changes of the plan
body only. Additionally, it *accounts* the *AI usage* of the session onto
the task:

-   Assigning the task to *oneself* (`me` or the current user id) opens
    the *usage window* of the task, or attaches the session to an already
    open one (e.g. of a previous session). From then on, all turns of the
    session are accounted: the AI request time, the cache read, cache
    write, input, and output tokens, and the costs, as reported by the
    agent tool via *OpenTelemetry* to the ASE service, plus, in addition,
    the human time (the whole real time of the window, as the engineer
    costs money even while waiting for the AI) and its costs at the
    hourly rate of the assignee in `telemetry.prices.hr` (default: 110 USD).

-   Assigning the task to *anybody else*, or to *nobody* with `none`
    (removing the `Assignee:` key), *gives it back*: it closes the usage
    window and, after a grace period of 10 seconds for late telemetry,
    adds the accumulated usage to the usage attachment of the task
    (`Type: application/yaml; kind="usage"`), whose YAML data carries the
    amounts `time: { ai, hr, real }` (minutes), `token: { cread, cwrite,
    input, output }` (counts), and `cost: { ai, hr }` (USD). Each
    booking *adds* to the existing amounts, atomically, so concurrent
    changes of the task (e.g. by the agents of `ase agent`) are never lost.

A usage window also closes and books when its last session *ends*, and
when the `Assignee:` of the task is changed *elsewhere* (e.g. on the task
board) while the task is the current task of the session. Conversely,
changing the `Assignee:` of a task to oneself *elsewhere* (e.g. on the
task board) opens its usage window, too, and attaches every session of
the project whose current task it is (also a session switching to it,
or starting with it, later on), with the window starting *paused*, i.e.,
accounting from the next AI request of its sessions on. An *unassigned*
task is even accounted *implicitly*, without any assignment: while it is
the current task of a session, the session is attached to its usage
window in the same way, until the session switches to another task, the
task gets assigned to anybody else, or the session ends (configurable via
`telemetry.implicit`, default: `true`, never for task `default`), so
explicitly assigning a task to oneself is needed only for claiming it,
e.g. against the agents of `ase agent`. Long windows
additionally book every `telemetry.service.interval` minutes (default: 10).
Without any AI request for `telemetry.service.idle` minutes (default: 30),
a usage window *pauses*, and the next AI request (of any kind, not just
ASE skills) silently *resumes* it, so forgetting a task assigned to
oneself does not account an idle session endlessly. A usage window without
any AI request for 7 days is closed and booked.

The accounting is *opt-in*: it requires the configuration key
`telemetry.enabled` to be `true` (via `ase config set telemetry.enabled
true`) and the telemetry export of the agent tool to be activated once
via `ase setup telemetry activate --tool` *tool*, otherwise only the
assignee is set and a `NOTICE` is reported. If *id*`:` is omitted, the *current* task id
(inherited from the session context) is used, otherwise, on a successful
assignment to *oneself*, the current task id of the session is switched
to *id*.

##  ARGUMENTS

-   *id*`:`:
    The unique identifier of the task plan, with a trailing colon.
    If omitted, the current task id is used.

-   *assignee*:
    The assignee: `me` for oneself, `none` for nobody, or any other
    name of a human or agent. If the configuration key `project.users`
    lists the known users, a name which is neither one of them nor the
    name of an agent present at the agent relay is still assigned, but
    reported with a `NOTICE`.

##  SCENARIOS

-   You start working on a task and want its AI usage tracked
-   You hand a task over to a colleague or an agent, booking your usage
-   You want to know the AI time, tokens, and costs spent on a task

##  EXAMPLES

Take the current task plan and track the AI usage of the session:

```text
❯ /ase-task-assign me
```

Take a specific task plan:

```text
❯ /ase-task-assign hello: me
```

Give the task plan back to a colleague, booking the AI usage:

```text
❯ /ase-task-assign alice
```

Unassign the task plan, booking the AI usage:

```text
❯ /ase-task-assign hello: none
```

##  SEE ALSO

[`ase-task-status`](../ase-task-status/help.md), [`ase-task-id`](../ase-task-id/help.md), [`ase-task-view`](../ase-task-view/help.md),
[`ase-task-list`](../ase-task-list/help.md).


##  NAME

`ase-task-status` - Configure Task Status

##  SYNOPSIS

`ase-task-status`
    [`--help`|`-h`]
    [*id*`:`] [*status*]

##  DESCRIPTION

The `ase-task-status` skill gets or sets the *lifecycle status* of a
*task plan*, i.e. its `Status:` frontmatter key, via the
`ase_task_status` MCP tool. Without a *status* argument, it reports the
current status of the plan (defaulting to the initial state of the task
lifecycle model if the plan carries no `Status:` key). With a *status*
argument, it sets the status of the plan, leaving its `Modified:` key
alone, as that key tracks changes of the plan body only.

The *status* is matched case-insensitively against the states of the
task lifecycle model configured for the project via
`project.task.lifecycle` (`solo`, `team`, or `enterprise`) and rejected
if it is no such state. A status not reachable from the current one via
one or more transitions of the state machine of the model is *rejected*,
too.

If *id*`:` is omitted, the *current* task id (inherited from the session
context) is used. A single bare token which is no state of the model is
also taken as the task id. The current task id of the session is never
switched.

##  ARGUMENTS

-   *id*`:`:
    The unique identifier of the task plan, with a trailing colon.
    If omitted, the current task id is used.

-   *status*:
    The lifecycle status to set, one of the states of the configured
    task lifecycle model (case-insensitive). If omitted, the current
    status is reported.

##  SCENARIOS

-   You want to know the lifecycle status of the current or a given task plan
-   You want a task plan closed, shelved, cancelled, or re-opened
-   You want a task plan moved into a certain lifecycle state by hand

##  EXAMPLES

Show the status of the current task plan:

```text
❯ /ase-task-status
```

Show the status of a specific task plan:

```text
❯ /ase-task-status hello:
```

Close the current task plan (`solo` lifecycle model):

```text
❯ /ase-task-status closed
```

Shelve a specific task plan:

```text
❯ /ase-task-status hello: SHELVED
```

##  SEE ALSO

[`ase-task-list`](../ase-task-list/help.md), [`ase-task-id`](../ase-task-id/help.md), [`ase-task-view`](../ase-task-view/help.md),
[`ase-task-implement`](../ase-task-implement/help.md), [`ase-task-delete`](../ase-task-delete/help.md).

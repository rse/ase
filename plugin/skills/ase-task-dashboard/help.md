
##  NAME

`ase-task-dashboard` - Show the Task Dashboard

##  SYNOPSIS

`ase-task-dashboard`
    [`--help`|`-h`]
    [`--web`|`-w`]
    [*number*]

##  DESCRIPTION

The `ase-task-dashboard` skill shows all task plans of the current
project in the *lanes* of the configured task lifecycle model, by calling
`ase dashboard --text`. The lanes are grouped by the phases of the model
and the finished states form a final group `Done`: the `solo` model
shows *Work in Progress* and *Done*, the `team` model *Planning*,
*Implementation*, and *Done*, and the `enterprise` model *Planning*,
*Implementation*, *Approval*, *Integration*, and *Done*. Within a group,
the entry state comes first, the active state second, and the parking
state last. The lane layout follows `project.task.lifecycle` and cannot
be configured otherwise.

Every card carries a *sticky display number*, which a task keeps as long
as it exists. With a *number* argument, the skill resolves that number to
its task and shows the task plan via `ase-task-view`, so a task seen on
the dashboard can be referred to in conversation (e.g. `open 7`).

The dashboard is *read-only*: it never changes a task. The interactive
terminal dashboard is available via `ase dashboard` in a terminal, and
the live web dashboard via `--web`, both following every change of the
task plans, including edits in an external editor.

##  OPTIONS

-   `--web`|`-w`:
    Start the ASE service of the project if necessary, serve the web
    dashboard through it, and open it in the browser.

-   *number*:
    Resolve the given display number of a card to its task and show the
    task plan.

##  SCENARIOS

-   You want an overview of all tasks in their lifecycle lanes
-   You want to open a task by its dashboard number
-   You want the live web dashboard in the browser

##  EXAMPLES

Show the lane overview of all task plans:

```text
❯ /ase-task-dashboard
```

Show the task plan with display number 7:

```text
❯ /ase-task-dashboard 7
```

Open the web dashboard in the browser:

```text
❯ /ase-task-dashboard --web
```

##  SEE ALSO

[`ase-task-list`](../ase-task-list/help.md), [`ase-task-view`](../ase-task-view/help.md),
[`ase-task-status`](../ase-task-status/help.md).

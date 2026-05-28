
##  NAME

`ase-task-edit` - Iteratively Edit a Task Plan

##  SYNOPSIS

`ase-task-edit`
    [`--help`|`-h`]
    [`--plan`|`-p` *option*]
    [`--next`|`-n` *option*]
    [*id* | *id*: *instruction* | *instruction*]

##  DESCRIPTION

The `ase-task-edit` skill establishes and refines a *task plan* purely
through a *chat-driven loop*. The user steers each round via an
interactive dialog that offers continued refinement, finalization, or
hand-off to implementation or preflight.

The task plan is stored in `.ase/tasks/`*id*`/plan.md` files of the
project and can be alternatively edited with the "`ase task edit` *id*"
command from outside the agent tool.

##  OPTIONS

`--plan`|`-p` *option*:
    Automatically answer the user dialog for the plan refinement
    with *option*, which can be either `none` (default, interactive
    answer required), `OVERWRITE` (overwrite an existing plan
    with *instruction*), `REFINE` (refine the existing plan with
    *instruction*), or `PRESERVE` (preserve the existing plan by
    ignoring *instruction* and stopping skill processing).

`--next`|`-n` *option*:
    Automatically answer the user dialog for the next step (at the end
    of this skill) with *option*, which can be either `none` (default,
    interactive answer required), `DONE` (no next step), `IMPLEMENT`
    (hand-over to `ase-task-implement`), `PREFLIGHT` (hand-over to
    `ase-task-preflight`), or `REFINE` (refine the plan with subsequent
    instruction).

##  ARGUMENTS

*id* | *id*: *instruction* | *instruction*:
    Edit the task with the unique identifier *id* (default: `default`).
    Optionally, *instruction* either gives instructions for creating a
    new task or gives instructions for refining an existing task.

##  EXAMPLES

Edit the current task:

```text
❯ /ase-task-edit
```

Create a new task under id `hello`:

```text
❯ /ase-task-delete hello
❯ /ase-task-edit hello: new "ase hello" CLI command which prints
  a nice "Hello World!" to the terminal in color blue.
```

Further refine the task under id `hello`:

```text
❯ /ase-task-edit hello: change the color to red.
```

##  SEE ALSO

`ase-task-reboot`, `ase-task-preflight`, `ase-task-implement`,
`ase-task-view`, `ase-task-list`, `ase-task-rename`, `ase-task-delete`.

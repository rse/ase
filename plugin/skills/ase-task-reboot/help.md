
##  NAME

`ase-task-reboot` - Reboot a Task Plan

##  SYNOPSIS

`ase-task-reboot`
    [`--help`|`-h`]
    [`--next`|`-n` *option*[,...]]
    [*id*]

##  DESCRIPTION

The `ase-task-reboot` skill re-creates an existing task plan *from
scratch* by extracting the `DOM` and `IFC` bullet points of the
`SPECIFICATION (WHAT)` section (if present) from the current plan,
using them as the new instruction, re-deriving the `DESIGN (HOW)` and
`VERIFICATION (WHEN)` sections grounded in the relevant specification
(`SPEC`), source code (`CODE`), and infrastructure (`INFR`) files of the
project (naming the actual files and symbols to change, the actual build,
lint, and test procedures, and a `CHANGELOG.md` entry if such a file
exists), preserving the original creation
timestamp, the remaining frontmatter keys, and all attachments, and
writing fresh plan content via `ase_task_save`. As the rebooted plan
starts its lifecycle anew, its `Status:` key is reset to the default
state of the task lifecycle model, all `grilled:` tags are dropped
from its `Tags:` key, and its `Source:`, `Changeset:`, and `Target:`
keys are dropped, so they read as their configured defaults
`project.task.default.{source,changeset,target}`.

A plan which does *not* follow the task format (or carries no `DOM` or
`IFC` bullet point) is rebooted from its entire body instead: all of
its existing content is *filed* into the `SPECIFICATION (WHAT)`,
`DESIGN (HOW)`, and `VERIFICATION (WHEN)` sections by classifying
each statement as a `DOM`, `IFC`, `ARC`, `IMP`, `REG`, or `CON` bullet
point, with no statement dropped and missing bullet points derived from
the existing content.

After the reboot, the user is asked whether to stop or hand off to
`ase-task-edit` or `ase-task-implement` (optionally with `--draft`),
unless `--next` pre-selects this choice.

##  OPTIONS

-   `--next`|`-n` *option*[,...]:
    Automatically answer the user dialog for the next step. *option*
    is a single token or a *comma-separated chronological list* of
    tokens; the *first* token is consumed by this skill, and any
    remaining tokens are *forwarded* (via `--next`) to the downstream
    skill so an entire pipeline can be pre-scripted in one shot.
    Recognized tokens at this skill: `none` (default, interactive
    answer required), `DONE` (stop), `EDIT` (hand off to
    `ase-task-edit`), `IMPLEMENT` (hand off to `ase-task-implement`),
    or `DRAFT` (hand off to `ase-task-implement --draft`). Example:
    `--next EDIT,DONE` reboots, hands off to editing, and the editing
    loop will exit immediately.

##  ARGUMENTS

-   *id*:
    The unique identifier of the task whose plan should be rebooted.
    If omitted, the *current* task id is used.

##  SCENARIOS

-   You want a task plan re-created from scratch
-   You want a fresh plan from the original specification
-   You want planning restarted after a plan degraded
-   You want a free-form or legacy plan filed into the task format

##  EXAMPLES

Reboot the current task plan:

```text
❯ /ase-task-reboot
```

Reboot a specific task and hand off to editing:

```text
❯ /ase-task-reboot --next EDIT hello
```

##  SEE ALSO

[`ase-task-edit`](../ase-task-edit/help.md), [`ase-task-implement`](../ase-task-implement/help.md),
[`ase-task-view`](../ase-task-view/help.md), [`ase-task-delete`](../ase-task-delete/help.md).

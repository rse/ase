
##  NAME

`ase-task-view` - View a Task Plan

##  SYNOPSIS

`ase-task-view`
    [`--help`|`-h`]
    [`--full`|`-f`]
    [*id*]

##  DESCRIPTION

The `ase-task-view` skill renders the *task plan* identified by *id*.
The plan is loaded via the `ase_task_load` MCP tool and shown framed
between a `( TASK )` header and footer rule. If *id* is omitted, the
*current* task id (inherited from the session context) is used.

By default, when the plan is longer than 90 lines and its backmatter
contains an implementation draft attachment (an attachment block of
type `text/x-diff; charset=utf-8; kind="draft"`, produced by
`ase-task-implement --draft`), the payload of that attachment is
collapsed to `[...]` to keep the view compact. The `--full`|`-f` option
suppresses this collapsing and renders the plan in full, without any
truncation or summarization.

An implementation draft attachment whose `Modified:` key is absent or
older than the `Modified:` key of the plan frontmatter is *stale*, as
the plan changed after the draft was created. Such a draft is reported
with a warning after the rendering, together with a hint that
`ase-task-implement --draft` has to be run again, as
`ase-task-integrate --draft` refuses a stale draft.

The frontmatter keys `Source:`, `Changeset:`, and `Target:` are
rendered as well, stating where the change set of the plan is
created from, stored in, and delivered to.

##  OPTIONS

-   `--full`|`-f`:
    Render the plan in full, without collapsing the implementation
    draft attachment. By default, its payload is replaced with `[...]`
    for plans longer than 90 lines.

##  ARGUMENTS

-   *id*:
    The unique identifier of the task plan to view. If omitted,
    the current task id is used.

##  SCENARIOS

-   You want the current or a given task plan shown
-   You want a plan rendered before deciding the next steps
-   You want a plan inspected including its implementation draft

##  EXAMPLES

View the current task plan:

```text
❯ /ase-task-view
```

View a specific task plan:

```text
❯ /ase-task-view hello
```

View a plan in full, including its implementation draft attachment:

```text
❯ /ase-task-view --full hello
```

##  SEE ALSO

[`ase-task-list`](../ase-task-list/help.md), [`ase-task-edit`](../ase-task-edit/help.md), [`ase-task-id`](../ase-task-id/help.md),
[`ase-task-rename`](../ase-task-rename/help.md), [`ase-task-delete`](../ase-task-delete/help.md).

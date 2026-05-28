
##  NAME

`ase-task-list` - List Task Plans

##  SYNOPSIS

`ase-task-list`
    [`--help`|`-h`]
    [`--verbose`|`-v`]

##  DESCRIPTION

The `ase-task-list` skill lists all available *task ids* in the
current project by calling the `ase_task_list` MCP tool. In the
default mode, only the task ids are rendered as a single-column
Markdown table. In verbose mode, the last-modified timestamp of
each task plan is rendered as an additional column.

##  OPTIONS

`--verbose`|`-v`:
    Render an additional `Last Modified` column with the
    `YYYY-MM-DD HH:MM` timestamp of each task plan.

##  EXAMPLES

List all task ids:

```text
❯ /ase-task-list
```

List all task ids together with their last-modified timestamps:

```text
❯ /ase-task-list --verbose
```

##  SEE ALSO

`ase-task-id`, `ase-task-view`, `ase-task-edit`,
`ase-task-rename`, `ase-task-delete`.

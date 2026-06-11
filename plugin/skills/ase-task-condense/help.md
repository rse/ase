
##  NAME

`ase-task-condense` - Condense a Task Plan

##  SYNOPSIS

`ase-task-condense`
    [`--help`|`-h`]
    [`--next`|`-n` *option*[,...]]
    [*id*]

##  DESCRIPTION

The `ase-task-condense` skill *compresses* the wording of an existing
task plan to make it require as little reading as possible, while
keeping *all semantics fully preserved and unchanged*. It loads the
current (or given) plan, applies a self-contained, telegrapher-like
"remove-fluff" ruleset to the *free-text* parts only (the `**WHAT**` /
`**WHY**` prose and each bullet's specification text), and writes the
shorter plan back via `ase_task_save`.

The plan *structure* is never altered: all headings, section markers,
`- **<aspect>**:` bullet labels, code spans, technical terms, file
paths, numbers, and severities are kept exactly. Only genuinely
redundant bullets may be merged, and a shortening that would change
meaning is always rejected in favor of the longer wording. The condense
ruleset *overrides* the active session persona, so the plan is compressed
telegrapher-like even under the `writer` persona.

The plan is saved *only* when condensing actually makes it smaller; if no
further reduction is possible, the plan is left untouched (including its
`⚙   Modified:` timestamp) and reported as *already condensed*.

After condensing, the user is asked whether to stop or hand off to
`ase-task-edit`, `ase-task-implement`, or `ase-task-preflight`, unless
`--next` pre-selects this choice.

##  OPTIONS

`--next`|`-n` *option*[,...]:
    Automatically answer the user dialog for the next step. *option*
    is a single token or a *comma-separated chronological list* of
    tokens; the *first* token is consumed by this skill, and any
    remaining tokens are *forwarded* (via `--next`) to the downstream
    skill so an entire pipeline can be pre-scripted in one shot.
    Recognized tokens at this skill: `none` (default, interactive
    answer required), `DONE` (stop), `EDIT` (hand off to
    `ase-task-edit`), `IMPLEMENT` (hand off to `ase-task-implement`),
    or `PREFLIGHT` (hand off to `ase-task-preflight`). Example: `--next
    EDIT,DONE` condenses, hands off to editing, and the editing loop will
    exit immediately.

##  ARGUMENTS

*id*:
    The unique identifier of the task whose plan should be condensed.
    If omitted, the *current* task id is used.

##  EXAMPLES

Condense the current task plan:

```text
❯ /ase-task-condense
```

Condense a specific task and hand off to editing:

```text
❯ /ase-task-condense --next EDIT hello
```

##  SEE ALSO

`ase-task-edit`, `ase-task-reboot`, `ase-task-view`,
`ase-task-rename`, `ase-task-delete`.

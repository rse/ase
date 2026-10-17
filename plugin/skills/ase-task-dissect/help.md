
##  NAME

`ase-task-dissect` - Dissect a Task Plan

##  SYNOPSIS

`ase-task-dissect`
    [`--help`|`-h`]
    [`--max-parts`|`-m` *count*]
    [`--dry`|`-d`]
    [`--force`|`-f`]
    [*task-id*[`:`]]
    [*dissect-hint*]

##  DESCRIPTION

The `ase-task-dissect` skill treats an existing task plan as an *epic*
and *dissects* it domain-wise and logically into *cohesive parts*. Each
part is a self-contained unit of work with a single coherent purpose, so
it can be implemented, reviewed, and committed entirely on its own.

The dissection follows a strict ruleset: at least *2* and at most
*count* parts are derived, *every* bullet point of the epic's
`##  SPECIFICATION (WHAT)`, `##  DESIGN (HOW)`, and
`##  VERIFICATION (WHEN)` sections is assigned to *exactly one* part,
mutually dependent bullet points are kept together, and
nothing beyond the epic's own content is invented. A bullet point which
itself covers *multiple* domains is *split* into fragments, which are
then assigned individually -- together they still reproduce the original
bullet point completely and without duplication. The cut follows the
*semantics*, not the technical structure -- a split by file, directory,
or technical layer is usually *not* the intended one. If the epic
carries only a single cohesive purpose, it is reported as *not
dissectable* and nothing is created.

An optional *dissect-hint* steers *how* the epic is split -- which
bullet points belong together, along which axis to cut, or how many
parts to aim at. It is especially useful after a `--dry` run showed an
unintended dissection. The hint overrides the default grouping, but
never the ruleset itself.

The derived parts are first reported as a *dissection table* (part
number, sub-task id, scope, and rationale). Then -- unless `--dry` is
given -- each part is materialized as its own *complete* sub-task plan
(with its own `##  SPECIFICATION (WHAT)`, `##  DESIGN (HOW)`, and
`##  VERIFICATION (WHEN)` sections) and persisted under the task id
`<task-id>-<feature-slug>`.

The parts are placed via their `Group:` and `After:` frontmatter keys.
If the task already is a *member* of an epic (its `Group:` names another
task), the parts join this very epic and *replace* the task: every other
task listing it in its `After:` key is re-wired to the final parts, and
the task itself is deleted. Otherwise the task *becomes* the explicit
epic of its parts: its `Group:` key is set to its own id, so it comes
after all of its parts. In both cases, each part lists the parts it
depends on in its `After:` key, and the first parts inherit the `After:`
predecessors of the task. The body of the task is never edited.

##  OPTIONS

-   `--max-parts`|`-m` *count*:
    Upper bound for the number of derived parts (default: `8`). The
    lower bound is always `2`, because fewer parts are no dissection.

-   `--dry`|`-d`:
    *Report only* -- print the dissection table but create *no*
    artifacts at all, so the decision stays fully reversible. Note that
    this meaning differs from `--dry`/`-d` in `ase-code-craft`, where it
    instead omits the `##  VERIFICATION (WHEN)` section of the composed plan.

-   `--force`|`-f`:
    Overwrite already existing sub-task plans. Without this option, the
    skill detects colliding sub-task ids *before* writing anything,
    reports them, and stops with status *targets exist*.

##  ARGUMENTS

-   *task-id*:
    The unique identifier of the task whose plan should be dissected.
    If omitted, the *current* task id is used. A *lone* argument
    matching the task id syntax is always taken as the *task id*, never
    as a hint; to combine both, separate them with a `:` character, as
    in `auth: split by API and UI`.

-   *dissect-hint*:
    A free-text hint telling *how* the epic should be split. If omitted,
    the parts are derived from the plan alone.

##  SCENARIOS

-   You want a large task plan split into cohesive sub-tasks
-   You want an epic decomposed into independently implementable parts
-   You want a preview of how a plan would be divided
-   You want each part of a plan persisted as its own separate plan

##  EXAMPLES

Dissect the current task plan:

```text
❯ /ase-task-dissect
```

Preview the dissection of a specific task into at most three parts:

```text
❯ /ase-task-dissect --dry --max-parts 3 auth
```

Re-dissect a task, overwriting the previously created sub-task plans:

```text
❯ /ase-task-dissect --force auth
```

Dissect the current task plan along an explicitly given axis:

```text
❯ /ase-task-dissect keep the meta file with the skills, docs separate
```

Dissect a specific task plan with a hint:

```text
❯ /ase-task-dissect auth: one part per authentication provider
```

##  SEE ALSO

[`ase-repo-dissect`](../ase-repo-dissect/help.md), [`ase-task-edit`](../ase-task-edit/help.md), [`ase-task-condense`](../ase-task-condense/help.md),
[`ase-task-implement`](../ase-task-implement/help.md), [`ase-task-list`](../ase-task-list/help.md), [`ase-task-delete`](../ase-task-delete/help.md).

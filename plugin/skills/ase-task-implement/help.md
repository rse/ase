
##  NAME

`ase-task-implement` - Implement a Task Plan

##  SYNOPSIS

`ase-task-implement`
    [`--help`|`-h`]
    [`--next`|`-n` *option*[,...]]
    [`--worktree`|`-w`]
    [*id*]

##  DESCRIPTION

The `ase-task-implement` skill performs the *final implementation* of
a task plan by modifying the corresponding *artifacts* with a complete
*change set*. The plan is loaded and any optional implementation draft
(an attachment block of type `text/x-diff; charset=utf-8; kind="preflight"` in the plan's
backmatter, produced by `ase-task-preflight`) is taken over *1:1* as the
change set -- the draft is assumed to be user-reviewed, so no fresh
implementation is created and only parts which actually fail are
adjusted, guided by the plain plan content. A *stale* draft -- one
whose `Modified:` key is absent or older than the `Modified:` key of
the plan frontmatter, as the plan changed after the draft was created
-- stops the skill with an error before any artifact is touched, so
`ase-task-preflight` has to be run again (or the attachment removed)
first. Afterwards the checkboxes
of the realized `DOM`/`IFC`/`ARC`/`IMP` bullet-points and of the
performed and succeeded `REG`/`CON` bullet-points are ticked to `[x]`
(or `[/]` if only partially realized or succeeded), refreshing the
plan's `Modified:` key and stamping the consumed draft with the same
value so it does not turn stale, and the plan's
`Status:` key becomes the implemented state of the task lifecycle model
(`CLOSED` for `solo`, `IMPLEMENTED` for `team` and `enterprise`) if the
change set was applied completely and successfully. Bullet-points in
state `[-]` (cancelled) or `[>]` (deferred) are *skipped*: they are
neither realized nor checked, do not count against completeness, and
keep their checkbox untouched.

The *kind of change* stated by the plan's `Kind:` frontmatter key
(`SPECIFYING`, `CRAFTING`, `REFACTORING`, or `RESOLVING`) selects which
*operation-specific tenet set* of the **ASE Tenets** is internalized
before any artifact is touched, in addition to the always applying
**GENERIC TENETS**. If a plan carries no such key, the kind is
*inferred* from the plan content, defaulting to `CRAFTING`.

If the task plan deliberately *omits* the `##  VERIFICATION (WHEN)` section
(as produced by `ase-code-craft`, `ase-code-refactor`,
`ase-code-resolve`, or `ase-task-edit` when invoked with `--dry`),
the entire verification phase is strictly skipped: no build, tests,
linter, type-checker, or program execution is performed once the
source files have been modified.

Two orthogonal controls decide *where* the change set lands. The
plan's `Branch:` frontmatter key selects the *branch*: if it is
absent, is the literal `current`, or equals the currently checked-out
branch, the checked-out branch is used; otherwise the named branch is
used, *checked out* if it already exists and *created* from `HEAD`
otherwise. The `--worktree`|`-w` option selects the *working copy*:
without it, the change set is applied to the *current* working copy
-- which, for a differing `Branch:`, is *switched* to that branch in
place first, but only if it has *no* uncommitted changes, otherwise
the skill stops and touches nothing. With it, a *Git WorkTree*
`.ase/worktree/<id>` -- named by the unique *task id*, so it stays
tied to the very task plan implemented in it -- is created *before*
any artifact is touched, carrying the `Branch:` branch, or -- as the
checked-out branch cannot be checked out a second time -- an *implied*
branch named by the task id, which is then recorded in the plan's
`Branch:` key. The entire implementation -- including all
verification runs -- then happens *inside* that worktree, which is
left *uncommitted*. If the worktree directory already exists, the
skill stops and touches nothing. As a freshly created branch starts
at `HEAD`, *uncommitted* changes of the current working copy are
*not* carried over into it.

The implementation runs to *completion*: the skill never concludes
while any point of the plan is still unimplemented, neither because the
change set grew large nor because an open question stands in the way.
Undecided details and defensible alternatives are therefore *decided by
the skill itself*, guided by the surrounding artifacts and the
internalized tenets, instead of interrupting the run with a question.
Once the change set is applied, the run closes with up to two boxed
summaries: `OPEN POINTS` lists everything now waiting for the user --
points left unimplemented on a *genuine blocker* no assumption can
bridge, follow-ups deliberately left out of scope with their reason,
and results needing review -- and `DECISIONS` lists each decision the
skill took on its own together with its rationale, so it can be
revisited or overruled. Either box is omitted entirely when it has no
content; a run which implemented every point and decided nothing on its
own emits no box at all.

After implementation, the user is asked whether to preserve or
delete the task plan, unless `--next` pre-selects this choice.

##  OPTIONS

-   `--next`|`-n` *option*[,...]:
    Automatically answer the user dialog for the next step. *option*
    is a single token or a *comma-separated chronological list* of
    tokens; the *first* token is consumed by this skill, and any
    remaining tokens are intentionally *discarded*, because the
    downstream `ase-task-delete` skill accepts no `--next` option.
    Recognized tokens at this skill: `none` (default, interactive
    answer required), `DONE` (preserve task plan and stop), or
    `DELETE` (hand off to `ase-task-delete`).

-   `--worktree`|`-w`:
    Apply the change set inside the dedicated *Git WorkTree*
    `.ase/worktree/<id>`, derived from the *task id*, instead of the
    current working copy. The worktree carries the branch named by the
    plan's `Branch:` key, or an equally named branch `<id>` created
    from `HEAD` if the plan targets the checked-out branch. If the
    worktree directory already exists, the skill stops and touches
    nothing. By default, the change set is applied to the current
    working copy.

##  ARGUMENTS

-   *id*:
    The unique identifier of the task whose plan should be
    implemented. If omitted, the *current* task id is used.

##  SCENARIOS

-   You want a task plan turned into actual changes
-   You want the planned change set applied and verified
-   You want a reviewed implementation draft applied 1:1
-   You want the change set to land on the branch named by the plan
-   You want the implementation isolated in a Git worktree

##  EXAMPLES

Implement the current task plan:

```text
❯ /ase-task-implement
```

Implement a specific task and delete the plan when done:

```text
❯ /ase-task-implement --next DELETE hello
```

Implement the task `hello`, whose plan carries `Branch: feature-hello`,
in place on the branch `feature-hello`, switching the (clean) working
copy to it first:

```text
❯ /ase-task-implement hello
```

Implement the task `hello` inside the isolated Git WorkTree
`.ase/worktree/hello`, on the branch named by its plan or on the
implied branch `hello`:

```text
❯ /ase-task-implement --worktree hello
```

##  SEE ALSO

[`ase-task-edit`](../ase-task-edit/help.md), [`ase-task-preflight`](../ase-task-preflight/help.md), [`ase-task-reboot`](../ase-task-reboot/help.md),
[`ase-task-view`](../ase-task-view/help.md), [`ase-task-delete`](../ase-task-delete/help.md).


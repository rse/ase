
##  NAME

`ase-task-edit` - Iteratively Edit a Task Plan

##  SYNOPSIS

`ase-task-edit`
    [`--help`|`-h`]
    [`--plan`|`-p` *option*]
    [`--mode`|`-m` `auto`|`craft`|`refactor`|`resolve`|`specify`]
    [`--approach`|`-a`]
    [`--unverified`|`-u`]
    [`--focus`|`-f` *section*[,...]]
    [`--quiet`|`-q`]
    [`--interactive`|`-i`]
    [`--next`|`-n` *option*[,...]]
    [*id* | *id*: *instruction* | *instruction* | *issue-id*]

##  DESCRIPTION

The `ase-task-edit` skill establishes and refines a *task plan* purely
through a *chat-driven loop*. The user steers each round via an
interactive dialog that offers continued refinement, finalization, or
hand-off to implementation or draft. It covers the planning of all
kinds of change: crafting a new feature, refactoring the code base,
resolving a problem, and specifying.

A newly generated plan is grounded in the relevant specification
(`SPEC`), source code (`CODE`), and infrastructure (`INFR`) files of the
project: it names the actual files and symbols to change, the actual
build, lint, and test procedures, and a `CHANGELOG.md` entry if such a
file exists.

Before a new plan is generated, the skill determines its *kind of
change* (stored in the `Kind:` key of the plan) and internalizes the
corresponding tenets (for example KISS, YAGNI, and DRY for crafting,
or Surgical Changes and Origin Proximity for resolving). For a
resolution, it first reports the `PROBLEM CONTEXT` and `PROBLEM
DETAILS`. Under `--approach`, it then proposes one or more *approaches*
with pros and cons, recommends one of them, and lets the user pick the
preferred one via an interactive dialog, and the new plan is then
composed along the chosen approach.

If the current task is `default` and a new plan is generated from an
*instruction*, a new task id is allocated from the instruction
according to the task id scheme of the project, so the plan does not
end up under `default`.

Attachments in the plan's backmatter are never removed by a refinement.
A refinement which changes an attachment refreshes the attachment's
`Modified:` key; a refinement which changes the plan body refreshes the
`Modified:` key of the frontmatter (which tracks body changes only, so
a refinement of frontmatter keys alone leaves it untouched); both use
the same value. An implementation draft (an attachment block of type
`text/x-diff; charset=utf-8; kind="draft"`, produced by
`ase-task-implement --draft`) whose `Modified:` key is absent or older
than the frontmatter's is *stale*: it is reported with a warning after
each rendering of the plan, together with a hint that
`ase-task-implement --draft` has to be run again to re-create the
draft for the changed plan, as `ase-task-integrate --draft` refuses a
stale draft.

##  OPTIONS

-   `--plan`|`-p` *option*:
    Automatically answer the user dialog for the plan refinement
    with *option*, which can be either `none` (default, interactive
    answer required), `OVERWRITE` (overwrite an existing plan
    with *instruction*), `REFINE` (refine the existing plan with
    *instruction*), or `PRESERVE` (preserve the existing plan by
    ignoring *instruction* and stopping skill processing).

-   `--mode`|`-m` `auto`|`craft`|`refactor`|`resolve`|`specify`:
    Select the kind of change of the plan: `craft` (`CRAFTING`),
    `refactor` (`REFACTORING`), `resolve` (`RESOLVING`), or `specify`
    (`SPECIFYING`). It selects the tenets internalized when the plan is
    generated or refined and sets the `Kind:` key of the plan, also on
    a refinement. The default `auto` infers the kind of a new plan from
    the *instruction*, uses `RESOLVING` for an *issue-id* (also on a
    refinement), and otherwise leaves the `Kind:` key of an existing
    plan as it is and honors its tenets.

-   `--approach`|`-a`:
    Before a new plan is composed, propose one or more crafting,
    refactoring, resolution, or specification approaches with pros and
    cons, recommend one of them, and let the user pick the preferred one
    via an interactive dialog (or, under the `black` project boxing or
    in headless mode, automatically pick the recommended one). The new
    plan is then composed along the chosen approach. Without
    `--approach`, no approaches are determined at all.

-   `--unverified`|`-u`:
    Generate any *new* plan *without* the `##  VERIFICATION (WHEN)` section.
    Applies only to freshly generated plans, not to existing plans
    loaded from disk. When `ase-task-implement` later applies such
    a plan, it strictly skips the entire verification phase (no
    build, tests, linter, type-checker, or program execution) once
    the source files have been modified.

-   `--focus`|`-f` *section*[,...]:
    Edit and show only the given plan *section*(s). Each *section* is
    one of `SPECIFICATION` (also `SPEC` or `WHAT`), `DESIGN` (also `DES`
    or `HOW`), or `VERIFICATION` (also `VERIFY`, `VER`, or `WHEN`),
    matched case-sensitively, or the sentinel `all` (default). The shown
    plan consists only of these sections, including their headings, but
    without the frontmatter and the title.

    The rest of the plan stays the context, and an *instruction* requiring a
    change outside of the focus is applied nevertheless and reported by
    a warning. A new plan gets all section headings, but only the focused
    sections are populated, and `OVERWRITE` re-generates only them. An
    unknown, empty, or duplicate *section* token aborts the skill. It is
    forwarded on a hand-off to `ase-task-grill`, but not on a hand-off
    to another skill.

-   `--quiet`|`-q`:
    Do not print the resulting plan at the end of a planning round. The
    status lines, the dialogs, and the warning on a stale implementation
    draft stay. It is forwarded on a hand-off to `ase-task-grill`, but
    not on a hand-off to another skill.

-   `--interactive`|`-i`:
    Show the plan in a band above the prompt (*Anthropic Claude Code CLI* with
    active ASE function hooks in an interactive terminal only, else the skill
    aborts), instead of printing it, and ask for the next step without any
    dialog. The band takes 75% of the terminal height, in the fullscreen mode
    all the rows the terminal UI leaves it. Under `--focus`, it shows only the
    focused sections.

    The band follows every change of the plan, also by others, and keeps its
    scroll position. Its line numbers are those of the plan text in `ase task
    edit`. It shows the last change as a unified diff with colored backgrounds and
    line numbers, red for removed and blue for added lines. In the fullscreen
    mode, scroll it with the mouse wheel, or with *CTRL+x* *TAB* and then
    *PageUp*/*PageDown*.

    At the prompt, type either a refinement instruction, or one of `DONE`,
    `GRILL`, `DRAFT`, `IMPLEMENT`, or `CANCEL` (in any case), which closes the
    band. After a hand-off to `ase-task-grill`, a hand-off back reopens it.

-   `--next`|`-n` *option*[,...]:
    Automatically answer the user dialog for the next step (at the end
    of this skill). *option* is a single token or a *comma-separated
    chronological list* of tokens; each iteration of the planning
    loop consumes the *first* token of the list, and on hand-off
    (`IMPLEMENT` / `DRAFT`) any remaining tokens are *forwarded*
    (via `--next`) to the downstream skill so an entire pipeline can
    be pre-scripted in one shot. Recognized tokens at this skill:
    `none` (default, interactive answer required), `DONE` (no next
    step), `GRILL` (hand-over to `ase-task-grill`), `DRAFT`
    (hand-over to `ase-task-implement --draft`), or `IMPLEMENT` (hand-over to
    `ase-task-implement`). Example: `--next GRILL,DONE` hands the plan
    off to grilling and forwards `DONE` so grilling exits without asking.

##  ARGUMENTS

-   *id* | *id*: *instruction* | *instruction* | *issue-id*:
    Edit the task with the unique identifier *id* (default: the current
    task). Optionally, *instruction* either gives instructions for
    creating a new task or gives instructions for refining an existing
    task. Instead, a bare *issue-id* (like `P1`, `T1`, or
    `<prefix>-P1`), previously reported by `ase-code-analyze` or
    `ase-arch-analyze`, uses the description of this issue as the
    *instruction* (also as *id*: *issue-id*), and the issue is removed
    once the plan is saved. If no such issue exists, *issue-id* is
    treated as a task *id* resp. as an *instruction*.

##  SCENARIOS

-   You want a task planned through chat-driven refinement
-   You want a plan created or refined round by round
-   You want approaches with pros and cons before a plan is composed
-   You want a plan to craft a feature, refactor code, or resolve a problem
-   You want an analyzer issue like `P1` turned into a plan
-   You want plan refinement with hand-off to draft or implementation

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

Plan the resolution of the analyzer issue `P1` along an interactively
chosen approach, and directly hand off to implementation:

```text
❯ /ase-task-edit --approach --next IMPLEMENT P1
```

Plan a refactoring under the id `cleanup`:

```text
❯ /ase-task-edit -m refactor cleanup: extract HTTP client into its own class
```

Refine and show only the `DESIGN` section of the task under id `hello`:

```text
❯ /ase-task-edit --focus HOW hello: print the text via a dedicated logger.
```

Refine the task under id `hello` with its plan shown in a band above the prompt:

```text
❯ /ase-task-edit --interactive hello
```

##  SEE ALSO

[`ase-code-edit`](../ase-code-edit/help.md), [`ase-spec-edit`](../ase-spec-edit/help.md), [`ase-task-grill`](../ase-task-grill/help.md),
[`ase-task-reboot`](../ase-task-reboot/help.md), [`ase-task-implement`](../ase-task-implement/help.md),
[`ase-task-view`](../ase-task-view/help.md), [`ase-task-list`](../ase-task-list/help.md), [`ase-task-rename`](../ase-task-rename/help.md), [`ase-task-delete`](../ase-task-delete/help.md).

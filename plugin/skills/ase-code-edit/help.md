
##  NAME

`ase-code-edit` - Edit Source Code

##  SYNOPSIS

`ase-code-edit`
    [`--help`|`-h`]
    [`--mode`|`-m` `auto`|`craft`|`refactor`|`resolve`]
    [`--grill`|`-g`]
    [`--grill-rounds`|`-r` *n*]
    [`--grill-until`|`-u` `MUST`|`SHOULD`|`MAY`]
    [`--verify`|`-v`]
    [`--worktree`|`-w` *name*[`:`*branch*]]
    [`--loop`|`-l`]
    [*query*]

##  DESCRIPTION

The `ase-code-edit` skill edits the code base *directly* from a *query*,
in one shot and without any task plan ceremony. It is a *plan-less*
fusion of `ase-code-craft`, `ase-code-refactor`, `ase-code-resolve`,
`ase-task-grill`, and `ase-task-implement`.

Each single-shot run (or each `--loop` iteration) walks through five
states: *querying* (take the *query* argument or ask for a query via an
interactive `Edit Query` dialog, and
split it into its domain-specific WHAT and its implementation-detail HOW
parts), *discovering* (read the source artifacts related to the query),
*grilling* (optionally stress-test the query with rounds of questions),
*implementing* (apply the change set in place, honoring the tenet set
selected via `--mode`), and *verifying* (optionally verify the
implementation until it passes). The *querying* state and every
*grilling* round close with an `EDIT TODO` box showing the established
`WHAT` and `HOW` information.

##  OPTIONS

-   `--mode`|`-m` `auto`|`craft`|`refactor`|`resolve`:
    Select the tenet set internalized for the implementation: `craft`
    (CRAFTING), `refactor` (REFACTORING), or `resolve` (RESOLVING).
    The default `auto` infers the tenet set from the query itself.

-   `--grill`|`-g`:
    Grill the query before implementing, similar to `ase-task-grill`:
    raise 1-10 questions per round which resolve the open points of the
    query. Each question carries a `FOCUS-AREA` -- `DOMAIN`
    (domain-specifics, must be clarified), `INTERFACE` (externally
    observable behavior or UI/API interfaces, must be clarified),
    `ARCHITECTURE` (structure, wiring, placement, or dependencies,
    should be clarified), `IMPLEMENTATION` (inner technical details,
    can be clarified), `REGRESSION` (what must not break, should be
    clarified), or `CONFIRMATION` (what proves the specified behavior,
    should be clarified) -- and a 1-2 word `TOPIC` hint. The questions
    of a round are sorted by descending focus area importance
    (`DOMAIN`, `INTERFACE`, `ARCHITECTURE`, `IMPLEMENTATION`,
    `REGRESSION`, `CONFIRMATION`).
    All questions of a round are announced together below a
    `GRILLING ROUND K/L` line (the announcement line and round numbering
    are omitted when only a single round is performed) as an
    `#`/`FOCUS ▶ TOPIC`/`QUESTION` table with one row per
    question, each row carrying two to four grounded answer alternatives
    (with the alternative reflecting the current understanding marked as
    `CURRENT`). They are then asked in *one* batch via a single
    interactive dialog titled `GRILLING ROUND K/L` (or plain `GRILLING`
    for a single round), whose question asks for the combined answer to
    all (or a subset) of the listed aspect questions and whose only
    answer options are the fixed `STOP SKILL` (stop the skill) and
    `SKIP GRILLING` (skip the remaining grilling) ones, plus free-text
    input. The questions are numbered `1`, `2`, etc. and their answer
    alternatives are lettered `A`, `B`, etc., so the free-text input can
    cherry-pick answers with short responses matching `\d+[a-zA-Z]`
    (like `1A 2c`), freely mixed with keyword text. The answers are
    merged back into the WHAT and HOW parts of the query. Without
    `--grill`, no questions are asked at all.

-   `--grill-rounds`|`-r` *n*:
    The *maximum* number of grill rounds to apply (default: `1`). Each
    round starts from scratch from only the current WHAT and HOW parts,
    forgetting all information of previous rounds, and closes with an
    `EDIT TODO` box. The grilling stops early -- announced by a
    `grilling finished early` status line -- once a round, even the
    first one, finds the open points clear enough according to
    `--grill-until`. Only effective together with `--grill`.

-   `--grill-until`|`-u` `MUST`|`SHOULD`|`MAY`:
    Grill until at least all open points of the given severity or
    higher are clear (default: `MUST`), where the severity follows from
    the focus area: `MUST` (`DOMAIN`, `INTERFACE`), `SHOULD`
    (`ARCHITECTURE`, `REGRESSION`, `CONFIRMATION`), and `MAY`
    (`IMPLEMENTATION`). Independent of this, every open point is rated
    with an individual impact (`HIGH`, `MEDIUM`, or `LOW`), which
    decides which points are raised as questions and in which order
    within a focus area. Only effective together with `--grill`.

-   `--verify`|`-v`:
    Verify whether the implementation fulfills the requirements, by
    running the available verification commands (build, tests, linter,
    type-checker) and adjusting the failing parts of the change set
    until the verification passes. Without `--verify`, strictly no
    verification is performed at all.

-   `--worktree`|`-w` *name*[`:`*branch*]:
    Apply the change sets inside the dedicated Git worktree
    `.ase/worktree/<name>` instead of the current working copy. The
    worktree is *reused* if it already exists -- then switched to
    *branch* if given and it has no uncommitted changes --, otherwise
    it is *created* with the branch *branch* (default: *name*),
    checked out if it exists or created from `HEAD` otherwise. One
    single worktree serves the whole skill run: it is prepared before
    the first discovery, so discovering, grilling, and implementing all
    operate on it, all `--loop` iterations land in it, and it is left
    uncommitted for review. If
    *name* is a bare lower-case word naming no existing worktree and a
    *query* follows (like `-w fix the crash`, a former boolean `-w`
    usage), the skill asks whether *name* is the worktree name or the
    first query word.

-   `--loop`|`-l`:
    Loop the whole state cycle: after each iteration, ask for the next
    edit query via the interactive `Edit Query` dialog and repeat, until
    the user answers with its fixed `STOP SKILL` option or cancels the
    dialog.

##  ARGUMENTS

-   *query*:
    Description of the edit to perform. When omitted, the skill asks
    for the query via an interactive `Edit Query` dialog, carrying the
    fixed `STOP SKILL` option plus free-text input.

##  SCENARIOS

-   You want the code base edited in one shot from a plain description
-   You want an analyzer issue like `P1` fixed directly without a plan
-   You want a quick change with optional grilling and verification
-   You want several edits chained in a loop, optionally in a worktree
-   You want the change set to land on a specific Git branch or worktree

##  EXAMPLES

Edit in one shot, without any questions or verification:

```text
❯ /ase-code-edit add a --verbose option to the CLI
```

Grill the query with two rounds first, then implement and verify:

```text
❯ /ase-code-edit -g -r 2 -v refactor the config loading into layers
```

Loop over multiple edits inside a dedicated Git worktree:

```text
❯ /ase-code-edit -l -w config-layers
```

Edit inside the dedicated Git worktree `.ase/worktree/verbose` on the
branch `feature-verbose`:

```text
❯ /ase-code-edit -w verbose:feature-verbose add a --verbose option to the CLI
```

##  SEE ALSO

[`ase-code-craft`](../ase-code-craft/help.md), [`ase-code-refactor`](../ase-code-refactor/help.md), [`ase-code-resolve`](../ase-code-resolve/help.md),
[`ase-task-grill`](../ase-task-grill/help.md), [`ase-task-implement`](../ase-task-implement/help.md).

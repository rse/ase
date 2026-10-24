
##  NAME

`ase-spec-edit` - Edit Specification

##  SYNOPSIS

`ase-spec-edit`
    [`--help`|`-h`]
    [`--approach`|`-a`]
    [`--grill`|`-g`]
    [`--grill-rounds`|`-r` *n*]
    [`--grill-until`|`-u` `MUST`|`SHOULD`|`MAY`]
    [`--grill-perspective`|`-p` *perspective*]
    [`--grill-ground`|`-G`]
    [`--verify`|`-v`]
    [`--worktree`|`-w` *name*[`:`*branch*]]
    [`--loop`|`-l`]
    [*query*]

##  DESCRIPTION

The `ase-spec-edit` skill edits the *SpecBook*-based specification
(`SPEC`) *directly* from a *query*, in one shot and without any task
plan ceremony. It is the specification-level counterpart of
`ase-code-edit` and a *plan-less* alternative to `ase-sync-import` and
`ase-sync-reconcile` whenever the specification has to be changed from a
plain description instead of from a foreign source or another artifact
kind.

Each single-shot run (or each `--loop` iteration) walks through five
states: *querying* (take the *query* argument or ask for a query via an
interactive `Edit Query` dialog, and split it into its domain-specific
WHAT and its implementation-detail HOW parts), *discovering* (resolve
the `SPEC` artifacts, read the *SpecBook* schema configuration of the
project, and read the specification artifacts related to the query),
*grilling* (optionally stress-test the query with rounds of questions),
*implementing* (optionally select an approach, then apply the change set
in place, honoring the GENERIC and SPECIFYING tenets and the `SPEC`
format contract), and *verifying* (optionally validate the specification
until it passes). The *querying* state, every *grilling* round, and the
approach selection close with an `EDIT TODO` box showing the established
`WHAT` and `HOW` information.

The change set stays strictly restricted to the `SPEC` artifacts -- the
artifact kinds `CODE`, `DOCS`, `TASK`, `INFR`, and `OTHR` are never
touched, except for an entry in an already existing `CHANGELOG.md`
file. Every generated artifact carries the current `Created:` and
`Modified:` timestamps, and every changed artifact gets its `Modified:`
timestamp refreshed.

##  OPTIONS

-   `--approach`|`-a`:
    Before applying the change set, propose one or more specification
    approaches with pros and cons, recommend one of them, and let the
    user pick the preferred one via an interactive dialog (or, under the
    `black` project boxing or in headless mode, automatically pick the
    recommended one). The chosen approach is merged into the HOW part of
    the query. Without `--approach`, no approaches are determined at
    all.

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
    should be clarified) -- and a 1-3 word `TOPIC` hint. The questions
    of a round are sorted by descending focus area importance
    (`DOMAIN`, `INTERFACE`, `ARCHITECTURE`, `IMPLEMENTATION`,
    `REGRESSION`, `CONFIRMATION`). Questions of focus area
    `REGRESSION` and `CONFIRMATION` are raised only together with
    `--verify`, as only then a verification honors their decisions.
    All questions of a round are announced together below a `GRILLING ROUND K/L` line (the round numbering is
    omitted when only a single round is performed) as a
    `QUESTION`/`ANSWERS`/`RECOMMENDATION` table with one row per
    question, preceded by a plain-language summary of the edit query,
    each row carrying two to three grounded answer alternatives (with
    the alternative reflecting the current understanding marked with
    `⚑` and the recommended alternative marked with `★`) and a brief
    rationale why the recommended alternative beats the others.
    They are then asked in *one* batch via a single interactive dialog,
    whose question asks for the combined answer to all (or a subset) of
    the listed questions and whose only answer options are the fixed
    `ACCEPT RECOMMENDATIONS` (accept the `★` answer of every question),
    `SKIP GRILLING` (skip the remaining grilling), and `STOP SKILL` (stop
    the skill) ones, plus free-text input. The questions are numbered
    `1`, `2`, etc. and their answer alternatives are lettered `A`, `B`,
    etc., so the free-text input can cherry-pick answers with short
    responses matching `\d+[a-zA-Z]` (like `1A 2c`), freely mixed with
    keyword text. The answers are merged back into the WHAT and HOW
    parts of the query. Without `--grill`, no questions are asked at
    all.

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

-   `--grill-perspective`|`-p` *perspective*:
    Grill exclusively from the logical *perspective* -- a keyword or
    short hint like `domain`, `performance`, or `security`. The
    perspective acts as an exclusive lens: only open points relevant from
    this perspective are raised as questions, while every question still
    carries its focus area, severity, and impact. The active perspective
    is shown in the announcement line, like `GRILLING (security)`.
    Without a perspective, the grilling is holistic. Only effective together with `--grill`.

-   `--grill-ground`|`-G`:
    Ground the grilling in facts instead of the world knowledge of the
    model alone: once before the first round, the artifacts of all kinds
    (`SPEC`, `CODE`, `DOCS`, `INFR`, and `OTHR`) are scanned for
    the project facts relevant to the grilled subject (from the given
    perspective, if any) and the Internet/Web is searched for the
    established practices, standards, patterns, and pitfalls about it.
    These facts serve all rounds, both for raising the questions and for
    preferably deriving their answer alternatives. The grounding is shown
    in the announcement line, like `GRILLING (security, grounded)`. If
    no usable facts are found, a warning is shown and the grilling falls
    back to model knowledge. Only effective together with `--grill`.

-   `--verify`|`-v`:
    Verify the edited specification by validating it via *SpecBook*
    linting and fixing the reported diagnostics in the affected `SPEC`
    artifacts, for at most three rounds. Any diagnostics remaining after
    the last round are listed as `REMAINING DIAGNOSTICS`. Without
    `--verify`, strictly no validation is performed at all.

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
    uncommitted for review. Under
    `--verify`, the validation then runs as the `ase spec lint` command
    inside the worktree. If *name* is a bare lower-case word naming no
    existing worktree and a *query* follows (like `-w fix the crash`, a
    former boolean `-w` usage), the skill asks whether *name* is the
    worktree name or the first query word.

-   `--loop`|`-l`:
    Loop the whole state cycle: after each iteration, ask for the next
    edit query via the interactive `Edit Query` dialog and repeat, until
    the user answers with its fixed `STOP SKILL` option or cancels the
    dialog.

##  ARGUMENTS

-   *query*:
    Description of the specification edit to perform. When omitted, the
    skill asks for the query via an interactive `Edit Query` dialog,
    carrying the fixed `STOP SKILL` option plus free-text input.

##  SCENARIOS

-   You want the specification edited in one shot from a description
-   You want `SPEC` changes without the task plan ceremony
-   You want the query stress-tested by grilling before the spec is edited
-   You want specification edits validated by SpecBook linting
-   You want the change set to land on a specific Git branch or worktree

##  EXAMPLES

Edit in one shot, without any questions or validation:

```text
❯ /ase-spec-edit add a Reviewer persona to the persona model
```

Grill the query with two rounds first, then edit and validate:

```text
❯ /ase-spec-edit -g -r 2 -v split the Event entity into Event and EventSeries
```

Let the user pick one of several specification approaches first, then
edit:

```text
❯ /ase-spec-edit -a model the access permissions of the personas
```

Grill the query exclusively from the domain perspective, grounded in
the project artifacts and the Internet/Web, then edit:

```text
❯ /ase-spec-edit -g -p domain -G add recurring events to the Event model
```

Loop over multiple specification edits inside a dedicated Git worktree:

```text
❯ /ase-spec-edit -l -w event-series
```

##  SEE ALSO

[`ase-spec-activate`](../ase-spec-activate/help.md), [`ase-spec-lint`](../ase-spec-lint/help.md), [`ase-code-edit`](../ase-code-edit/help.md), [`ase-sync-import`](../ase-sync-import/help.md),
[`ase-sync-reconcile`](../ase-sync-reconcile/help.md), [`ase-sync-export`](../ase-sync-export/help.md), [`ase-task-grill`](../ase-task-grill/help.md).

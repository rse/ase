
##  NAME

`ase-task-grill` - Iteratively Grill a Task Plan

##  SYNOPSIS

`ase-task-grill`
    [`--help`|`-h`]
    [`--rounds`|`-r` *n*]
    [`--until`|`-u` `MUST`|`SHOULD`|`MAY`]
    [`--focus`|`-f` *section*[,...]]
    [`--next`|`-n` *option*[,...]]
    [*id*]

##  DESCRIPTION

The `ase-task-grill` skill *relentlessly interviews* the user about
every *essential aspect* of an existing *task plan* until a *shared
understanding* is reached and no decisions or questions are left open.

The skill identifies the essential aspects of the plan and raises up to
10 questions per round which resolve its open points. Each question
carries a `FOCUS-AREA` -- `DOMAIN` (domain-specifics, must be
clarified), `INTERFACE` (externally observable behavior or UI/API
interfaces, must be clarified), `ARCHITECTURE` (structure, wiring,
placement, or dependencies, should be clarified), `IMPLEMENTATION`
(inner technical details, can be clarified), `REGRESSION` (what must
not break, should be clarified), or `CONFIRMATION` (what proves the
specified behavior, should be clarified) -- and a 1-3 word `TOPIC`
hint. The focus areas are selected by the plan sections under focus
(`--focus`): `SPECIFICATION` selects `DOMAIN` and `INTERFACE`, `DESIGN`
selects `ARCHITECTURE` and `IMPLEMENTATION`, and `VERIFICATION` selects
`REGRESSION` and `CONFIRMATION`. The questions are sorted
by descending focus area importance, then by descending individual
impact, and finally by the decision tree of their dependencies, so each
decision is asked after the decisions it depends on. It honors checks
for *fuzzy language*, *conflicting terminology*, *conflicting code*,
*non-concrete scenarios*, *unspecified architecture patterns*, and
*unspecified dependencies*.

As with `ase-code-edit --grill`, all questions of a round are announced
together below a `GRILLING ROUND K/L` line (plain `GRILLING` for a
single round) as a `QUESTION`/`ANSWERS` table with one row per
question, each row carrying two to three *grounded* answer alternatives
(the one reflecting the current plan marked with `⚑`). They are then
asked in *one* batch via a single interactive dialog, whose only answer
option is the fixed `SKIP GRILLING` (skip the remaining grilling, but
still update the plan with the answers of the previous rounds), plus
free-text input. The questions are numbered `1`, `2`, etc. and their
answer alternatives are lettered `A`, `B`, etc., so the free-text input
can cherry-pick answers with short responses matching `\d+[a-zA-Z]`
(like `1A 2c`), freely mixed with keyword text. A question not
addressed by the reply accepts its `⚑` answer, if one exists.
Cancelling the dialog stops the skill without updating the plan with
the current round. After every round, the plan is updated and
persisted, its `Tags:` frontmatter key records each grilled section as
its own tag `grilled:`*section* (lower-case, kept alongside the tags of
previously grilled sections, e.g. `grilled:specification,
grilled:design`), and a `PLAN CHANGES` box shows the bullet-points
changed by the round. Finally, the user is offered a hand-off to
editing, implementation, or draft.

The *open* questions are recorded in the checkboxes of the plan's
bullet-points: a bullet-point whose question stayed *unanswered*
(because the grilling was skipped, or the reply did not address a
question the plan offers no answer for) is marked `[?]`, an unanswered
question the plan does not cover yet is added as a new `[?]`
bullet-point, and an *answered* question resets its bullet-points to
`[ ]`. When a section is grilled *again* (its `grilled:`*section* tag
is already present), only its `[?]` bullet-points are re-asked, and a
section without any `[?]` bullet-point is skipped entirely. Bullet-points
in state `[-]` (cancelled) or `[>]` (deferred) are never questioned.

##  OPTIONS

-   `--rounds`|`-r` *n*:
    The *maximum* number of grill rounds to apply (default: `1`). Each
    round starts from scratch from only the current plan, as updated and
    saved by all previous rounds, and re-derives its questions from it,
    forgetting all questions and answers of previous rounds. With more than one
    round, each round is announced as `GRILLING ROUND K/L`. The grilling
    stops early -- announced by a `grilling finished early` status line
    -- once a round, even the first one, finds the open points clear
    enough according to `--until`.

-   `--until`|`-u` `MUST`|`SHOULD`|`MAY`:
    Grill until at least all open points of the given severity or
    higher are clear (default: `MUST`), where the severity follows from
    the focus area: `MUST` (`DOMAIN`, `INTERFACE`), `SHOULD`
    (`ARCHITECTURE`, `REGRESSION`, `CONFIRMATION`), and `MAY`
    (`IMPLEMENTATION`). Independent of this, every open point is rated
    with an individual impact (`HIGH`, `MEDIUM`, or `LOW`), which
    decides which points are raised as questions and in which order
    within a focus area.

-   `--focus`|`-f` *section*[,...]:
    Grill only the given plan *section*(s), in the given order. Each
    *section* is one of `SPECIFICATION` (abbreviated `SPEC`), `DESIGN`
    (abbreviated `DES`), or `VERIFICATION` (abbreviated `VER`), matched
    case-insensitively, or the sentinel `all` (default), which expands
    to `SPECIFICATION,DESIGN,VERIFICATION`. The questions are derived
    from the themes of the focused sections only, while the entire plan
    stays the context, and the answers may still update any section.
    An unknown, empty, or duplicate *section* token aborts the skill.

-   `--next`|`-n` *option*[,...]:
    Automatically answer the user dialog for the next step (at the end
    of this skill). *option* is a single token or a *comma-separated
    chronological list* of tokens; the *first* token is consumed by
    this skill and any remaining tokens are *forwarded* (via `--next`)
    to the downstream skill on hand-off so an entire pipeline can be
    pre-scripted in one shot. Recognized tokens at this skill: `none`
    (default, interactive answer required), `DONE` (no next step),
    `EDIT` (hand-over to `ase-task-edit`), `IMPLEMENT` (hand-over to
    `ase-task-implement`), or `DRAFT` (hand-over to
    `ase-task-implement --draft`).

##  ARGUMENTS

-   *id*:
    Grill the task with the unique identifier *id* (default: `default`).
    The skill accepts *only* an optional *id* argument and never a
    free-text instruction.

##  SCENARIOS

-   You want to be interviewed about your plan until it is watertight
-   You want the open decisions of a plan resolved question by question
-   You want fuzzy language and conflicts flushed out of a plan
-   You want shared understanding before the implementation starts

##  EXAMPLES

Grill the current task plan:

```text
❯ /ase-task-grill
```

Grill the task plan under id `hello`:

```text
❯ /ase-task-grill hello
```

Grill the current task plan in two rounds:

```text
❯ /ase-task-grill --rounds 2
```

Grill only the `DESIGN` and then the `SPECIFICATION` section of the
current task plan:

```text
❯ /ase-task-grill --focus DES,SPEC
```

Grill the current task plan and then hand off to editing:

```text
❯ /ase-task-grill --next EDIT
```

##  SEE ALSO

[`ase-task-edit`](../ase-task-edit/help.md), [`ase-task-reboot`](../ase-task-reboot/help.md),
[`ase-task-implement`](../ase-task-implement/help.md), [`ase-task-view`](../ase-task-view/help.md), [`ase-task-list`](../ase-task-list/help.md),
[`ase-task-rename`](../ase-task-rename/help.md), [`ase-task-delete`](../ase-task-delete/help.md), [`ase-code-edit`](../ase-code-edit/help.md).

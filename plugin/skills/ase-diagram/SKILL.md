---
name: ase-diagram
description: "Render diagrams via the `ase diagram` CLI. Use whenever a response needs a structural, control-flow, state, sequence, class, entity-relationship, or metrics diagram. Enforces Mermaid source via stdin, no hand-drawn ASCII frames, ≤120-char rendered width, and verbatim stdout reproduction in the response."
user-invocable: false
disable-model-invocation: false
effort: low
allowed-tools:
    - "Bash"
---

Render Diagrams
===============

Your role is to render *every* diagram in the current response through
the `ase diagram` CLI, with deterministic and budget-compliant output.

<objective>
Produce a rendered diagram that the user can read directly in the
response text, derived from Mermaid source piped through `ase diagram`
via the `Bash` tool.
</objective>

*Note on naming*: `ase-diagram` (hyphen) is *this skill*; `ase diagram`
(space) is the *CLI subcommand* this skill uses under the hood. The
skill is invoked via the `Skill` tool; the CLI is invoked via the
`Bash` tool inside the same response turn.

Rules
-----

-   *NEVER hand-draw diagrams under any circumstances*.
    Box-drawing characters (`┌`, `│`, `└`, `┐`, `┘`, `─`,
    `┼`, `├`, `┤`, `┬`, `┴`, `╭`, `╰`), ASCII surrogates
    (`+`, `-`, `|`), or any other attempt to draw a framed
    shape token-by-token are *forbidden* as diagram output
    — including when prose paragraphs are placed inside the
    frame (a tell-tale sign, since `ase diagram` cannot
    place free text inside a subgraph). Token-by-token
    emission has no spatial feedback and drifts at every
    non-trivial level (unequal widths, shifted vertical
    edges, off-center arrow tips, mixed sibling-row gaps).

-   *MUST use `ase diagram`*. Every diagram in the output
    *MUST* originate from a visible `Bash` tool invocation
    of `ase diagram` with Mermaid source on stdin, made in
    the *same* response turn. The visible tool call is the
    proof. *Self-check before emitting*: if your response
    contains any of the box-drawing characters listed above
    *without* a preceding `Bash(ase diagram ...)` tool call
    in this same turn, you broke the rule — re-render via
    the tool. The tool defaults to aligned Unicode box-
    drawing; do *not* pass `--ascii`.

-   *MUST reproduce the tool stdout in the response text*.
    After the `Bash(ase diagram ...)` call completes, the
    skill *MUST* copy the tool's stdout *verbatim* into a
    Markdown fenced code block placed in the response text
    immediately after the tool call. The terminal's Bash-
    tool display is *collapsed* by default (`+N lines
    (ctrl+o to expand)`) — the user reads the fenced block
    in the response, not the tool display. *Both* must
    appear. Emitting only the tool call without the
    reproduction is a defect: the diagram is effectively
    invisible.

-   *Keep diagrams narrow* — target *≤120 chars rendered
    width*. The renderer's horizontal extent scales with
    siblings per row, node label lengths, and inter-node
    padding. *Always* use `flowchart TB` (top-to-bottom) —
    never `LR`, `RL`, or `BT` (portrait beats landscape for
    terminals and code review diffs). Limit *siblings per
    row* to *≤4* and group further items into nested
    `subgraph` hierarchies; keep *node labels* *≤30 chars*
    (abbreviate long names, drop adjectives). If the rendered
    output still exceeds the budget, restructure the Mermaid
    source — do *not* widen the terminal and do *not* raise
    `--pad-x`/`--pad-y` (defaults `3`/`3` are already tight;
    lower values break junction rendering).

-   *Budget compliance is non-negotiable*. If restructuring
    the Mermaid source cannot bring the rendered width
    ≤120 chars (e.g., four populated `subgraph`s side by
    side), *reduce scope*: show only the *top-level
    structure* (the root node and ≤1 level of children) in
    the diagram, and enumerate the detail as a bulleted
    list *below* the rendered block. *Never* emit Mermaid
    source as a substitute for a rendered diagram. The
    choice is: render (possibly at reduced scope) or omit
    the diagram entirely with a one-line note — *not* ship
    unrendered source.

-   *Keep edges inside subgraph boundaries*. An edge that
    crosses a `subgraph` border produces a visually ambiguous
    `┼` glyph where the border line (`─`) and the edge line
    (`─`) collide — the box appears to merge into the arrow.
    If a node has edges to peers *outside* a subgraph, either
    move the node out of the subgraph or widen the subgraph
    to include both endpoints. Never let arrows pierce
    `subgraph` walls.

-   For diagrams, choose the Mermaid type per intent:

    -   *structure / layout / components / dependencies* → `flowchart TB`
    -   *control flow / branching / concurrency*         → `flowchart TB`
    -   *state machine / states / transitions*           → `stateDiagram-v2`
    -   *data flow / actors / messages / protocols*      → `sequenceDiagram`
    -   *data structure / classes / methods*             → `classDiagram`
    -   *data model / entities / relationships*          → `erDiagram`
    -   *metrics / distributions / time series*          → `xychart-beta`

-   *Always* render diagrams inside a Markdown *fenced code block*
    (triple backticks).

-   For *comparison diagrams* (e.g., *current vs. proposed*,
    *before vs. after*), render each side as a *separate*
    Mermaid source via `ase diagram` and stack the two
    rendered blocks *vertically* — each preceded by a bold
    label (`**Before:**` / `**After:**` or similar). Do *not*
    attempt side-by-side layout: each renderer call produces
    its own width with no shared column grid, so horizontal
    alignment is impossible.


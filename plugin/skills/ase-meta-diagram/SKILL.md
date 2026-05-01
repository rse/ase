---
name: ase-meta-diagram
description: >
    Render diagrams via the `ase diagram` CLI.
    Use whenever a response needs to visualize
    *structure/layout/components/dependencies* as Flowchart,
    *control-flow/branching/concurrency* as Flowchart,
    *state-machine/states/transitions* as UML State Diagram,
    *data-flow/actors/messages/protocols* as UML Sequence Diagram,
    *data-structure/classes/methods* as UML Class Diagram
    *data-model/entities/relationships* as ER Diagram, or
    *metrics/distributions/time-series* as XY-Charts.
user-invocable: false
disable-model-invocation: false
effort: low
allowed-tools:
    - "Bash(ase diagram *)"
---

Render Diagrams
===============

Your role is to render *every* diagram in the current session, with
*deterministic* and *clean* output. For this, your objective is to
produce a rendered diagram that the user can read directly in the
response text, derived from a *Mermaid* diagram specification which is
piped through the companion `ase diagram` program via the `Bash` tool.

Rules
-----

-   *NEVER hand-draw diagrams under any circumstances*.
    Box-drawing characters (`┌`, `│`, `└`, `┐`, `┘`, `─`, `┼`, `├`, `┤`,
    `┬`, `┴`, `╭`, `╰`), ASCII surrogates (`+`, `-`, `|`), or any other
    attempt to draw a framed shape token-by-token are *forbidden* as
    diagram output -— including when prose paragraphs are placed inside
    the frame (a tell-tale sign, since `ase diagram` cannot place free
    text inside a subgraph).

-   *MUST use `ase diagram`*. Every diagram in the output
    *MUST* originate from a visible `Bash` tool invocation of the
    command `ase diagram`, with Mermaid diagram specification passed on
    stdin, made in the *same* session response turn. The visible tool
    call is the proof. *Self-check before emitting*: if your response
    contains any of the box-drawing characters listed above *without* a
    preceding `Bash(ase diagram ...)` tool call in this same response
    turn, you broke the rule —- re-render via the tool!

-   *MUST* use the `Bash` command *starting* with *EXACTLY* the
    string `ase diagram`. Do not use any variant of this or the
    permission hooks will break.

-   *MUST* use a timeout of 20 seconds with the `Bash` command
    for the `ase diagram` invocation.

-   *MUST reproduce the tool stdout in the response text*.
    After the `Bash(ase diagram [...])` call completes, the skill *MUST*
    copy the tool's stdout *verbatim* into a Markdown-fenced code block
    placed in the response text immediately after the tool call. The
    terminal's Bash- tool display is *collapsed* by default (`+N lines
    (ctrl+o to expand)`) -— the user reads the Markdown-fenced block
    in the response, not the tool display. Emitting only the tool call
    without the reproduction of the output is a defect: the diagram is
    then effectively invisible.

-   *Keep diagrams narrow*.
    The renderer's horizontal extent scales with siblings
    per row, node label lengths, and inter-node padding. *Always*
    use `flowchart TB` (top-to-bottom) -— never `LR`, `RL`, or `BT`
    (portrait beats landscape for terminals and code review diffs).
    Limit *≤4 siblings per row* and group further items into nested
    `subgraph` hierarchies; keep *node labels* *≤30 chars* (abbreviate
    long names, drop adjectives).

-   *Never* emit Mermaid diagram specification as a substitute for a
    rendered diagram.

-   *Keep edges inside subgraph boundaries*. An edge that crosses a
    `subgraph` border produces a visually ambiguous `┼` glyph where the
    border line (`─`) and the edge line (`─`) collide -— the box appears to
    merge into the arrow. If a node has edges to peers *outside* a subgraph,
    either move the node out of the subgraph or widen the subgraph to
    include both endpoints. Never let arrows pierce `subgraph` walls.

-   For diagrams, choose the Mermaid diagram type per intent:

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
    *before vs. after*), render each side as a *separate* Mermaid
    diagram specification via `ase diagram` and then stack the two
    rendered blocks *vertically* — each preceded by a bold label
    (`**BEFORE:**` / `**AFTER:**` or similar). Do *not* attempt
    side-by-side layout: each renderer call produces its own width with
    no shared column grid, so horizontal alignment is impossible.


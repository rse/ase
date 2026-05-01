---
name: ase-meta-diagram
description: >
    Render diagrams via the `diagram` tool of the `ase` MCP service.
    *Always use* when you have to *visualize*
    structure/layout/components/dependencies as Flowchart,
    control-flow/branching/concurrency as Flowchart,
    state-machine/states/transitions as an UML State Diagram,
    data-flow/actors/messages/protocols as an UML Sequence Diagram,
    data-structure/classes/methods as an UML Class Diagram
    data-model/entities/relationships as an ER Diagram, or
    metrics/distributions/time-series as XY-Charts.
user-invocable: false
disable-model-invocation: false
effort: low
allowed-tools:
    - "mcp__plugin_ase_ase__diagram"
---

Render Diagrams
===============

Your role is to render *every* diagram in the current session, with
*deterministic* and *clean* output. For this, your objective is to
produce a beautifully rendered diagram that the user can read directly
in the response text, derived from a *Mermaid* diagram specification,
which is rendered with the `diagram` tool of the `ase` MCP service.

Rules
-----

-   WHEN NOT:
    You *MUST* *NEVER* hand-draw diagrams under any circumstances!

    Box-drawing characters (`┌`, `│`, `└`, `┐`, `┘`, `─`, `┼`, `├`,
    `┤`, `┬`, `┴`, `╭`, `╰`), ASCII surrogates (`+`, `-`, `|`), or any
    other attempt to draw a framed shape token-by-token are *forbidden*
    as your own diagram output.

-   WHEN:
    You *MUST* always use the `diagram` tool from the `ase` MCP service,
    whenever a diagram should be drawn!

    Every diagram in the output *MUST* originate from a `diagram`
    MCP tool call, with Mermaid diagram specification passed in the
    `diagram` field, made in the *same* session response turn. Also,
    pass a `colorMode` of `none` to always get monochrome renderings.

-   INPUT:
    For describing the diagrams, you *MUST* use the *Mermaid* diagram
    specification language!

    Use the following Mermaid diagram types per intent:

    -   *structure / layout / components / dependencies* → `flowchart`
    -   *control flow / branching / concurrency*         → `flowchart`
    -   *state machine / states / transitions*           → `stateDiagram-v2`
    -   *data flow / actors / messages / protocols*      → `sequenceDiagram`
    -   *data structure / classes / methods*             → `classDiagram`
    -   *data model / entities / relationships*          → `erDiagram`
    -   *metrics / distributions / time series*          → `xychart-beta`

    Other Mermaid diagram types are *not* supported by the renderer
    and hence should *not* be specified!

-   OUTPUT:
    You *MUST* reproduce the `text` output of the `diagram` tool from the
    `ase` MCP service in the response text!

    In other words, after the `diagram` tool call completes, the
    skill *MUST* copy the tool's `text` result *verbatim* into a
    Markdown-fenced code block (triple backticks), directly placed
    in the response text immediately after the MCP tool call -— the
    user reads the Markdown fenced block in the response, not the
    (truncated) tool call display. Emitting only the tool call without
    the reproduction of the `text` output is a defect: the diagram is
    then effectively invisible.

-   NOTICE 1:
    You *MUST* *NEVER* emit the plain Mermaid diagram specification, as
    it is just an intermediate format for driving the rendering process!

-   NOTICE 2:
    You *SHOULD* keep diagrams narrow!

    The renderer's horizontal extent scales with siblings per row, node
    label lengths, and inter-node padding. Limit *≤6 siblings per row*
    and group further items into nested `subgraph` hierarchies; keep
    *node labels* *≤20 chars* (abbreviate long names, drop adjectives).

-   NOTICE 3:
    You *SHOULD* stack diagrams vertically!

    For *comparison diagrams* (e.g., *current vs. proposed*, *before
    vs. after*), render each side as a *separate* Mermaid diagram
    specification via the `diagram` tool from the `ase` MCP service, and
    then stack the two rendered blocks *vertically* -— each preceded by
    a bold label (`**BEFORE:**` / `**AFTER:**`, or similar). Do *not*
    attempt side-by-side layout.


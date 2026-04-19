
Skill Meta Information
======================

Skill Output
------------

-   *IMPORTANT*: The following rules apply both to regular skill responses
    *and* to generated plan files (`EnterPlanMode` tool).

-   *IMPORTANT*: *All* output is *exclusively* requested through
    <template/> sections. You *MUST* *NOT* output anything *EXCEPT* it
    is explicitly included in such a <template/> section. Especially,
    you *MUST* *NOT* output any explanations on your own, except
    explicitly requested.

-   *IMPORTANT*: You *MUST* output all <template/> sections *EXACTLY* as provided
    (including newlines), except for removing trailing spaces and
    replacing the placeholders `<xxx/>` and `[...]` and replacing XML
    entities (like `&#x25CB;`) with the corresponding Unicode characters.

-   *IMPORTANT*: You *MUST* *NEVER* output any `---` lines.

-   *IMPORTANT*: For *Diagrams*:

    -   You *MUST* emit *every* diagram as Mermaid source and
        invoke the `Bash` tool with `ase diagram` piping the
        Mermaid source on stdin, then include the tool's stdout
        *verbatim* inside a Markdown fenced code block. The tool
        defaults to aligned Unicode box-drawing; do *not* pass
        `--ascii`. Do *not* hand-draw diagrams -— token-by-token
        emission has no spatial feedback and drifts at every
        non-trivial level (unequal widths, shifted vertical
        edges, off-center arrow tips, mixed sibling-row gaps).

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

-   *IMPORTANT*: For Markdown *Tables*:

    -   *Alignment is mandatory*: every vertical edge character
        (`|`, `│`, `+`) that belongs in the same column *must*
        sit at the same column across all rows. Determine box
        width from the *longest* content line plus 1-space
        padding, draw the top edge to that width, then keep every
        inner line (including annotations like `!`, `?`, `*`)
        within it. Count columns and verify before emitting; a
        one-space drift is a defect -— re-render.

Skill Control Flow
------------------

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <define name="<define-name/>"><define-body/></define>:

    This specifies a *reusable definition* named <define-name/> and
    an <define-body/> which can contain arbitrary information with
    optional `<args/>` (or alternatively, individual `<arg1/>`,
    `<arg2/>`, etc) and optional `<content/>` references from
    subsequent <expand/> calls.
    This construct is expanded into nothing.
    Do not output anything.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <expand name="<define-name/>" arg1="<expand-arg1/>" [arg2="<expand-arg2/>]" [...]]]><expand-content/></expand>:

    This specifies the *expansion* of previous <define/>.
    This construct is expanded into its <define-body/> with `<args/>`
    substituted with `<expand-arg1/> <expand-arg2/> [...]`, `<arg1/>`
    substituted with <expand-arg1/>, and `<content/>` substituted with
    <expand-content/>.
    Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <flow><flow-body/></flow>:

    This specifies a *sequential flow* of <step/>s, which have
    to be followed/executed in exactly the given order.
    This construct is expanded to its <flow-body/>.
    Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <step id="<id/>"><step-body/></step>:

    This specifies a distinct *single step* in a <flow/>.
    This construct is expanded to its <step-body/>.
    Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <if condition="<if-condition/>"><if-body/></if>:

    This specifies a simple condition which is expanded to <if-body/>
    if <if-condition/> is met, or to empty string if <if-condition/> is
    *not* met. Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <while condition="<while-condition/>"><while-body/></while>:

    This specifies a <while-body/> which is *repeated* until <while-condition/> is met.
    This construct is expanded to the repetition of <while-body/>.
    Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <for items="<for-item/> [...]"><for-body/></for>:

    This specifies a <for-body/> which is *repeated* for all <for-item/>s
    and where `<item/>` is expanded with the current <for-item/> in <for-body/>.
    This construct is expanded to the repetition of <for-body/>.
    Do not output anything else.

Skill Sequential Processing
---------------------------

-   *IMPORTANT*: For each <step/> in <flow/> you *MUST* use the
    `TaskCreate` tool to create a corresponding processing step.

    For this, transform each `<step id="xxx" [...]/>` into `TaskCreate({
    subject: "xxx", description: "xxx", activeForm: "xxx" })`. In
    other words, use the text of the `id` attribute of <step/> for the
    `subject`, `description`, and `activeForm` fields of `TaskCreate`.

    Make the `TaskCreate` tool calls *sequentially*, *not* in parallel,
    so the user can see intermediate results.

-   *IMPORTANT*: For each <step/> you *MUST* use the `TaskUpdate` tool
    for updating its status during processing.

-   *IMPORTANT*: You *MUST* sequentially execute every <step/> in
    a <flow/> *EXACTLY* as the instructions specify.

-   *IMPORTANT*: For any <step/> that specifies an *agent* in its
    `agent="[...]"` XML attribute, you *MUST* use the specified
    *agent* to execute the instructions for that <step/>.

-   *IMPORTANT*: If you need clarification on any details of your current
    <step/>, temporarily stop and immediately ask the user specific
    numbered questions, and then continue immediately once you have all
    of the information you need.

-   *IMPORTANT*: You *MUST* output the result of all <step/> *EXACTLY* as
    provided, without any further text interpretations and modifications.

Skill Identification
--------------------

- *IMPORTANT*: Initially, in case <objective/> is not empty,
  you *MUST* once output the following output <template/>:

  <template>
  &#x26AA; **OBJECTIVE**: <objective/>
  </template>


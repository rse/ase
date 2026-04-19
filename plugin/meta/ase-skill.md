
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

    -   For diagrams prefer the following diagrams types: for
        *structure* (layout, components, dependencies, etc) use
        Boxes'n'Lines, for *control flow* (branching, concurrency, etc)
        use Flowchart, for *state machine* (states, transitions, etc) use
        UML State Diagram, for *data flow* (actors, messages, etc) use UML
        Sequence Diagram, and for *data structure* (classes, entities,
        relationships, etc) use UML Class Diagram.

    -   *Always* render diagrams inside a Markdown *fenced code block*
        (triple backticks).

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


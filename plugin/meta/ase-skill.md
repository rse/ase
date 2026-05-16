
ASE Skill Meta Information
==========================

Skill Output
------------

-   *IMPORTANT*: The following rules apply both to regular skill responses
    *and* to generated plan files (`EnterPlanMode` tool).

-   *IMPORTANT*: The syntax `<xxx>[...]</xxx>` is used to *set* the value
    of a placeholder named `xxx`, and the syntax `<xxx/>` is used to *get*
    the value of a placeholder named `xxx`.

-   *IMPORTANT*: *All* output is *exclusively* requested through
    <template/> sections. You *MUST* *NOT* output anything *EXCEPT* it
    is explicitly included in such a <template/> section. Especially,
    you *MUST* *NOT* output any explanations on your own, except
    explicitly requested.

-   *IMPORTANT*: You *MUST* output all <template/> sections *EXACTLY* as provided
    (including newlines), except for removing trailing spaces and
    replacing the placeholders `<xxx/>` and `[...]` and replacing XML
    entities (like `&#x25CB;`) with the corresponding Unicode characters.

-   *IMPORTANT*: The active *persona style* (see `ase-persona.md`) *MUST* be applied
    to all *free-text placeholders* within <template/> sections — i.e. any placeholder
    whose content you author yourself (such as `<description/>`, `<title/>`, `<objective/>`,
    `<summary/>`, `<explanation/>`, etc.). The *structure* of the template (fixed keywords,
    punctuation, labels) remains unchanged; only the *authored content* inside free
    placeholders carries the persona style.

-   *IMPORTANT*: You *MUST* *NEVER* output any `---` lines.

-   *IMPORTANT*: For *Diagrams*: whenever the response needs a
    diagram (structural, control-flow, state, sequence, class,
    entity-relationship, or metrics), you *MUST* invoke the
    `ase-meta-diagram` skill via the `Skill` tool and follow its rules.
    All hand-drawn ASCII frames, raw Mermaid source as a
    substitute for a rendered block, and missing stdout
    reproduction are defects defined by that skill.

-   *IMPORTANT*: For Markdown *Tables*:

    -   *Alignment is mandatory*: every vertical edge character
        (`|`, `│`, `+`) that belongs in the same column *must*
        sit at the same column across all rows. Determine box
        width from the *longest* content line plus 1-space
        padding, draw the top edge to that width, then keep every
        inner line (including annotations like `!`, `?`, `*`)
        within it. Count columns and verify before emitting; a
        one-space drift is a defect -— re-render.

-   *IMPORTANT*: For *Findings* (problems, tradeoffs, warnings
    emitted by analysis skills):

    -   *Evidence-grounded (mandatory)*: each finding MUST cite
        the exact line range that triggers it AND the cited
        snippet must prove the claim *verbatim*. If the cited
        lines do not prove the claim, *re-investigate and
        re-cite correctly*. Drop the finding *only* if no code
        location in the scanned files proves it — never drop
        due to sloppy citation alone.

    -   *Documented-context alignment*: cross-check each
        finding against documented context — interface
        contracts, docstrings (Javadoc, JSDoc, Python
        docstring, ...), adjacent code comments, and
        project-level AI guidance files (`CLAUDE.md`,
        `AGENTS.md`, `GEMINI.md`, `MEMORY.md`,
        `.github/copilot-instructions.md`, `.cursor/rules/`,
        or similar). Two cases resolve via the same
        mechanism — do *not* drop, keep the finding visible
        for traceability:

        -   *Problem already addressed*: the finding's
            concern is explicitly stated in a contract or
            docstring (e.g. "MUST be non-blocking"). Mark
            severity `ACCEPTED` with note "contractually
            addressed".

        -   *Fix conflicts with documented priority*: the
            recommendation would violate a documented priority
            (hot-path, allocation-free, lock-free, latency-
            sensitive, sub-µs budget). Either weaken the
            recommendation, convert it to a tradeoff, or mark
            severity `ACCEPTED` with note "priority-conflict
            accepted".

        Skills that report severity MUST support `ACCEPTED`
        in addition to `LOW`, `MEDIUM`, and `HIGH`.

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
    <expand name="<define-name/>" [arg1="<expand-arg1/>" [arg2="<expand-arg2/>]" [...]]]><expand-content/></expand>:

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

    This specifies a <while-body/> which is *repeated* as long as
    <while-condition/> is met. This construct is expanded to the
    repetition of <while-body/>. Do not output anything else.

-   *IMPORTANT*: You *MUST* honor the following control flow construct:
    <for items="<for-item/> [...]"><for-body/></for>:

    This specifies a <for-body/> which is *repeated* for all
    <for-item/>s and where `<item/>` is expanded with the current
    <for-item/> in <for-body/>. This construct is expanded to the
    repetition of <for-body/>. A <break/> in <for-body/> can stop the
    repetition early. Do not output anything else.

Skill Sequential Processing
---------------------------

-   *IMPORTANT*: For each given <flow/>, you *MUST* use the
    `TaskCreate` tool to create a corresponding set of processing steps.

    Each `<step id="xxx" [...]/>` corresponds to a `TaskCreate({
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

MCP Tool Calls
--------------

-   *IMPORTANT*: Whenever you call *any* tool from the `ase` MCP service,
    you *MUST* check the response immediately:

    -   If the call fails because the `ase` MCP service is not running
        (tool not found, connection refused, server not connected, internal
        error), output the following and stop immediately:

        <template>
        ⧉ **ASE**: **ERROR:** MCP service not running — please start it via `ase service start` and reconnect via `/mcp`, then retry.
        </template>

    -   If the call fails for any other reason (timeout, transport error,
        or other infrastructure problem), output the following and stop immediately:

        <template>
        ⧉ **ASE**: **ERROR:** MCP tool unavailable
        </template>

    -   If the response `text` starts with or contains `ERROR: <info/>`,
        output the following and stop immediately:

        <template>
        ⧉ **ASE**: **ERROR:** MCP tool failed: <info/>
        </template>

    -   Only on a clean response: proceed as the skill instructs.

Next Step Processing
--------------------

<define name="next-step">
Output `⧉ **ASE**: ✱ skill: **<arg1/>**, ▶ status: **ending**`.
Then let the *user interactively choose*, with the help of the `AskUserQuestion` tool,
what to do as the next step. For this, call:

`AskUserQuestion({
    questions: [
        {
            header: "Next Step",
            question: "What next step do you prefer to perform?",
            multiSelect: false,
            options: [
                { label: "None": "Just stop the current skill processing (or press ESCAPE)." },
                <content/>
            ]
        }
    ]
})`

Check the tool result and dispatch accordingly:

-   If the tool result contains the `user doesn't want to proceed`,
    `tool use was rejected`, `user declined to answer questions`,
    stop processing immediately.

-   If the tool result is `"What next step do you prefer to perform?"="<answer/>"`,
    dispatch according to the value of <answer/>:

    -   If <answer/> is `None`, stop processing immediately.

    -   If <answer/> is `Skill: <name/>`, output
        `⧉ **ASE**: ✱ skill: **<name/>**, ▶ status: **starting**`
        and then call the `Skill(skill: <name/>)` tool and let it
        continue the further processing.
</define>

Skill Identification
--------------------

- *IMPORTANT*: Initially, in case <objective/> is not empty,
  you *MUST* once output the following output <template/>:

  <template>
  &#x26AA; **OBJECTIVE**: <objective/>
  </template>



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
    you *MUST* *NOT* output any explanations on your own, unless
    explicitly requested.

-   *IMPORTANT*: You *MUST* output all <template/> sections *EXACTLY* as provided
    (including newlines), *EXCEPT* for expanding control items, removing
    trailing spaces, replacing the placeholders `<xxx/>` and `[...]`,
    replacing XML entities (like `&#x25CB;`) with the corresponding
    Unicode characters, and the potential reduction of prose according
    to the currently defined persona style.

-   *IMPORTANT*: For *Final-Message-Only Display* ("focus mode"):
    some agent harnesses show the user only the *final* text message of
    a turn and *hide* all text emitted *between* tool calls. If your
    harness instructions indicate such a mode (e.g. *Claude Code* with
    "focus mode" enabled), you *MUST* repeat *all* <template/> outputs
    emitted since the last shown final text message -- *verbatim*, in
    their *original order*, and each only *once* -- at the *top* of the
    next final text message (i.e. the text after the last tool call of
    a turn). Never *drop* or *summarize* a <template/> output just
    because it would land between tool calls. If no such display mode
    is indicated, do *not* repeat anything.

-   *IMPORTANT*: The active *persona style* (see `ase-persona.md`) *MUST* be applied
    to all *free-text placeholders* within <template/> sections - i.e. any placeholder
    whose content you author yourself (such as `<description/>`, `<title/>`, `<objective/>`,
    `<summary/>`, `<explanation/>`, etc.). The *structure* of the template (fixed keywords,
    punctuation, labels) remains unchanged; only the *authored content* inside free
    placeholders carries the persona style.

-   *IMPORTANT*: For *Diagrams*: whenever the response needs a
    diagram (structural, control-flow, state, sequence, class,
    entity-relationship, or metrics), you *MUST* build a Mermaid
    specification and dispatch its rendering to the `ase-meta-diagram`
    sub-agent via the `Agent` tool (`subagent_type: "ase:ase-meta-diagram"`),
    then reproduce its returned fenced code block verbatim in the
    response text. All hand-drawn ASCII frames, raw Mermaid source as a
    substitute for a rendered block, and missing reproduction of the
    rendered block are defects defined by that agent.

-   *IMPORTANT*: For Markdown *Tables*:

    -   *Alignment is mandatory*: every vertical edge character
        (`|`, `│`, `+`) that belongs in the same column *must*
        sit at the same column across all rows. Determine box
        width from the *longest* content line plus 1-space
        padding, draw the top edge to that width, then keep every
        inner line (including annotations like `!`, `?`, `*`)
        within it. Count columns and verify before emitting; a
        one-space drift is a defect - re-render.

-   *IMPORTANT*: For *Findings* (problems, tradeoffs, warnings
    emitted by analysis skills):

    -   *Evidence-grounded (mandatory)*: each finding MUST cite
        the exact line range that triggers it AND the cited
        snippet must prove the claim *verbatim*. If the cited
        lines do not prove the claim, *re-investigate and
        re-cite correctly*. Drop the finding *only* if no code
        location in the scanned files proves it - never drop
        due to sloppy citation alone.

    -   *Documented-context alignment*: cross-check each
        finding against documented context - interface
        contracts, docstrings (Javadoc, JSDoc, Python
        docstring, ...), adjacent code comments, and
        project-level AI guidance files (`CLAUDE.md`,
        `AGENTS.md`, `GEMINI.md`, `MEMORY.md`,
        `.github/copilot-instructions.md`, `.cursor/rules/`,
        or similar). Two cases resolve via the same
        mechanism - do *not* drop, keep the finding visible
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

Skill Sequential Processing
---------------------------

-   *IMPORTANT*: For each given <flow/>, you *MUST* use the
    `TaskCreate` tool to create a corresponding set of processing steps.

    Each `<step id="xxx" [...]>...</step>` corresponds to a
    `TaskCreate({ subject: "xxx", description: "xxx" })`. In other
    words, use the text of the `id` attribute of <step/> exactly
    *as-is* for both the `subject`, and the `description` fields of
    `TaskCreate`.

    For speed, emit *all* `TaskCreate` calls together in a *single* turn
    (issued in parallel), *not* one-per-turn sequentially. Do *not*
    rely on the call order to establish the step order, as the parallel
    results carry no guaranteed ordering.

    Instead, in the *immediately single following* turn, first
    reconstruct the step-id-to-taskId mapping: because each task's
    `subject` equals the originating <step/> `id` (and <step/> ids are
    unique), match every created task back to its <step/> by comparing
    the task's `subject` to the step `id` -- read the ids straight from
    the `TaskCreate` results, or call `TaskList` if the results are
    no longer at hand.

    Then establish the strict order explicitly by chaining the created
    tasks with `TaskUpdate`: for each <step/> after the first one,
    resolve <this/> and <prev/> to the mapped `taskId` values and
    call `TaskUpdate({ taskId: "<this/>", addBlockedBy: [ "<prev/>" ]
    })` so that every step (with `taskId` <this/>) is blocked by its
    predecessor step (with `taskId` <prev/>).

-   *IMPORTANT*: For each <step/> you *MUST* use the `TaskUpdate` tool
    for updating its status *during* processing, once a <step/> finished.

-   *IMPORTANT*: You *MUST* *strictly sequentially* execute every <step/> in
    a <flow/>. You *MUST* not implicitly skip any <step/> during
    processing, except you were explicitly requested to do this or the
    step is a configured to be a conditional step!

-   *IMPORTANT*: You *MUST* *strictly sequentially* execute every numbered
    items in a <step/>. You *MUST* not implicitly skip any numbered item during
    processing, except you were explicitly requested to do this!

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

-   *IMPORTANT*: Whenever you call *any* tool from the `ase` MCP server,
    you *MUST* check the response immediately:

    -   If the call fails because the `ase` MCP server is not running
        (tool not found, connection refused, server not connected, internal
        error), output the following and stop immediately:

        <template>
        ⧉ **ASE**: **ERROR:** MCP server not running - please start it via `ase service start` and reconnect via `/mcp`, then retry.
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

        *EXCEPTION*: this rule does *NOT* apply to the `ase_getopt` tool,
        whose `ERROR:`-prefixed output is *expected* option-parsing
        feedback handled exclusively by step 4 of the `getopt` procedure
        (see `ase-getopt.md`); never emit this generic template for an
        `ase_getopt` response.

    -   Only on a clean response: proceed as the skill instructs.

Skill Identification
--------------------

-   *IMPORTANT*: Set <skill></skill> (set to empty)
    and <skill-name></skill-name> (set name to empty).

    In case <skill/> later becomes *not* empty by defining it as <skill
    name="<name/>"><body/></skill>, set <skill-name><name/></skill-name>
    (set skill name to name), and then (but only if `$1` is *NOT* equal
    to `-h` or `--help`) you *MUST* once output the following output
    <template/>:

    <template>
    ⧉ **ASE**: ✪ skill: **<skill-name/>**, ✦ purpose: **<skill/>**, ▶ status: **skill started**
    </template>

    Later (but only if `$1` is *NOT* equal to `-h` or `--help`), once
    this skill finally will stop processing, you *MUST* once output the
    following output <template/>:

    <template>
    ⧉ **ASE**: ✪ skill: **<skill-name/>**, status: **skill finished**
    </template>

-   *IMPORTANT*: Set <objective></objective> (set to empty).
    Then, in case <objective/> later becomes *not* empty,
    you *MUST* once output the following output <template/>:

    <template>
    ⧉ **ASE**: ✪ skill: **<skill-name/>**, ◎ objective: **<objective/>**
    </template>

-   *IMPORTANT*:
    If `$1` (the first token of the skill arguments) is equal to `-h` or
    `--help`, you *MUST* once output the following output <template/> and
    then *IMMEDIATELY* *STOP* the further skill processing:

    <template>
    @${CLAUDE_SKILL_DIR}/help.md
    </template>

-   *IMPORTANT*:
    You *MUST* *NOT* output any summaries, explanations, or next
    steps at the end of a skill beside the explicit outputs via any
    <template/>.

Template Patterns
-----------------

-   When `<ase-tpl-head/>` (no title attribute) should be expanded, use:

    <template>

    ╭──────────────────────────────────────────────────────────────────────┈┈┈┈┈┈┈┈┈┈

    </template>

-   When `<ase-tpl-head title="<title/>"/>` should be expanded, use
    (where <raw-title/> is the visible un-styled text `⧉ ASE: <title/>`,
    <raw-title-len/> is the number of characters in <raw-title/>, and
    <bar/> is the `─` character repeated exactly max(0, 67 - <raw-title-len/>)
    times -- clamped to zero so an over-long title never yields a negative
    count -- the very same bar-width rule as `<ase-tpl-foot/>` and
    `<ase-tpl-boxed/>`, so equal visible text yields equal total width):

    <template>

    ╭────━━━━**(** ⧉ ASE: **`<title/>`** **)**━━━━────<bar/>┈┈┈┈┈┈┈┈┈┈

    </template>

-   When `<ase-tpl-foot/>` (no title attribute) should be expanded, use:

    <template>

    ╰──────────────────────────────────────────────────────────────────────┈┈┈┈┈┈┈┈┈┈

    </template>

-   When `<ase-tpl-foot title="<title/>"/>` should be expanded, use
    (where <raw-title/> is the visible un-styled text `⧉ ASE: <title/>`,
    <raw-title-len/> is the number of characters in <raw-title/>, and
    <bar/> is the `─` character repeated exactly max(0, 67 - <raw-title-len/>)
    times -- clamped to zero so an over-long title never yields a negative
    count -- the very same bar-width rule as `<ase-tpl-head/>` and
    `<ase-tpl-boxed/>`, so equal visible text yields equal total width):

    <template>

    ╰────━━━━**(** ⧉ ASE: **`<title/>`** **)**━━━━────<bar/>┈┈┈┈┈┈┈┈┈┈

    </template>

-   When `<ase-tpl-boxline><line/></ase-tpl-boxline>` should be expanded, use:

    <if condition="<line/> is not empty">
        <template>
        │ <line/>
        </template>
    </if>
    <else>
        <template>
        │
        </template>
    </else>

-   When `<ase-tpl-boxed title="<title/>"[ subtitle="<subtitle/>"]><content/></ase-tpl-boxed>`
    should be expanded use the following helper placeholders and then
    the following <template/>:

    -   <if condition="<subtitle/> is not empty">
            Set <raw-title>⧉ ASE: <title/>: <subtitle/></raw-title>.
            Set <render-title>⧉ ASE: **`<title/>`**: `<subtitle/>`</render-title>.
        </if>
        <else>
            Set <raw-title>⧉ ASE: <title/></raw-title>.
            Set <render-title>⧉ ASE: **`<title/>`**</render-title>.
        </else>
    -   Set <raw-title-len/> to the number of characters in the visible
        un-styled text <raw-title/>.
    -   Set <bar/> to the `─` character repeated exactly max(0, 67 - <raw-title-len/>)
        times -- clamped to zero so an over-long title never yields a negative
        count -- the very same bar-width rule as `<ase-tpl-head/>` and
        `<ase-tpl-foot/>`, so equal visible text yields equal total width.
    -   Set <body/> to <content/> with all line-starts prefixed with `│ `.

    <template>

    ╭────━━━━**(** <render-title/> **)**━━━━────<bar/>┈┈┈┈┈┈┈┈┈┈
    │
    <body/>
    │
    ╰────━━━━**(** <render-title/> **)**━━━━────<bar/>┈┈┈┈┈┈┈┈┈┈

    </template>

-   When `<ase-tpl-key digit="<digit/>"/>` should be expanded, use:

    <if condition="<digit/> is '1'"><template>➊</template></if>
    <if condition="<digit/> is '2'"><template>➋</template></if>
    <if condition="<digit/> is '3'"><template>➌</template></if>
    <if condition="<digit/> is '4'"><template>➍</template></if>
    <if condition="<digit/> is '5'"><template>➎</template></if>
    <if condition="<digit/> is '6'"><template>➏</template></if>
    <if condition="<digit/> is '7'"><template>➐</template></if>
    <if condition="<digit/> is '8'"><template>➑</template></if>
    <if condition="<digit/> is '9'"><template>➒</template></if>

-   When `<ase-tpl-bullet-secondary/>` should be expanded, use:

    <template>⚪</template>

-   When `<ase-tpl-bullet-normal/>` should be expanded, use:

    <template>🔵</template>

-   When `<ase-tpl-bullet-signal/>` should be expanded, use:

    <template>🟠</template>

-   When `<ase-tpl-pad width="<width/>" text="<text/>"/>` should be expanded, use
    (where <ws/> = ` ` x max(0, <width/> - length("<text/>")), i.e., <ws/> is
    the ` ` character repeated max(0, <width/> - length("<text/>")) times --
    clamped to zero so an over-long text never yields a negative count):

    <template><text/><ws/></template>

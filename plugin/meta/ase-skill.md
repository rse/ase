
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
    <template/> sections. You *MUST* *NOT* output anything *UNLESS* it
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
    harness instructions indicate such a mode (e.g. *Anthropic Claude Code CLI* with
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
    specification <mermaid-spec/> and render it at the position of
    the diagram in the response as follows:

    -   *Inline Image*: If <ase-diagram-mode/> is not equal `text` and
        the tool `ase_mods_diagram` of the `ase` MCP server is available
        (if deferred, first load it via `ToolSearch`), emit the response
        text up to the diagram, call
        this tool with `diagram: <mermaid-spec/>`, and continue with the
        remaining response text. On `OK: ...` the user already sees the
        diagram, so do *not* reproduce or describe it in the response text.

    -   *Text Block*: Otherwise, or if the tool returns `ERROR: ...`,
        dispatch the rendering to the `ase-meta-diagram` sub-agent via
        the `Agent` tool (`subagent_type: "ase:ase-meta-diagram"`,
        `prompt: <mermaid-spec/>`, `run_in_background: false`), then
        reproduce its returned fenced code block verbatim in the
        response text.

    All hand-drawn ASCII frames, raw Mermaid source as a substitute for
    a rendered diagram, and missing renderings of the diagram are defects.

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
            (hot-path, allocation-free, lock-free,
            latency-sensitive, sub-µs budget). Either weaken the
            recommendation, convert it to a tradeoff, or mark
            severity `ACCEPTED` with note "priority-conflict
            accepted".

        Skills that report severity MUST support `ACCEPTED`
        in addition to `LOW`, `MEDIUM`, and `HIGH`.

Skill Sequential Processing
---------------------------

-   *IMPORTANT*: The task tracking rules below apply *only* if the
    `TaskCreate` and `TaskUpdate` tools are actually available to you.
    If they are *not* available (as with some agent tools or models),
    silently skip *all* task tracking -- the creation of tasks, their
    chaining via `addBlockedBy`, and their status updates -- and do
    *not* search for these tools (e.g. via `ToolSearch`), do *not*
    emulate them, and do *not* mention their absence. The strictly
    sequential processing of every <step/> stays mandatory regardless.

-   *IMPORTANT*: For each given <flow/>, you *MUST* use the
    `TaskCreate` tool to create a corresponding set of processing steps.

    Each `<step id="xxx" [...]>...</step>` corresponds to a
    `TaskCreate({ subject: "xxx", description: "xxx" })`. In other
    words, use the text of the `id` attribute of <step/> exactly
    *as-is* for both the `subject` and the `description` fields of
    `TaskCreate`.

    For speed, emit *all* `TaskCreate` calls together in a *single* turn
    (issued in parallel), *not* one-per-turn sequentially. Do *not*
    rely on the call order to establish the step order, as the parallel
    results carry no guaranteed ordering.

    Instead, in the *single immediately following* turn, first
    reconstruct the step-id-to-taskId mapping: because each task's
    `subject` equals the originating <step/> `id` (and <step/> ids are
    unique), match every created task back to its <step/> by comparing
    the task's `subject` to the step `id` -- read the ids straight from
    the `TaskCreate` results, or call `TaskList` if the results are
    no longer at hand.

    Then establish the strict order explicitly by chaining the created
    tasks with `TaskUpdate`: for each <step/> after the first one, set
    <this/> to the mapped taskId of this step and <prev/> to the mapped
    taskId of the predecessor step from the reconstructed mapping, and
    call `TaskUpdate({ taskId: "<this/>", addBlockedBy: [ "<prev/>" ]
    })` so that every step (with `taskId` <this/>) is blocked by its
    predecessor step (with `taskId` <prev/>).

-   *IMPORTANT*: For each <step/> you *MUST* use the `TaskUpdate` tool
    for updating its status *during* processing, once a <step/> has finished.

-   *IMPORTANT*: Whenever a skill *stops early* -- because a <step/>
    instructed you to *STOP* processing (on an error, a cancelled
    dialog, a short-circuit branch, or any other early exit) -- you
    *MUST*, *before* emitting the final <template/>, use the `TaskUpdate`
    tool to set the status of *every* still `pending` or `in_progress`
    task of the current <flow/> to `deleted`, so that no task of a
    finished skill remains open. Steps that were *skipped* because their
    `condition` attribute was not met *MUST* be treated the same way.

-   *IMPORTANT*: You *MUST* *strictly sequentially* execute every <step/> in
    a <flow/>. You *MUST* not implicitly skip any <step/> during
    processing, unless you were explicitly requested to do this or the
    step is configured to be a conditional step!

-   *IMPORTANT*: You *MUST* *strictly sequentially* execute every numbered
    item in a <step/>. You *MUST* not implicitly skip any numbered item during
    processing, unless you were explicitly requested to do this!

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

-   *IMPORTANT*: Set <purpose></purpose> (set to empty)
    and <skill-name></skill-name> (set name to empty).

    In case <purpose/> later becomes *not* empty by defining it as
    <purpose name="<name/>"><body/></purpose>, set
    <skill-name><name/></skill-name> (set skill name to name), and then
    (but only if ((`$1` is *NOT* equal to `-h` or `--help`) *AND*
    (<ase-guidance-level/> is equal to `normal` or `verbose`))) you *MUST*
    once output the following output <template/>:

    <template>
    ⧉ **ASE**: ✪ skill: **<skill-name/>**, ✦ purpose: **<purpose/>**, ▶ status: **skill started**
    </template>

    You *MUST* output this <template/> *immediately* as the *very first*
    output of the skill, *before* any tool call (including the
    `ase_getopt` call) and *before* any work of the skill, and also when
    the skill was invoked via the `Skill` tool from another skill. Any
    "Do not output anything" instruction of the subsequent steps does
    *NOT* suppress or defer it.

    Later (but only if ((`$1` is *NOT* equal to `-h` or `--help`) *AND*
    (<ase-guidance-level/> is equal to `normal` or `verbose`))), once
    this skill finally will stop processing, you *MUST* once output the
    following output <template/>:

    <template>
    ⧉ **ASE**: ✪ skill: **<skill-name/>**, ▶ status: **skill finished**
    </template>

-   *IMPORTANT*: Set <objective></objective> (set to empty).
    Then, in case <objective/> later becomes *not* empty
    (but only if <ase-guidance-level/> is equal to `normal` or `verbose`),
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
    steps at the end of a skill besides the explicit outputs via any
    <template/>.

Artifact Boxing Transparency
----------------------------

-   *IMPORTANT*: The *boxing* of a project (indicated by
    <ase-project-boxing/> configuration) classifies how *transparent*
    its *source artifacts* (specification, architecture, source code,
    documentation, infrastructure, task plan, and other artifacts) are,
    and thus how *deeply* you *MUST* inspect or produce them and how
    *much* of their internals you *MUST* surface.

-   *IMPORTANT*: Boxing modulates only the *work depth* (inspection and
    production thoroughness) and the *output visibility* (surfaced
    content and findings) of *artifact-touching* skills, per the three
    lists below. It *MUST* *NOT* alter the *communication style*
    (governed exclusively by the persona), and it *MUST* *NOT* apply to
    skills that neither read, critique, nor write any project source
    artifact.

    -   If <ase-project-boxing/> is `white`:
        -   Transparency:      *fully*
        -   Work depth:        inspect *fully*, produce *thoroughly*
        -   Findings surfaced: *all*
        -   Internals exposed: *full* (complete diffs, exhaustive rationale)

    -   If <ase-project-boxing/> is `grey`:
        -   Transparency:      *partially*
        -   Work depth:        inspect *significant* parts, produce *reasonably*
        -   Findings surfaced: *essentials*, summarize rest
        -   Internals exposed: *key* only (essential hunks, condensed rationale), summarize rest

    -   If <ase-project-boxing/> is `black`:
        -   Transparency:      *none*
        -   Work depth:        *minimum* work to satisfy the request
        -   Findings surfaced: *none* (report only the *outcome*)
        -   Internals exposed: *none* (no diffs, no code, no per-artifact explanation)

-   *IMPORTANT*: Precedence rule: a skill's *explicit* `black` branches
    and a skill's *explicit* output suppression instructions
    deterministically skip or suppress and *win* over the implicit decisions
    above. Where no such branches or instructions exist, the decisions
    above apply.

-   *IMPORTANT*: Severity rule: an *explicitly* given severity floor
    (option `--severity`|`-S` other than `AUTO`) of a finding-producing
    skill *overrules* the boxing for *which* findings are inspected and
    acted on: it lifts the `black` skip and the `grey` floor `MEDIUM`,
    so e.g. `-S LOW` acts on *all* findings of severity `LOW` and above.
    The boxing still governs the *internals exposed* of each finding.

Guidance Hint Level
-------------------

-   *IMPORTANT*: The *guidance* of the agent (indicated by
    <ase-guidance-level/> configuration) classifies how many
    *unsolicited hints* -- pointers to the available *ASE* skills, to
    their options, and to the recommended next operations, which the
    user did *not* explicitly ask for -- you *MUST* emit in addition to
    the requested result.

-   *IMPORTANT*: Guidance modulates only the *hints*, per the four
    levels below. It *MUST* *NOT* alter the *communication style*
    (governed exclusively by the persona), it *MUST* *NOT* alter the
    *work depth* or the *output visibility* (governed exclusively by the
    boxing), and it *MUST* *NOT* suppress, reduce, or expand any
    *requested* output. In particular, guidance *MUST* *NOT* apply to:

    -   the *manual page* emitted for `-h`/`--help`, which is
        explicitly requested,
    -   the *skill catalog*, *manual page*, and *command proposal*
        results of the `ase-help-skill` and `ase-help-intent` skills,
        which are explicitly requested,
    -   the *option affordance* lines of a user dialog (e.g. `Please
        choose *one* option by typing ...`), which are functional parts
        of the dialog and not hints,
    -   the *artifact state* lines of a skill (e.g. `plan loaded`, `plan
        created`, `task given`) and every `ERROR:` line, which carry
        state rather than pointers.

    The *skill identification* chrome (the `skill started`, `skill
    finished`, and `objective` lines) is the sole exception: it is
    *decoration* rather than result, so it is gated on `normal` and
    `verbose` directly in the `Skill Identification` section above.

-   *IMPORTANT*: Every hint carries a *level* -- `minimal`, `normal`,
    or `verbose` -- and is emitted only if the configured
    <ase-guidance-level/> *includes* that level:

    -   If <ase-guidance-level/> is `none`:
        -   Hints emitted: *none*
    -   If <ase-guidance-level/> is `minimal`:
        -   Hints emitted: `minimal` -- the *essential* pointers only,
            i.e. those without which the just-produced result cannot be
            consumed at all (such as the follow-up command that turns
            persisted findings into actual changes)
    -   If <ase-guidance-level/> is `normal`:
        -   Hints emitted: `minimal` *and* `normal` -- additionally the
            *canonical next step* of the finished skill
    -   If <ase-guidance-level/> is `verbose`:
        -   Hints emitted: `minimal`, `normal`, *and* `verbose` --
            additionally the *unused options* of the current skill, the
            *related* skills, and the *configuration* skills
    -   If <ase-guidance-level/> is empty or not set:
        -   Treat it as `normal`

-   *IMPORTANT*: A hint *MUST* be emitted *exclusively* through the
    `<ase-tpl-hint/>` template pattern below, and *never* as free-text
    prose, so that its suppression is uniform across all skills.

Template Patterns
-----------------

-   *IMPORTANT*: In every `<template/>` below you *MUST* reproduce all
    box-drawing and decorative glyphs *verbatim*, character-for-character,
    exactly as written. This especially includes the corner and edge
    characters `╭`, `╰`, and `│`, the shoulder character `━`, the bar
    character `─`, and the trailing dotted character `┈`. You *MUST* *NOT*
    substitute visually similar ASCII fallbacks (e.g. `+`, `|`, `-`) or
    other Unicode look-alikes, and you *MUST* *NOT* drop, add, or reorder
    any of these glyphs.

-   When `<ase-tpl-head/>` (no title attribute) should be expanded, use:

    <template>

    ╭───────────────────────────────────────────────────────────────────┈┈┈┈┈┈┈┈┈┈

    </template>

-   When `<ase-tpl-head title="<title/>"[ subtitle="<subtitle/>"]/>`
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
        times -- clamped to zero so an over-long title never yields a
        negative count -- the very same bar-width rule as `<ase-tpl-foot/>`
        and `<ase-tpl-boxed/>`, so equal visible text yields equal total
        width.

    <template>

    ╭────━━━━**(** <render-title/> **)**━━━━────<bar/>┈┈┈┈┈┈┈┈┈┈

    </template>

-   When `<ase-tpl-foot/>` (no title attribute) should be expanded, use:

    <template>

    ╰───────────────────────────────────────────────────────────────────┈┈┈┈┈┈┈┈┈┈

    </template>

-   When `<ase-tpl-foot title="<title/>"[ subtitle="<subtitle/>"]/>`
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
        times -- clamped to zero so an over-long title never yields a
        negative count.

    <template>

    ╰────━━━━**(** <render-title/> **)**━━━━────<bar/>┈┈┈┈┈┈┈┈┈┈

    </template>

-   When `<ase-tpl-hint level="<level/>"><content/></ase-tpl-hint>`
    should be expanded, first determine whether the hint passes the
    configured guidance level (see `Guidance Hint Level` above):

    -   Set <emit>false</emit>.
    -   If <ase-guidance-level/> is `minimal` and <level/> is `minimal`,
        set <emit>true</emit>.
    -   If <ase-guidance-level/> is `normal` and <level/> is `minimal`
        or `normal`, set <emit>true</emit>.
    -   If <ase-guidance-level/> is `verbose` and <level/> is `minimal`,
        `normal`, or `verbose`, set <emit>true</emit>.
    -   If <ase-guidance-level/> is empty or not set, treat it as
        `normal` and apply the corresponding decision above.

    Then dispatch on <emit/>:

    <if condition="<emit/> is `true`">
        <template>
        ⧉ **ASE**: ▷ hint [<level/>]: **<content/>**
        </template>
    </if>
    <else>
        This construct is expanded into *nothing*.
        Do not output anything.
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
        times -- clamped to zero so an over-long title never yields a negative count.
    -   Pre-wrap every line of <content/> at *96 visible columns* (the box
        width minus the `│ ` prefix, Markdown markup not counted), breaking
        only at word boundaries and never inside an identifier, path, URL,
        or quoted code: the agent tool wraps longer lines *without* the `│ `
        prefix and visibly breaks the box. Indent each continuation line to
        the text column of its first line (e.g. behind a key glyph, bullet,
        or padded label), so gutters stay aligned.
    -   Set <body/> to <content/> with all non-empty lines prefixed with
        `│ ` and all empty lines prefixed with just `│` (so no trailing
        whitespace is produced). Do *not* prefix any line twice -- the
        <content/> itself *MUST* *NOT* contain any `│` prefixes already.

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


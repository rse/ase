---
name: ase-meta-persona
argument-hint: "[--help|-h] [<persona>]"
description: >
    Adjust communication style in four intensity levels of token usage.
    The <persona> can be either the decorative, eloquent, and explaining "writer",
    the concise, factual, and accurate "engineer" (default),
    the brief, factual, and abbreviating "telegrapher",
    the terse, rough, and stuttering "caveman".
    Use when user says "persona <persona>" or "be <persona>".
user-invocable: true
disable-model-invocation: false
effort: medium
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

<skill name="ase-meta-persona">
Persona Configuration
</skill>

1.  Determine request:
    <request>$ARGUMENTS</request>
    Do not output anything.

2.  <if condition="<request/> is empty">
    1.  Call the `ase_persona(session: "<ase-session-id/>")`
        tool from the `ase` MCP server and set
        <ase-persona-style/> to its `text` output.
        Do not output anything.

    2.  Output the following <template/>:

        <template>
        ⧉ **ASE**: ☯ persona: **<ase-persona-style/>**
        </template>
    </if>

3.  <if condition="<request/> is NOT empty">
    1.  If <request/> is NEITHER 'writer', 'engineer', 'telegrapher',
        NOR 'caveman', report this with the following <template/> and then
        *STOP* immediately:

        <template>
        ⧉ **ASE**: **ERROR:** invalid persona: "<request/>" (expected `writer`, `engineer`, `telegrapher`, or `caveman`)
        </template>

    2.  Set <ase-persona-style><request/></ase-persona-style> and
        call the `ase_persona(style: "<ase-persona-style/>", session:
        "<ase-session-id/>")` tool from the `ase` MCP server. Do not
        output anything.

    3.  Output the following <template/>:

        <template>
        ⧉ **ASE**: ☯ persona: **<ase-persona-style/>** (*updated*)
        </template>
    </if>


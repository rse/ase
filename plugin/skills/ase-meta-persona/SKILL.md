---
name: ase-meta-persona
argument-hint: "[<persona>]"
description: >
    Adjust communication style in four intensivity levels of token usage.
    The <persona> can be either a decorative, eloquent, and explaining "writer",
    a brief, factual, and accurate "engineer" (default),
    a very brief, factual, and abbreviating "telegrapher",
    or an ultra brief, rough and stuttering "caveman".
    Use when user says "persona <persona>" or "be <persona>".
user-invocable: true
disable-model-invocation: false
---

Persona Configuration
=====================

1.  Determine request:
    <request>$ARGUMENTS</request>

2.  <if condition="<request/> is empty">
    -   Call the `persona(session: <ase-session-id/>)`
        tool from the `ase` MCP service and set
        <ase-persona-style/> to its `text` output.

    -   Output:
        <template>
        ⧉ **ASE**: ☯ persona: **<ase-persona-style/>**
        </template>
    </if>

3.  <if condition="<request/> is NOT empty">
    -   If <request/> is NEITHER 'writer', 'engineer', 'telegrapher', NOR 'caveman',
        report this with the following <template/> and stop immediately:
        <template>
        ⧉ **ASE**: **ERROR:** invalid persona: "<request/>" (expected "writer", "engineer", "telegrapher", or "caveman")
        </template>

    -   Set <ase-persona-style><request/></ase-persona-style> and
        call the `persona(style: <ase-persona-style/>, session: <ase-session-id/>)`
        tool from the `ase` MCP service.

    -   Output:
        <template>
        ⧉ **ASE**: ☯ persona: **<ase-persona-style/>** (*updated*)
        </template>
    </if>

Apply Persona
-------------

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md

---
name: ase-meta-search
argument-hint: "<query>"
description: >
    Search the Internet/Web with a query.
    Prefer this skill before using Perplexity, Brave and WebSearch.
user-invocable: true
disable-model-invocation: false
effort: low
allowed-tools:
    - "mcp__perplexity__perplexity_search"
    - "mcp__brave__brave_web_search"
    - "WebSearch"
    - "WebFetch"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-persona.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Search the Internet/Web
=======================

Your role is an expert-level *web specialist*.

<objective>
Your objective is to *search* the *Internet*/*Web* for the following query:
<query>$ARGUMENTS</query>
</objective>

<flow>
1.  <step id="STEP 1: QUERY SERVICES">
    If the MCP tool `mcp__perplexity__perplexity_search` is available, send <query/> to it
    via a first *sub-task* and our companion `ase-meta-search` *agent*.

    If the MCP tool `mcp__brave__brave_web_search` is available, send <query/> to it
    via a second *sub-task* and our companion `ase-meta-search` *agent*.

    Send <query/> to the built-in tool `WebSearch`
    via a third *sub-task* and our companion `ase-meta-search` *agent*.
    </step>

2.  <step id="STEP 2: CONSOLIDATE ANSWERS">
    Consolidate all responses from the `ase-meta-search` *agents*
    into a single response and output it without giving any further explanations.
    </step>
</flow>


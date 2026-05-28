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
    - "mcp__search-perplexity__perplexity_search"
    - "mcp__search-brave__brave_web_search"
    - "mcp__search-exa__web_search_exa"
    - "WebSearch"
    - "Agent"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Search the Internet/Web
=======================

<skill name="ase-meta-search">
Search the Internet/Web
</skill>

<objective>
Your objective is to *search* the *Internet*/*Web* for the following query:
<query>$ARGUMENTS</query>
</objective>

<flow>

1.  <step id="STEP 1: Query Search Services">

    <define name="agent">
    ```text
        Agent(
            name:          "ase:ase-meta-search",
            description:   "Query Web Search Service",
            subagent_type: "ase:ase-meta-search",
            prompt:        <content/>
        )
    ```
    </define>

    If the MCP tool `perplexity_search` from the MCP server `search-perplexity` is available:
    <expand name="agent">
        Call the MCP tool `perplexity_search(query: "<query/>")`
        from the MCP server `search-perplexity`.
    </expand>

    If the MCP tool `brave_web_search` from the MCP server `search-brave` is available:
    <expand name="agent">
        Call the MCP tool `brave_web_search(query: "<query/>")`
        from the MCP server `search-brave`.
    </expand>

    If the MCP tool `web_search_exa` from the MCP server `search-exa` is available:
    <expand name="agent">
        Call the MCP tool `web_search_exa(query: "<query/>")`
        from the MCP server `search-exa`.
    </expand>

    <expand name="agent">
        Call the tool `WebSearch(query: "<query/>")`.
    </expand>

    </step>

2.  <step id="STEP 2: Consolidate Search Answers">

    Consolidate all responses from the `ase:ase-meta-search` agents
    calls above into a single response and output it without giving any
    further explanations.

    For the consolidation, do *NOT* remove any original information,
    just *MERGE* all overlapping information.

    </step>

</flow>


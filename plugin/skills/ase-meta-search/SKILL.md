---
name: ase-meta-search
argument-hint: "[--help|-h] [--services|-s=(all|perplexity|brave|exa|websearch|other)...] <query>"
description: >
    Search the Internet/Web with a query through Perplexity, Brave, Exa,
    and WebSearch in parallel. Use when the user wants to "search" or
    "look up" something on the Internet/Web, and prefer it over using
    those search tools directly.
user-invocable: true
disable-model-invocation: false
effort: medium
allowed-tools:
    - "mcp__search-perplexity__perplexity_search"
    - "mcp__search-brave__brave_web_search"
    - "mcp__search-exa__web_search_exa"
    - "WebSearch"
    - "Agent"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-meta-search">
Search the Internet/Web
</purpose>

<expand name="getopt"
    arg1="ase-meta-search"
    arg2="--services|-s=(all|perplexity|brave|exa|websearch|other)...">
    $ARGUMENTS
</expand>

<objective>
Your objective is to *search* the *Internet*/*Web* for the following query:
<query><getopt-arguments/></query>
</objective>

<flow>

1.  <step id="STEP 1: Query Search Services">

    <if condition="<query/> is empty">
    Only output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-meta-search**, ▶ ERROR: expected a `<query>` argument
    </template>
    </if>

    <define name="agent">
    ```text
        Agent(
            description:       "Query Web Search Service: <arg1/>",
            subagent_type:     "ase:ase-meta-search",
            prompt:            <content/>,
            run_in_background: false
        )
    ```
    </define>

    Treat <getopt-option-services/> as a comma-separated list of
    *backend tokens*. The getopt parser validates only the *first*
    token, so you *MUST* validate each remaining token yourself against
    the allowed set `all`, `perplexity`, `brave`, `exa`, `websearch`, `other`. If
    any token is *not* in this set, bind <token/> to that offending
    token, then only output the following <template/> and then
    immediately *STOP* processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-meta-search**, ▶ ERROR: invalid `--services` token: **<token/>**
    </template>

    A backend is *selected* if `all` is in <getopt-option-services/> *OR*
    that backend's own name is in <getopt-option-services/>.

    Then invoke the following tool once per *selected* backend, emitting
    *all* invocations *in one single message* so they run in *parallel*:

    If the `perplexity` backend is *selected* and the MCP tool
    `perplexity_search` from the MCP server `search-perplexity` is available:

    <expand name="agent" arg1="perplexity">
        Call the MCP tool `perplexity_search(query: "<query/>")`
        from the MCP server `search-perplexity`.
    </expand>

    If the `brave` backend is *selected* and the MCP tool
    `brave_web_search` from the MCP server `search-brave` is available:

    <expand name="agent" arg1="brave">
        Call the MCP tool `brave_web_search(query: "<query/>")`
        from the MCP server `search-brave`.
    </expand>

    If the `exa` backend is *selected* and the MCP tool
    `web_search_exa` from the MCP server `search-exa` is available:

    <expand name="agent" arg1="exa">
        Call the MCP tool `web_search_exa(query: "<query/>")`
        from the MCP server `search-exa`.
    </expand>

    If the `websearch` backend is *selected* and the tool
    `WebSearch` is available:

    <expand name="agent" arg1="websearch">
        Call the tool `WebSearch(query: "<query/>")`.
    </expand>

    If the `websearch` backend is *selected* and the tool `web_search` is
    available and the tool `WebSearch` is not available:

    <expand name="agent" arg1="websearch">
        Call the tool `web_search(query: "<query/>")`.
    </expand>

    If the `other` backend is *selected* and an MCP tool <tool/> is
    available, whose name matches the case-insensitive regular expression
    `^mcp__.*(web.?search|search.?web).*$` and which is none of the MCP
    tools of the backends above, and either `other` is explicitly in
    <getopt-option-services/> or none of the other selected backends
    could be invoked (pick at most *one* such <tool/>):

    <expand name="agent" arg1="other">
        Call the MCP tool `<tool/>` with "<query/>" as the value of its
        query parameter (or of its single string parameter).
    </expand>

    If *none* of the selected backends could be invoked - because no
    corresponding tool is available - only output the following
    <template/> and then immediately *STOP* processing the entire current
    skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-meta-search**, ▶ ERROR: no search backend available: **<getopt-option-services/>**
    </template>

    </step>

2.  <step id="STEP 2: Consolidate Search Answers">

    Consolidate all responses from the `ase:ase-meta-search` agent
    calls above into a single response and output it without giving any
    further explanations.

    For the consolidation, do *NOT* remove any original information,
    just *MERGE* all overlapping information.

    </step>

</flow>


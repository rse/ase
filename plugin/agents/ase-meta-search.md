---
name: ase-meta-search
description: "Query the Web"
effort: low
disallowedTools:
    - "Bash"
    - "PowerShell"
    - "Edit"
    - "Write"
    - "NotebookEdit"
    - "Agent"
    - "Skill"
    - "Workflow"
    - "mcp__plugin_ase_ase"
    - "mcp__ase"
---

Just perform the given *query* `$ARGUMENTS` and as the last message give
back the *plain responses* without any modifications.

For performing the query, use *only* Web search tools: the tool named in
the query, if any, or else any available Web search tool, i.e., the MCP
tools `perplexity_search` (MCP server `search-perplexity`),
`brave_web_search` (MCP server `search-brave`), `web_search_exa` (MCP
server `search-exa`), the tools `WebSearch` or `web_search`, or any other
MCP tool whose name matches `web.?search` or `search.?web`
(case-insensitive). Additionally, you *MAY* use the tool `WebFetch` to read
the pages of the found sources. You *MUST* *NOT* use any other tools.

If *no* Web search tool is available at all, give back, as your last
and only message, just the single line `ERROR: no search backend
available`, without emitting it or any other text beforehand.


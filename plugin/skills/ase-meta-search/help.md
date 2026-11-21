
##  NAME

`ase-meta-search` - Search the Internet/Web

##  SYNOPSIS

`ase-meta-search`
    [`--help`|`-h`]
    [`--services`|`-s`=(`all`|`perplexity`|`brave`|`exa`|`websearch`|`other`)...]
    *query*

##  DESCRIPTION

The `ase-meta-search` skill searches the *Internet*/*Web* for the
given *query*. It dispatches the query in parallel to the *selected*
search services (Perplexity, Brave, Exa, Claude's built-in
`WebSearch`, and any other Web search tool of an MCP server, like the
one of an LLM gateway) via the `ase:ase-meta-search` sub-agent and
consolidates all responses into a single answer without removing
original information.

This skill should be preferred over directly invoking Perplexity,
Brave, or `WebSearch` individually.

##  OPTIONS

-   `--services`|`-s`=(`all`|`perplexity`|`brave`|`exa`|`websearch`|`other`)...:
    The comma-separated list of search backends to query. The default
    `all` queries every available backend;
    otherwise only the listed backends are queried. The backend `other`
    is any MCP tool whose name contains `web search` resp. `search web`
    (in any spelling), and `all` falls back to it only if no named
    backend is available. If none of the
    selected backends is available, the skill stops with an error.

##  ARGUMENTS

-   *query*:
    The search query to dispatch to the search services.

##  SCENARIOS

-   You want the Internet/Web searched for a query
-   You want results from several search backends consolidated
-   You want current facts which model knowledge may lack

##  EXAMPLES

Search the Web for a topic across all backends:

```text
❯ /ase-meta-search latest stable release of TypeScript and release notes
```

Search the Web using only the Brave and Exa backends:

```text
❯ /ase-meta-search --services=brave,exa latest stable release of TypeScript
```

##  SEE ALSO

[`ase-meta-chat`](../ase-meta-chat/help.md), [`ase-meta-quorum`](../ase-meta-quorum/help.md), [`ase-arch-discover`](../ase-arch-discover/help.md).

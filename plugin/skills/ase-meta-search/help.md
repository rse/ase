
##  NAME

`ase-meta-search` - Search the Internet/Web

##  SYNOPSIS

`ase-meta-search`
    [`--help`|`-h`]
    [`--services`|`-s`=(`all`|`perplexity`|`brave`|`exa`|`websearch`)...]
    *query*

##  DESCRIPTION

The `ase-meta-search` skill searches the *Internet*/*Web* for the
given *query*. It dispatches the query in parallel to the *selected*
search services (Perplexity, Brave, Exa, and Claude's built-in
`WebSearch`) via the `ase:ase-meta-search` sub-agent and consolidates
all responses into a single answer without removing original
information.

This skill should be preferred over directly invoking Perplexity,
Brave, or `WebSearch` individually.

##  ARGUMENTS

`--services`|`-s`=(`all`|`perplexity`|`brave`|`exa`|`websearch`)...:
    The comma-separated list of search backends to query. The default
    `all` queries every available backend (the original behavior);
    otherwise only the listed backends are queried.

*query*:
    The search query to dispatch to the search services.

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

`ase-meta-chat`, `ase-meta-quorum`, `ase-arch-discover`.


##  NAME

`ase-meta-search` - Search the Internet/Web

##  SYNOPSIS

`ase-meta-search`
    [`--help`|`-h`]
    *query*

##  DESCRIPTION

The `ase-meta-search` skill searches the *Internet*/*Web* for the
given *query*. It dispatches the query in parallel to all available
search services (Perplexity, Brave, Exa, and Claude's built-in
`WebSearch`) via the `ase:ase-meta-search` sub-agent and consolidates
all responses into a single answer without removing original
information.

This skill should be preferred over directly invoking Perplexity,
Brave, or `WebSearch` individually.

##  ARGUMENTS

*query*:
    The search query to dispatch to the search services.

##  EXAMPLES

Search the Web for a topic:

```text
❯ /ase-meta-search latest stable release of TypeScript and release notes
```

##  SEE ALSO

`ase-meta-chat`, `ase-meta-quorum`, `ase-arch-discover`.

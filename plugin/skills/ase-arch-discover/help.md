
##  NAME

`ase-arch-discover` - Discover Components

##  SYNOPSIS

`ase-arch-discover`
    [`--help`|`-h`]
    *functionality*

##  DESCRIPTION

The `ase-arch-discover` skill discovers additional, *third-party
components* (libraries/frameworks) for the technology stack that
provide the needed *functionality*.

The skill determines the project's technology stack (TypeScript,
JavaScript, Kotlin, or Java), derives essential keywords from the
requested functionality, queries the corresponding package registry
(NPM or Maven Central), retrieves metadata (version, downloads,
stars, dates) via the `ase_component_info` MCP tool, and reports
the top-ranked components as a Markdown table together with a single
distinguishing hint (USP, Crux, or Gotcha) per component.

##  ARGUMENTS

*functionality*:
    A short description of the desired functionality the third-party
    component should provide.

##  EXAMPLES

Discover components for JSON schema validation:

```text
❯ /ase-arch-discover JSON schema validation
```

Discover components for HTTP client functionality:

```text
❯ /ase-arch-discover HTTP client with retries
```

##  SEE ALSO

`ase-arch-analyze`, `ase-meta-search`, `ase-meta-evaluate`.

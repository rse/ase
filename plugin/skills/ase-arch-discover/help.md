
##  NAME

`ase-arch-discover` - Discover Components

##  SYNOPSIS

`ase-arch-discover`
    [`--help`|`-h`]
    [`--limit`|`-l=12`]
    [`--staleness`|`-s=18`]
    [`--small-scope`|`-S`]
    *functionality*

##  DESCRIPTION

The `ase-arch-discover` skill discovers additional, *third-party
components* (libraries/frameworks) for the technology stack that
provide the needed *functionality*.

The skill determines the project's technology stack (TypeScript,
JavaScript, Kotlin, or Java), derives essential keywords from the
requested functionality, queries the corresponding package registry
(NPM or Maven Central), retrieves metadata (version, downloads,
stars, dates, dependency count) via the `ase_component_info` MCP tool,
and reports the top-ranked components as a Markdown table together with
a single distinguishing hint (USP, Crux, or Gotcha) per component.

The ranking penalizes *stale* components (last release older than the
`--staleness` threshold) and, when the `--small-scope` option is given,
demotes dependency-heavy components.

##  OPTIONS

`--limit`|`-l=12`:
    The *maximum* number of components searched per source and retained
    in the final ranking (default: 12). Raise it for a broader, more
    exhaustive survey, lower it for a quicker, narrower lookup.

`--staleness`|`-s=18`:
    The *staleness threshold* in months (default: 18). A component whose
    last release is older than this is rank-penalized and flagged with an
    `aging` gotcha; older than *twice* the threshold, it is penalized
    harder and flagged as `stale/abandoned`.

`--small-scope`|`-S`:
    Treat the requested *functionality* as *small-scope* (default: off).
    When enabled, the ranking demotes dependency-heavy components by a
    dependency-weight penalty, since a dependency-free/hand-rolled
    implementation is a realistic alternative for narrow, self-contained
    functionality.

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

Discover a broader set of up to 20 HTTP client components:

```text
❯ /ase-arch-discover --limit 20 HTTP client with retries
```

Discover HTTP clients, flagging any without a release in the last 12 months:

```text
❯ /ase-arch-discover --staleness 12 HTTP client with retries
```

##  SEE ALSO

[`ase-arch-analyze`](../ase-arch-analyze/help.md), [`ase-meta-search`](../ase-meta-search/help.md), [`ase-meta-evaluate`](../ase-meta-evaluate/help.md).

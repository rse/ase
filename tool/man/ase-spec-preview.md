# ase-spec-preview(1) -- Serve a Live Preview of the Project Specification

## SYNOPSIS

`ase spec preview`
\[`-h`|`--help`\]
\[`-a`|`--addr` *ip-addr*\]
\[`-p`|`--port` *tcp-port*\]
\[`-S`|`--schema`\]
\[`-O`|`--omit` *aspect*\[`,`...\]\] \[...\]
\[`-F`|`--fetch` *mode*\]

## DESCRIPTION

**ase spec preview** serves the HTML export of the *SpecBook*-based
specification Markdown files below `project.artifact.spec.basedir` (see
`ase-spec`(1)) as a live preview on `http://`*ip-addr*`:`*tcp-port*`/`
(default: `http://127.0.0.1:12345/`). The export is kept in sync with
its sources exactly like under `ase spec export --watch` (see
`ase-spec-export`(1)), and every fresh export is pushed into the
connected browsers as an in-place document update. Before the first
successful export, a placeholder page is served instead.

The command does not terminate on its own, but runs until it is
interrupted (e.g., via `CTRL+C`).

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-a`|`--addr` *ip-addr*\]:
  The IP address to listen on (default: `127.0.0.1`).

- \[`-p`|`--port` *tcp-port*\]:
  The TCP port to listen on, an integer in the range `1`..`65535`
  (default: `12345`).

- \[`-S`|`--schema`\]:
  Preview the effective schema configuration `project.artifact.spec.schema`
  itself, rendered as a *SpecBook* document, instead of the specification.

- \[`-O`|`--omit` *aspect*\[`,`...\]\]:
  Omit content aspects from the HTML export instead of just leaving
  them foldable in the browser, exactly like for `ase spec export` (see
  `ase-spec-export`(1)). The option is repeatable.

- \[`-F`|`--fetch` *mode*\]:
  When to fetch the remote schemas of the schema configuration through
  the network: `never`, `auto` (the default), or `always` (see `ase-spec`(1)).

## EXIT STATUS

Runs until interrupted. Exits with status `1` on an invalid TCP port,
an unknown omit aspect, or if the server cannot be started.

## EXAMPLES

```sh
# serve the live preview on the default address and port
$ ase spec preview

# serve the live preview on all interfaces on port 8080
$ ase spec preview -a 0.0.0.0 -p 8080

# serve the live preview of the schema configuration
$ ase spec preview -S

# serve the live preview without the code diagrams and overlong cells
$ ase spec preview -O diagram:code,text:long
```

## SEE ALSO

`ase`(1), `ase-spec`(1), `ase-spec-export`(1), `ase-spec-lint`(1),
`ase-spec-query`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

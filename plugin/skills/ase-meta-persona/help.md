
##  NAME

`ase-meta-persona` - Persona Configuration

##  SYNOPSIS

`ase-meta-persona`
    [`--help`|`-h`]
    [*persona*]

##  DESCRIPTION

The `ase-meta-persona` skill gets or sets the active *communication
style* (persona) of the assistant. Five intensity levels of token
usage are supported, from most verbose to most terse:

-   `writer`: decorative, eloquent, and explaining; full prose
    sentences bundled into paragraphs separated by blank lines
-   `engineer`: concise, factual, and accurate (default); prefers
    bullet point lists with one aspect per bullet
-   `journalist`: layered, pyramid-structured; every aspect a single-line
    bullet following `**<title>**: <core> ▶ **<keywords>**: <details>.`,
    with a one-to-two word title, a terse core, one-to-four keywords, and
    a one-to-four sentence detail
-   `telegrapher`: brief, factual, and abbreviating; every aspect a
    single-line bullet following `**<title>**: <core>.`, with a one-to-two
    word title and a terse, arrow/em-dash-joined core
-   `caveman`: terse, rough, and stuttering; every aspect a single-line
    bullet with a very terse core of one-word fields or a one-to-two word
    expression

Without arguments, the skill reports the currently active persona.
With a *persona* argument, it switches to that persona via the
`ase_persona` MCP tool.

##  ARGUMENTS

*persona*:
    The persona to activate; one of `writer`, `engineer`, `journalist`,
    `telegrapher`, or `caveman`. If omitted, the currently active
    persona is reported.

##  EXAMPLES

Show the currently active persona:

```text
❯ /ase-meta-persona
```

Switch to the telegrapher persona:

```text
❯ /ase-meta-persona telegrapher
```

##  SEE ALSO

[`ase-task-id`](../ase-task-id/help.md).

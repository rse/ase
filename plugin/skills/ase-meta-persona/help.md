
##  NAME

`ase-meta-persona` - Persona Configuration

##  SYNOPSIS

`ase-meta-persona`
    [`--help`|`-h`]
    [*persona*]

##  DESCRIPTION

The `ase-meta-persona` skill gets or sets the active *communication
style* (persona) of the assistant. Four intensity levels of token
usage are supported, from most verbose to most terse:

-   `writer`: decorative, eloquent, and explaining
-   `engineer`: concise, factual, and accurate (default)
-   `telegrapher`: brief, factual, and abbreviating
-   `caveman`: terse, rough, and stuttering

Without arguments, the skill reports the currently active persona.
With a *persona* argument, it switches to that persona via the
`ase_persona` MCP tool.

##  ARGUMENTS

*persona*:
    The persona to activate; one of `writer`, `engineer`,
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

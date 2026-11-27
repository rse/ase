
##  NAME

`ase-help-diagnose` - Diagnose an Agent Session

##  SYNOPSIS

`ase-help-diagnose`
    [`--help`|`-h`]
    [`--session`|`-s` *session-id*]
    [*issue-hint*]

##  DESCRIPTION

The `ase-help-diagnose` skill diagnoses an agent session of *Anthropic
Claude Code CLI*, *OpenAI Codex CLI*, or *GitHub Copilot CLI* -- the
current session, or the one named by `--session` -- and reports what
happened in it with *evidence*. The session transcript is read from
disk and never modified, and the agent tool of a named session is
detected automatically, so a session of another agent tool can be
diagnosed, too.

Without an *issue-hint*, the session is diagnosed *in general*. With an
*issue-hint*, like `it took too long` or `the grilling was skipped`, the
diagnosis leads with the hinted issue and additionally investigates
where it manifests, what triggered it, and what it caused.

The diagnosis covers the skills invoked (and those which should have
fired), the adherence to agreed plans, repeated work, stumbles like
tool errors and dead ends, success claims without verification
evidence, conflicts with the requests of the user, the cost and time
drivers, and the conformance of the ASE skills and tools themselves.

The report starts with a verdict -- `HEALTHY`, `DEGRADED`, or
`UNHEALTHY` -- and the key figures of the session, followed by one row
per finding with its severity, its dimension, the transcript line
proving it, its likely root cause, and a recommendation preventing it
in future sessions. Findings without a transcript line proving them are
never reported, and no fix is applied.

##  OPTIONS

-   `--session`|`-s` *session-id*:
    Diagnose the session with the id *session-id* instead of the
    current session.

##  ARGUMENTS

-   *issue-hint*:
    An optional free-text hint on the particular issue to diagnose. If
    omitted, the session is diagnosed in general.

##  SCENARIOS

-   You want to know what went wrong in the current session
-   You want to know why a session took so long or was so expensive
-   You want to know why a skill did not fire or a plan was ignored
-   You want an earlier or parallel session diagnosed by its id

##  EXAMPLES

Diagnose the current session in general:

```text
❯ /ase-help-diagnose
```

Diagnose the current session for a particular issue:

```text
❯ /ase-help-diagnose why did it run the build three times?
```

Diagnose an earlier session, of any agent tool, by its id:

```text
❯ /ase-help-diagnose -s 3f2b9c1e-8a4d-4e6f-9b0a-1c2d3e4f5a6b it ignored the plan
```

##  SEE ALSO

[`ase-meta-why`](../ase-meta-why/help.md), [`ase-help-intent`](../ase-help-intent/help.md),
[`ase-code-edit`](../ase-code-edit/help.md).

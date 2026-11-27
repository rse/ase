# ase-util-session(1) -- Summarize the Transcript of an Agent Tool Session

## SYNOPSIS

`ase util session`
\[`-h`|`--help`\]
\[`-t`|`--tool` `claude`|`codex`|`copilot`\]
\[`-f`|`--format` `md`|`yaml`|`json`\]
\[*session-id*\]

## DESCRIPTION

**ase util session** locates the on-disk transcript of an agent tool
session, given by its *session-id*, and prints a summary of it to
standard output. Without a *session-id*, the most recent session whose
working directory is the current directory (or inside it) is taken. The
transcript files are only read, never modified.

The transcripts are searched in the session stores of the agent tools:

- `claude` (*Anthropic Claude Code CLI*):
  `$CLAUDE_CONFIG_DIR/projects/`*project*`/`*session-id*`.jsonl`
  (default `~/.claude`), plus the subagent transcripts below
  *project*`/`*session-id*`/subagents/`.

- `codex` (*OpenAI Codex CLI*):
  `$CODEX_HOME/sessions/`...`/rollout-`*time*`-`*session-id*`.jsonl` and
  the same below `archived_sessions/` (default `~/.codex`). Compressed
  `*.jsonl.zst` rollout files are skipped with a warning.

- `copilot` (*GitHub Copilot CLI*):
  `$COPILOT_HOME/session-state/`*session-id*`/events.jsonl` or the
  legacy `$COPILOT_HOME/session-state/`*session-id*`.jsonl` (default
  `~/.copilot`).

The summary covers the agent tool and its version, the working
directory, the period, the models, the token usage as recorded by the
agent tool, the transcript files with their lines and bytes, the counts
of the events per kind, and the normalized timeline of the session. The
timeline has one event per human `prompt`, parent agent `dispatch` (in
a subagent transcript), assistant `reply`, `tool-call`, `tool-error`,
`compaction`, or `error`. Each event carries the absolute path and the
line of its transcript record, and a text truncated to 200 characters.

As the transcript formats are internal to the agent tools and change
between their versions, unknown records are ignored, malformed lines
are skipped with a warning, and unrecorded values are reported as
unknown. This backs the MCP tool `ase_session`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-t`|`--tool` `claude`|`codex`|`copilot`\]:
  Agent tool of the session (default: auto-detected, by searching the
  session stores of `claude`, `codex`, and `copilot` in this order).

- \[`-f`|`--format` `md`|`yaml`|`json`\]:
  Output format of the summary: Markdown, YAML, or JSON (default: `md`).

## ARGUMENTS

- \[*session-id*\]:
  The id of the session, as shown by the agent tool (e.g. via
  `/status` resp. `/session`). If omitted, the most recent session of
  the current directory is taken.

## ENVIRONMENT

- `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `COPILOT_HOME`:
  The home directories of the agent tools, holding their session stores.

## EXIT STATUS

Exits with status `0` on success, and with status `1` if the
*session-id* is invalid or no transcript of the session is found.

## EXAMPLES

```sh
# summarize the most recent session of the current directory
$ ase util session

# summarize a particular OpenAI Codex CLI session as JSON
$ ase util session -t codex -f json 019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b
```

## SEE ALSO

`ase`(1), `ase-util`(1), `ase-hook`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

# ase-hook(1) -- Handle the Hook Events of the Agent Tool

## SYNOPSIS

`ase hook`
\[`-h`|`--help`\]

`ase hook`
*event*
\[`-t`|`--tool` *tool*\]

## DESCRIPTION

**ase hook** is the entry point group of the hook handlers which the
*ASE* plugin configures in the agent tool: in `hooks/hooks.json` for
*Anthropic Claude Code CLI*, in `hooks/hooks-copilot.json` for *GitHub
Copilot CLI* (with `--tool copilot`), and in `hooks/hooks-codex.json`
for *OpenAI Codex CLI* (with `--tool codex`). The agent tool invokes a
handler on the corresponding event, passes the event payload as a JSON
object on standard input, and interprets the JSON object a handler
optionally writes to standard output.

The handlers are intended to be invoked by the agent tool internally
only, and not directly by end users. Without a sub-command, the usage
information is shown and the command exits with status `1`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information, including the list of all event handlers,
  and exit.

## COMMANDS

The following event handlers exist, each accepting the option
\[`-t`|`--tool` *tool*\] (`claude`, `copilot`, or `codex`, default:
`$ASE_TOOL`, else `claude`) to select the agent tool whose payload
format is read and written:

- `ase hook session-start`:
  Handle the `SessionStart` (resp. `sessionStart`) event: inject the
  *ASE* constitution and session information into the session context.
  See `ase-hook-session-start`(1).

- `ase hook session-persona`:
  Handle the `SessionStart` (resp. `sessionStart`) event a second time:
  inject the *ASE* persona rules into the session context.
  See `ase-hook-session-persona`(1).

- `ase hook session-end`:
  Handle the `SessionEnd` (resp. `sessionEnd`) event: remove the
  session state and detach the session from its AI usage window. See
  `ase-hook-session-end`(1).

- `ase hook pre-tool-use`:
  Handle the `PreToolUse` (resp. `preToolUse`) event: auto-approve the
  invocations of *ASE* tools. See `ase-hook-pre-tool-use`(1).

- `ase hook permission-request`:
  Handle the `PermissionRequest` event of *OpenAI Codex CLI*:
  auto-approve the invocations of *ASE* tools. See
  `ase-hook-permission-request`(1).

- `ase hook user-prompt-submit`:
  Handle the `UserPromptSubmit` (resp. `userPromptSubmitted`) event:
  mark the agent as busy. See `ase-hook-user-prompt-submit`(1).

- `ase hook stop`:
  Handle the `Stop` (resp. `agentStop`) event: mark the agent as
  ready. For Anthropic Claude Code CLI, once per turn, re-prompt the
  model instead if its reply text of the turn (outside code blocks and
  spans) still carries unfilled template placeholders like
  `<ase-task-id/>`. See `ase-hook-stop`(1).

## ENVIRONMENT

- `ASE_TOOL`:
  The default of the `--tool` option of all event handlers. An invalid
  value is reported only once a handler actually runs.

## EXIT STATUS

Each event handler exits with status `0` on success, and with status
`1` on an invalid `--tool` value or a fatal error. The group command
without a sub-command exits with status `1`.

## SEE ALSO

`ase`(1), `ase-hook-session-start`(1), `ase-hook-session-persona`(1),
`ase-hook-session-end`(1),
`ase-hook-pre-tool-use`(1), `ase-hook-permission-request`(1),
`ase-hook-user-prompt-submit`(1), `ase-hook-stop`(1), `ase-setup`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

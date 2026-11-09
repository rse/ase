# ase-setup-statusline(1) -- Activate or Deactivate the ASE Statusline

## SYNOPSIS

`ase setup statusline`
\[`-h`|`--help`\]

`ase setup statusline activate`
\[`-h`|`--help`\]
\[`-t`|`--tool` *tool*\]
\[`-s`|`--scope` *scope*\]
\[`-w`|`--width` *n*\]
\[`-m`|`--margin` *n*\]
\[`-p`|`--padding` *n*\]
\[`--no-icons`\]
\[`--no-labels`\]
\[*format* \[...\]\]

`ase setup statusline deactivate`
\[`-h`|`--help`\]
\[`-t`|`--tool` *tool*\]
\[`-s`|`--scope` *scope*\]

## DESCRIPTION

**ase setup statusline** activates or deactivates the *ASE*
statusline, i.e., the `ase statusline` renderer (see
`ase-statusline`(1)) configured as the `statusLine` command in the
settings file of the agent tool. Without a sub-command, the usage
information is shown and the command exits with status `1`.

The statusline is supported for *Anthropic Claude Code CLI* (`claude`)
and *GitHub Copilot CLI* (`copilot`) only, while *OpenAI Codex CLI*
(`codex`) has no scriptable statusline mechanism, so `--tool codex`
fails with an error.

The settings file is, for `claude`, `~/.claude/settings.json` (scope
`user`), `.claude/settings.json` (scope `project`), resp.
`.claude/settings.local.json` (scope `local`) relative to the current
working directory, and, for `copilot`, the single per-user
`$COPILOT_HOME/settings.json` (default: `~/.copilot/settings.json`).
The settings file is edited in place (preserving its formatting and
all other entries) and written atomically, and a missing settings file
(and its directory) is created.

A `statusLine` entry counts as owned by *ASE* if its `command` starts
with `ase statusline`. A foreign, hand-crafted `statusLine` entry is
never touched by either sub-command: it is preserved with a warning,
and the command still exits with status `0`.

## COMMANDS

- `ase setup statusline activate` \[*options*\] \[*format* \[...\]\]:
  Add the `statusLine` entry of *ASE* to the settings file, or update
  an existing one of *ASE* in place.

  The entry is the object
  `{ "type": "command", "command": "ase statusline ...", "padding": 0 }`
  (for `claude` additionally with `"refreshInterval": 10`, re-running
  the command every 10 seconds beside its event-driven updates),
  whose command is `ase statusline --tool` *tool* `-w` *width* `-m`
  *margin* `-p` *padding*, followed by `--no-icons` and `--no-labels`
  if given, and the *format* lines, each one single-quoted for the
  shell (resp. double-quoted for `copilot` on Windows, which spawns
  the command via `cmd.exe`).

- `ase setup statusline deactivate` \[*options*\]:
  Remove the `statusLine` entry of *ASE* from the settings file. A
  missing settings file or a missing `statusLine` entry is skipped
  with an informational message.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-t`|`--tool` *tool*\]:
  Select the target agent tool: `claude` or `copilot` (default:
  `$ASE_TOOL`, else `claude`). `codex` is rejected with an error.

- \[`-s`|`--scope` *scope*\]:
  Select the settings file of the scope `user` (default), `project`,
  or `local` (see above). Only supported for `--tool claude`; a
  non-`user` scope for `copilot`, which has a single per-user settings
  file, fails with an error.

- \[`-w`|`--width` *n*\] (`activate` only):
  Force the terminal width of the statusline rendering to *n*
  characters, where `0` (default) auto-detects it via `/dev/tty`.
  Has to be a non-negative integer.

- \[`-m`|`--margin` *n*\] (`activate` only):
  Reduce the maximum used terminal width by *n* characters on each
  side (default: `2`). Has to be a non-negative integer.

- \[`-p`|`--padding` *n*\] (`activate` only):
  Pad each rendered line with *n* spaces on the left and right side
  (default: `0`). Has to be a non-negative integer.

- \[`--no-icons`\] (`activate` only):
  Disable the leading icon glyph in front of each placeholder
  rendering.

- \[`--no-labels`\] (`activate` only):
  Disable the textual label in front of the bold value of each
  placeholder rendering.

## ARGUMENTS

- \[*format* \[...\]\] (`activate` only):
  One or more statusline template lines of literal text,
  `%`-prefixed placeholders, and `<`*color*`>`...`</`*color*`>`
  markup (see `ase-statusline`(1) for all placeholders and colors).
  Without any *format*, the following three default lines are used:
  `<blue>%u</blue> <red>%p</red> <black>%T</black> %s` (user, project,
  task, and session), `%m %e %t` (model, effort, and thinking), and
  `%P %h %B %c` (persona, guidance level, boxing, and context usage).

## ENVIRONMENT

- `ASE_TOOL`:
  The default of `--tool`.

- `COPILOT_HOME`:
  The configuration directory of *GitHub Copilot CLI* (default:
  `~/.copilot`).

## FILES

- `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`:
  The settings files of *Anthropic Claude Code CLI* of the scopes
  `user`, `project`, and `local`.

- `$COPILOT_HOME/settings.json` (default: `~/.copilot/settings.json`):
  The settings file of *GitHub Copilot CLI*.

## EXIT STATUS

`0` on success (including a preserved foreign `statusLine` entry),
`1` on any error (and when invoked without a sub-command).

## EXAMPLES

```sh
# activate the ASE statusline with its default lines
$ ase setup statusline activate

# activate a single custom line for the current project only
$ ase setup statusline activate --scope project "%p %T %m %c"

# activate the ASE statusline in GitHub Copilot CLI without icons
$ ase setup statusline activate --tool copilot --no-icons

# deactivate the ASE statusline again
$ ase setup statusline deactivate
```

## SEE ALSO

`ase`(1), `ase-setup`(1), `ase-statusline`(1), `ase-setup-status`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

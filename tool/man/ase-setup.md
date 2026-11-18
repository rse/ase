# ase-setup(1) -- Install, Update, and Uninstall the ASE Tool and Plugin

## SYNOPSIS

`ase setup`
\[`-h`|`--help`\]
*command*
\[*options* \[...\]\]
\[*args* \[...\]\]

## DESCRIPTION

**ase setup** is the entry point group for installing, updating,
uninstalling, enabling, disabling, and reporting the *ASE* tool and its
companion agent tool plugin, and for activating or deactivating the
pre-defined foreign MCP servers, the *ASE* statusline, and the *ASE*
telemetry export towards the AI usage accounting. Without a
*command*, the usage information is shown and the command exits with
status `1`.

The target agent tool is either *Anthropic Claude Code CLI*
(`claude`), *GitHub Copilot CLI* (`copilot`), or *OpenAI Codex CLI*
(`codex`). All operations are performed through the plugin and MCP
commands of the respective agent tool CLI (e.g., `claude plugin
install`), which hence has to be found in `$PATH`, and through direct
edits of its settings files (for the output style, the function
hooks, the statusline, and the telemetry). Every sub-process command is logged (with API keys
masked) and its output is shown only on failure.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information of the command group and exit.

The following options are shared by most sub-commands (see their
individual manual pages for the exact applicability):

- \[`-t`|`--tool` *tool*\]:
  Select the target agent tool: `claude` (*Anthropic Claude Code
  CLI*), `copilot` (*GitHub Copilot CLI*), or `codex` (*OpenAI Codex
  CLI*). The default is the value of the environment variable
  `ASE_TOOL`, if set and non-empty, else `claude`. An invalid value
  is rejected with an error. Accepted by all sub-commands except `ase
  setup mcp list`.

- \[`-s`|`--scope` *scope*\]:
  Select the installation scope of the plugin, MCP server, or
  statusline registration: `user` (registered globally for the
  current user), `project` (registered in the project and meant to be
  shared via version control), or `local` (registered in the project,
  but kept out of version control).

  Only supported for `--tool claude` (and, for the statusline, a `user`
  scope for `--tool copilot`); a non-`user` scope for any other tool
  fails with an error, as those agent tools have no scope concept. Not
  accepted by `ase setup status` (which reports all scopes at once) and
  `ase setup telemetry` (which is always user-level).

## COMMANDS

- `ase setup install` \[`-t`|`--tool` *tool*\] \[`-s`|`--scope` *scope*\] \[`-d`|`--dev`\] \[`--statusline`\]:
  Install the *ASE* plugin into the agent tool. See
  `ase-setup-install`(1).

- `ase setup update` \[`-t`|`--tool` *tool*\] \[`-s`|`--scope` *scope*\] \[`-f`|`--force`\] \[`-d`|`--dev`\]:
  Update the *ASE* tool and the *ASE* plugin to their latest
  versions. See `ase-setup-update`(1).

- `ase setup uninstall` \[`-t`|`--tool` *tool*\] \[`-s`|`--scope` *scope*\] \[`-d`|`--dev`\]:
  Uninstall the *ASE* plugin and the *ASE* tool. See
  `ase-setup-uninstall`(1).

- `ase setup enable` \[`-t`|`--tool` *tool*\] \[`-s`|`--scope` *scope*\]:
  Enable the already installed *ASE* plugin. See
  `ase-setup-enable`(1).

- `ase setup disable` \[`-t`|`--tool` *tool*\] \[`-s`|`--scope` *scope*\]:
  Disable the *ASE* plugin without uninstalling it. See
  `ase-setup-disable`(1).

- `ase setup status` \[`-t`|`--tool` *tool*\]:
  Report the plugin, MCP server, output style, function hooks,
  statusline, and telemetry registrations of all scopes. See `ase-setup-status`(1).

- `ase setup mcp` `list`|`activate`|`deactivate` \[...\]:
  List, activate, or deactivate the pre-defined foreign MCP servers.
  See `ase-setup-mcp`(1).

- `ase setup statusline` `activate`|`deactivate` \[...\]:
  Activate or deactivate the *ASE* statusline. See
  `ase-setup-statusline`(1).

- `ase setup telemetry` `activate`|`deactivate` \[...\]:
  Activate or deactivate the *OpenTelemetry* export of the agent tool
  towards the *ASE* OTLP ingress. See `ase-setup-telemetry`(1).

## ENVIRONMENT

- `ASE_TOOL`:
  The default of the `--tool` option (default: `claude`).

- `ASE_SETUP_DEV`:
  The default of the `--dev` option of `ase setup install`, `ase setup
  update`, and `ase setup uninstall`: any non-empty value other than
  `0` and `false` (case-insensitive) enables it.

- `ASE_SETUP_DEV_BASEDIR`:
  The base directory of the local *ASE* working copy used with
  `--dev` (default: the parent directory of the installed `@rse/ase`
  package directory).

- `ASE_MCP_KEY_`*KEY*:
  The API keys of the pre-defined MCP servers (see `ase-setup-mcp`(1)).

## FILES

- `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`:
  The settings files of *Anthropic Claude Code CLI* of the scopes
  `user`, `project`, and `local` (the latter two relative to the
  current working directory).

- `$COPILOT_HOME/settings.json` (default: `~/.copilot/settings.json`):
  The single per-user settings file of *GitHub Copilot CLI*.

- `$CODEX_HOME/config.toml` (default: `~/.codex/config.toml`):
  The per-user configuration file of *OpenAI Codex CLI*.

## EXIT STATUS

`0` on success, `1` on any error, and `1` when invoked without a
*command*.

## EXAMPLES

```sh
# install ASE for Anthropic Claude Code CLI globally
$ ase setup install

# install ASE for OpenAI Codex CLI
$ ase setup install --tool codex

# report all ASE registrations
$ ase setup status
```

## SEE ALSO

`ase`(1), `ase-setup-install`(1), `ase-setup-update`(1),
`ase-setup-uninstall`(1), `ase-setup-enable`(1),
`ase-setup-disable`(1), `ase-setup-status`(1), `ase-setup-mcp`(1),
`ase-setup-statusline`(1), `ase-setup-telemetry`(1),
`claude`(1), `copilot`(1), `codex`(1), `npm`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

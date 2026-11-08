# ase(1) -- Agentic Software Engineering (ASE)

## SYNOPSIS

`ase`
\[`-h`|`--help`\]
\[`-V`|`--version`\]
\[`-l`|`--log-level` *level*\]
\[`-L`|`--log-file` *file*\]
*command*
\[*options* \[...\]\]
\[*args* \[...\]\]

## DESCRIPTION

**ase**, *Agentic Software Engineering (ASE)*, is the command-line
companion tool of the *ASE* agent tool plugin for
*Anthropic Claude Code CLI* (primary target), *GitHub Copilot CLI*,
and *OpenAI Codex CLI* (secondary targets).

It provides the plugin and tool setup, the layered configuration
management, a per-project background HTTP service (bridged into the
agent tool as a Model-Context-Protocol (MCP) server), the agent tool
hook handlers, the statusline rendering, the persisted task plan
management (including a task store server and an interactive task
board), the autonomous task lifecycle agents (plus their agent relay
and fleet supervisor), the project artifact resolution, the
*SpecBook*-based specification initializing, linting, exporting,
querying, and previewing, and miscellaneous utilities like diagram rendering,
identifier minting, text measuring, and SVG rasterizing.

Most commands are sub-command groups. Each group and each command has
its own manual page, named after the command path with dashes, e.g.,
`ase-task`(1) for `ase task` and `ase-task-board`(1) for `ase task
board`. They are shipped with **ase** and shown via `ase man`, e.g.,
`ase man task board`.

## OPTIONS

The following top-level (global) options exist. They have to be given
*before* the *command*, as all options after the *command* belong to
the command itself.

- \[`-h`|`--help`\]:
  Show program usage information, including the list of all top-level
  commands, and exit. Every command and sub-command also accepts
  `-h`|`--help` to show its own usage information. Alternatively, `ase
  help` \[*command*\] shows the usage information of *command*.

- \[`-V`|`--version`\]:
  Show program version information (as `ASE` *version*) and exit.

- \[`-l`|`--log-level` *level*\]:
  Set the logging verbosity. Supported *level* values are `error`,
  `warning`, `info` (default), and `debug`. Log messages of a level
  above the selected one are suppressed. The level is passed on to all
  background processes (like the service, the task store, the agent
  relay, and the agents) started by the command.

- \[`-L`|`--log-file` *file*\]:
  Redirect log output to *file* (appended). Use `-` (default) to write
  log messages to standard error. If the log output is connected to a
  terminal, it is colored.

## COMMANDS

The following top-level commands exist:

- `ase setup` *command* \[...\]:
  Install, update, uninstall, enable, disable, and report the *ASE*
  tool and plugin for an agent tool, and activate or deactivate the
  pre-defined foreign MCP servers, the *ASE* statusline, and the *ASE*
  telemetry export. See `ase-setup`(1).

- `ase config` \[`--scope` *scope*\] *command* \[...\]:
  Manage the layered *ASE* configuration of the scope chain `user` <
  `project` < `task` < `session`. See `ase-config`(1).

- `ase alias` *command* \[...\]:
  Manage the skill command aliases: full aliases, option aliases, and
  option defaults of the *ASE* skills. See `ase-alias`(1).

- `ase mcp`:
  Bridge stdio MCP to the per-project background service. Configured
  as an MCP server in the agent tool. See `ase-mcp`(1).

- `ase service` *command* \[...\]:
  Manage the per-project background HTTP service. See `ase-service`(1).

- `ase hook` *command* \[...\]:
  Handle the hook events of the agent tool. Configured as hook
  handlers in the agent tool. See `ase-hook`(1).

- `ase statusline` \[*options*\] \[*line* \[...\]\]:
  Render the statusline of the agent tool. Configured as statusline
  command in the agent tool. See `ase-statusline`(1).

- `ase task` *command* \[...\]:
  Manage the persisted task plans in the task store, show the task
  board, and run the task store server. See `ase-task`(1).

- `ase artifact` *command* \[...\]:
  Resolve project artifact kinds to project-relative file lists. See
  `ase-artifact`(1).

- `ase spec` *command* \[...\]:
  Initialize, lint, export, query, and preview the *SpecBook*-based project
  specification. See `ase-spec`(1).

- `ase util` *command* \[...\]:
  Utility commands (meta files, compatibility probes, diagram rendering,
  worktree resolution, identifier minting, text measuring, and SVG
  rasterizing). See
  `ase-util`(1).

- `ase agent` *agent* *command* \[...\]:
  Run the autonomous agents driving the task lifecycle phases,
  processing the requests of tasks, estimating the effort of tasks,
  researching topics for tasks, or configured by definitions, individually or as a fleet, optionally
  reporting to the agent relay. See `ase-agent`(1).

- `ase man` \[*page* \[...\]\]:
  Browse the manual pages of all commands and skills interactively,
  with *page* selected, e.g., `ase man agent fleet` for
  `ase-agent-fleet`(1), or (outside a terminal) print one of them as
  plain text. See `ase-man`(1).

- `ase help` \[*command*\]:
  Show the usage information of *command* (or of `ase` itself).

## ENVIRONMENT

The following environment variables are honored by multiple commands.
The command-specific ones are described in their own manual pages.

- `ASE_TOOL`:
  The default target agent tool (`claude`, `copilot`, or `codex`) of
  all commands accepting a `--tool` option (default: `claude`).

- `ASE_TASK_ID`:
  The default task id of the `ase task` commands accepting an optional
  task id (default: `default`).

- `ASE_HEADLESS`:
  Set to `true` by the agents for the agent tool processes they spawn,
  to signal the skills that they run without any user interaction.

- `ASE_SETUP_DEV`:
  The default of the `--dev` option of `ase setup install`, `ase setup
  update`, and `ase setup uninstall`.

- `EDITOR`, `VISUAL`:
  The text editor used by `ase config edit`, `ase task edit`, and
  `ase task board` (falling back to `vi`).

- `PAGER`:
  The pager used by `ase task view` (falling back to `more`).

- `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `APPDATA`, `LOCALAPPDATA`:
  The base directories of the *per-user configuration directory* and
  the *per-user state directory* (see **FILES**).

## FILES

- *per-user configuration directory*:
  The per-user *ASE* configuration directory: `~/Library/Application
  Support/ase` on macOS, `%APPDATA%\ase` on Windows, and
  `$XDG_CONFIG_HOME/ase` (falling back to `~/.config/ase`) on Linux
  and other Unix systems. It holds the `user` scope configuration
  `config.yaml`, the user agent definitions `agents/`, the user skill
  command aliases `aliases.yaml`, and the state
  of the task store server (`store.yaml`, `store.log`, `tasks/`) and
  agent relay server (`relay.yaml`, `relay.log`).

- *per-user state directory*:
  The machine-local per-user *ASE* state (session configurations, task
  lifecycle deviation warnings, agent run records, and telemetry
  state), never roamed or versioned: `~/Library/Application
  Support/ase` on macOS, `%LOCALAPPDATA%\ase` on Windows, and
  `$XDG_STATE_HOME/ase` (falling back to `~/.local/state/ase`) on Linux
  and other Unix systems.

- `.ase/`:
  The per-project *ASE* directory in the project root, holding the
  `project` scope configuration `config.yaml`, the agent definitions
  `agents/`, the skill command aliases `aliases.yaml`, the fleet
  configuration `fleet.yaml`, the task plans
  `task/` of the default local task store, and the machine-local
  runtime files (`service.yaml`, `service.log`, `board.yaml`, `agent/`,
  and `worktree/`), the latter covered by the self-ignoring
  `.ase/.gitignore`.

## EXIT STATUS

The **ase** command exits with status `0` on success and with status
`1` on any error (with the error message logged at level `error`),
unless a command documents otherwise. A usage error (an unknown
command or option, or a missing argument) is reported together with
the usage information and leads to exit status `1`.

## EXAMPLES

```sh
# install the ASE tool and plugin for Anthropic Claude Code CLI
$ ase setup install

# show the effective configuration of the current project
$ ase config list

# list all open task plans with their status and title
$ ase task list -v

# show the interactive task board
$ ase task board

# start the fleet of agents of ".ase/fleet.yaml"
$ ase agent fleet start
```

## SEE ALSO

`ase-setup`(1), `ase-config`(1), `ase-alias`(1), `ase-mcp`(1), `ase-service`(1),
`ase-hook`(1), `ase-statusline`(1), `ase-task`(1), `ase-artifact`(1),
`ase-spec`(1), `ase-util`(1), `ase-agent`(1), `ase-man`(1),
`claude`(1), `copilot`(1), `codex`(1), `git`(1).

<https://ase.tools>

## HISTORY

Development of `ase`(1) started in October 2025.

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>


Usage of Tool
=============

SYNOPSIS
--------

`ase`
\[`-h`|`--help`\]
\[`-V`|`--version`\]
\[`-l`|`--log-level` *level*\]
\[`-L`|`--log-file` *file*\]
\[*command*
\[*options* \[...\]\]
\[*args* \[...\]\]\]

DESCRIPTION
-----------

`ase`, *Agentic Software Engineering (ASE)*,
is the command-line companion tool to the *ASE* Claude Code plugin.
It provides project-level configuration management and a small
per-project background HTTP service for dispatching commands.

OPTIONS
-------

The following top-level command-line options exist:

- \[`-h`|`--help`\]:
  Show program usage information only.

- \[`-V`|`--version`\]:
  Show program version information only.

- \[`-l`|`--log-level` *level*\]:
  Set the logging verbosity. Supported *level* values are
  `error`, `warning` (default), `info`, and `debug`.

- \[`-L`|`--log-file` *file*\]:
  Redirect log output to *file* (appended). Use `-` (default) to
  write log messages to standard output. If *file* is connected
  to a TTY, colors are used in the output.

COMMANDS
--------

The following top-level commands exist for configuration handling:

- `ase config`:
  Manage *ASE* configuration stored in `.ase/config.yaml`.
  Without a subcommand, prints usage information.
  The file is validated against a schema: on read, unknown or
  invalid entries are warned about and silently dropped from the
  in-memory view; on set/write, they cause a fatal error.
  Recognized keys are grouped under three top-level sections:
  `project.*` (project identity, classification, and artifact
  globs), `agent.*` (agent persona and process), and `task.*`
  (currently `task.id`, the active task identifier).
  All `ase config` subcommands accept a `--scope` *scope* option
  that selects the scope chain. The *scope* value is a
  comma-separated list of scope terms, in any order; each term
  is one of `user`, `project`, `task:`*id*, or `session:`*id*
  (where *id* matches `[A-Za-z0-9._-]+`). At most one term per
  kind is allowed. The chain is canonicalized into the fixed
  inheritance order `user` < `project` < `task` < `session`.
  `user` is always implicitly added at the bottom of the chain.
  `project` is implicitly added only when a *project context*
  exists -- i.e. when the current working directory is inside a
  Git repository, or a `.ase` directory is found at or above it.
  Specifying `project` explicitly without a project context is
  an error. Without an explicit `--scope`, the target defaults
  to `project` when a project context exists, otherwise to
  `user`.
  Reads cascade from the strongest (rightmost) scope down to the
  weakest and return the first value that is defined. Writes
  (`set`, `delete`, `edit`, `init`) are always confined to the
  strongest (target) scope's own file -- intermediate and weaker
  scopes are never modified. See *FILES* below for the resulting
  paths. Example: `--scope task:T1,session:S1` yields the chain
  `user` -> `project` -> `task:T1` -> `session:S1`, with
  `session:S1` as the write target.

- `ase config init` *type*:
  Initialize `.ase/config.yaml` with preset values for all recognized
  keys. The *type* argument selects the preset:
  `default` (empty baseline with all recognized keys present and
  unset),
  `vibe` (solo rookie: small black-box prototype, bare code, fully
  agent-driven, spec-driven, engineer ambition),
  `pro` (solo expert: medium white-box product, framework-based,
  human-controlled, code-driven, artist ambition),
  or `industry` (team crew: large grey-box MVP, framework-based,
  human-in-the-loop, code-driven, craftsman ambition).

- `ase config edit`:
  Open `.ase/config.yaml` in the editor defined by the `$EDITOR`
  or `$VISUAL` environment variable (falling back to `vi`).
  The file and its parent directory are created if missing.
  After the editor exits, the file is re-read and schema warnings
  are reported.

- `ase config list`:
  List all effective configured values across the scope
  inheritance chain, rendered as a three-column table of `key`,
  `value`, and `origin`. The `origin` column identifies the
  scope (`user`, `project`, `task:`*id*, or `session:`*id*) that
  supplied each value. For overlapping keys only the value from
  the strongest scope is shown.

- `ase config get` *key*:
  Print the value at the given dotted *key*. Fails with an error
  if *key* does not resolve to a leaf value.

- `ase config set` *key* *value*:
  Set the value at the given dotted *key* (creating intermediate
  maps as needed) and persist the file.

The following top-level commands exist for service management:

- `ase service`:
  Manage the per-project background HTTP service. The service
  is bound to `127.0.0.1` on a port persisted in `.ase/service.yaml`
  and stops itself after 30 minutes of idle time. Without a
  subcommand, the help text is shown.

- `ase service start`:
  Start the background service (detached). Allocates a random
  port in the range `42000`..`44000` if none is persisted yet,
  writes it to `.ase/service.yaml`, and probes readiness. Exits
  silently with status 0 if the service is already running; prints
  `ase: service: started on port <port>` on a fresh start.

- `ase service status`:
  Report whether the background service is running. Probes the
  persisted port via HTTP `GET /ping` and verifies that the
  responding service belongs to the current project. Prints
  `ase: service: running on port <port>` and exits with status 0
  if a matching service is reachable; otherwise prints a
  diagnostic message (no port configured, port not responding,
  or port in use by a foreign service) and exits with status 1.

- `ase service send` *cmd*:
  Dispatch the *cmd* token as a passthrough command to the running
  service via HTTP `POST /command`; if the service is not running,
  it is auto-started first.

- `ase service stop`:
  Stop the background service via HTTP `GET /stop`. Exits silently
  with status 0 on successful stop. If no port is configured or
  the port is not responding, prints an informational message and
  exits with status 0.

The following top-level command exists for bridging the per-project
background service as a *Claude Code* MCP server:

- `ase mcp`:
  Bridge stdio MCP to the per-project background service over
  Streamable HTTP. The command accepts MCP requests on standard
  input, forwards them to the running `ase service` (auto-starting
  it if necessary), and writes responses to standard output. It
  is intended to be configured as a stdio MCP server in *Claude
  Code* and not invoked directly by end users.

The following top-level command exists for rendering the *Claude Code*
statusline:

- `ase statusline`:
  Render the *Claude Code* statusline from a JSON payload read on
  standard input. Intended to be configured as the `statusLine`
  command in *Claude Code* settings and not invoked directly by end
  users. The input JSON is the standard *Claude Code* statusline
  payload (with `workspace.current_dir`, `model.display_name`,
  `context_window.used_percentage`, `effort.level`, `thinking.enabled`,
  and `session_id`). The output is a multi-line, ANSI-colored
  rendering of the user, project, task, session, model, effort,
  thinking, persona, and a context-usage progress bar. The bar color
  shifts from default to blue, yellow, and red as context usage
  crosses 40%, 60%, and 80%. The active task id and persona style
  are resolved from the *ASE* configuration cascade (with the current
  session id) and fall back to the `ASE_TASK_ID` and
  `ASE_PERSONA_STYLE` environment variables. Lines wrap dynamically
  based on the controlling terminal width (probed via `/dev/tty`).
  When run inside a *tmux* pane, the resolved task id is also
  published as the per-pane user option `@ase_task_id`, so external
  tools (like the *claudeX* sister project) can pick it up via
  `#{@ase_task_id}`.

The following top-level command exists for diagram rendering:

- `ase diagram`:
  Render a *Mermaid* diagram specification (read from standard
  input or from `--input` *file*) as Unicode/ASCII art. Supports
  the following options:
    - \[`-i`|`--input` *file*\]:
      read *Mermaid* source from *file* instead of standard input.
    - \[`-a`|`--ascii`\]:
      emit plain ASCII (`+-|`) instead of Unicode box-drawing.
    - \[`-c`|`--color-mode` *mode*\]:
      force color mode (`none`, `ansi16`, or `ansi256`).
    - \[`--node-margin-x` *n*\] / \[`--node-margin-y` *n*\]:
      horizontal/vertical margin between nodes.
    - \[`--node-padding` *n*\]:
      horizontal and vertical inner node padding.
    - \[`--diagram-clip-x` *n*\] / \[`--diagram-clip-y` *n*\]:
      extra clipping of the diagram relative to terminal width/height.
    - \[`--terminal-width` *n*\] / \[`--terminal-height` *n*\]:
      explicit terminal width/height for clipping.

The following top-level commands exist for installing, updating, and
uninstalling the *ASE* tool and its companion *Claude Code* plugin:

- `ase setup`:
  Entry point group for setup operations. Without a subcommand, the
  help text is shown and the command exits with status 1.

- `ase setup install` \[`-d`|`--dev`\]:
  Install the *ASE Claude Code* plugin (and, in `--dev` mode, the
  local working copy of the `@rse/ase` tool instead of the published
  npm package). The default for `--dev` is taken from the
  `ASE_SETUP_DEV` environment variable.

- `ase setup update` \[`-f`|`--force`\] \[`-d`|`--dev`\]:
  Update the *ASE* tool and the *ASE Claude Code* plugin to their
  latest versions. With `--force`, the update is always performed
  even if already at the latest version. With `--dev`, the local
  working copy is used instead of the remote repository.

- `ase setup uninstall` \[`-d`|`--dev`\]:
  Uninstall the *ASE Claude Code* plugin and the *ASE* tool.

The following top-level commands exist for managing persisted task
plans under `~/.ase/task/`*id*`/plan.md`:

- `ase task`:
  Entry point group for task plan management. Without a subcommand,
  the help text is shown and the command exits with status 1.

- `ase task list`:
  List all persisted task ids in lexicographic order, one per line.

- `ase task load` *id*:
  Load the task plan with the given *id* and write it to standard
  output. Prints nothing if the task does not exist.

- `ase task edit` *id*:
  Open the task plan with the given *id* in the editor defined by
  `$EDITOR` or `$VISUAL` (falling back to `vi`). The file and its
  parent directory are created if missing.

- `ase task save` *id*:
  Save the task plan with the given *id*, reading its contents from
  standard input.

- `ase task delete` *id*:
  Delete the task plan with the given *id* (removing the entire
  `~/.ase/task/`*id*`/` directory). Exits with status 1 if no such
  task existed.

- `ase task purge` \[*days*\]:
  Remove all persisted tasks whose modification time is older than
  *days* (default: 31).

The following top-level commands exist for *Claude Code* hook
integration:

- `ase hook`:
  Entry point group for *Claude Code* hook events. Without a
  subcommand, the help text is shown and the command exits with
  status 1.

- `ase hook session-start`:
  Handle the *Claude Code* `SessionStart` hook event. This
  subcommand is intended to be invoked by *Claude Code*
  internally as a configured hook handler only, not directly
  by end users.

- `ase hook pre-tool-use`:
  Handle the *Claude Code* `PreToolUse` hook event. This
  subcommand is intended to be invoked by *Claude Code*
  internally as a configured hook handler only, not directly
  by end users.

CONFIGURATION FILES
-------------------

- **user**: *per-user configuration directory*`/config.yaml`:
  Per-user *ASE* configuration (scope `user`). The per-user
  configuration directory is `~/Library/Application Support/ase` on
  macOS, `%APPDATA%\ase` on Windows, and `$XDG_CONFIG_HOME/ase`
  (falling back to `~/.config/ase`) on Linux and other Unix systems.

- **project**: `.ase/config.yaml`:
  Per-project *ASE* configuration (scope `project`). Read upward from
  the current working directory.

- **task**: `.ase/task/`*id*`/config.yaml`:
  Per-task *ASE* configuration (scope `task:`*id*), located relative
  to the Git top-level directory. Outside a Git repository, the file
  is placed relative to the current working directory.

- **session**: `~/.ase/session/`*id*`/config.yaml`:
  Per-session *ASE* configuration (scope `session:`*id*), located
  under the user's home directory (independent of any project context).

STATE FILES
-----------

- `.ase/service.yaml`:
  Per-project service state.

- `.ase/service.log`:
  Stdout/stderr log of the detached background service.

- `~/.ase/task/`*id*`/plan.md`:
  Persisted task plan, managed by the `ase task` subcommands. The
  per-task directory is owned by *ASE* in full and removed by
  `ase task delete` and `ase task purge`.

HISTORY
-------

`ase` was started to be developed in October 2025.

AUTHOR
------

Dr. Ralf S. Engelschall <rse@engelschall.com>


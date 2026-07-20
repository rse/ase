
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
is the command-line companion tool to the *ASE* Anthropic Claude Code CLI plugin.
It provides plugin/tool setup, layered project configuration
management, a per-project background HTTP service (bridged into the
agent tool as an MCP server), agent hook handlers, status line
rendering, persisted task plan management, artifact resolution,
diagram rendering, and a compatibility self-test helper.

OPTIONS
-------

The following top-level command-line options exist:

- \[`-h`|`--help`\]:
  Show program usage information only.

- \[`-V`|`--version`\]:
  Show program version information only.

- \[`-l`|`--log-level` *level*\]:
  Set the logging verbosity. Supported *level* values are
  `error`, `warning`, `info` (default), and `debug`.

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
  Recognized keys are grouped under two top-level sections:
  `project.*` (project identity, classification, and artifact
  globs: `project.id`, `project.name`, `project.boxing`, and the
  `project.artifact.`*kind*`.{basedir,files}` globs) and `agent.*`
  (`agent.persona`, `agent.task` -- the active task identifier --
  and `agent.skill`).
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
  Initialize `.ase/config.yaml` with preset values. The *type* argument
  selects the preset:
  `default` (baseline: persona `engineer`, boxing `white`, plus the
  active task `default` and the full set of `project.artifact.*` globs),
  `vibe` (persona `writer`, boxing `black`),
  `pro` (persona `engineer`, boxing `white`),
  or `industry` (persona `engineer`, boxing `grey`).
  The `vibe`, `pro`, and `industry` presets each set only
  `agent.persona`, `project.id`, `project.name`, and `project.boxing`.

- `ase config edit`:
  Open `.ase/config.yaml` in the editor defined by the `$EDITOR`
  or `$VISUAL` environment variable (falling back to `vi`).
  The file and its parent directory are created if missing.
  After the editor exits, the file is re-read and schema warnings
  are reported.

- `ase config list`:
  List all effective configured values across the scope
  inheritance chain, rendered as a three-column table of `KEY`,
  `VALUE`, and `SCOPE`. The `SCOPE` column identifies the
  scope (`user`, `project`, `task:`*id*, or `session:`*id*) that
  supplied each value. For overlapping keys only the value from
  the strongest scope is shown.

- `ase config get` *key*:
  Print the value at the given dotted *key*. Fails with an error
  if *key* does not resolve to a leaf value.

- `ase config set` *key* *value*:
  Set the value at the given dotted *key* (creating intermediate
  maps as needed) and persist the file.

- `ase config delete` *key*:
  Delete the value at the given dotted *key* from the target scope's
  own file and persist the file.

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
background service as a *Anthropic Claude Code CLI* MCP server:

- `ase mcp`:
  Bridge stdio MCP to the per-project background service over
  Streamable HTTP. The command accepts MCP requests on standard
  input, forwards them to the running `ase service` (auto-starting
  it if necessary), and writes responses to standard output. It
  is intended to be configured as a stdio MCP server in *Claude
  Code* and not invoked directly by end users.

- `ase chat` \[`-s`|`--service` *name*\] \[`-t`|`--mcp-tool` *name*\] \[`-m`|`--model` *model*\] \[`--timeout` *ms*\]:
  Bridge a stdio MCP `query(prompt)` tool to the locally installed
  *OpenAI Codex CLI* (`codex`), so that ASE skills can query OpenAI GPT
  through the Codex CLI's own configured authentication (it reads no
  `ASE_MCP_KEY`; typically a ChatGPT subscription). Each query runs
  `codex` non-interactively in a throw-away temporary directory, with a
  read-only sandbox, the switchable built-in tool surfaces disabled
  (shell/command tool, web search, image generation, and the hosted
  `apps` MCP) and multi-agent spawning requested off, a minimized
  environment, the user config and execpolicy rules ignored, the prompt
  piped on standard input, and a hard `--timeout` (default: 300000 ms).
  It is intended to be registered as the stdio MCP server
  `chat-openai-codex` by `ase setup mcp activate openai-codex` and not
  invoked directly by end users. Trust note: this is defense in depth,
  not a sealed box -- the built-in `view_image` reader has no feature
  switch, the model catalog's `model_info.multi_agent_version` can
  override the multi-agent flags (a model pinned to a multi-agent version
  re-enables the spawn tools), and system- or cloud-level Codex
  configuration stays outside the bridge's control. Treat this provider
  exactly like a locally launched `codex`, which is why activation is an
  explicit opt-in.

The following top-level command exists for rendering the *Anthropic Claude Code CLI*
or *GitHub Copilot CLI* statusline:

- `ase statusline` \[`-t`|`--tool` `claude`|`copilot`\] \[`-w`|`--width` *n*\] \[`-m`|`--margin` *n*\] \[`--no-icons`\] \[`--no-labels`\] \[*line* \[...\]\]:
  Render the *Anthropic Claude Code CLI* or *GitHub Copilot CLI* statusline from a
  JSON payload read on standard input. Intended to be configured as
  the `statusLine` command in *Anthropic Claude Code CLI* settings (or the
  `statusLine.command` entry in `~/.copilot/settings.json` for *GitHub
  Copilot CLI*) and not invoked directly by end users. The `--tool`
  option selects the host (default: `claude`, or the value of the
  `ASE_TOOL` environment variable if set); under `--tool copilot` the
  payload's top-level `cwd` field is mapped onto `workspace.current_dir`
  for the renderers below, and placeholders backed by Claude-Code-only
  fields (such as `%e`, `%t`, `%O`, `%S`, `%D`, `%W`, `%Q`) are simply
  suppressed. The input JSON is the standard *Anthropic Claude Code CLI* statusline
  payload (with `workspace.current_dir`, `model.display_name`,
  `context_window.used_percentage`, `effort.level`, `thinking.enabled`,
  `session_id`, and -- on *Anthropic Claude Code CLI* `2.1.90+` -- additionally
  `transcript_path`, `version`, `output_style.name`, raw token counts
  in `context_window.current_usage.*` and `context_window.total_*_tokens`,
  `cost.total_cost_usd` / `cost.total_duration_ms`, and the
  `rate_limits.five_hour` / `rate_limits.seven_day` window
  percentages and reset timestamps). The output is an ANSI-colored
  rendering composed from one or more template *line* arguments.
  Each *line* may contain literal characters and the following
  `%`-prefixed placeholders: `%u` (user), `%p` (project), `%T` (task,
  suppressed if empty), `%s` (session id, or `unknown` if absent),
  `%m` (model), `%e` (effort), `%t` (thinking), `%P` (persona,
  suppressed if empty), `%c` (context-usage progress bar with a
  20-cell bar and percentage),
  `%C` (current/limit context tokens, e.g. `334k/1.0M`),
  `%a` (lines of code added in this session), `%r`
  (lines of code removed in this session), `%S` (5-hour rate-limit
  window used percentage), `%D` (5-hour window time-until-reset,
  e.g. `4hr 27m`), `%W` (7-day rate-limit window used percentage),
  `%Q` (7-day window time-until-reset), `%H` (session wall-clock
  duration, e.g. `92hr 40m`), `%X` (session cost in USD, e.g.
  `$54.44`), `%b` (git branch, or `no git`), `%g` (git changed lines,
  e.g. `+42/-7`), `%G` (git untracked file count), `%d` (full
  current working directory path), `%M` (memory used/total, e.g.
  `33.2G/64.0G`), `%V` (combined *Anthropic Claude Code CLI* and *ASE*
  version, e.g. `claude/2.1.90 ase/0.9.35`), and `%O`
  (output-style name). All `%`-tokens whose source field is missing
  in the input JSON (or, for `%b`/`%g`/`%G`, when the *cwd* is not a
  git working tree) are *suppressed silently*, so older *Anthropic Claude Code CLI*
  versions and synthetic test inputs do not produce empty
  placeholders. The context bar color shifts from default to blue,
  yellow, and red as context usage crosses 40%, 60%, and 80%. In
  addition, each *line* may contain
  `<`*color*`>`...`</`*color*`>` markup to colorize literal text,
  where *color* is one of `black`, `red`, `green`, `yellow`, `blue`,
  `magenta`, `cyan`, `white`, or `default`. A closing tag resets the
  foreground color to the terminal default (no nesting); unrecognized
  color names are kept literally in the output. If no *line* arguments
  are given, a single default line `"%m %e %t"` is rendered. The active task id
  and persona style are resolved from the *ASE* configuration cascade
  (with the current session id) and fall back to the `ASE_TASK_ID`
  and `ASE_PERSONA_STYLE` environment variables. Each rendered line
  is wrapped automatically when it would exceed the available width
  budget, where the budget is derived from the controlling terminal
  width (probed via `/dev/tty`) reduced by `2 *` *margin* characters.
  Supports the following options:
    - \[`-w`|`--width` *n*\]:
      force terminal width to *n* characters
      (`0`, the default, auto-detects via `/dev/tty`).
    - \[`-m`|`--margin` *n*\]:
      reduce maximum used terminal width by *n* characters on each
      side (default: `2`).
    - \[`--no-icons`\]:
      disable the leading icon glyph (e.g. `※`, `⚑`, `⚙`) in front of
      each placeholder rendering.
    - \[`--no-labels`\]:
      disable the textual label (e.g. `user:`, `project:`, `model:`)
      in front of the bold value of each placeholder rendering.
  When run inside a *tmux* pane, the resolved task id is also
  published as the per-pane user option `@ase_task_id`, so external
  tools (like the *claudeX* sister project) can pick it up via
  `#{@ase_task_id}`.

The following top-level command exists for diagram rendering:

- `ase diagram`:
  Render a *Mermaid* diagram specification (read from standard
  input or from `--input` *file*) as Unicode/ASCII art or SVG. Supports
  the following options:
    - \[`-i`|`--input` *file*\]:
      read *Mermaid* source from *file* instead of standard input.
    - \[`-f`|`--format` `ascii`|`svg`\]:
      select the output format (default: `ascii`).
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
uninstalling the *ASE* tool and its companion *Anthropic Claude Code CLI* plugin:

- `ase setup`:
  Entry point group for setup operations. Without a subcommand, the
  help text is shown and the command exits with status 1.

- `ase setup install` \[`-d`|`--dev`\]:
  Install the *ASE Anthropic Claude Code CLI* plugin (and, in `--dev` mode, the
  local working copy of the `@rse/ase` tool instead of the published
  npm package). The default for `--dev` is taken from the
  `ASE_SETUP_DEV` environment variable.

- `ase setup update` \[`-f`|`--force`\] \[`-d`|`--dev`\]:
  Update the *ASE* tool and the *ASE Anthropic Claude Code CLI* plugin to their
  latest versions. With `--force`, the update is always performed
  even if already at the latest version. With `--dev`, the local
  working copy is used instead of the remote repository.

- `ase setup uninstall` \[`-d`|`--dev`\]:
  Uninstall the *ASE Anthropic Claude Code CLI* plugin and the *ASE* tool.

- `ase setup enable`:
  Enable the (already-installed) *ASE* plugin in the agent tool.

- `ase setup disable`:
  Disable the (already-installed) *ASE* plugin in the agent tool
  without uninstalling it.

  All of `install`, `update`, `uninstall`, `enable`, and `disable` also
  accept \[`-s`|`--scope` `user`|`project`|`local`\] (default: `user`)
  to select the plugin installation scope: `user` registers the plugin
  globally for the current user, `project` registers it in the project
  and is meant to be shared via version control, and `local` registers
  it in the project but keeps it out of version control. `--scope` is
  only supported for `--tool claude`; requesting a non-`user` scope for
  `copilot` or `codex` fails with an error, since those agent tools have
  no scope concept.

- `ase setup mcp`:
  Entry point group for managing the pre-defined *foreign MCP servers*
  that *ASE* skills can *optionally* leverage. Without a subcommand,
  the help text is shown and the command exits with status 1.

- `ase setup mcp list`:
  List all pre-defined MCP servers known to *ASE*, rendered as a table
  of `ID`, `NAME`, `VERS` (pinned model version), `MCP` (the registered
  MCP server name), `KEY` (the accepted `ASE_MCP_KEY_<KEY>` suffixes),
  and `SKILLS` (the *ASE* skills that leverage the server). The
  currently defined servers are the *chat* servers `openai-chatgpt`,
  `google-gemini`, `deepseek`, `xai-grok`, `alibaba-qwen`, `zai-glm`,
  and `openai-codex` (leveraged by `ase-meta-chat` and
  `ase-meta-quorum`), and the *search* servers `brave`, `perplexity`,
  and `exa` (leveraged by `ase-meta-search`, `ase-meta-evaluate`, and
  `ase-arch-discover`). Unlike the other *chat* servers, `openai-codex`
  reads no `ASE_MCP_KEY_<KEY>` variable at all (its `KEY` column is
  empty): it is bridged through the local *OpenAI Codex CLI* via `ase
  chat` and gated on the presence of the `codex` binary in `$PATH`.

- `ase setup mcp activate` \[*servers*\]:
  Register one or more pre-defined MCP servers with the agent tool. The
  optional *servers* argument is a comma-separated list of server ids;
  when omitted or given as the literal `all`, every registered server
  is selected. Most servers read their API key from an environment
  variable `ASE_MCP_KEY_<KEY>`, where `<KEY>` is one of the suffixes
  shown in the `KEY` column of `ase setup mcp list` (e.g. the server
  `openai-chatgpt` uses `ASE_MCP_KEY_OPENAI_CHATGPT`). These variables
  are also automatically sourced from `.env` files in the current
  directory. The `openai-codex` server is the exception: it reads no
  `ASE_MCP_KEY` (its authentication comes from the `codex` CLI's own
  configured credentials, which may itself be a ChatGPT subscription or
  an OpenAI API key that ASE never sees) and is instead gated on the
  presence of its `codex` binary in `$PATH`. In either case the activation gate has the same
  semantics: a server whose gate fails (its key variable unset/empty,
  or its `codex` binary absent) is silently skipped when implicitly
  selected via an empty list or `all`, but causes a hard error when
  given explicitly on the command line. Beyond that gate, `openai-codex`
  additionally requires **explicit** activation: it is *never* registered
  by an implicit selection (empty list or `all`) even when its `codex`
  binary is present -- it must be named on the command line (`ase setup
  mcp activate openai-codex`), which emits an informational skip notice
  otherwise. This is a deliberate consent gate, because activating it
  routes your prompts to a foreign model (OpenAI) through the local
  `codex` login and its calls are auto-approved by the ASE hook once
  registered (as defense in depth the child `codex` runs with every
  switchable tool surface disabled and a read-only sandbox, but the
  switch-less `view_image` reader can still read a local file as an
  image, the model catalog can override the multi-agent flags, and
  system- or cloud-level Codex config stays outside ASE's control). A
  stale prior
  registration of the same server is removed first so it is re-created
  cleanly. Each *chat* server except `openai-codex` accepts either the
  LLM vendor's native API key or the `ASE_MCP_KEY_OPENROUTER` key of an
  *OpenRouter* account as a common alternative.

- `ase setup mcp deactivate` \[*servers*\]:
  Unregister one or more pre-defined MCP servers from the agent tool.
  The optional *servers* argument behaves as for `activate` (empty or
  `all` selects every registered server). A server that is not
  currently registered is skipped.

  Both `activate` and `deactivate` also accept \[`-s`|`--scope`
  `user`|`project`|`local`\] (default: `user`) to select the MCP server
  registration scope, with the same `--tool claude`-only restriction as
  for the plugin subcommands above.

All `ase setup` subcommands -- except `ase setup mcp list` -- accept
the host selector \[`-t`|`--tool` `claude`|`copilot`|`codex`\] (default:
`claude`, or the value of the `ASE_TOOL` environment variable if set)
to choose between *Anthropic Claude Code CLI*, *GitHub Copilot CLI*, and
*OpenAI Codex CLI* as the target agent tool.

The following top-level commands exist for managing persisted task
plans, each stored as a single file `<project>/`*basedir*`/TASK-`*id*`.md`,
where *basedir* is the `project.artifact.task.basedir` configuration
value (default `.ase/task`) and the filename must match the
`project.artifact.task.files` glob (default `*.md`). A legacy
`<basedir>/`*id*`/plan.md` layout is auto-migrated to the current
single-file layout on first access:

- `ase task`:
  Entry point group for task plan management. Without a subcommand,
  the help text is shown and the command exits with status 1.

- `ase task list` \[`-v`|`--verbose`\]:
  List all persisted task ids in lexicographic order, one per line.
  With `--verbose`, each id is annotated with the task file's
  modification timestamp (`YYYY-MM-DD HH:MM`).

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
  Delete the task plan with the given *id* (removing its
  `<project>/`*basedir*`/TASK-`*id*`.md` file). Exits with status 1 if no
  such task existed.

- `ase task rename` *old-id* *new-id*:
  Rename the task plan with the given *old-id* to *new-id* (moving the
  `TASK-`*old-id*`.md` file to `TASK-`*new-id*`.md` and rewriting the
  `# TASK <id>:` heading inside). Exits with status 1 if no such task
  existed or the target id is already in use.

- `ase task purge` \[*age*\]:
  Remove all persisted task files whose modification time is older than
  *age* (default: `31d`). The *age* argument is a `<number><unit>`
  value, where *unit* is one of `h` (hour), `d` (day), `m` (month), or
  `y` (year).

The following top-level commands exist for resolving project artifact
kinds to project-relative file lists, driven by the
`project.artifact.*` configuration globs:

- `ase artifact`:
  Entry point group for artifact resolution. Without a subcommand,
  the help text is shown and the command exits with status 1.

- `ase artifact list` \[`--kind` *kinds*\]:
  Resolve one or more artifact kinds to project-relative file paths.
  The optional `--kind` *kinds* option is a comma-separated list of
  artifact kinds out of `spec`, `arch`, `code`, `docs`, `infr`, and
  `othr` (default: all kinds). Each kind's files are printed as a
  bullet list; when more than one kind is resolved, each list is
  preceded by a `# `*kind*`:` header. The `othr` kind is the implicit
  catch-all and is always resolved last.

- `ase artifact name` *filename* \[`--kind` *kind*\]:
  Resolve a base-relative *filename* within an artifact *kind* to a
  project-relative path. The `--kind` option selects one of the five
  configured kinds `spec`, `arch`, `code`, `docs`, or `infr` (default:
  `code`).

The following top-level command exists for exposing plugin meta files:

- `ase meta` *name* \[...\]:
  Output the contents of one or more plugin *meta files* to standard
  output. Each *name* selects a file under the plugin's `meta/`
  directory; the `ase-` prefix and `.md` extension are optional. This is
  intended to be leveraged by *ASE* skills and not typically invoked
  directly by end users.

The following top-level command exists for the `ase-meta-compat`
self-test skill:

- `ase compat`:
  Output the canonical expected probe values for the `ase-meta-compat`
  self-test skill as `<id>: <value>` lines, one per probe. This is
  intended to be invoked by the skill (after it has recorded all actual
  probe results) and not directly by end users.

The following top-level commands exist for *Anthropic Claude Code CLI* hook
integration:

- `ase hook`:
  Entry point group for *Anthropic Claude Code CLI* hook events. Without a
  subcommand, the help text is shown and the command exits with
  status 1.

- `ase hook session-start`:
  Handle the *Anthropic Claude Code CLI* `SessionStart` hook event. This
  subcommand is intended to be invoked by *Anthropic Claude Code CLI*
  internally as a configured hook handler only, not directly
  by end users.

- `ase hook session-end`:
  Handle the *Anthropic Claude Code CLI* `SessionEnd` hook event. This
  subcommand is intended to be invoked by *Anthropic Claude Code CLI*
  internally as a configured hook handler only, not directly
  by end users.

- `ase hook pre-tool-use`:
  Handle the *Anthropic Claude Code CLI* `PreToolUse` hook event. This
  subcommand is intended to be invoked by *Anthropic Claude Code CLI*
  internally as a configured hook handler only, not directly
  by end users.

- `ase hook permission-request`:
  Handle the *OpenAI Codex CLI* `PermissionRequest` hook event. This
  subcommand is intended to be invoked by the agent tool internally
  as a configured hook handler only, not directly by end users.

- `ase hook user-prompt-submit`:
  Handle the *Anthropic Claude Code CLI* `UserPromptSubmit` hook event. This
  subcommand is intended to be invoked by *Anthropic Claude Code CLI*
  internally as a configured hook handler only, not directly
  by end users.

- `ase hook stop`:
  Handle the *Anthropic Claude Code CLI* `Stop` hook event. This subcommand is
  intended to be invoked by *Anthropic Claude Code CLI* internally as a configured
  hook handler only, not directly by end users.

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

- `<project>/`*basedir*`/TASK-`*id*`.md`:
  Persisted task plan, managed by the `ase task` subcommands, located
  relative to the Git top-level directory (or the current working
  directory outside a Git repository). *basedir* defaults to `.ase/task`
  (configurable via `project.artifact.task.basedir`). Each task file is
  owned by *ASE* and removed by `ase task delete` and `ase task purge`.
  A legacy `<basedir>/`*id*`/plan.md` layout is auto-migrated to this
  single-file layout on first access.

HISTORY
-------

`ase` was started to be developed in October 2025.

AUTHOR
------

Dr. Ralf S. Engelschall <rse@engelschall.com>


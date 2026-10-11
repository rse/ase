
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
rendering, persisted task plan management, autonomous task lifecycle
agents, artifact resolution,
specification linting, exporting and previewing, and miscellaneous
utilities like diagram rendering, identifier minting, and text measuring.

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
  Recognized keys are grouped under three top-level sections:
  `project.*` (project identity, classification, and artifact
  globs: `project.id`, `project.name`, `project.boxing`, `project.task.lifecycle`, `project.task.idscheme`, `project.task.default.{source,changeset,target}`, `project.task.store.url`, `project.task.store.token` (masked as `***` by `list`), `project.task.store.crt`, `project.task.store.key`, `project.relay.url`, `project.relay.token` (masked as `***` by `list`), `project.relay.crt`, `project.relay.key`, and the
  `project.artifact.`*kind*`.{basedir,files}` globs plus the `project.artifact.spec.schema` file list) and `agent.*`
  (`agent.persona`, `agent.guidance`, `agent.task` -- the active
  task identifier -- and `agent.skill`), and `board.*`
  (`board.tui.color.{dim,normal,accent,signal}` -- the colors of
  the terminal task board, `board.web.color.{dim,normal,accent,signal}`
  -- the base colors of the web task board, and `board.web.editor.keymap`
  -- the key bindings of its task plan editor: `default`, `vim`, or `emacs`).
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
  Git repository, or a `.ase` directory is found at or above it --
  and only as long as it stays *weaker* than the strongest
  explicitly requested term, so an explicit `--scope user` is
  never silently retargeted to `project`.
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
  `default` (baseline: persona `engineer`, guidance `normal`,
  boxing `white`, task lifecycle `solo`, plus the active task `default`
  and the full set of `project.artifact.*` globs),
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
  List all available configuration keys with their effective
  values across the scope inheritance chain, rendered as a
  three-column table of `KEY`, `VALUE`, and `SCOPE`. The `SCOPE`
  column identifies the scope (`default`, `user`, `project`,
  `task:`*id*, or `session:`*id*) that supplied each value, or
  is `-` for a key which is not set in any scope (its `VALUE`
  is then empty). For overlapping keys only the value from the
  strongest scope is shown.

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

- `ase service start` \[`-f`|`--foreground`\]:
  Start the background service (detached). Allocates a random
  port in the range `42000`..`44000` if none is persisted yet,
  writes it to `.ase/service.yaml`, and probes readiness. Exits
  silently with status 0 if the service is already running; prints
  `ase: service: started on port <port>` on a fresh start.
  With `--foreground`, the service instead runs in the current
  process, logging to the terminal instead of `.ase/service.log`,
  without idle timeout, until it is interrupted (e.g. via `CTRL+C`)
  or stopped via `ase service stop`; an already running service
  is then an error.

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

- `ase service log` [`-f`|`--follow`] [`-n`|`--lines` *n*]:
  Show the log `.ase/service.log` of the background service. With
  `-n`/`--lines`, only the last *n* lines are shown. With
  `-f`/`--follow`, the last *n* lines (default: 10) are shown and
  then, in the style of `tail -f`, all newly appended lines are
  followed until interrupted, even once the service has stopped.
  Exits silently with status 0 if no log file exists.

- `ase service stop`:
  Stop the background service via HTTP `POST /stop`. Exits silently
  with status 0 on successful stop. If no port is configured or
  the port is not responding, prints an informational message and
  exits with status 0.

The following top-level command exists for bridging the per-project
background service as an *Anthropic Claude Code CLI* MCP server:

- `ase mcp`:
  Bridge stdio MCP to the per-project background service over
  Streamable HTTP. The command accepts MCP requests on standard
  input, forwards them to the running `ase service` (auto-starting
  it if necessary), and writes responses to standard output. It
  is intended to be configured as a stdio MCP server in *Claude
  Code* and not invoked directly by end users.

The following top-level command exists for rendering the *Anthropic Claude Code CLI*
or *GitHub Copilot CLI* statusline:

- `ase statusline` \[`-t`|`--tool` `claude`|`copilot`\] \[`-w`|`--width` *n*\] \[`-m`|`--margin` *n*\] \[`-p`|`--padding` *n*\] \[`--no-icons`\] \[`--no-labels`\] \[*line* \[...\]\]:
  Render the *Anthropic Claude Code CLI* or *GitHub Copilot CLI* statusline from a
  JSON payload read on standard input. Intended to be configured as
  the `statusLine` command in *Anthropic Claude Code CLI* settings (or the
  `statusLine.command` entry in `~/.copilot/settings.json` for *GitHub
  Copilot CLI*) and not invoked directly by end users. The `--tool`
  option selects the host (default: `claude`, or the value of the
  `ASE_TOOL` environment variable if set); under `--tool copilot` the
  payload's top-level `cwd` field is mapped onto `workspace.current_dir`
  for the renderers below, and placeholders backed by Claude-Code-only
  fields (such as `%t`, `%O`, `%S`, `%D`, `%W`, `%Q`) are simply
  suppressed. As *GitHub Copilot CLI* passes no `effort` field at all and
  instead embeds the reasoning effort as a ` · `-separated segment of
  `model.display_name` (e.g. `gpt-5.4 (2x) · high · 1M context`), that
  segment is split off again, so `%m` renders the plain model and `%e`
  the effort level. The input JSON is the standard *Anthropic Claude Code CLI* statusline
  payload (with `workspace.current_dir`, `model.display_name`,
  `context_window.used_percentage`, `effort.level`, `thinking.enabled`,
  `session_id`, and -- on *Anthropic Claude Code CLI* `2.1.90+` -- additionally
  `transcript_path`, `version`, `output_style.name`, raw token counts
  in `context_window.current_usage.*` and `context_window.total_*_tokens`,
  `cost.total_cost_usd` / `cost.total_duration_ms`, and the
  `rate_limits.five_hour` / `rate_limits.seven_day` window
  percentages and reset timestamps). If the payload carries no
  `rate_limits` and the model matches `gpt-*`, the windows are instead
  fetched directly from the *ChatGPT* backend with the credential stored
  by *OpenAI Codex CLI* (`$CODEX_HOME/auth.json`, default
  `~/.codex/auth.json`) and cached for 60 seconds. The output is an ANSI-colored
  rendering composed from one or more template *line* arguments.
  Each *line* may contain literal characters and the following
  `%`-prefixed placeholders: `%u` (user), `%p` (project), `%T` (task,
  suppressed if empty), `%s` (session id, or `unknown` if absent),
  `%m` (model), `%e` (effort), `%t` (thinking), `%P` (persona,
  suppressed if empty), `%h` (guidance level, suppressed if empty),
  `%B` (project boxing transparency, suppressed if empty),
  `%L` (project task lifecycle, suppressed if empty),
  `%c` (context-usage progress bar with a
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
  are given, a single default line `"%m %e %t"` is rendered. The active task id,
  persona style, guidance level, boxing transparency, and task lifecycle
  are resolved from the *ASE* configuration cascade (with the current
  session id) and fall back to the `ASE_TASK_ID`, `ASE_PERSONA_STYLE`,
  `ASE_GUIDANCE_LEVEL`, `ASE_PROJECT_BOXING`, and
  `ASE_PROJECT_TASK_LIFECYCLE` environment variables. Each rendered line
  is wrapped automatically when it would exceed the available width
  budget, where the budget is derived from the controlling terminal
  width (probed via `/dev/tty`) reduced by `2 *` (*margin* `+`
  *padding*) characters.
  Supports the following options:
    - \[`-w`|`--width` *n*\]:
      force terminal width to *n* characters
      (`0`, the default, auto-detects via `/dev/tty`).
    - \[`-m`|`--margin` *n*\]:
      reduce maximum used terminal width by *n* characters on each
      side (default: `2`).
    - \[`-p`|`--padding` *n*\]:
      pad each rendered line with *n* spaces on the left and right
      side (default: `0`). In contrast to *margin*, which only
      shrinks the width budget, the padding spaces are actually
      emitted. Empty lines are left unpadded.
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

The following top-level commands exist for miscellaneous utilities:

- `ase util`:
  Entry point group for utility operations. Without a subcommand, the
  help text is shown and the command exits with status 1.

- `ase util meta` *name* \[...\]:
  Output the contents of one or more plugin *meta files* to standard
  output. Each *name* selects a file under the plugin's `meta/`
  directory; the `ase-` prefix and `.md` extension are optional. This is
  intended to be leveraged by *ASE* skills and not typically invoked
  directly by end users.

- `ase util compat`:
  Output the canonical expected probe values for the `ase-meta-compat`
  self-test skill as `<id>: <value>` lines, one per probe. This is
  intended to be invoked by the skill (after it has recorded all actual
  probe results) and not directly by end users.

- `ase util worktree base` \[`-c`|`--create`\] \[`-t`|`--temp`\]:
  Print the validated base directory `<repo-root>/.ase/worktree`
  holding all *ASE* worktrees. With `--create`, the directory is
  created if it does not exist yet. With `--temp`, the base directory
  `<repo-root>/.ase/worktree/.temp` of the *temporary* worktrees is
  printed instead.

- `ase util worktree path` *id* \[`-c`|`--create`\] \[`-t`|`--temp`\]:
  Print the validated worktree directory `<repo-root>/.ase/worktree/<id>`
  of a single *id*, which has to match `[A-Za-z0-9_-]+`. With
  `--create`, the base directory is created if it does not exist yet.
  With `--temp`, the *id* is resolved below the base directory of the
  *temporary* worktrees, a namespace disjoint from all regular ones.

- `ase util diagram`:
  Render a *Mermaid* or *D2* diagram specification (read from standard
  input or from `--input` *file*) as Unicode/ASCII art or SVG. Supports
  the following options:
    - \[`-i`|`--input` *file*\]:
      read diagram source from *file* instead of standard input.
    - \[`-l`|`--lang` `mermaid`|`d2`\]:
      select the diagram language (default: `mermaid`).
    - \[`-f`|`--format` `ascii`|`svg`\]:
      select the output format (default: `ascii`).
    - \[`-a`|`--ascii`\]:
      emit plain ASCII (`+-|`) instead of Unicode box-drawing.
    - \[`-c`|`--color-mode` *mode*\]:
      force color mode (`none`, `ansi16`, or `ansi256`) (Mermaid only).
    - \[`--node-margin-x` *n*\] / \[`--node-margin-y` *n*\]:
      horizontal/vertical margin between nodes (Mermaid only).
    - \[`--node-padding` *n*\]:
      horizontal and vertical inner node padding (Mermaid only).
    - \[`--diagram-clip-x` *n*\] / \[`--diagram-clip-y` *n*\]:
      extra clipping of the diagram relative to terminal width/height.
    - \[`--terminal-width` *n*\] / \[`--terminal-height` *n*\]:
      explicit terminal width/height for clipping.

- `ase util mint` \[`-t`|`--type` `uuid`|`sha1`\] \[`-c`|`--count` *count*\] \[*hint* \[...\]\]:
  Mint one or more hash-derived identifiers out of the *hint* formed by
  the remaining arguments, one identifier per output line. With `--type`
  `uuid` (default), a deterministic *UUID V5* over the *hint* within the
  fixed *ASE* namespace is emitted, or a random *UUID V4* if no *hint*
  is given. With `--type` `sha1`, the 40-character hexadecimal *SHA-1*
  digest of the *hint* is emitted, which requires a non-empty *hint*.
  `--count` (default: `1`) selects how many identifiers are minted, but
  is honored for an empty *hint* only, where random *UUID V4* values are
  emitted; with a non-empty *hint*, hashing always yields exactly one
  identifier, so `--count` is clamped to `1` and a warning is emitted on
  *stderr*. This backs the `uuid` and `sha1` types
  of the `ase-meta-mint` skill; the language-level types of that skill
  require the AI and hence exist in the skill only.

- `ase util metric` \[`-f`|`--file` *file*\] \[*text* \[...\]\]:
  Measure the length metrics of a text, given either as the content of
  *file* or as the *text* formed by the remaining arguments, which are
  mutually exclusive and of which exactly one has to be given. The
  metrics are emitted as a single JSON object with the fields `words`
  (the whitespace-separated tokens), `lines` (the newline-separated
  lines, where a trailing line without a final newline still counts as
  one line), `chars` (the Unicode characters, i.e. code points), and
  `bytes` (the octets: the raw file size for *file*, the UTF-8 length
  for *text*). This backs the `ase_text_metric` MCP tool, which the
  skills use instead of estimating a text length themselves.

The following top-level commands exist for installing, updating, and
uninstalling the *ASE* tool and its companion *Anthropic Claude Code CLI* plugin:

- `ase setup`:
  Entry point group for setup operations. Without a subcommand, the
  help text is shown and the command exits with status 1.

- `ase setup install` \[`-d`|`--dev`\]:
  Install the *ASE Anthropic Claude Code CLI* plugin (and, in `--dev` mode, the
  local working copy of the `@rse/ase` tool instead of the published
  npm package). The default for `--dev` is taken from the
  `ASE_SETUP_DEV` environment variable. For `--tool claude`, the
  plugin-shipped output style `ase:ase-terse` is additionally selected by writing
  `"outputStyle": "ase:ase-terse"` into the `settings.json` of the installation
  scope, unless a foreign `outputStyle` is already selected there, which
  is preserved with a warning. For `--tool copilot` and `--tool codex`,
  which have no output style concept, the `ase hook session-start`
  handler injects the identical style instructions into the session
  context instead.

- `ase setup update` \[`-f`|`--force`\] \[`-d`|`--dev`\]:
  Update the *ASE* tool and the *ASE Anthropic Claude Code CLI* plugin to their
  latest versions. With `--force`, the update is always performed
  even if already at the latest version. With `--dev`, the local
  working copy is used instead of the remote repository. Like
  `install`, the output style `ase:ase-terse` is selected for `--tool claude`.

- `ase setup uninstall` \[`-d`|`--dev`\]:
  Uninstall the *ASE Anthropic Claude Code CLI* plugin and the *ASE* tool. For
  `--tool claude`, the selection of the output style `ase:ase-terse` is removed
  from the `settings.json` of the installation scope again, while a
  foreign `outputStyle` is preserved with a warning.

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

- `ase setup status`:
  Report where *ASE* is currently registered with the agent tool,
  rendered as a table of `KIND`, `ID`, `SCOPE`, and `STATUS`. The
  `PLUGIN` row shows the registration scope and the enabled/disabled
  state of the *ASE* plugin (one row per registration, or a single `not
  installed` row); one `MCP` row per *currently registered* server of
  the `ase setup mcp list` registry shows its registration scope, with
  unregistered servers omitted entirely; one `OUTPUTSTYLE` row per
  settings file carrying an `outputStyle` entry shows whether it is
  `selected` (the *ASE* output style `ase:ase-terse`) or `foreign` (hand-selected);
  and one `STATUSLINE` row per settings file carrying a `statusLine`
  entry shows whether it is `activated` (owned by *ASE*) or `foreign`
  (hand-crafted). The command
  is purely read-only and always exits with status 0, so a missing
  registration is reported rather than signalled through the exit code.
  It takes no `--scope`, since it deliberately reports *all* scopes at
  once -- that is exactly what makes an unintentionally leaked
  registration visible. Scope information is only available for `--tool
  claude` (and, for MCP servers, `--tool copilot`); everywhere else the
  scope is reported as `(n/a)`.

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
  `google-gemini`, `deepseek`, `xai-grok`, `alibaba-qwen`, and
  `zai-glm` (leveraged by `ase-meta-chat` and `ase-meta-quorum`), and
  the *search* servers `brave`, `perplexity`, and `exa` (leveraged by
  `ase-meta-search`, `ase-meta-evaluate`, and `ase-arch-discover`).

- `ase setup mcp activate` \[*servers*\]:
  Register one or more pre-defined MCP servers with the agent tool. The
  optional *servers* argument is a comma-separated list of server ids;
  when omitted or given as the literal `all`, every registered server
  is selected. Each server reads its API key from an environment
  variable `ASE_MCP_KEY_<KEY>`, where `<KEY>` is one of the suffixes
  shown in the `KEY` column of `ase setup mcp list` (e.g. the server
  `openai-chatgpt` uses `ASE_MCP_KEY_OPENAI_CHATGPT`). These variables
  are also automatically sourced from `.env` files in the current
  directory. A server whose key variable is unset or empty is silently
  skipped when implicitly selected, but causes a hard error when given
  explicitly on the command line. A stale prior registration of the
  same server is removed first so it is re-created cleanly. Each *chat*
  server accepts either the LLM vendor's native API key or the
  `ASE_MCP_KEY_OPENROUTER` key of an *OpenRouter* account as a common
  alternative.

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
plans, forwarded to the *task store* selected by the `project.task.store.url`
configuration URL: `ase:`*path* (default `ase:./.ase/task`, a path
resolved relative to the project root) stores the plans as
`TASK-`*id*`.md` files in the textual task format directly in *path*
through the built-in storage plugin running in-process, while
`ase://`*addr*`:`*port* or `ase://`*addr*`:`*port*`/`*token* forwards
them to a remote task store server (see `task-api.md`), registering the
`project.id` with its `project.task.lifecycle` there on first use, and
`ases://` instead of `ase://` connects via HTTPS (with the URL suffix
`?insecure` skipping the certificate verification). The
bearer token is the embedded *token* (warned about if configured on the
`project` scope), else `$ASE_TASK_STORE_TOKEN`, else the
`project.task.store.token` configuration (writable on the `user` scope only),
else the `token` of the per-user `store.yaml`. Finally,
`github:`*owner*`/`*repo* resp. `github+http[s]://`*host*`/`*owner*`/`*repo*
stores the plans as the issues of a repository on GitHub resp. a GitHub
Enterprise instance through the built-in GitHub storage plugin running
in-process (requiring a `seq` task id scheme, with the GitHub token
from `project.task.store.token`, else `$GITHUB_TOKEN`, else `$GH_TOKEN`),
`gitlab:`*namespace*`/`*project* resp. `gitlab://`*host*`/`*namespace*`/`*project*
resp. `gitlab+http[s]://`*host*`/`*namespace*`/`*project* the issues of a GitLab project through the built-in GitLab storage
plugin running in-process (likewise requiring a `seq` task id scheme,
with the GitLab instance *host*, else `$GITLAB_HOST`, else `gitlab.com`,
and the GitLab token from `project.task.store.token`, else `$GITLAB_TOKEN`), and
`gitea+https://`*host*`/`*owner*`/`*repo* resp. `gitea+http://`*host*`/`*owner*`/`*repo*
the issues of a Gitea repository through the built-in Gitea storage
plugin running in-process (likewise requiring a `seq` task id scheme,
with the Gitea token from `project.task.store.token`, else `$GITEA_TOKEN`):

- `ase task`:
  Entry point group for task plan management. Without a subcommand,
  the help text is shown and the command exits with status 1.

- `ase task list` \[`-v`|`--verbose`\]:
  List all persisted task ids in natural order (numbers ordered by their
  value, e.g. `FOO-2` before `FOO-10`), one per line.
  With `--verbose`, each id is annotated with the task plan status, its
  modification timestamp (`YYYY-MM-DD HH:MM`), and its title.

- `ase task status` \[*id*\[`:`\]\] \[*status*\]:
  Get or set the lifecycle status (`Status:` frontmatter key) of the
  task plan with the given *id* (default: `$ASE_TASK_ID`, else
  `default`). Without *status*, the current status is printed
  (defaulting to the initial state of the configured task lifecycle
  model). With *status* (a state of the model, case-insensitive), the
  status is set (the `Modified:` key is left alone, as it tracks body
  changes only). A single bare token which is a state of the model is
  taken as *status*, else as *id*. Exits with status 1 if no such task
  exists, the *status* is unknown, or it is not reachable from the
  current one via one or more transitions of the model.

- `ase task load` *id*:
  Load the task plan with the given *id* and write it to standard
  output. Prints nothing if the task does not exist.

- `ase task view` *id*:
  Show the task plan with the given *id* in the pager defined by
  `$PAGER` (falling back to `more`), run through the shell and fed via
  its standard input. If standard output is not a terminal, the pager is
  bypassed and the plan is written plainly to standard output. Exits
  with status 1 if no such task exists.

- `ase task edit` *id*:
  Open the task plan with the given *id* in the editor defined by
  `$EDITOR` or `$VISUAL` (falling back to `vi`, run through the shell,
  so a value with arguments is supported), round-tripped through
  a temporary file, as the task store is not necessarily local. A not
  yet existing plan starts as its minimal frontmatter.

- `ase task save` \[`-c`|`--create`\] *id*:
  Save the task plan with the given *id*, reading its contents from
  standard input. With `--create`, the save fails with exit status 1
  if a task with *id* already exists, instead of overwriting it (for the
  first save of a task whose *id* was obtained via `ase task newid`).
  The `Status:` frontmatter key is checked against the
  configured task lifecycle model: a changed status which is not a state
  of the model, or which is not reachable from the previously saved
  status via one or more transitions of the model, lets the save fail
  with exit status 1. An *id* not conforming to the task id scheme
  (`project.task.idscheme`) is saved, but warned about (also on `ase task edit`
  and `ase task rename`).

- `ase task delete` *id*:
  Delete the task plan with the given *id*. Exits with status 1 if no
  such task existed.

- `ase task rename` *old-id* *new-id*:
  Rename the task plan with the given *old-id* to *new-id*, rewriting
  the `Id:` frontmatter key inside, and *old-id* to *new-id* in the
  `Group:` and `After:` keys of all other task plans of the project
  (frontmatter only, so their `Modified:` key stays untouched), reporting
  the number of updated plans. Exits with status 1 if no such task
  existed or the target id is already in use.

- `ase task newid` \[`-p`|`--proposal` *id*\] \[`-t`|`--taken` *ids*\] \[`-v`|`--verbose`\] \[*title*\]:
  Print the next free task id according to the effective task id scheme
  of the project (see `ase task idscheme`), determined by searching all
  existing task ids plus the comma-separated *ids* considered as taken
  additionally (as only a `seq` id is reserved): for `slug[:<words>]` the
  slug of the first *words* words of *title*, for `seq[:<template>]`
  the highest sequence number of all ids matching *template* plus one
  (at least the high-water mark of the removed and allocated ids plus one,
  raised to the allocated number, so the number of a deleted, purged,
  renamed, or concurrently allocated task is never reused; ids not matching the
  current *template*, e.g. after a template change, are ignored),
  and for `any` the (sanitized) proposed *id*, else the slug of *title*.
  A taken slug or proposed id gets a numeric suffix `-2`, `-3`, etc.
  With `--verbose`, print the lines `scheme:`, `id:`, and `match:`,
  the latter being the regular expression of all ids conforming to the
  scheme (see `project.task.idscheme`). Quote ids containing `#` in the shell, as `#` starts a comment.

- `ase task purge` \[*age*\]:
  Remove all persisted task plans whose modification time is older than
  *age* (default: `31d`). The *age* argument is a `<number><unit>`
  value, where *unit* is one of `h` (hour), `d` (day), `m` (month), or
  `y` (year).

- `ase task lifecycle` \[*name*\]:
  Without *name*, print the effective task lifecycle model of the
  project: `project.task.lifecycle` for a local task store, else the
  model the project is registered under in the remote task store (which
  is registered under `project.task.lifecycle` on first use only, as the
  model is shared by all clients of the project). With *name* (`solo`,
  `team`, or `enterprise`), explicitly switch the project in the task
  store to this model: for a local task store, which always follows
  `project.task.lifecycle`, by setting it on the `project` scope. On
  every switch of the model, the `Status` of the existing task plans is
  mapped onto the new model (e.g. `solo` → `team`: `OPEN` → `PLANNING`,
  `CLOSED` → `IMPLEMENTED`). For a remote task store, a deviating
  `project.task.lifecycle` is warned about once per deviation only
  (tracked in *per-user state directory*`/task-lifecycle.json`).

- `ase task idscheme` \[*scheme*\]:
  Without *scheme*, print the effective task id scheme of the project:
  `project.task.idscheme` for a local task store (default: `slug`), else the
  scheme the project is registered under in the remote task store (which
  is registered under `project.task.idscheme` on first use only). With
  *scheme* (`slug[:<words>]`, `seq[:<template>]`, or `any`), explicitly
  switch the project in the task store to this scheme: for a local task
  store by setting `project.task.idscheme` on the `project` scope. Existing
  task ids are not changed. For a remote task store, a deviating
  `project.task.idscheme` is warned about once per deviation only.

- `ase task store start` \[`-a`|`--address` *host*\] \[`-p`|`--port` *port*\]
  \[`-t`|`--token` *token*\] \[`-c`|`--cors` *origin*\] \[`-m`|`--module` *name*\]
  \[`-d`|`--basedir` *dir*\] \[`-s`|`--solo`|`--no-solo`\] \[`--tls-cert` *file* `--tls-key` *file*\]
  \[`--with-agent-relay`|`--without-agent-relay`\] \[`-f`|`--foreground`\]:
  Start the per-user task store REST API server (see `task-api.md`) in
  the background, binding to *host* (default: `127.0.0.1`) and *port*
  (default: the configured one, else allocated randomly), expecting the
  bearer *token* (default: `ASE_TASK_STORE_TOKEN`, else the `token` key of
  the per-user `store.yaml`, else generated; the effective token is
  persisted there),
  allowing cross-origin browser requests from *origin* (repeatable, `*`
  for any origin), and loading the storage plugin *name*: `ase` for the
  built-in one, `github`, `gitlab`, resp. `gitea` for the built-in GitHub, GitLab, resp. Gitea Issues one (configured
  by `storage.options`, see `task-api.md`), else the NPM package `ase-task-store-`*name* (default:
  the `storage.plugin` key of `store.yaml`, else `ase`). The built-in
  plugin stores the plans below *dir* (default: `storage.options.basedir`,
  else `tasks` below the per-user config directory), one sub-directory
  per project, or -- with `--solo` -- a single project flat in *dir*,
  accepting any project id (persisted as `storage.options.solo`, reset
  by `--no-solo`). With `--tls-cert` and `--tls-key` (both PEM
  files, default: the configured `project.task.store.crt` and
  `project.task.store.key` (unless `project.task.store.url` selects HTTP via
  `ase://` on this host), else the `tls.cert` and `tls.key` keys of `store.yaml`,
  where the effective paths are persisted), the server serves HTTPS
  instead of HTTP. With `--with-agent-relay` (persisted as `relay`, reset
  by `--without-agent-relay`), the server additionally co-hosts the agent
  relay (see `ase agent relay start`) under the same address, port, and
  token, so a central host needs a single server process only. Binding to a non-loopback *host* without TLS is warned
  about. Idempotent if the server is already running, but restarts the
  server if an explicitly given option deviates from its configuration.
  With `--foreground`, the server instead runs in the current process,
  logging to the terminal instead of `store.log`, until it is interrupted
  (e.g. via `CTRL+C`) or stopped via `ase task store stop`; an already
  running server with an unchanged configuration is then an error.

- `ase task store status`:
  Report whether the task store server is running (and whether it
  co-hosts the agent relay), and on which address
  and port. Exits with status 1 if it is not running.

- `ase task store log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\]:
  Show the log `store.log` of the task store server run in the
  background. The options correspond to `ase service log`.

- `ase task store stop`:
  Stop the task store server.

The following sub-command exists for watching, moving, and editing
the persisted task plans of the current project:

- `ase task board` \[`-w`|`--web`\] \[`-t`|`--text`\] \[`--agent-relay` *url*\]:
  Show the task board: all task plans as cards (showing the task id and,
  behind a `▶`, the title) in the
  lanes of the effective task lifecycle model (see `ase task lifecycle`),
  grouped by the phases of the model plus a final `Done` group, with the
  active lanes in blue and the parking lanes in grey. Without options,
  the interactive terminal board is started (in its last shown view:
  the lanes view or the dependency graph view derived from the `After:`
  keys, switched via `v`); lanes can be
  minimized and groups collapsed, the selected lane can be grown via `g`
  to the full board, showing all its cards in a grid of at least four
  columns (`g`, `ESC`, or a click onto its title shrinks it back again),
  a card title is cut onto a single line
  or, toggled with `t`, wrapped onto at most three lines, and a card
  opens its plan in a full-height dialog (also by a mouse click onto the
  card, while a click onto its ` X ` closes the dialog again, a click onto
  a tab selects it, and the mouse wheel scrolls it; `M` disables the
  mouse support to regain the regular text selection of the terminal).
  `?` hides and shows the key hint lines (terminal and web board, persisted).
  In the graph view, `s` hides and shows the standalone tasks, i.e., the
  tasks without any predecessors and successors (persisted).
  `e` edits the selected task plan with `$EDITOR` (default: `vi`), a
  draft which failed to save being offered again on the next `e`. In
  the lanes and graph views, `N` creates a new task by editing a
  pre-filled task plan (all frontmatter keys, a free placeholder id, the
  initial state, and the section template of the task format), which is
  stored under the id of its `Id:` line (refused for an existing id,
  while an unchanged text creates no task at all). In the lanes, graph,
  and task views, `E` requests the edit of the selected task by a prompt
  (refused for a finished task and while an edit of it is in progress;
  a multi-line prompt, where `⏎` requests and `Shift`+`⏎` breaks the
  line; terminal: `Shift`+`⏎` only under the kitty keyboard protocol,
  while `Alt`+`⏎` breaks the line in every terminal; an empty prompt is
  refused), which `ase agent editor`
  then processes via `ase-task-edit` (prefilled with the prompt of a
  failed request for a retry); its card is marked with `✎` while
  requested, `✎…` while being processed, and `✎✗` when failed. `D` deletes the selected task after a confirmation
  (`y` confirms and `ESC` cancels; web: also via the `delete` and `cancel` buttons). In
  the lanes view, `SPACE` picks up the selected task and a second `SPACE`
  drops it onto the selected lane, changing the task status (`ESC`
  cancels); only lanes whose state is reachable from the current state
  in the lifecycle model accept the task. Alternatively, in the lanes,
  graph, and task views, `T` transfers the selected task via a popup
  listing all lane states (as `<group> ▷ <state>`, starting at the
  current state), where `↑`/`↓` select one of the reachable states (the
  others are dimmed), `⏎` (or a click onto it) moves the task, and `ESC`
  (or a click outside) cancels. `/` focuses the `filter:` field
  of the header (also a click onto it, as a click onto the `view:` value
  or `v` switches the view; web: `⏎` keeps,
  `ESC` or `✕` clears it; terminal: `⏎` keeps,
  `ESC` clears it): its keywords are fuzzy matched against
  the task id and title, AND-combined when separated by spaces and
  OR-combined when separated by commas; the lanes show only the matching
  tasks, the graph additionally their direct predecessors and successors
  (dimmed and dashed). `--web` serves the web board through the ASE
  service of the project and opens it in the browser, where a task is
  moved by dragging its card onto a reachable lane (or, with the same
  keyboard navigation as in the terminal, via `SPACE`); its minimized lanes
  and collapsed groups are stored once per project, not per browser, so
  all open web boards share them and pick up a change immediately.
  In the task dialog of the web board, `e` (or `✎`) edits the task plan
  (in the lanes and graph views, `e` opens the selected task directly for editing)
  in a Markdown editor: `Ctrl`/`⌘`+`S` saves it, but only if the plan was
  not changed meanwhile (else it offers to overwrite or discard), and
  `ESC` cancels (after a confirmation if changed; with Vim or Emacs key
  bindings via `board.web.editor.keymap`: `:w`/`:q` resp. `C-x C-s`/`C-x C-c`); a text which failed to
  save is kept as a draft in the browser and offered on the next edit.
  A running service with other ASE code is never restarted, as
  this would break the MCP connections of agent sessions: an older service
  without the web board fails `--web`, a differing build is only
  warned about. `--text` prints
  the lane overview as plain text (with the same `⟲` and `✎` markers),
  which is also the fallback without an
  interactive terminal. All views follow changes of the task plans live.
  With an agent relay (`--agent-relay` *url*, else `project.relay.url`,
  see `ase agent relay start`; the web board always follows the latter),
  the board additionally follows the running agents live in a third
  view `agents` (besides `lanes` and `graph`, all cycled via `v` or a
  click onto the `view:` value): a master/detail view, with the framed
  master list `Agents` on the left, showing each agent as a card with
  its name (inverse, behind a `⚉`), a pulse on the right side of its top
  border while busy (like the task cards of the active lanes, resp. just
  a circle while waiting), and the labeled fields `kind:` and `mode:` of
  its operation (e.g. `implementer` and `draft`, or `none` without a
  mode), `uptime:` with the duration since its start, `task:` with the ids of
  the tasks it is busy with (inverse, else `none (waiting)`), and `usage:` resp.
  `last:` with its usage of the agent tool in total since its start resp. by its
  last finished job, each as wall time, output tokens, and costs in USD
  (e.g. `12m, 9.2k tok, $3.41`, with `n/a` for what the agent tool does not
  report, and `none` before the first finished job), and the
  framed detail view `Agent: Recent Log Entries` on the right (taking the remaining
  width), showing the recent processing log lines of the selected agent
  (all lines kept by the relay), each with its full timestamp
  `YYYY-MM-DD HH:MM:SS.mmm:` as prefix (in normal color), the id of its
  task (if any, inverse), its level as `[INFO]:`, `[WARNING]:`, resp.
  `[ERROR]:`, and its content, both in accent color (warnings and errors in signal color), broken
  onto multiple rows instead of being cut. The detail view follows the
  bottom of the log while not scrolled up, and otherwise stays at the
  lines shown, even while the relay drops the oldest lines. When the
  selected agent vanishes, its neighbor is selected instead. `↑`/`↓` (or a click onto a
  card) select an agent; `Shift`+`↑`/`↓` (terminal), the mouse wheel,
  `PgUp`/`PgDn`, and `Home`/`End` scroll the log, where scrolling down to
  its bottom follows it again. The info line shows the selected agent
  with its host and process id, its state with the duration for which it
  has been in it, and the age of its latest heartbeat. Without an agent relay, the agents view is
  skipped. Additionally,
  the card of each task an agent is busy with carries an inverse ` ⚉ <name> ` box per agent on its top border
  (lanes view; in accent color, rounded in the web board), the status line shows the number of agents and the
  connection state of the relay, and `--text` appends the agents with
  their current operation. An agent stopping vanishes from the board
  immediately, while an agent missing its heartbeat vanishes after 30
  to 35 seconds. A relay connection without any traffic for 15 to 30
  seconds (e.g. after a network partition) is detected, reported as
  disconnected (dropping the shown agents), and re-established.

The following top-level commands exist for autonomous agents driving the
phases of the `enterprise` task lifecycle model and processing the edit
requests of tasks:

- `ase agent` *agent* `start` \[*agent-options*\] \[`-f`|`--foreground`\]:
  Start one of the agents `planner`, `implementer`, `approver`,
  `integrator`, and `editor` in the background, each running in its own
  process, e.g., `ase agent implementer start -p 2`. The *agent-options*
  \[`-n`|`--name` *name*\] \[`-t`|`--tool` `claude`|`copilot`|`codex`\]
  \[`-p`|`--parallel` *num*\] \[`-T`|`--timeout` *duration*\]
  \[`-o`|`--one-shot`\] \[`-r`|`--repo` *url*\] \[`-d`|`--tempdir` *dir*\]
  \[`--agent-relay` *url*\] (where `--repo` and `--tempdir` are not
  accepted for `planner`, which never processes tasks in a clone)
  additionally carry the individual options of an agent (if any).
  `--name` names the agent (default: its kind, i.e., `planner`,
  `implementer`, `approver`, `integrator`, or `editor`; at most 64
  characters) in its log lines, its processing log attachment, the
  `Assignee:` of the tasks it processes, its temporary directory, and
  its runtime files `.ase/agent/<name>.yaml` (its process id) and
  `.ase/agent/<name>.log` (its log), so multiple agents of the same kind
  are started under different names, e.g., `ase agent implementer start
  -n impl-claude -t claude` and `ase agent implementer start -n
  impl-codex -t codex`, where a name must not be the name of another
  agent kind, `relay`, or `fleet`. The agents of the same kind then
  form a pool: they compete for the same tasks, share the same tag (per mode), and
  process their tasks in parallel to each other (so `integrator`, which
  processes tasks serially only, has to be started only once). The
  agent is validated and initialized (e.g., its agent tool is looked up
  and the task lifecycle model is checked) before the command returns,
  so a failing agent is reported together with the tail of its log. An
  agent of the same name already running is left alone. With
  `--foreground`, the agent runs in the current process instead, logging
  to the terminal, until it is interrupted or stopped. Several agents are
  best run together as a fleet (see `ase agent fleet start`). `ase agent
  <agent> start --help` shows the options of a single agent.

  Each agent except `editor` (see below) drives one phase of the `enterprise` task lifecycle model
  (refused for any other model) until interrupted, so that the four
  agents together realize the entire model. Each agent observes the tasks in its
  *incoming* state which do not carry the *tag* of its kind -- `ase-agent-<kind>`, resp. per mode
  for `planner` (`ase-agent-planner-<mode>`, i.e., `ase-agent-planner-reboot` by default)
  and for `implementer` in mode `draft` (`ase-agent-implementer-draft`) --
  (plain or with any value) in their
  `Tags:` frontmatter key yet and whose `After:` predecessors all passed
  its phase (or no longer exist), and whose `Assignee:` frontmatter key
  is either still empty or already the agent name of `--name` (so a task
  can be pre-assigned to a particular agent of a pool, and a task assigned
  to anybody else, e.g. a human, is left alone), where an agent can
  require a task to be already assigned to it (see `planner`). It claims each such task
  (in natural task id order, re-checked on every change
  of the task store, while a task still waiting for its predecessors is
  reported once) in a single conditional save of the task (retried on a
  concurrent change), which moves it into its *activity* state, tags it with
  its tag with the value `active` (so no other
  agent of this kind picks it up, even if the skill itself puts it back
  into the incoming state during its processing), and sets its
  `Assignee:` frontmatter key to the agent name of `--name` (for information
  only, as the tag alone guards the task against other agents), where a task
  meanwhile tagged or (re)assigned is silently skipped instead,
  and processes it through an ASE skill of the agent tool
  of `--tool` (default: `claude`, or the `ASE_TOOL` environment variable
  if set), i.e., via
  `claude -p --disallowedTools AskUserQuestion --permission-mode auto --permission-prompts none "/ase:<skill> <args>"`,
  `copilot --allow-all-tools --no-ask-user --no-color -p "/<skill> <args>"`, or
  `codex exec --approve-for-me --color never "$<skill> <args>"`
  (headless, with `ASE_HEADLESS=true`, where risky actions are denied
  or automatically reviewed instead of being prompted for, and where
  each additional directory a skill needs access to besides its working
  directory is granted through an additional `--add-dir <dir>`). Afterwards,
  in a single conditional save again, the task is unassigned (only if still
  assigned to the agent, and not meanwhile to somebody else, e.g. the
  `editor` agent), tagged with its plain tag instead
  (or with the label of the processing as its value, like the verdict of `approver`), so no agent of this kind
  picks it up again (and only now it counts as passed for its successors
  where the *success* state precedes the passed one), and moved into its *success* or *parking* state, where a
  processing failure or a processing exceeding the *duration* of
  `--timeout` (as `<number><unit>` with unit `s`, `m`, or `h`, default:
  `60m`) always leads to the parking state. The preparing of a processing
  (e.g. creating a worktree) and its finishing (e.g. committing and
  pushing a branch) are each limited to a fixed duration of `240s`,
  where exceeding it also leads to the parking state. A task the skill
  already put into the success state, but whose finishing failed (e.g. a
  task `INTEGRATED` resp. `IMPLEMENTED`, but whose target resp. changeset
  branch could not be pushed), and a task whose resulting state is not
  reachable from its current state, is
  instead tagged with its tag with the value `failed`, unassigned, left in its
  state for a manual intervention (which removes the tag), and does not
  count as passed for its successors, while the failure is logged as an error. On an interrupt
  (`SIGINT`/`SIGTERM`/`SIGHUP`/`SIGQUIT`), and on the failure of a
  concurrently run agent, the running processings are aborted and their
  tasks put back, untagged and with their previous assignee, into the incoming state,
  while a repeated signal terminates the process at once (leaving the
  claimed tasks to the recovery described below). A final status update
  of a processed task which fails even after its retries is retried in
  the background with a growing delay. The claimed tasks of each run are recorded under a run lock in the
  per-user state directory (below a sub-directory per task store, as
  task ids are unique per task store only), so the tasks of an agent
  terminated without this cleanup (e.g. killed or crashed) are recovered
  on the next start of an agent of its kind for the same task store on
  the same host by the same user: a task still in the
  activity state is put back the same way, and any other task still tagged as
  `active` is tagged plain (as processed), but only while it is still
  assigned to the terminated agent and not claimed meanwhile by a live
  agent, where concurrently started agents never recover the same run. `--parallel`
  processes up to *num* (default: `1`) tasks of each agent in parallel,
  where an agent can deny parallelism (see `integrator`). `--one-shot`
  terminates an agent, instead of observing for further tasks, once a
  check of the task store finds no dispatchable task while it processes
  no task anymore -- intended for CI contexts like GitHub Actions, and
  not allowed in a fleet (see `ase agent fleet start`).
  Hence, a task still waiting for its predecessors at that time (e.g.,
  for a task still processed by an agent of another phase) is left
  for a later run. A failed check of the task store is retried after a
  growing delay, where `--one-shot` gives up after three failures in a
  row and terminates with a non-zero exit status. All processing
  information, including the output of the agent tool, is logged to
  stdout with timestamp prefixes in real time (the agent tool streams
  its agent messages, tool calls, failures, and final result as JSONL
  events), followed by the usage of the agent tool as wall time (measured
  locally), output tokens (of `claude` and `codex`), and costs in USD (of `claude` only), with `n/a` for
  what the agent tool does not report, and, at the end of each processing
  (with at most 20 lines of each agent message), appended to the attachment of the task with the type
  `text/plain; charset=utf-8; kind="agent:<name>"` (created if not
  existing yet). A task whose status the skill itself moved elsewhere
  is tagged, too, and left in that state.

  With an agent relay (`--agent-relay` *url*, else `project.relay.url`,
  as `ase://<addr>:<port>[/<token>]` resp. `ases://<addr>:<port>[/<token>][?insecure]`
  for HTTPS, optionally without certificate verification), each agent
  additionally passes its live presence to the task boards (see `ase
  task board`): its state (`waiting` or `busy` with the ids of its tasks)
  immediately on every change, its usage of the agent tool (in total and
  by its last job) immediately after each finished job, its new processing log lines (only the
  ones added since its previous announcement, coalesced to at most four
  announcements per second), and a heartbeat every 10 seconds, and it
  removes its presence on termination. The relay requires an explicit
  `project.id`. Its bearer token is the one embedded in the URL, else
  `ASE_AGENT_RELAY_TOKEN`, else `project.relay.token` (intended for the
  `user` scope, and warned about on any other scope), else the token of
  the locally started agent relay (or of
  the locally started task store co-hosting it), if the URL addresses it.
  An unreachable relay is warned about once per outage and never disturbs
  the processing of the tasks, where the not yet passed lines are kept
  (at most 100) and passed once the relay is reachable again. A presence
  rejected by the relay (e.g. by its limits or for an invalid token) is
  warned about with its reason and retried after a growing delay (from
  1 up to 15 minutes), where the rejected lines are dropped, unless the
  rejection was by its limits or for an invalid token.

  The `implementer`, `approver`, and `integrator` agents follow the
  `Source:`, `Changeset:`, and `Target:` frontmatter keys of a task (or
  their configured defaults `project.task.default.*`). Their `worktree`
  values refer to the Git working copy the agents are started in: for
  those the agents create no own Git worktree, but work in the working
  copy directly, just adjusting its checked-out branch. As concurrently
  processed tasks would interfere there, an agent handles at most one
  task at a time in the working copy itself (other tasks waiting until
  it is free again), and the implementer
  starts a task with a `worktree` changeset (or with a `branch:` changeset
  checked out in the working copy) only in a working copy without
  uncommitted changes (e.g. of an earlier task not yet integrated), while
  such a task otherwise waits. This coordination does not extend to
  other agents (each running in its own process, also within a fleet)
  or humans working in the same working copy, so a working copy should
  be used directly by a single agent only, while the other agents are
  given `--repo` (or process tasks without `worktree` values only). Without
  `--repo`, all tasks are processed in this working copy, so the agents
  have to be started inside one. With `--repo` *url*, each agent instead
  clones the Git repository *url* once into its temporary directory
  (removed on termination) and processes every task without a `worktree`
  value in its own temporary Git worktree of this clone (below `work/`
  of the temporary directory), where the Git operations on the clone are
  serialized: before each task, its default branch and the
  branches of the task (unless checked out for another task) are refreshed from the origin, and afterwards the
  implementer pushes its `branch:` changeset and the integrator its
  `branch:` target back to the origin (and deletes there a `branch:`
  changeset deleted by the merge, where a failure is just warned about), where a rejected push fails the
  task. If the push of the integrator fails after the skill already put the
  task into `INTEGRATED` (resp. the push of the implementer after the skill
  already put the task into `IMPLEMENTED`), the merge (resp. the committed
  change set) is kept as the branch
  `ase-agent-rescue/<id>` in the clone, the task is tagged
  `ase-agent-integrator:failed` (resp. `ase-agent-implementer:failed`), and the temporary directory is preserved
  (instead of being removed on termination) for a manual recovery, where the
  implementer rescues its branch this way also for a partial change set of a
  task it then puts into `STALLED`. Only a task with a `worktree` value then requires the agents to
  be started inside a Git working copy (and fails otherwise). As the
  skills run inside the clone, `--repo` requires a task store not
  located in the working copy (i.e., not a local `ase:<path>` one).
  In the names of all ASE worktrees derived from a task id (see the
  individual agents below), a `#` of the id (e.g. of the `seq:#%d` id
  scheme of the issue tracker task stores) is replaced by `_`, as
  neither a worktree name nor a branch name can carry it.
  The temporary directory of an agent holds the clone and other
  temporary files: by default, it is securely created as a fresh,
  private directory below the system temporary directory, while
  `--tempdir` *dir* forces it to be the sub-directory `<name>` (the
  agent name of `--name`) of *dir*, where `%p` in *dir* is expanded to the process
  id of the agent, `%h` to a hash value unique to the process, and `%%`
  to `%`. A missing *dir* is created private to the current user (and
  removed again on termination if empty), while an existing *dir* has
  to be a directory (no symbolic link) owned by the current user. A
  sub-directory `<name>` left over by an earlier run is removed only if
  its owning process is no longer alive and it holds no work preserved
  for a manual recovery, and otherwise refused. The agents are:

  | Agent         | Phase          | Incoming      | Activity       | Success                                           | Parking                                      | Predecessors passed                         |
  | ------------- | -------------- | ------------- | -------------- | ------------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
  | `planner`     | Planning       | `DRAFTED`     | `PLANNING`     | `DRAFTED`                                         | `SHELVED`                                    | `PLANNED` or later, or `DRAFTED` and tagged |
  | `implementer` | Implementation | `PLANNED`     | `IMPLEMENTING` | `IMPLEMENTED` (or `PLANNED` with `draft`)         | `STALLED` (or `PLANNED` with `draft`)        | `IMPLEMENTED` or later                      |
  | `approver`    | Approval       | `IMPLEMENTED` | `APPROVING`    | `IMPLEMENTED` (`judge`) or `APPROVED` (`approve`) | `IMPLEMENTED` (or `DECLINED` with `approve`) | `APPROVED` or later                         |
  | `integrator`  | Integration    | `APPROVED`    | `INTEGRATING`  | `INTEGRATED`                                      | `DEFERRED`                                   | `INTEGRATED` or `CANCELLED`                 |

  - `ase agent planner`:
    Claims only the `DRAFTED` tasks whose `Assignee:` frontmatter key
    already is its agent name of `--name` (default: `planner`), so a plan
    is rebooted only on the explicit request of a human, who assigns the
    task to the planner.
    Reboots the plan via `ase-task-reboot --next DONE <id>`. The skill
    itself resets a rebooted plan into `DRAFTED`, where it waits,
    tagged with `ase-agent-planner-reboot`, for its final review and its promotion into `PLANNED` by a
    human (so removing this tag requests another reboot). A plan left in `PLANNING` is put into `SHELVED`. All this is
    the behavior of the individual option \[`-m`|`--mode`
    `reboot`|`condense`\] in its default mode `reboot`. In mode
    `condense`, the agent instead claims only the tasks without the
    separate tag `ase-agent-planner-condense` (so a condensed task can
    still be rebooted later by a planner in mode `reboot`, and vice versa), condenses
    the plan via `ase-task-condense --next DONE <id>`, tags it with
    `ase-agent-planner-condense`, and puts it back into `DRAFTED` (or
    into `SHELVED` if the skill failed).

  - `ase agent implementer`:
    Implements the plan from its `Source:` into its `Changeset:` via
    `ase-task-implement --next DONE <id>`. A `worktree` changeset stays
    *uncommitted* in the working copy, which is switched to the branch
    of a `branch:<name>` source beforehand (where a task waits while the
    working copy still carries uncommitted changes), or, if `--parallel` is greater than
    `1`, in the own Git worktree `.ase/worktree/<id>` of each task (via
    `--worktree <id>`). A `branch:<name>` changeset is checked out
    (created from the source if missing) in the Git worktree
    `.ase/worktree/<id>-implementer` of the agent (unless already checked
    out in the working copy or another ASE worktree, which then has to
    be without uncommitted changes, as they would be committed, too),
    implemented there in place (via `--source worktree --changeset
    worktree --worktree <id>-implementer`), afterwards *committed* onto the branch with the
    message `<kind>: <title> (<id>)` -- also a partial result of a
    failed processing, as the plan tracks it -- and the worktree is
    removed again (under `--repo` the branch is pushed to the origin
    beforehand, and rescued if the push is rejected, see above). An `attachment:<name>` changeset is entirely handled
    by the skill. The skill itself puts a successfully implemented
    task into `IMPLEMENTED`, while a task left in `IMPLEMENTING` is put
    into `STALLED`. All this is the behavior of the individual option
    \[`-m`|`--mode` `implement`|`draft`\] in its default mode
    `implement`. In mode `draft`, the agent instead claims only the
    tasks without an implementation draft attachment (type
    `text/x-diff; charset=utf-8; kind="draft"`) yet and without the
    separate tag `ase-agent-implementer-draft` (so a drafted task is
    still implemented later by an implementer in mode `implement`),
    drafts the implementation from the `Source:` into this attachment
    only, ignoring the `Changeset:`, via `ase-task-implement --next DONE
    --draft --stateless <id>` (in a temporary worktree of the skill,
    leaving the working copy untouched), and puts the task back into
    `PLANNED`: untagged if the draft attachment was created, as the
    attachment itself keeps the agent from drafting it again, and
    otherwise tagged with `ase-agent-implementer-draft`, so a failed
    drafting is not retried endlessly.

  - `ase agent approver`:
    Reviews the `Changeset:` of the task via `ase-repo-review`: a
    `worktree` changeset staged in its working copy (the Git worktree
    `.ase/worktree/<id>` of a parallel implementer if existing, else the
    working copy of the project), a `branch:<name>` changeset via
    `ase-repo-review --branch <name>`, and an `attachment:<name>`
    changeset staged in a temporary Git worktree, detached at the
    `base` commit of the attachment and removed afterwards. A task
    already carrying a verdict of the approver (i.e., any tag
    `ase-agent-approver`) is never picked up again. The verdict
    `APPROVE` resp. `REJECT` of the review is added as the tag
    `ase-agent-approver:approve` resp. `ase-agent-approver:reject`
    (and a failed or skipped review, which yields no verdict, as the
    plain tag `ase-agent-approver`). With the individual option
    \[`-m`|`--mode` `judge`|`approve`\] (default: `judge`), mode
    `judge` then puts the task back into `IMPLEMENTED` for a human
    decision, while mode `approve` puts it into `APPROVED` on the
    verdict `APPROVE`, into `DECLINED` on the verdict `REJECT`, and
    back into `IMPLEMENTED` without a verdict.

  - `ase agent integrator`:
    Integrates the `Changeset:` of the task into its `Target:` via
    `ase-task-integrate --next DONE --mode <mode> <id>` (with `--worktree <id>` for a
    `worktree` changeset in the Git worktree of a parallel implementer),
    where the merge commits the change set into the target. With the
    individual option \[`-m`|`--mode` `merge`|`rebase`|`squash`\]
    (default: `squash`), passed through to the skill, mode `merge`
    creates a merge commit, mode `rebase` rebases the change set onto
    the target and fast-forwards the target, and mode `squash` combines
    the change set into one new commit on the target. A
    `branch:<name>` target not checked out in any Git worktree yet is
    checked out in a temporary Git worktree for the merge and removed
    afterwards. The agent tool is granted access to the Git worktrees
    of the changeset and the target. The skill itself puts an integrated
    task into `INTEGRATED`, while a task left in `INTEGRATING` is put
    into `DEFERRED`, especially on unresolvable merge conflicts. Any
    uncommitted change in the worktree of the target branch lets the
    merge of every task with a `branch:` changeset fail, and is committed
    together with the change set of a task with a `worktree` changeset,
    so keep that worktree clean while the integrator runs. As merges into
    the same target branch cannot run concurrently, tasks are processed
    serially only: `--parallel` is clamped to `1` with a warning (and
    a fleet refuses more than one `integrator`).

  - `ase agent editor`:
    Unlike the other agents, it is bound to no phase and supports all
    task lifecycle models (`solo`, `team`, and `enterprise`). It
    processes the edit requests of tasks, which the task board adds
    (key `E`) as an attachment of type `text/plain; charset=utf-8;
    kind="edit"` (with the prompt as its data), mirrored in the tag
    `ase-agent-editor:pending` (aggregated as `:active` while one is
    processed and as `:failed` once one failed). It observes the tasks
    with this tag, except those in an activity status of the model, where
    the task is actively worked on (`team`: `IMPLEMENTING`; `enterprise`:
    `PLANNING`, `IMPLEMENTING`, `APPROVING`, and `INTEGRATING`), which
    wait until their status changes. It claims the oldest request of
    such a task in a single conditional save by turning it into
    `kind="edit-running"` and setting the `Assignee:` of the task to its
    agent name (remembering the previous assignee in the request), which
    keeps all other agents off the task during the edit without touching
    its status, where the request of a finished task, resp. a request
    with an empty prompt, is turned into `kind="edit-failed"` instead. It then edits the plan via `ase-task-edit --plan REFINE
    --next DONE <id>: <prompt>` in the working copy, grounded in the
    `Source:` of the task (a `branch:<name>` source checked out in the
    temporary, detached Git worktree `.ase/worktree/.temp/<id>-editor`,
    passed to the skill via its internal option `--int-source-dir` and
    removed afterwards), where the skill saves the plan only if it was
    not changed meanwhile (e.g. by a further edit request), and finally,
    in a single save, restores the previous assignee (unless reassigned
    meanwhile) and removes the request if the plan content actually
    changed (its frontmatter, except `Status:`, `Tags:`, and `Assignee:`,
    which other agents change, and its body) and the skill reported no error, or else turns it back into
    `kind="edit"` on interrupt, resp. into `kind="edit-failed"` (with the
    reason) otherwise. A finalization failing even after its retries is
    retried on every further dispatching. Like the other agents, each
    agent process holds a run lock in the per-user state directory
    (`agent-editor/<store-hash>/<run-id>.lock`, see *STATE FILES*): on start, the requests left in
    `kind="edit-running"` by any terminated editor process of the same
    user on the same host (whose run lock is gone or stale and whose
    process is no longer alive) are turned into `kind="edit-failed"`,
    and the previous assignees of their tasks are restored.

- `ase agent` *agent* `status` \[`-n`|`--name` *name*\]:
  Report whether the agent of the name *name* (default: its kind) is
  running. Exits with status 1 if it is not running.

- `ase agent` *agent* `log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\] \[`--name` *name*\]:
  Show the log `.ase/agent/`*name*`.log` of the agent of the name *name*
  (default: its kind) run in the background (where an agent of a fleet
  logs into the log of the fleet instead, see `ase agent fleet log`).
  The options `-f`/`--follow` and `-n`/`--lines` correspond to `ase
  service log`, where the name is hence given via `--name` only.

- `ase agent` *agent* `stop` \[`-n`|`--name` *name*\]:
  Stop the agent of the name *name* (default: its kind), waiting (up to
  5 minutes) until it aborted its running processings and put their
  tasks back.

- `ase agent relay start` \[`-a`|`--address` *host*\] \[`-p`|`--port` *port*\]
  \[`-t`|`--token` *token*\] \[`-c`|`--cors` *origin*\] \[`--tls-cert` *file* `--tls-key` *file*\]
  \[`-f`|`--foreground`\]:
  Start the per-user agent relay server in the background, which passes
  the live presence of the agents (see `ase agent` *agent* `start`) to the task boards
  (see `ase task board`) without any external infrastructure. It can run
  locally or on a central host, as long as both the agents and the task
  boards reach it, and serves any number of projects (by their
  `project.id`). It holds the presence of the agents in memory only:
  per agent its state, its tasks, its usage of the agent tool, and its last 100 processing log lines,
  where an agent without heartbeat for 30 seconds is removed. Its
  REST endpoints are `GET /agents` (the projects with their number of
  agents), `GET /projects/<id>/agents` (all agents of a project),
  `PUT /projects/<id>/agents/<agent>` (the announcement of an agent,
  with its added processing log lines only), and
  `DELETE /projects/<id>/agents/<agent>` (its removal), and its WebSocket
  event endpoint `/projects/<id>/agents/events` first sends a snapshot of
  all agents and then each change, where the processing log lines of an
  agent are always to be appended to the already received ones. The
  options and their defaults correspond to `ase task store start`, with
  `ASE_AGENT_RELAY_TOKEN` and the per-user `relay.yaml` (logging into
  `relay.log`, or with `--foreground` to the terminal) instead, where
  `--tls-cert` and `--tls-key` not given fall back to the configured
  `project.relay.crt` and `project.relay.key` (unless
  `project.relay.url` selects HTTP via `ase://` on this host). Alternatively, `ase task store start
  --with-agent-relay` co-hosts the agent relay in the task store server.

- `ase agent relay status`:
  Report whether the agent relay server is running, and on which address
  and port. Exits with status 1 if it is not running.

- `ase agent relay log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\]:
  Show the log `relay.log` of the agent relay server run in the
  background. The options correspond to `ase service log`.

- `ase agent relay stop`:
  Stop the agent relay server.

- `ase agent fleet init` \[`-c`|`--config` *file*\] \[`-t`|`--tool` *tool*\] \[`--force`\]:
  Create the initial YAML configuration *file* (default:
  `.ase/fleet.yaml`) of a fleet (see `ase agent fleet start`) for the
  `enterprise` task lifecycle model, with the agent relay, the four
  phase agents `planner` (mode `reboot`), `implementer` (mode
  `implement`, 2 tasks in parallel), `approver` (mode `judge`, 2 tasks
  in parallel, so a human still decides on the approval), and
  `integrator` (mode `squash`), and the edit request agent `editor`,
  all with the agent tool *tool* (default: `claude`, or the `ASE_TOOL`
  environment variable if set), where the section `default` lists all
  its options with their default values (an empty value for the options
  without a fixed default). The configuration is checked like on
  `ase agent fleet start` before it is written, and an already existing
  *file* is overwritten only with `--force`.

- `ase agent fleet start` \[`-c`|`--config` *file*\] \[`-f`|`--foreground`\]:
  Start the fleet of agents (and optionally of the agent relay they
  report to) of the YAML configuration *file* (default:
  `.ase/fleet.yaml`) in the background, through a supervising process
  which runs each member in its own child process via `ase agent`
  *agent* `start --foreground` resp. `ase agent relay start
  --foreground`, all logging into `.ase/agent/fleet.log` (or with
  `--foreground` to the terminal), where each line is prefixed with the
  name of the member writing it (resp. `fleet` for the fleet itself),
  padded to the longest name and followed by ` | ` (e.g.,
  `implementer | ase: [...]: [INFO]: ...`), and, on a terminal, colored
  by the name (see `ase agent fleet log`). The configuration carries the
  optional section `fleet` with the option `foreground` of the fleet
  itself (the same as `--foreground`), the optional section `relay`
  with the options `address`, `port`, `token`, `cors`, `tls-cert`, and
  `tls-key` of `ase agent relay start`, the optional section `default`
  with the options `tool`, `parallel`, `timeout`, `repo`, `tempdir`, and
  `agent-relay` as the default options of all agents (each one applied
  only to the agents supporting it, and overridden by the section of
  an agent), and one section per agent, named by its agent name, with
  its agent options and an optional `kind` (default: the section name),
  all options given by their long names, where `true` enables a flag,
  `false` or an empty value omits an option, and a list repeats an
  option, e.g.:

  ```yaml
  fleet:
      foreground: true
  relay:
      port:     4711
  default:
      tool:     claude
  planner:
  implementer:
      parallel: 2
  editor-claude:
      kind:     editor
  editor-codex:
      kind:     editor
      tool:     codex
  ```

  The options `name` (given by the section name), `one-shot` (as the
  members are restarted), and `foreground` are not allowed, neither is
  a non-empty `agent-relay` together with the section `relay`, and `integrator`
  can be given only once. Before the fleet starts, the structure of the
  configuration, the option names, and the option syntax are checked,
  while the option values (e.g., `parallel` or `tool`) are checked only
  once the corresponding member starts. With the section `relay`, the
  fleet owns the per-user agent relay (which hence must not run
  already): the options `address`, `port`, and `token` not given fall
  back to those of `project.relay.url` (its embedded token, else
  `$ASE_AGENT_RELAY_TOKEN`, else `project.relay.token`), if it addresses
  this host (else it is warned about and not adopted), where a deviating
  `address` or `port` is warned about (as the task boards following
  `project.relay.url` then do not see the agents); the options
  `tls-cert` and `tls-key` not given fall back to `project.relay.crt`
  and `project.relay.key` (unless an adopted `project.relay.url`
  selects HTTP), where an adopted `project.relay.url` selecting HTTPS
  requires both. The fleet starts the agent relay first and passes its
  URL via `--agent-relay` and its actual token via
  `$ASE_AGENT_RELAY_TOKEN` to all agents. The command returns once
  all members started successfully (else all of them are stopped again
  and the failure is reported). Afterwards, the fleet restarts every
  member whenever it exits (e.g., crashed, or stopped individually via
  `ase agent` *agent* `stop`) after a delay starting at 1 second and
  doubled on each restart in a row up to 5 minutes, which is reset
  once the member ran for 10 minutes. On termination, the fleet first
  stops all agents and then the agent relay, where a repeated signal is
  forwarded to the remaining members (terminating the agents at once).
  As each agent runs in its own process, the agents of a fleet do not
  coordinate their direct use of the Git working copy they are started
  in (see `ase agent` *agent* `start`). An already running fleet is
  left alone. As the members run in their own process groups, they
  survive a fleet process killed without a chance to stop them (e.g.,
  via `SIGKILL`): such orphaned members (identified by their runtime
  state still recording the process of the fleet) are stopped first.

- `ase agent fleet status`:
  Report whether the fleet is running, and for each member whether it
  is running (with its process id) or awaiting its restart, and how
  often it was restarted. Exits with status 1 if it is not running.

- `ase agent fleet log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\]:
  Show the log `.ase/agent/fleet.log` of the fleet run in the background,
  aggregating the lines of the fleet itself and of all its members, each
  one prefixed with its name (see `ase agent fleet start`), which is
  colored by the name if the output is a terminal. The options
  correspond to `ase service log`.

- `ase agent fleet stop`:
  Stop the fleet with all its members, first all agents and then the
  agent relay. With the fleet process already gone (e.g., killed via
  `SIGKILL`), its orphaned members are stopped (see `ase agent fleet
  start`).

The following top-level commands exist for resolving project artifact
kinds to project-relative file lists, driven by the
`project.artifact.*` configuration globs. Only the files Git tracks are
ever resolved: the Git exclude rules -- the global excludes file
(`core.excludesFile`, else the XDG fallback), the repository-local
`info/exclude`, and the `.gitignore` files from the project root
downwards, with the last matching rule winning -- prune the file universe
before any glob is applied:

- `ase artifact`:
  Entry point group for artifact resolution. Without a subcommand,
  the help text is shown and the command exits with status 1.

- `ase artifact list` \[`--kind` *kinds*\]:
  Resolve one or more artifact kinds to project-relative file paths.
  The optional `--kind` *kinds* option is a comma-separated list of
  artifact kinds out of `spec`, `code`, `docs`, `infr`, and
  `othr` (default: all kinds). Each kind's files are printed as a
  bullet list; when more than one kind is resolved, each list is
  preceded by a `# `*kind*`:` header. The `othr` kind is the implicit
  catch-all and is always resolved last.

- `ase artifact name` *filename* \[`--kind` *kind*\]:
  Resolve a base-relative *filename* within an artifact *kind* to a
  project-relative path. The `--kind` option selects one of the four
  configured kinds `spec`, `code`, `docs`, or `infr` (default:
  `code`).

The following top-level commands exist for linting, exporting and previewing the
*SpecBook*-based project specification, i.e. the Markdown files below
the `project.artifact.spec.basedir` directory, governed by the SpecBook
YAML schema configurations `project.artifact.spec.schema` -- a
whitespace-separated list of schema files merged in order, where the
entry `std` names the standard `ase-format-specbook.yaml` bundled with
the plugin and every other entry is a file path relative to the project
root (default: `std`). The
SpecBook processing information is logged at the `info` level and its
tracing details at the `debug` level, while the progress chatter a bare
SpecBook run always prints is not logged at all. The Git exclude rules
apply here exactly as they do to `ase artifact list`: an artifact file
Git excludes from the project counts as an *absent* one, so both
resolvers always see the very same specification:

- `ase spec`:
  Entry point group for the specification commands. Without a
  subcommand, the help text is shown and the command exits with status 1.

- `ase spec lint` \[`-v`|`--verbose`\]:
  Lint the specification Markdown files against the SpecBook schema
  configuration. Every diagnostic is printed as a
  `<file>:<line>:<column>: <message>` line (with *file* relative to the
  project root and *message* prefixed with `warning: ` for a diagnostic
  of `warning` severity), or, with `--verbose`, as a multi-line message
  with the affected source snippet (colorized on a terminal). The
  command exits with status 1 if there is any diagnostic of `error`
  severity.

- `ase spec export` \[`-o`|`--output` \[*format*`:`\]*file*\] \[...\] \[`-w`|`--watch`\]:
  Export the specification Markdown files as `json`, `json5`, `yaml`,
  `toon` (the specification object model), `html` (self-contained single
  document), `pdf` (paginated print document), or `md` (normalized single
  Markdown document). The repeatable `--output` option names an output
  file (`-` for standard output), whose *format* is inferred from the
  filename extension unless explicitly given as a prefix (plain `-`
  defaults to `json`). Without any `--output` option, the HTML rendering
  is written to `index.html` inside the specification base directory
  (e.g. `docs/specbook/index.html`). With `--watch`, the command does
  not terminate after the initial export, but keeps the outputs in sync
  by re-exporting on every change of a configuration file, an artifact
  file, or one of its embedded assets; a transiently failing re-export
  leaves the watch intact. As a
  re-export has to land somewhere it can be picked up again, `--watch`
  rejects the `-` standard output. The export fails
  on any lint diagnostic, so a partial or invalid specification is never
  emitted. The `pdf` format additionally requires a Chromium-class
  browser, which neither `npm install -g @rse/ase` nor `ase setup
  install` provides: unless a *Google Chrome* is installed system-wide,
  fetch the Playwright Chromium once via `npx playwright install
  chromium`. Without any such browser the export fails before the
  specification is even parsed and reports that very command; a fallback
  onto a system-installed *Google Chrome* is reported in the `notices`
  of the `ase_specbook_export` MCP tool.

- `ase spec preview` \[`-a`|`--addr` *ip-addr*\] \[`-p`|`--port` *tcp-port*\]:
  Serve the HTML export of the specification Markdown files as a live
  preview on `http://<ip-addr>:<tcp-port>/` (default:
  `http://127.0.0.1:12345/`). The export is kept in sync with its
  sources exactly like under `ase spec export --watch`, and every fresh
  export is pushed into the connected browsers as an in-place document
  update. Before the first successful export, a placeholder page is
  served instead. The command does not terminate on its own.

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
  by end users. It injects the *ASE* constitution into the session
  context and, for `--tool copilot` and `--tool codex` only, additionally
  the instructions of the plugin-shipped output style `ase-terse` (with its
  YAML frontmatter stripped), as those tools have no output style
  concept, whereas *Anthropic Claude Code CLI* applies the plugin output
  style natively.

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

- **session**: *per-user state directory*`/session/`*id*`/config.yaml`:
  Per-session *ASE* configuration (scope `session:`*id*), located
  independent of any project context and removed on session end.

STATE FILES
-----------

- *per-user state directory*:
  Machine-local per-user *ASE* state (session configurations,
  `task-lifecycle.json`, and the agent run files below), never roamed or versioned. The per-user
  state directory is `~/Library/Application Support/ase` on macOS,
  `%LOCALAPPDATA%\ase` on Windows, and `$XDG_STATE_HOME/ase`
  (falling back to `~/.local/state/ase`) on Linux and other Unix systems.

- *per-user state directory*`/agent-`*kind*`/`*store-hash*`/`*run-id*`.lock` and `.json`:
  Run lock (a directory, refreshed periodically and considered stale
  after 30 seconds without refresh) and run record (process id, process
  start time, and claimed tasks) of each agent process of agent
  *kind* (`planner`, `implementer`, `approver`, `integrator`, or
  `editor`), below a sub-directory per task store, where *store-hash*
  is the first 12 hex digits of the SHA-1 digest of the absolute base
  directory of an `ase:` task store, the scheme, host, and port of an `ase://`
  resp. `ases://` task store, or the `project.task.store.url` value
  otherwise. They are used to recover the tasks of terminated agent
  processes. On termination, the lock is removed, and so is the
  record, unless it still records claimed tasks.

- `.ase/service.yaml`:
  Per-project service state.

- `.ase/service.log`:
  Stdout/stderr log of the detached background service. As the service
  inherits the file descriptor for its entire lifetime, the file cannot
  be rotated while the service runs and instead is trimmed down to its
  last 2000 lines whenever a service is started on a file larger than
  1 MB. Routine *MCP* traffic (session handshakes, notifications, and
  stream opens) is logged at log level `debug` only and tool call
  arguments are capped at 200 characters. Start the service with `ase
  --log-level debug service start` to log the full *MCP* traffic.

- `<project>/`*basedir*`/TASK-`*id*`.md`:
  Persisted task plan, managed by the `ase task` subcommands through the
  built-in storage plugin of a local `ase:`*basedir* task store
  (`project.task.store.url`, default `ase:./.ase/task`), located relative
  to the Git top-level directory (or the current working directory
  outside a Git repository). Each task file is owned by *ASE* and
  removed by `ase task delete` and `ase task purge`.

- `<project>/.ase/board.yaml`:
  Display state of `ase task board`: separately for the terminal and the
  web board, the shown view (`lanes`, `graph`, or `agents`), the
  minimized lanes, the collapsed groups, whether the
  task titles are wrapped onto multiple lines, whether the key hint
  lines are shown, and whether the graph shows the standalone tasks.
  The web state is shared by all
  browsers and tabs showing the web board. It never holds task content.

- `<project>/.ase/agent/`*name*`.yaml` and `.log`:
  Runtime state (process id and process start time) and log (of a
  detached agent only) of the agent named *name* (see `ase agent`
  *agent* `start`), where the state exists while the agent runs.

- `<project>/.ase/agent/fleet.yaml` and `fleet.log`:
  Runtime state (process id, process start time, configuration file,
  and the kind, process id, and number of restarts of each member) and
  log (of a detached fleet only) of the fleet (see `ase agent fleet
  start`), where the state exists while the fleet runs.

- `<project>/.ase/fleet.yaml`:
  Default configuration of the fleet (see `ase agent fleet start`),
  written by the user (or initially created via `ase agent fleet init`)
  and intended to be versioned.

- `<project>/.ase/.gitignore`:
  Self-ignoring Git ignore file, created on first write of any of the
  machine-local runtime files above (`service.yaml`, `service.log`,
  `board.yaml`, and `agent/`), which it covers together with lock files and
  `worktree/`, so they never show up as untracked files. An existing
  file is never overwritten.

HISTORY
-------

Development of `ase` started in October 2025.

AUTHOR
------

Dr. Ralf S. Engelschall <rse@engelschall.com>


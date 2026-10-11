## About

**Agentic Software Engineering (ASE)** is the opinionated companion
tooling of *Dr. Ralf S. Engelschall* for combining Agentic AI Coding with
Software Engineering in tools like *Anthropic Claude Code CLI*. **ASE**
consists of an agent tool plugin (hooks, skills, sub-agents, meta files),
a Command-Line Interface (CLI) tool, and a per-project background service
bridged into the agent tool as a Model-Context-Protocol (MCP) server.

The primary target agent tool is *Anthropic Claude Code CLI*; *GitHub
Copilot CLI* and *OpenAI Codex CLI* are secondary targets, selected via
`ASE_TOOL=copilot` resp. `ASE_TOOL=codex` or the `--tool` CLI option.

## Repository Layout

**ASE (Agentic Software Engineering)** ships three deliverables from one repo:

-   `plugin/`: the agent tool plugin
    -   `plugin/skills/ase-xxx-xxx/`: the 57 skills, each with a `SKILL.md`
        (agent instructions) and a `help.md` (Unix-style manual page)
    -   `plugin/agents/`: the sub-agent definitions leveraged by the skills
    -   `plugin/meta/`: the shared meta files (constitution, tenets, persona,
        dialog, getopt, and artifact format conventions), exposed to skills
        via `ase util meta <name>`; the specification format `ase-format-spec.md`
        includes the SpecBook models and formats description
        `ase-format-specbook.md` and the standard SpecBook schema
        configuration `ase-format-specbook.yaml`, both generated at
        build-time by *SpecBook* (`@rse/specbook`)
    -   `plugin/hooks/`: the per-agent-tool hook wiring
        (`hooks.json`, `hooks-copilot.json`, `hooks-codex.json`)
    -   `plugin/.claude-plugin/`, `plugin/.codex-plugin/`,
        `plugin/.github/plugin/`: the per-agent-tool plugin manifests
-   `tool/`: the `@rse/ase` CLI
    -   `tool/src/ase.ts`: the entry point, wiring all top-level commands
    -   `tool/src/ase-*.ts`: one module per top-level command (`setup`,
        `config`, `mcp`, `service`, `hook`, `statusline`, `task`, `artifact`,
        `spec`, `util`, `util-meta`, `util-compat`, `util-diagram`, `util-worktree`,
        `util-mint`, `util-metric`, `agent`) plus generic library modules (`lib-log`,
        `lib-stdio`, `lib-table`, `lib-ignore`, `lib-version`, the
        `lib-daemon-cli` part shared by all background processes (servers,
        agents, and the agent fleet) for their start/status/log/stop CLI commands,
        and the `lib-server-cli` and `lib-server-bind` parts shared by the task store
        and agent relay servers for their CLI commands and their HTTP
        binding), the parts of `ase agent` (`agent-common` for the common
        agent base, `agent-common-phase` for the common base of the lifecycle
        phase agents `agent-planner`, `agent-implementer`, `agent-approver`,
        and `agent-integrator`, `agent-common-request` for the common base
        of the task request agent `agent-editor`, `agent-instance` for the
        `ase agent <kind> start|status|log|stop` commands of a single agent, and
        `agent-fleet` for the `ase agent fleet` supervisor of multiple agents
        and the agent relay), the parts of
        `ase setup` (`setup-common` for the shared types and sub-process
        runner, `setup-mcp` for the MCP server registry, `setup-settings`
        for the statusline and output style settings), the parts of
        `ase config` (`config-scope` for the scope chain and directory
        resolution, `config-schema` for the schema, presets, and write
        policies, `config-core` for the layered `Config` class), the MCP-only tool modules of the
        service (`service-kv`, `service-getopt`, `service-markdown`,
        `service-skills`, `service-sleep`, `service-timestamp`),
        the task board (`task-board` for
        the `ase task board` CLI command plus its `task-board-core`,
        `task-board-graph`, `task-board-filter`, `task-board-tui` (split into its
        `task-board-tui-{model,control,view,popup,style}` parts), and `task-board-web-server`
        parts, the latter with its browser client in
        `ase-task-board-web-client.{html,ts,vue,styl}`, a Vue application
        bundled by Vite), and the task store (`task-store-server-cli` for
        the `ase task store` CLI wrapper, `task-store-core` for the
        transport-agnostic REST API functionality, `task-store-server-bind`
        for its HTTP and WebSocket binding,
        `task-store-plugin-api` for the storage plugin contract, `task-store-plugin-delegate`
        for the plugin loader and the locking storage delegate,
        `task-store-plugin-ase` for the built-in file-based storage plugin,
        `task-store-plugin-github` for the built-in GitHub Issues storage plugin,
        `task-store-plugin-gitlab` for the built-in GitLab Issues storage plugin,
        `task-store-plugin-gitea` for the built-in Gitea Issues storage plugin,
        `task-store-issues` for the common parts of all issue tracker storage plugins,
        `task-format` for the textual task format codec and the lifecycle
        models, `task-request` for the codec of the agent requests attached
        to tasks, like the edit requests of the task boards; see
        `docs/task-api.md`), and the agent relay, selected by
        `project.relay.url` and passing the live presence of the agents
        to the task boards (`agent-relay-server-cli` for the `ase agent relay` CLI
        wrapper, `agent-relay-core` for the transport-agnostic in-memory
        presence, `agent-relay-server-bind` for its HTTP and WebSocket
        binding, mountable into the task store server, and `agent-relay-client`
        for the relay URL resolution, the client, and the presence reporter
        of the agents). `ase-task.ts` itself only forwards
        the `ase task` CLI and `ase_task_*` MCP tools to the task store
        selected by `project.task.store.url`, through
        the local or remote task store clients of `ase-task-store-client.ts`.
    -   `tool/bin/ase`: the published shim, loading compiled output from `dst/`
    -   `tool/plugin/` and `tool/.claude-plugin/`: build-time copies of
        `plugin/` and `.claude-plugin/` -- never edit them, they are regenerated
-   `pages/`: the GitHub Pages site (https://ase.tools), an *Astro* project
    -   `pages/src/data/*.ts`: the content data, especially `skills.ts` (the
        single source of truth for skill grouping and ordering), `highlights.ts`,
        `methods.ts`, `comparison.ts`, `fit.ts`, `testimonials.ts`, and `site.ts`
    -   `pages/src/components/*.astro`: the page sections and UI components,
        assembled in `pages/src/pages/index.astro`

Additionally, the repository root carries `docs/` (hand-written documentation
and diagram sources) and `bin/ase` (a development shim which builds `tool/` on
demand and runs it with `ASE_SETUP_DEV=1`).

## Build System

Build orchestration uses `@rse/stx`, not plain npm scripts. In every
directory the only npm script is `npm start`, which invokes stx with the
local `etc/stx.conf`.

The top-level targets in the repository root fan out into all three
deliverables:

```
npm start lint          # lint  plugin, tool, and pages
npm start build         # build plugin, tool, and pages
npm start upd           # update all package.json dependency versions
npm start tokei         # show project statistics
npm start clean         # remove regularly built files
npm start distclean     # also remove node_modules and package-lock.json
npm start publish       # bump version, commit, tag, npm publish, GitHub release
```

The per-deliverable targets are:

```
cd plugin
npm start lint          # markdownlint-cli2 + eslint over meta/ and skills/
npm start build         # lint, then regenerate skills/ase-help-intent/data.md

cd tool
npm start lint          # eslint over src/*.{ts,vue} + vue-tsc type-check of the web board client
npm start build         # lint + build-cmd + build-plugin + test
npm start build-cmd     # tsc + vite build of the web board client (emits into dst/)
npm start build-plugin  # copy ../plugin and ../.claude-plugin into the package
npm start test          # node --test over test/*.test.mjs against the built dst/
npm start build-watch   # nodemon rebuild on src/**/*.{ts,vue,styl,html}
npm start lint-watch    # nodemon relint on src/**/*.{ts,vue}

cd pages
npm start lint          # astro check + eslint over src/**/*.{ts,astro}
npm start build         # lint, then astro build (emits into dst/)
npm start dev           # astro dev
npm start preview       # astro preview
npm start typing-demo   # re-record the typing demo GIF via Playwright
```

Each of `plugin`, `tool`, and `pages` additionally provides `clean` and
`distclean`. Only `tool` defines a `test` target, which `build` runs last.

## Setup

```
ase setup install                # install    tool and plugin
ase setup update                 # update     tool and plugin
ase setup uninstall              # uninstall  tool and plugin
ase setup enable                 # enable     plugin (without uninstalling)
ase setup disable                # disable    plugin (without uninstalling)
ase setup status                 # report     plugin, MCP server, and statusline registrations
ase setup mcp list               # list       pre-defined foreign MCP servers
ase setup mcp activate           # activate   foreign MCP servers (keys in ASE_MCP_KEY_<ID>)
ase setup mcp deactivate         # deactivate foreign MCP servers
ase setup statusline activate    # activate   ASE statusline
ase setup statusline deactivate  # deactivate ASE statusline
```

All `ase setup` sub-commands -- except `ase setup mcp list` -- accept
`--tool claude|copilot|codex` (default: `claude`, or `$ASE_TOOL`) and,
for `claude` only, `--scope user|project|local` (default: `user`).
The exception is `ase setup status`, which reports *all* scopes at once
and hence takes no `--scope`.

## CLI Commands

Beyond `ase setup`, the CLI provides `ase config` (layered `user` <
`project` < `task` < `session` configuration), `ase service` (per-project
background HTTP service), `ase mcp` (stdio-to-service MCP bridge), `ase
hook` (agent tool hook handlers), `ase statusline` (statusline renderer),
`ase task` (persisted task plans, including `ase task board` for the
interactive task board in terminal and browser), `ase agent` (the
autonomous task lifecycle agents `planner`, `implementer`, `approver`,
and `integrator`, which together drive the `enterprise` task lifecycle
model headless, and the `editor` agent, which processes the
prompt-driven edit requests of the task boards in any lifecycle model;
each agent runs in its own process, managed individually via `ase agent
<kind> start|status|log|stop`, e.g. `ase agent implementer start -p 2`;
additionally, `ase agent relay` runs the per-user agent relay server,
which passes the live presence of the agents to the task boards, and
`ase agent fleet start|status|log|stop` runs a fleet of agents (and of the
relay) of a YAML configuration (initially created via `ase agent fleet
init`) through a supervising process, restarting every exited member
with an exponential backoff), `ase artifact` (artifact kind
resolution), `ase spec` (SpecBook specification linting, exporting, and
previewing), and `ase util` (utility commands: `ase util meta` (plugin
meta file output), `ase util diagram` (Mermaid rendering), `ase util
worktree` (ASE worktree path resolution), `ase util mint` (hash-derived
identifier minting), `ase util metric` (text length metrics), and `ase
util compat` (probe values for the `ase-meta-compat` self-test skill)). See
`docs/usage-tool.md` for the full manual page.

## Code Style

Strict TypeScript conventions are enforced in `tool/src/`: no semicolons
(except inside `for`), double quotes, K&R braces, no braces around
single-statement `if`/`while` blocks, vertically-aligned operators
on similar consecutive lines, `/* ... */` block comments with two
leading/trailing spaces, parens around all arrow parameters, and line
breaks before `else`/`catch`/`finally`. Match existing formatting
exactly when editing.

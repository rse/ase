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

**ASE** ships three deliverables from one repository:

-   `plugin/`: the agent tool plugin
    -   `plugin/skills/ase-xxx-xxx/`: the 57 skills, each with a `SKILL.md`
        (agent instructions) and a `help.md` (Unix-style manual page), plus
        optional skill-specific files (like `ase-help-intent/data.md`, the
        concatenation of all `help.md` files, generated at build-time, or
        `ase-help-skill/catalog.md`, the grouped catalog of all skills);
        the `help.md` files document only the user-facing skill surface
        (purpose, options, arguments, and usage examples), *not* the
        internals of the skills (the workflow steps of `SKILL.md`, the
        leveraged sub-agents, meta files, and MCP tools, and their
        interplay), so consult the `SKILL.md` and its referenced files for
        the latter and never add implementation details to the `help.md`
        files
    -   `plugin/agents/`: the sub-agent definitions leveraged by the skills
    -   `plugin/meta/`: the shared meta files, exposed to skills via
        `ase util meta <name>`: the constitution, tenets, persona, dialog,
        control flow, getopt, and skill output conventions
        (`ase-{constitution,tenets,persona,dialog,control,getopt,skill}.md`),
        the common steps shared by groups of skills (`ase-common-*.md`),
        and the artifact formats (`ase-format-{meta,task,spec}.md`), where
        the specification format `ase-format-spec.md` includes the SpecBook
        models and formats description `ase-format-specbook.md` and the
        standard SpecBook schema configuration `ase-format-specbook.yaml`,
        both generated at build-time by *SpecBook* (`@rse/specbook`)
    -   `plugin/hooks/`: the per-agent-tool hook wiring
        (`hooks.json`, `hooks-copilot.json`, `hooks-codex.json`)
    -   `plugin/output-styles/`: the output style `ase-terse`
    -   `plugin/mods/`: the Claude Code function hooks module ("mod"),
        type-checked against the downloaded `claude-code.d.ts`:
        `ase-mods.ts` for the hooking infrastructure (the only module
        loaded by the engine, registering the hooks, dispatching them
        into the other modules, and binding the engine services for
        them), `ase-mods-common.ts` for the shared parts (Markdown table
        rows, styled characters, Markdown conversion, wrapping, framing,
        and the contract, keys, geometry, and drawing of the master/detail
        view in the band above the prompt), `ase-mods-grill.ts` for
        re-rendering the grilling tables of ASE, `ase-mods-evaluate.ts`
        for re-rendering the decision matrices of `ase-meta-evaluate`
        (with the best alternative in blue and the criteria rows sortable
        by clicking the header cells), `ase-mods-help-find.ts`
        for the intent help (a prompt, other than a skill command,
        suffixed with a blank and `!!` matched against the help of all
        skills, with the proposed commands in the band above the prompt,
        and closed by `!!` again),
        `ase-mods-help-compose.ts` for the synopsis form (a skill command,
        bare or with its typed options and arguments, suffixed with `!!`
        composed resp. edited through a form of its SYNOPSIS in the band
        above the prompt, and applied by `!!` again),
        `ase-mods-help-show.ts` for the manual band (a skill command,
        bare or with its typed options and arguments, suffixed with a
        blank and `//` toggling the entire manual page of the skill in
        the band above the prompt, while the command is typed on, until
        the synopsis form opens), `ase-mods-help-browse.ts` for the
        manpage browser (a prompt of just `//`, or of a free text
        suffixed with a blank and `//`, browsing the manual pages of all
        skills, filtered by a fuzzy search initially of the free text, in
        the band above the prompt, with RETURN taking over the command of
        the selected skill), and `ase-mods-help-hint.ts` for the hint band
        (a prompt starting with a skill command showing the entire argument
        hint of the skill, wrapped over multiple lines, in the band above
        the prompt, instead of the truncated one-line argument hint of
        Claude Code, which is dropped for the skills)
    -   `plugin/.claude-plugin/`, `plugin/.codex-plugin/`,
        `plugin/.github/plugin/`: the per-agent-tool plugin manifests
-   `tool/`: the `@rse/ase` CLI
    -   `tool/src/ase.ts`: the entry point, wiring all top-level commands
    -   `tool/src/ase-<command>.ts`: one module per CLI command resp.
        command group: `setup`, `config`, `service`, `mcp`, `hook`,
        `statusline`, `task`, `task-board`, `agent`, `artifact`, `spec`,
        `man`, `util`, and `util-{meta,diagram,worktree,mint,metric,compat}`
    -   `tool/src/ase-lib-*.ts`: the generic library modules (`lib-log`,
        `lib-stdio`, `lib-table`, `lib-ignore`, `lib-version`, `lib-hash`,
        `lib-daemon-cli` for the start/status/log/stop CLI commands of all
        background processes (servers, agents, and the agent fleet), and
        `lib-server-cli` and `lib-server-bind` for the CLI commands and the
        HTTP binding of the task store and agent relay servers)
    -   `tool/src/ase-setup-*.ts`: the parts of `ase setup`
        (`setup-common` for the shared types and sub-process runner,
        `setup-mcp` for the MCP server registry, and `setup-settings` for
        the statusline and output style settings)
    -   `tool/src/ase-man-*.ts`: the parts of `ase man` (`man-catalog`
        for the catalog of the manual pages of all commands and skills,
        `man-render` for their Markdown rendering, including the Shiki
        syntax highlighting of the code blocks, and `man-tui` for the
        interactive, full-screen manual page browser)
    -   `tool/src/ase-config-*.ts`: the parts of `ase config`
        (`config-scope` for the scope chain and directory resolution,
        `config-schema` for the schema, presets, and write policies, and
        `config-core` for the layered `Config` class and the internal
        session state)
    -   `tool/src/ase-service-*.ts`: the MCP-only tool modules of the
        service (`service-{kv,getopt,markdown,skills,sleep,state,timestamp}`)
        and its AI usage accounting (`service-otel` for the OTLP ingress,
        the usage windows of the task assignments, and their bookings onto
        the usage attachments of the tasks)
    -   `tool/src/ase-task-*.ts`: the task functionality, where `ase-task.ts`
        itself only forwards the `ase task` CLI and `ase_task_*` MCP tools to
        the task store selected by `project.task.store.url`, through the
        local or remote task store clients of `task-store-client`
        (see `docs/task-api.md`):
        -   `task-format` for the textual task format codec and the
            lifecycle models, and `task-request` for the codec of the agent
            requests attached to tasks, like the edit requests of the task
            boards
        -   the task store: `task-store-server-cli` for the `ase task store`
            CLI wrapper, `task-store-core` for the transport-agnostic REST
            API functionality, `task-store-server-bind` for its HTTP and
            WebSocket binding, `task-store-plugin-api` for the storage
            plugin contract, `task-store-plugin-delegate` for the plugin
            loader and the locking storage delegate, the built-in storage
            plugins `task-store-plugin-{ase,github,gitlab,gitea}` (file-based
            resp. GitHub, GitLab, and Gitea Issues), and `task-store-issues`
            for the common parts of all issue tracker storage plugins
        -   the task board: `task-board` for the `ase task board` CLI
            command, `task-board-{core,graph,flow,filter,stats}` for its
            model (where `flow` is the agent graph along the lifecycle model),
            `task-board-tui` (split into `task-board-tui-{model,control,view,popup,style}`)
            for the terminal UI, and `task-board-web-server` for the browser
            UI, served by the service, with its client in
            `ase-task-board-web-client.{html,ts,vue,styl}`, a Vue
            application bundled by Vite, whose root component is split
            into the modules `task-board-web-client-{model,editor,control}`
            (shared state and service access, task plan editor, and
            actions and key dispatching) and the components
            `task-board-web-client-{lanes,graph,flow,agents,stats,dialog,popup,title}`
    -   `tool/src/ase-agent-*.ts`: the parts of `ase agent`:
        -   `agent-runtime` for the runtime base of all agents,
            `agent-runtime-tool` for the headless agent tool invocation
            and the decoding of its output, `agent-runtime-exec` for the
            processes, temporary directories, jobs, and Git operations,
            `agent-runtime-claim` for the run locks and task claims of the
            crash recovery, `agent-runtime-{phase,request}` for the runtime bases of the
            phase resp. request agents, and `agent-runtime-engine` for the
            engine running every agent of a definition (its phase and
            request agents) and its facades: the built-in agents, the agents
            of the definition kinds, and the `adhoc` agent
        -   `agent-definition-api` for the public, self-contained types of
            the agent definitions and their hooks (exported as the types of
            the `@rse/ase` package), `agent-definition-core` for the
            definition model (options, YAML, TypeScript, JavaScript, and
            built-in definition loading, discovery of the definition kinds,
            hooks, validation, and templates), and
            the directory
            `tool/src/ase-agent-definition-builtin/` with the files
            `{rebooter,condenser,implementer,qualifier,integrator,editor,estimator,researcher}.ts`
            for the declarative definitions of the modes of the built-in
            agents
        -   `agent-process` for the `ase agent <kind> start|status|log|stop`
            commands of a single agent, and `agent-fleet` for the
            `ase agent fleet` supervisor of multiple agents and the agent
            relay
        -   the agent relay, selected by `project.relay.url` and passing the
            live presence of the agents to the task boards:
            `agent-relay-server-cli` for the `ase agent relay` CLI wrapper,
            `agent-relay-core` for the transport-agnostic in-memory
            presence, `agent-relay-server-bind` for its HTTP and WebSocket
            binding (mountable into the task store server), and
            `agent-relay-client` for the relay URL resolution, the client,
            and the presence reporter of the agents
    -   `tool/bin/ase`: the published shim, loading compiled output from `dst/`
    -   `tool/man/ase{,-xxx{,-yyy}}.md`: the Unix manual pages of all CLI
        commands (one per command and command group, where the pages of a
        group with third-level commands like `ase task store` cover them),
        in the *remark-man* Markdown format, copied at build-time into
        `dst/man/*.md` (shown by `ase man`); they
        document only the user-facing CLI surface (commands, options,
        arguments, configuration, and files), *not* the internals of
        `tool/src/` (modules, classes, functions, types, and their
        interplay), so consult the source code for the latter and never
        add implementation details to the manual pages
    -   `tool/plugin/` and `tool/.claude-plugin/`: build-time copies of
        `plugin/` and `.claude-plugin/` -- never edit them, they are regenerated
-   `pages/`: the GitHub Pages site (https://ase.tools), an *Astro* project
    -   `pages/src/pages/`: the pages of the site (`index.astro`, `author`,
        `design`, `highlights`, `news`, `project`, `setup`, `usage`,
        `workflows`, `typing-demo`, and `usecases/[usecase]`), all based on
        `pages/src/layouts/BaseLayout.astro`
    -   `pages/src/components/*.astro`: the page sections (`Section-*`),
        modals (`Modal-*`), widgets (`Widget-*`), and client-side features
        (`Feature-*`)
    -   `pages/src/styles/theme.css`: the global stylesheet (Tailwind CSS,
        fonts, and theme) of the site
    -   `pages/src/data/*.ts`: the content data, especially `skills.ts` (the
        single source of truth for skill grouping and ordering, mirrored by
        the skill groups of `tool/src/ase-man-catalog.ts`, so keep both in
        sync),
        `manpages.ts` (the CLI command tree, read at build-time from
        `tool/man/*.md`), `news.ts` (the release news, read at build-time
        from `NEWS.md`), `terminology.ts` (the term definitions, imported at
        build-time from the sibling `terminology.md`), and
        `comparison.ts`, `fit.ts`, `methods.ts`,
        `nav.ts`, `previews.ts`, `site.ts`, `testimonials.ts`,
        `usecases.ts`, and `usps.ts`
-   `test/`: the non-shipped skill test harness, documented in
    `test/TESTS.md`

Additionally, the repository root carries `docs/` (hand-written
documentation and diagram sources), `etc/` (the top-level `stx.conf` and the
version bumping script `version.mts`), `CHANGELOG.md` (the detailed
change log, also the source of the GitHub release notes), `NEWS.md` (the
user-facing release news, also rendered by `pages/`),
`.claude-plugin/marketplace.json` and `.github/plugin/marketplace.json`
(the plugin marketplace manifests), `.github/workflows/static.yml` (the
GitHub Pages deployment of `pages/`), and `bin/ase` (resp. `bin/ase.bat`
on Windows, both delegating to `bin/ase.js`), a development shim which
builds `tool/` on demand and runs it with `ASE_SETUP_DEV=1`.

## Build System

Build orchestration uses `@rse/stx`, not plain npm scripts. In every
directory the only npm script is `npm start`, which invokes stx with the
local `etc/stx.conf`.

The top-level targets in the repository root fan out into all three
deliverables:

```
npm start lint          # lint  plugin, tool, pages, and test
npm start build         # build plugin, tool, and pages
npm start test          # run the skill test harness of test/ (burns AI tokens, see test/TESTS.md)
npm start upd           # update all package.json dependency versions
npm start tokei         # show project statistics
npm start clean         # remove regularly built files
npm start distclean     # also remove node_modules and package-lock.json
npm start publish       # lint, bump version, build, commit, tag, push, npm publish, GitHub release
npm start publish-minor # same as "publish", but bumping the minor instead of the release version
npm start publish-major # same as "publish", but bumping the major instead of the release version
```

The per-deliverable targets are:

```
cd plugin
npm start lint          # markdownlint-cli2 + eslint over meta/, skills/, agents/,
                        # and output-styles/, tsc over mods/, and "claude plugin validate"
npm start build         # lint, then regenerate skills/ase-help-intent/data.md
                        # and meta/ase-format-specbook.{md,yaml}
npm start fetch-types   # force re-download of mods/claude-code.d.ts

cd tool
npm start lint          # eslint over src/ + vue-tsc type-check of the web board client
npm start build         # lint + build-cmd + build-man + build-plugin
npm start build-cmd     # tsc of the program and its public types + vite build
                        # of the web board client (emits into dst/)
npm start build-man     # copy of man/*.md into dst/man/*.md
npm start build-plugin  # copy ../plugin and ../.claude-plugin into the package
npm start build-container # build and push the multi-arch container image (etc/ase.dockerfile)
npm start build-watch   # nodemon rebuild on src/**/*.{ts,vue,styl,html}
npm start lint-watch    # nodemon relint on src/**/*.{ts,vue}

cd pages
npm start lint          # astro check + eslint over src/**/*.{ts,astro}
npm start build         # lint, then astro build (emits into dst/)
npm start dev           # astro dev
npm start preview       # astro preview
npm start typing-demo   # re-record the typing demo GIF via Playwright
```

Each of `plugin`, `tool`, `pages`, and `test` additionally provides
`clean` and `distclean`. The only test target is the skill test harness
of `test/` (see `test/TESTS.md`), which burns real AI tokens and is
hence never part of `build` or `publish`.

## Setup

```
ase setup install                # install    tool and plugin
ase setup update                 # update     tool and plugin
ase setup uninstall              # uninstall  tool and plugin
ase setup enable                 # enable     plugin (without uninstalling)
ase setup disable                # disable    plugin (without uninstalling)
ase setup status                 # report     plugin, MCP server, output style, function hooks, statusline, and telemetry registrations
ase setup mcp list               # list       pre-defined foreign MCP servers
ase setup mcp activate           # activate   foreign MCP servers (keys in ASE_MCP_KEY_<ID>)
ase setup mcp deactivate         # deactivate foreign MCP servers
ase setup statusline activate    # activate   ASE statusline
ase setup statusline deactivate  # deactivate ASE statusline
ase setup telemetry activate     # activate   OTLP export towards ASE
ase setup telemetry deactivate   # deactivate OTLP export towards ASE
```

All `ase setup` sub-commands -- except `ase setup mcp list` -- accept
`--tool claude|copilot|codex` (default: `claude`, or `$ASE_TOOL`; the
statusline is unsupported for `codex`) and, for `claude` only,
`--scope user|project|local` (default: `user`, except for `update`,
`uninstall`, `enable`, and `disable`, which auto-detect the scope of the
existing plugin installation). The exceptions are `ase setup status`,
which reports *all* scopes at once, and `ase setup telemetry
activate|deactivate`, which always writes user-level configuration, and
hence both take no `--scope`. Additionally, `install`, `update`, and
`uninstall` accept `--dev` (default: `$ASE_SETUP_DEV`) to use the local
working copy instead of the remote or bundled repository, and `update`
accepts `--force` to update even if already at the latest version.

## CLI Commands

Beyond `ase setup`, the CLI provides:

-   `ase config`: the layered `user` < `project` < `task` < `session` configuration
-   `ase service`: the per-project background HTTP service
-   `ase mcp`: the stdio-to-service MCP bridge
-   `ase hook`: the agent tool hook handlers
-   `ase statusline`: the statusline renderer
-   `ase task`: the persisted task plans, including `ase task board` for
    the interactive task board in terminal and browser, and `ase task
    store` for the task store server
-   `ase agent`: the autonomous agents, each running in its own process,
    managed individually via `ase agent <kind> start|status|log|stop`
    (e.g. `ase agent implementer start -p 2`):
    -   the task lifecycle agents `implementer`, `qualifier`, and
        `integrator`, which together drive the `enterprise` task lifecycle
        model headless from the planned to the integrated tasks
    -   the planning agents `rebooter` and `condenser`, which re-create
        resp. condense the plans of the `DRAFTED` tasks of the
        `enterprise` lifecycle model explicitly assigned to them
        (`DRAFTED` > `PLANNING` > `DRAFTED`, unassigned afterwards)
    -   the `editor` agent, which processes the prompt-driven edit requests
        of the task boards in any lifecycle model
    -   the `estimator` agent, which estimates the effort (the `Effort:`
        key) of the tasks without a valid one in any lifecycle model
        (mode `phase`, intended for the final estimation), resp. of the
        tasks of the `estimate` requests of the task boards in any
        unfinished status (mode `request`, intended for dry-runs)
    -   the `researcher` agent, which researches the plans of the `DRAFTED`
        tasks of the `enterprise` lifecycle model explicitly assigned to
        it (mode `phase`, intended for researching and grounding the plan
        content), resp. processes the `research` requests of the task
        boards in any lifecycle model (mode `request`, intended for
        topic-driven research), appending a research report (Web research
        plus source artifact grounding) to the `research` attachment of
        the tasks and refining their plans
    -   the agents of the definition kinds, whose entire behavior is
        configured by a definition file `<kind>.{yaml,yml,ts,mts,js,mjs,cjs}`
        of the project (`.ase/agents/`) or of the user (`agents/` of the
        user configuration directory), where a definition kind replaces a
        built-in kind of the same name, resp. by the options of the `adhoc`
        agent (with example definitions in `tool/man/ase-agent-adhoc.md`); the
        built-in agents are themselves declarative definitions run by the
        same agent engine
    -   `ase agent relay`: the per-user agent relay server, passing the
        live presence of the agents to the task boards
    -   `ase agent fleet start|status|log|stop`: a fleet of agents (and of
        the relay) of a YAML configuration (initially created via `ase
        agent fleet init`), run through a supervising process, restarting
        every exited member with an exponential backoff
-   `ase artifact`: the artifact kind resolution
-   `ase spec`: the SpecBook specification initializing, linting, exporting,
    and previewing
-   `ase man`: the interactive browser of the manual pages of `tool/man/`
    and of the skills shipped with the tool (plain text outside a terminal)
-   `ase util`: the utility commands `ase util meta` (plugin meta file
    output), `ase util diagram` (Mermaid rendering), `ase util worktree`
    (ASE worktree path resolution), `ase util mint` (hash-derived
    identifier minting), `ase util metric` (text length metrics), and
    `ase util compat` (probe values for the `ase-meta-compat` self-test
    skill)

See the manual pages `tool/man/*.md` (e.g. `ase man ase`) for the full details.

## Code Style

Strict TypeScript conventions are enforced in `tool/src/`: no semicolons
(except inside `for`), double quotes, K&R braces, no braces around
single-statement `if`/`while` blocks, vertically-aligned operators
on similar consecutive lines, `/* ... */` block comments with two
leading/trailing spaces, parens around all arrow parameters, and line
breaks before `else`/`catch`/`finally`. Match existing formatting
exactly when editing.

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
    -   `plugin/skills/ase-xxx-xxx/`: the 50 skills, each with a `SKILL.md`
        (agent instructions) and a `help.md` (Unix-style manual page)
    -   `plugin/agents/`: the sub-agent definitions leveraged by the skills
    -   `plugin/meta/`: the shared meta files (constitution, tenets, persona,
        dialog, getopt, and artifact format conventions), exposed to skills
        via `ase meta <name>`; the specification format `ase-format-spec.md`
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
        `spec`, `meta`, `compat`, `diagram`, `worktree`, `mint`) plus support modules
        (`log`, `stdio`, `getopt`, `kv`, `markdown`, `skills`, `sleep`,
        `timestamp`, `version`)
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
npm start lint          # eslint --config etc/eslint.mjs src/*.ts
npm start build         # lint + build-cmd + build-plugin
npm start build-cmd     # tsc --project etc/tsc.json (emits into dst/)
npm start build-plugin  # copy ../plugin and ../.claude-plugin into the package
npm start build-watch   # nodemon rebuild on src/**/*.ts
npm start lint-watch    # nodemon relint on src/**/*.ts
npm start prices-update # refresh checked-in LiteLLM price snapshot (needs network)

cd pages
npm start lint          # astro check + eslint over src/**/*.{ts,astro}
npm start build         # lint, then astro build (emits into dst/)
npm start dev           # astro dev
npm start preview       # astro preview
npm start typing-demo   # re-record the typing demo GIF via Playwright
```

Each of `plugin`, `tool`, and `pages` additionally provides `clean` and
`distclean`. No test target is defined anywhere.

## Setup

```
ase setup install                # install    tool and plugin
ase setup update                 # update     tool and plugin
ase setup uninstall              # uninstall  tool and plugin
ase setup enable                 # enable     plugin (without uninstalling)
ase setup disable                # disable    plugin (without uninstalling)
ase setup mcp list               # list       pre-defined foreign MCP servers
ase setup mcp activate           # activate   foreign MCP servers (keys in ASE_MCP_KEY_<ID>)
ase setup mcp deactivate         # deactivate foreign MCP servers
ase setup statusline activate    # activate   ASE statusline
ase setup statusline deactivate  # deactivate ASE statusline
```

All `ase setup` sub-commands -- except `ase setup mcp list` -- accept
`--tool claude|copilot|codex` (default: `claude`, or `$ASE_TOOL`) and,
for `claude` only, `--scope user|project|local` (default: `user`).

## CLI Commands

Beyond `ase setup`, the CLI provides `ase config` (layered `user` <
`project` < `task` < `session` configuration), `ase service` (per-project
background HTTP service), `ase mcp` (stdio-to-service MCP bridge), `ase
hook` (agent tool hook handlers), `ase statusline` (statusline renderer),
`ase task` (persisted task plans), `ase artifact` (artifact kind
resolution), `ase spec` (SpecBook specification linting and exporting),
`ase meta` (plugin meta file output), `ase diagram` (Mermaid
rendering), `ase worktree` (ASE worktree path resolution), `ase mint`
(hash-derived identifier minting), and `ase compat` (probe values for
the `ase-meta-compat` self-test skill). See
`docs/usage-tool.md` for the full manual page.

## Code Style

Strict TypeScript conventions are enforced in `tool/src/`: no semicolons
(except inside `for`), double quotes, K&R braces, no braces around
single-statement `if`/`while` blocks, vertically-aligned operators
on similar consecutive lines, `/* ... */` block comments with two
leading/trailing spaces, parens around all arrow parameters, and line
breaks before `else`/`catch`/`finally`. Match existing formatting
exactly when editing.

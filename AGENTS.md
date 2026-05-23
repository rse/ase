
## About

**Agentic Software Engineering (ASE)** is the opinionated companion
tooling of *Dr. Ralf S. Engelschall* for combining Agentic AI Coding
with Software Engineering in tools like *Claude Code*. **ASE** consists
of a *Claude Code* plugin and a Command-Line Interface (CLI) tool.

## Repository Layout

**ASE (Agentic Software Engineering)** ships two deliverables from one repo:

- `tool/` — the `@rse/ase` npm CLI (TypeScript, ESM, commander-based).
  Entry point `tool/src/ase.ts` wires the top-level commands `config`,
  `service`, `mcp`, `hook`, `diagram`, `setup`, `statusline`, and
  `task`, each registered by a corresponding `ase-<name>.ts` module.
  `ase config` manages layered YAML configuration across `user`/
  `project`/`task`/`session` scopes (subcommands: `init`, `list`,
  `edit`, `get`, `set`); `ase service` runs a per-project background
  HTTP service (subcommands: `start`, `status`, `send`, `stop`)
  bridged to *Claude Code* via `ase mcp`; `ase hook` handles agent
  hook events (subcommands: `session-start`, `session-end`,
  `pre-tool-use`, `user-prompt-submit`, `stop`); `ase setup`
  installs/updates/uninstalls/enables/disables the tool and its
  companion plugin (subcommands: `install`, `update`, `uninstall`,
  `enable`, `disable`, all with `--tool claude|copilot`);
  `ase statusline` renders the *Claude Code* (or *GitHub Copilot CLI*)
  status line; `ase task` manages persisted task plans under
  `<project>/.ase/task/<id>/plan.md` (subcommands: `list`, `load`,
  `edit`, `save`, `delete`, `purge`); `ase diagram` renders Mermaid
  diagrams as Unicode/ASCII art.

- `plugin/` — the Claude Code plugin published via the marketplace
  defined at `.claude-plugin/marketplace.json`. Plugin metadata in
  `plugin/.claude-plugin/plugin.json`. Layout:
  - `plugin/skills/<name>/SKILL.md` — the skill set, grouped by
    `ase-meta-*` (chat, search, changes, commit, diagram, evaluate,
    persona, quorum, why), `ase-code-*` (analyze, craft, explain,
    insight, lint, refactor, resolve), `ase-arch-*` (analyze, discover),
    and `ase-task-*` (id, list, edit, view, reboot, preflight, implement,
    delete).
  - `plugin/agents/<name>.md` — sub-agent definitions (`ase-meta-chat`,
    `ase-meta-search`).
  - `plugin/commands/<name>/*.md` — slash commands; currently the
    `ase-code-lint` chord (`complete`, `explain`, `nope`, `reassess`,
    `recheck`, `refine`).
  - `plugin/hooks/hooks.json` and `plugin/hooks/hooks-copilot.json` —
    hook wirings into *Claude Code* / Copilot.
  - `plugin/meta/*.md` — meta documents injected into sessions or
    used by skills: `ase-constitution.md` (session constitution),
    `ase-skill.md` (skill-authoring guide), `ase-control.md`
    (skill control flow), `ase-dialog.md` (user-dialog conventions),
    `ase-getopt.md` (skill option parsing), `ase-persona.md`
    (persona definitions), and `ase-plan.md` (task-plan conventions).

The root `README.md` is user-facing install docs;
`pages/` is the GitHub Pages site (`.github/workflows/static.yml`).

## Tool Build System

Build orchestration uses `@rse/stx`, not plain npm scripts. The only npm
script is `npm start`, which invokes stx with `etc/stx.conf`. Common
targets:

```
cd tool
npm start build         # lint + tsc (etc/tsc.json)
npm start lint          # eslint --config etc/eslint.mjs src/*.ts
npm start build-watch   # nodemon rebuild on src/**/*.ts
npm start lint-watch    # nodemon relint on src/**/*.ts
npm start clean         # rm -rf dst
npm start clean-dist    # also removes node_modules and package-lock.json
```

No test target is defined. The published `bin/ase` shim loads compiled output from `dst/`.

## Setup

```
ase setup install      # install   tool and plugin
ase setup update       # update    tool and plugin
ase setup uninstall    # uninstall tool and plugin
```

## Code Style

Strict TypeScript conventions are enforced in `tool/src/`: no semicolons
(except inside `for`), double quotes, K&R braces, no braces around
single-statement `if`/`while` blocks, vertically-aligned operators
on similar consecutive lines, `/* ... */` block comments with two
leading/trailing spaces, parens around all arrow parameters, and line
breaks before `else`/`catch`/`finally`. Match existing formatting
exactly when editing.


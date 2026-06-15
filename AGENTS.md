
## About

**Agentic Software Engineering (ASE)** is the opinionated companion
tooling of *Dr. Ralf S. Engelschall* for combining Agentic AI Coding
with Software Engineering in tools like *Claude Code*. **ASE** consists
of a *Claude Code* plugin and a Command-Line Interface (CLI) tool.

## Repository Layout

**ASE (Agentic Software Engineering)** ships two deliverables from one repo:

- `tool/` — the `@rse/ase` npm CLI (TypeScript, ESM, commander-based).
  Entry point `tool/src/ase.ts` wires the top-level commands `setup`,
  `config`, `mcp`, `service`, `hook`, `statusline`, `task`, `artifact`,
  `compat`, and `diagram`, each registered by a corresponding
  `ase-<name>.ts` module.
  `ase config` manages layered YAML configuration across `user`/
  `project`/`task`/`session` scopes (subcommands: `init`, `list`,
  `edit`, `get`, `set`, `delete`); `ase service` runs a per-project
  background HTTP service (subcommands: `start`, `status`, `send`,
  `stop`) bridged to *Claude Code* via `ase mcp`; `ase hook` handles
  agent hook events (subcommands: `session-start`, `session-end`,
  `pre-tool-use`, `permission-request`, `user-prompt-submit`, `stop`);
  `ase setup`
  installs/updates/uninstalls/enables/disables the tool and its
  companion plugin and (de)activates pre-defined foreign MCP servers
  (subcommands: `install`, `update`, `uninstall`, `enable`, `disable`,
  all with `--tool claude|copilot|codex`, plus `mcp list` and `mcp
  activate`/`mcp deactivate [<servers>]` which read per-server API keys
  from `ASE_MCP_KEY_<ID>` environment variables, also sourced from
  `.env` files);
  `ase statusline` renders the *Claude Code* (or *GitHub Copilot CLI*)
  status line (*OpenAI Codex CLI* has no scriptable status line, so
  `ase statusline --tool codex` errors out); `ase task` manages persisted task plans under
  `<project>/.ase/task/<id>/plan.md` (subcommands: `list`, `load`,
  `edit`, `save`, `delete`, `rename`, `purge`); `ase artifact` resolves
  project artifact kinds (`spec`, `arch`, `code`, `docs`, `infr`,
  `othr`) to project-relative file lists (subcommands: `list`, `name`);
  `ase compat` outputs the expected probe values for the
  `ase-meta-compat` self-test skill; `ase diagram` renders
  Mermaid diagrams as Unicode/ASCII art.
  Supporting modules backing the MCP service include `ase-kv.ts`
  (in-memory, per-project key/value store shared across sessions),
  `ase-skills.ts` (package metadata gathering for component discovery),
  `ase-markdown.ts` (Markdown rendering preparation), `ase-timestamp.ts`
  (Luxon-formatted timestamps), `ase-persona.ts`, `ase-getopt.ts`
  (skill option parsing), `ase-log.ts` (logging), and `ase-version.ts`
  (current/latest version determination).
  The `tool/plugin` is a build-time copy of `plugin` and can be ignored.

- `plugin/` — the Claude Code plugin published via the marketplace
  defined at `.claude-plugin/marketplace.json`. Plugin metadata in
  `plugin/.claude-plugin/plugin.json` (with a *GitHub Copilot CLI*
  variant at `plugin/.github/plugin/plugin.json` and an *OpenAI Codex
  CLI* variant at `plugin/.codex-plugin/plugin.json`, each differing only
  by their `hooks` wiring). Layout:
  - `plugin/skills/<name>/SKILL.md` — the skill set (36 skills total),
    grouped by `ase-meta-*` (brainstorm, changelog, chat, commit, compat,
    diaboli, diff, evaluate, persona, quorum, review, search, steelman,
    why), `ase-code-*`
    (analyze, craft, explain, insight, lint, refactor, resolve), `ase-arch-*`
    (analyze, discover), `ase-task-*` (id, list, edit, grill, view,
    reboot, rename, condense, preflight, implement, delete), and `ase-docs-*`
    (proofread, distill).
  - `plugin/agents/<name>.md` — sub-agent definitions (`ase-meta-chat`,
    `ase-meta-search`, `ase-meta-diagram`, `ase-meta-review`,
    `ase-code-lint`, `ase-docs-proofread`); 6 in total.
  - `plugin/commands/` — slash commands directory (currently empty).
  - `plugin/hooks/hooks.json`, `plugin/hooks/hooks-copilot.json`, and
    `plugin/hooks/hooks-codex.json` — hook wirings into *Claude Code* /
    *GitHub Copilot CLI* / *OpenAI Codex CLI*.
  - `plugin/meta/*.md` — meta documents injected into sessions or
    used by skills: `ase-constitution.md` (session constitution),
    `ase-skill.md` (skill-authoring guide), `ase-control.md`
    (skill control flow), `ase-dialog.md` (user-dialog conventions),
    `ase-getopt.md` (skill option parsing), `ase-persona.md`
    (persona definitions), `ase-format-task.md` (task format),
    `ase-format-meta.md` (artifact-set/artifact meta-information
    conventions), and the artifact-set format definitions
    `ase-format-spec.md` (Specification / SPEC) and `ase-format-arch.md`
    (Architecture / ARCH).

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
ase setup install         # install    tool and plugin
ase setup update          # update     tool and plugin
ase setup uninstall       # uninstall  tool and plugin
ase setup enable          # enable     plugin (without uninstalling)
ase setup disable         # disable    plugin (without uninstalling)
ase setup mcp list        # list       pre-defined foreign MCP servers
ase setup mcp activate    # activate   foreign MCP servers (keys in ASE_MCP_KEY_<ID>)
ase setup mcp deactivate  # deactivate foreign MCP servers
```

## Code Style

Strict TypeScript conventions are enforced in `tool/src/`: no semicolons
(except inside `for`), double quotes, K&R braces, no braces around
single-statement `if`/`while` blocks, vertically-aligned operators
on similar consecutive lines, `/* ... */` block comments with two
leading/trailing spaces, parens around all arrow parameters, and line
breaks before `else`/`catch`/`finally`. Match existing formatting
exactly when editing.



## About

**Agentic Software Engineering (ASE)** is the opinionated companion
tooling of *Dr. Ralf S. Engelschall* for combining Agentic AI Coding
with Software Engineering in tools like *Anthropic Claude Code CLI*. **ASE** consists
of a *Anthropic Claude Code CLI* plugin and a Command-Line Interface (CLI) tool.

## Repository Layout

**ASE (Agentic Software Engineering)** ships three deliverables from one repo:

-   `plugin/`: Agentic AI coding tool plugin
-   `tool/`: the `@rse/ase` CLI.
    `tool/plugin` is a build-time copy of `plugin` and can be ignored.
-   `pages/`: the GitHub Pages site (https://ase.tools),

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


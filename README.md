
<img src="https://raw.githubusercontent.com/rse/ase/master/docs/ase-logo.svg" width="250" align="right" alt=""/>

Agentic Software Engineering
============================

https://ase.tools

About
-----

**Agentic Software Engineering (ASE)** is the opinionated companion
tooling of *Dr. Ralf S. Engelschall* for combining the approach of
*Agentic AI* into *Software Engineering* with the help of *Agentic
AI Coding Tools* like *Claude Code*. **ASE** primarily consists of a
*Claude Code* plugin and a Command-Line Interface (CLI) tool. **ASE**
provides skills and commands to support the most important, recurring
work-steps in the primary disciplines of *Software Engineering*,
especially in the discipline *Software Development*.

> [!NOTE]
> **ASE** is *agentic*, but not pure *agent*-based, i.e., it focuses
> on supporting the role of a software engineer with *Agentic AI* and
> not driving the disciple software engineering with fully autonomous
> agents.

> [!NOTE]
> The initial, primary focus of **ASE** is on the tool *Claude Code* and
> the *TypeScript/JavaScript* technology stack, but the forthcoming,
> secondary focus will be also the tool *Github Copilot CLI* and the
> *Java* technology stack.

> [!CAUTION]
> **ASE** is still under heavy development, still incomplete, partially
> broken and hence not ready for production use. If you are not a
> hard-boiled early adopter, please visit this project again, once we
> reached at least version 0.9.x!

Features
--------

**ASE** provides the following four distinct features:

- **Configuration Scopes** (100% done):
  Parameters of project and agent can be configured on the hierarchy of
  the scopes *user*, *project*, *task*, and *skill*. This allows
  the flexible configuration of **ASE**.

- **Session Constitution** (80% done):
  All agent sessions have a "constitution" preloaded all the time, based
  on the configured parameters. This allows to control the *general*
  agent behavior.

- **Task Skills** (30% done):
  Recurring tasks are supported with dedicated skills, based on the
  configured parameters. This allows to control the *specific* agent
  behavior.

- **Context Gathering** (0% done):
  The agent context is loaded with individual information for all
  particular tasks. This allows the agent to more precisely perform the
  tasks.

Installation
------------

```
#   install ASE tool
npm install -g @rse/ase
```

```
#   install ASE plugin
claude plugin marketplace add rse/ase
claude plugin install ase@ase
```

Documenation
------------

- [Setup: Installation, Update, Uninstallation](docs/setup.md)
- [Configuration: Parameters](docs/configuration.md)
- [Architecture: Building Blocks](docs/building-blocks.md)
- [Usage: Plugin Skills](docs/usage-plugin.md)
- [Usage: Plugin Tool](docs/usage-tool.md)

See Also
--------

- [claudeX](https://github.com/rse/claudex) (convenience wrapper for Claude Code)

Support
-------

**ASE** is developed in the experience context of industrial Software
Engineering at the [*msg group*](https://www.msg.group) and in the
educational context of the *Software Engineering Academy (SEA)*. **ASE**
development is supported by *msg Research* and *Software Engineering
Academy (SEA)*.

Copyright & License
-------------------

Copyright &copy; 2025-2026 [Dr. Ralf S. Engelschall](https://engelschall.com)<br/>
Licensed under [GPL 3.0](https://spdx.org/licenses/GPL-3.0-only)


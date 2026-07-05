
[![ASE](pages/public/assets/typing-demo.gif)](https://ase.tools)

[![ASE](docs/ase-banner.png)](https://ase.tools)

<p align="center">
[![github (author stars)](https://img.shields.io/github/stars/rse?logo=github&label=author%20stars&color=%233377aa)](https://github.com/rse)
[![github (author followers)](https://img.shields.io/github/followers/rse?label=author%20followers&logo=github&color=%234477aa)](https://github.com/rse)
[![github (project license)](https://img.shields.io/github/license/rse/ase?logo=github&label=project%20license&color=%233377aa)](https://github.com/rse/ase/blob/master/LICENSE.txt)
[![github (project release)](https://img.shields.io/github/v/release/rse/ase?logo=github&label=project%20release&color=%233377aa)](https://github.com/rse/ase)
[![github (project stars)](https://img.shields.io/github/stars/rse/ase?logo=github&label=project%20stars&color=%233377aa)](https://github.com/rse/ase)
</p>

About
-----

**Agentic Software Engineering (ASE)** is the
opinionated [Open Source](https://github.com/rse/ase/blob/master/LICENSE.txt) companion
toolkit of [*Dr. Ralf S. Engelschall*](https://ase.tools/#author)
for fusing the concept of *Agentic AI Coding* and traditional *Software Engineering*
in the software development tool [Anthropic Claude
Code](https://claude.com/product/claude-code) — and with reduced support also in the alternative
tool [GitHub Copilot CLI](https://github.com/features/copilot/cli) or
[OpenAI Codex CLI](https://github.com/openai/codex).

**ASE** ships with agent hooks, agent skills, an underlying Model-Context-Protocol (MCP)
service and a Command-Line Interface (CLI), incorporating reasonable methodology
and automation aspects, to support the recurring tasks of a
*Software Developer* and *Software Architect*.

**ASE** is primarily motivated by the following statement of its primary
author, [*Dr. Ralf S. Engelschall*](https://ase.tools/#author):

> "Software developers in the industrial Software Engineering context,
> in their recurring tasks, should leverage pre-manufactured agentic AI
> skills to boost their daily productivity. Those skills incorporate
> reasonable methodology and automation aspects while keeping the
> developers in the driver's seat to ensure stable result quality."

Notices
-------

> [!NOTE]
> **TERMINOLOGY**: The discipline of [*Agentic Software Engineering*](docs/agentic-software-engineering.md)
> in *general* is *Software Engineering*, supported by autonomous *AI
> Agents* to perform tasks across the software development lifecycle.
> This **ASE** product in *particular* is also *agentic*, but not
> strictly based on autonomous agents. Instead, **ASE** focuses on
> supporting the role of a Software Engineer with *Agentic AI Coding
> Tools* towards multi-step operations and a plan/task-driven approach,
> but still strongly focuses on Human-in-the-Loop.

> [!NOTE]
> **TOOL SUPPORT FOCUS**: The primary focus of **ASE** is on the Agentic AI Coding tool [*Claude
> Code*](https://code.claude.com). The secondary focus is on the support
> for [*GitHub Copilot CLI*](https://github.com/features/copilot/cli)
> (just set environment variable `ASE_TOOL=copilot`) and [*OpenAI Codex
> CLI*](https://github.com/openai/codex) (just set environment variable
> `ASE_TOOL=codex`). In the future, additional support could be provided
> also for alternative tools &mdash; if their agent harness features
> (especially hooks, interactive user dialog tool, etc.) realistically
> allow it.

Highlights
----------

Check out the following scenarios and corresponding **ASE** examples to
see whether **ASE** is right for you:

<table>
<tr>
<td width="50%" valign="top">

- **Boosted Sessions**:
  You want to speed up your interactive sessions and at the same time
  reduce costs by reducing the number of produced LLM output tokens?
  &rarr; [`/ase-meta-persona`](plugin/skills/ase-meta-persona/help.md)
  `engineer` or even [`/ase-meta-persona`](plugin/skills/ase-meta-persona/help.md)
  `caveman`

- **Alternative Approach Funnel**:
  You prefer a plan-driven approach, but the agent harness's
  Plan Mode is too unstructured and too direct because you want to
  leverage a funnel of alternative approaches first?
  &rarr; [`/ase-code-craft`](plugin/skills/ase-code-craft/help.md)
  `hello: "ase hello" CLI command which prints a nice "Hello World" in red`

- **Named and Persisted Plans**:
  You prefer a plan-driven approach, but the agent harness's Plan Mode is
  regularly too weak, because you want named, persisted, cross-session
  reachable, and strictly structured plans?
  &rarr; [`/ase-task-edit`](plugin/skills/ase-task-edit/help.md)
  `hello`

- **Plan Stress-Testing**:
  You have a task plan, but want to be relentlessly grilled about every
  essential aspect of it until you and the agent reach a shared
  understanding and no open decisions remain?
  &rarr; [`/ase-task-grill`](plugin/skills/ase-task-grill/help.md)
  `hello`

- **Implementation Preflights**:
  You prefer a plan-driven approach, but want to pre-flight the
  implementation without later having to rewind artifacts via the version
  control system or the agent harness's session history?
  &rarr; [`/ase-task-preflight`](plugin/skills/ase-task-preflight/help.md)
  `hello`

- **Project Insights**:
  You want to get a quick insight into a project by determining
  the author, the source files with the most churn, and the module
  structure?
  &rarr; [`/ase-code-insight`](plugin/skills/ase-code-insight/help.md)
  `@tool`

- **Code Comprehension**:
  You want to better comprehend code by finding focused information on
  What, Why, Analogy, Diagram, Cruxes, and Gotchas?
  &rarr; [`/ase-code-explain`](plugin/skills/ase-code-explain/help.md)
  `@tool/src/*.ts`

- **Lexical Code Analysis**:
  You want to analyze code for potential problems
  related to a standard set of code quality aspects?
  &rarr; [`/ase-code-lint`](plugin/skills/ase-code-lint/help.md)
  `@tool/src/*.ts`

- **Document Proofreading**:
  You want your text documents checked and corrected for spelling,
  punctuation, and grammar errors?
  &rarr; [`/ase-docs-proofread`](plugin/skills/ase-docs-proofread/help.md)
  `@README.md`

- **Research Quorum**:
  You want to research a fact by asking multiple (potentially available)
  foreign LLMs and methodologically derive a quorum answer?
  &rarr; [`/ase-meta-quorum`](plugin/skills/ase-meta-quorum/help.md)
  `What is Agentic Software Engineering?`

- **Logical Code Analysis**:
  You want to analyze code for potential problems
  in its logic, semantics, and control flow?
  &rarr; [`/ase-code-analyze`](plugin/skills/ase-code-analyze/help.md)
  `@tool/src/*.ts`

- **Automated Change Logs**:
  You want to get your `CHANGELOG.md` entries
  automatically derived from your recent Git commits?
  &rarr; [`/ase-meta-changelog`](plugin/skills/ase-meta-changelog/help.md)

- **Plan Implementation**:
  You have a named, persisted task plan and now want it implemented as a
  single, complete change set across your project artifacts?
  &rarr; [`/ase-task-implement`](plugin/skills/ase-task-implement/help.md)
  `hello`

- **Artifact Reconciliation**:
  You want one set of artifacts (e.g. CODE, DOCS) automatically aligned
  to reflect the current state of another set (e.g. SPEC, ARCH), one-way
  or bidirectionally?
  &rarr; [`/ase-sync-reconcile`](plugin/skills/ase-sync-reconcile/help.md)
  `-s SPEC -t DOCS`

- **Foreign Source Import**:
  You want external files, URLs, or pasted text ingested and turned into
  structured SPEC, ARCH, CODE, DOCS, or TASK artifacts?
  &rarr; [`/ase-sync-import`](plugin/skills/ase-sync-import/help.md)
  `-t SPEC @requirements.txt`

- **Artifact Export**:
  You want artifact content materialized into derived, side-by-side
  files, like the Data Model rendered as an SVG diagram or the Technology
  Stack rendered as a Markdown table?
  &rarr; [`/ase-sync-export`](plugin/skills/ase-sync-export/help.md)
  `-s SPEC,ARCH`

- **Direct Skill Usage Help**:
  You want usage help for skills directly within your agent tool sessions?
  &rarr; `/ase-xxx-xxx` `--help`

</td>
<td width="50%" valign="top">

- **Diff Summary**:
  You want a raw Git diff turned into a concise, human-readable
  narrative of what changed and why, grouped by intent, and with
  optional intent-coherence check, risk grading and blast radius?
  &rarr; [`/ase-meta-diff`](plugin/skills/ase-meta-diff/help.md)
  `-c -r -b`

- **Change Review**:
  You want the staged Git changes reviewed the way a human reviewer
  would on a pull request, with an approve/reject verdict and
  prioritized, severity-tagged, line-cited findings?
  &rarr; [`/ase-meta-review`](plugin/skills/ase-meta-review/help.md)

- **Guided Bug Fixing**:
  You want a problem or bug resolved through a structured, plan-driven
  funnel of candidate root causes and fix approaches instead of a direct,
  unstructured patch?
  &rarr; [`/ase-code-resolve`](plugin/skills/ase-code-resolve/help.md)
  `the CLI crashes on an empty config file`

- **Guided Refactoring**:
  You want the code base refactored through a structured funnel of
  alternative refactoring approaches, optionally captured as a named,
  persisted task plan?
  &rarr; [`/ase-code-refactor`](plugin/skills/ase-code-refactor/help.md)
  `extract the config loading into a dedicated module`

- **Architecture Analysis**:
  You want your software architecture reviewed for package cohesion and
  inter-package coupling to spot structural weak spots?
  &rarr; [`/ase-arch-analyze`](plugin/skills/ase-arch-analyze/help.md)
  `@tool/src`

- **Collaborative Brainstorming**:
  You want to figure out *what* to build before *how*, by diverging on
  a broad space of ideas and then converging through clustering and
  scoring into a recommended direction?
  &rarr; [`/ase-meta-brainstorm`](plugin/skills/ase-meta-brainstorm/help.md)
  `an offline-first sync layer for the mobile app`

- **Root-Cause Analysis**:
  You want to understand the reason for a fact with the help of the
  "Five-Whys" root-cause determination method?
  &rarr; [`/ase-meta-why`](plugin/skills/ase-meta-why/help.md)
  `is the Decibel (dB) unit a logarithmic one?`

- **Devil's Advocate Challenge**:
  You want a thesis or statement relentlessly challenged and criticised,
  and finally resolved into a balanced Hegelian synthesis?
  &rarr; [`/ase-meta-diaboli`](plugin/skills/ase-meta-diaboli/help.md)
  `The Decibel (dB) is an intuitive unit.`

- **Steelman Argument**:
  You want a thesis or statement charitably strengthened with the
  strongest possible case, and finally consolidated into a fortification
  argument?
  &rarr; [`/ase-meta-steelman`](plugin/skills/ase-meta-steelman/help.md)
  `ASE is one of the best Anthropic Claude Code CLI add-ons.`

- **Key Point Distillation**:
  You want a document distilled into a flat, importance-ranked list of
  its key points, each with a salience rank, a rationale, and a verbatim
  line-cited evidence snippet?
  &rarr; [`/ase-docs-distill`](plugin/skills/ase-docs-distill/help.md)
  `doc/architecture.md`

- **Search Engine Consolidation**:
  You want to query multiple (potentially available) search engines
  and derive a consolidated result?
  &rarr; [`/ase-meta-search`](plugin/skills/ase-meta-search/help.md)
  `What is Agentic Software Engineering?`

- **Foreign LLM Query**:
  You want to directly query a (potentially available) foreign LLM?
  &rarr; [`/ase-meta-chat`](plugin/skills/ase-meta-chat/help.md)
  `gemini What is Agentic Software Engineering?`

- **Package Discovery**:
  You want to be supported in the discovery of suitable packages
  for the establishment of your technology stack?
  &rarr; [`/ase-arch-discover`](plugin/skills/ase-arch-discover/help.md)
  `reactive UI DOM rendering`

- **Multi-Criteria Decision Matrices**:
  You want to be supported in the evaluation of alternatives with the
  methodological help of a weighted multi-criteria decision matrix?
  &rarr; [`/ase-meta-evaluate`](plugin/skills/ase-meta-evaluate/help.md)
  `Vue vs. React vs. Angular, focus on TypeScript support and extensibility`

- **Convenient Foreign MCP Server Setup**:
  You have API keys for popular AI chat services and/or Web search services
  which ASE could *optionally* leverage in various skills?
  &rarr; `ase setup mcp activate`

</td>
</tr>
</table>

User Setup
----------

### Prerequisites

- Operating System: macOS, Linux, Windows
- Agent Tool: [Anthropic Claude Code CLI](https://code.claude.com), [GitHub Copilot CLI](https://github.com/features/copilot/cli), or [OpenAI Codex CLI](https://github.com/openai/codex)
- Runtime Engine: [Node.js](https://nodejs.org)

### Installation

```
#   install ASE tool into PATH (bootstrapping only)
npm install -g @rse/ase

#   install ASE plugin into agent tool
ase setup install [--tool claude|copilot|codex] [--scope user|project|local]
```

### Updating

```
#   update ASE tool in PATH and ASE plugin in agent tool
ase setup update [--tool claude|copilot|codex] [--scope user|project|local]
```

### Uninstallation

```
#   uninstall ASE tool from PATH and ASE plugin from agent tool
ase setup uninstall [--tool claude|copilot|codex] [--scope user|project|local]
```

The `--scope` option defaults to `user` (today's global, machine-wide behavior). Use
`--scope project` to share the plugin registration via the repository, or `--scope
local` to keep it out of version control and confined to a single repository. `--scope`
is only supported for `--tool claude`; a non-`user` scope is rejected for `copilot` and
`codex`, whose CLIs have no scope concept.

Foreign MCP Servers
-------------------

**ASE** can *optionally* leverage foreign MCP servers in various **ASE**
skills for improved quality. They can be conveniently managed via `ase
setup mcp`.

```
#   check list of MCP servers known to ASE
ase setup mcp list

#   activate MCP servers in the agent tool
ase setup mcp activate   [--tool claude|copilot|codex] [--scope user|project|local] [<server>[,...]]

#   deactivate MCP servers in the agent tool
ase setup mcp deactivate [--tool claude|copilot|codex] [--scope user|project|local] [<server>[,...]]
```

Each MCP server reads its API key from an environment
variable `ASE_MCP_KEY_XXX`, where `XXX` is the server id in
upper-case with dashes replaced by underscores (e.g. the server
`openai-chatgpt` uses `ASE_MCP_KEY_OPENAI_CHATGPT`). These variables
are also automatically sourced from `.env` files. A server whose
key variable is unset or empty is silently skipped on activation.

The following AI services are currently defined:

<table>
<tr>
<td width="50%" valign="top">

- Chat: OpenAI ChatGPT (`openai-chatgpt`)
- Chat: Google Gemini (`google-gemini`)
- Chat: DeepSeek (`deepseek`)
- Chat: xAI Grok (`xai-grok`)
- Chat: Alibaba Qwen (`alibaba-qwen`)
- Chat: Z.AI GLM (`zai-glm`)

</td>
<td width="50%" valign="top">

- Search: Brave (`brave`)
- Search: Perplexity (`perplexity`)
- Search: Exa (`exa`)

</td>
</tr>
</table>

Hint: All MCP servers of type "Chat" support both the native API of the
LLM vendor and the *OpenRouter* proxy API as an alternative, i.e. you
can leverage all paid "Chat" AI services by just providing the
`ASE_MCP_KEY_OPENROUTER` of an *OpenRouter* account.

See Also
--------

- [claudeX](https://github.com/rse/claudex) (convenience wrapper for Anthropic Claude Code CLI)
- [mcp-to-openai](https://github.com/rse/mcp-to-openai) (gateway between MCP and OpenAI-compatible APIs)
- [bash-authorize](https://github.com/rse/bash-authorize) (pre-tool-use hook for Bash commands)

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
Licensed under [Apache 2.0](https://spdx.org/licenses/Apache-2.0)


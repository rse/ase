
Setup
=====

User Setup
----------

### Prerequisites

- Operating System: macOS, Linux, Windows
- Agent Tool: [Anthropic Claude Code CLI](https://code.claude.com) or [GitHub Copilot CLI](https://github.com/features/copilot/cli)
- Runtime Engine: [Node.js](https://nodejs.org)

### Installation

```
#   install ASE tool into PATH (bootstrapping only)
npm install -g @rse/ase

#   install ASE plugin into agent tool
ase setup install [--tool claude|copilot]
```

### Updating

```
#   update ASE tool in PATH and ASE plugin in agent tool
ase setup update [--tool claude|copilot]
```

### Uninstallation

```
#   uninstall ASE tool from PATH and ASE plugin from agent tool
ase setup uninstall [--tool claude|copilot]
```

### Foreign MCP Servers

**ASE** can *optionally* leverage foreign MCP servers in various
**ASE** skills for improved quality. They can be conveniently managed
via `ase setup mcp`.

```
#   list MCP servers known to ASE
ase setup mcp list

#   activate MCP servers in the agent tool
ase setup mcp activate   [--tool claude|copilot] [<server>[,...]]

#   deactivate MCP servers in the agent tool
ase setup mcp deactivate [--tool claude|copilot] [<server>[,...]]
```

Each API-based MCP server reads its API key from an environment variable
`ASE_MCP_KEY_XXX`, where `XXX` is the server id in upper-case with
dashes replaced by underscores (e.g. the server `openai-chatgpt` uses
`ASE_MCP_KEY_OPENAI_CHATGPT`). These variables are also automatically
sourced from `.env` files. Such a server whose key variable is unset or
empty is silently skipped on activation. The `openai-codex` server is
the exception: it reads no `ASE_MCP_KEY` and instead gates on explicit
activation plus the presence of the local `codex` CLI. The following AI
services are
currently defined:

-   Chat: OpenAI ChatGPT (`openai-chatgpt`)
-   Chat: Google Gemini (`google-gemini`)
-   Chat: DeepSeek (`deepseek`)
-   Chat: xAI Grok (`xai-grok`)
-   Chat: Alibaba Qwen (`alibaba-qwen`)
-   Chat: Z.AI GLM (`zai-glm`)
-   Chat: OpenAI Codex (`openai-codex`)
-   Search: Brave (`brave`)
-   Search: Perplexity (`perplexity`)
-   Search: Exa (`exa`)

All API-based MCP servers of type "Chat" (i.e., every one except
`openai-codex`) support both the native API of the LLM vendor and the
*OpenRouter* proxy API as an alternative, i.e., you can leverage those
paid "Chat" AI services by just providing the `ASE_MCP_KEY_OPENROUTER`
of an *OpenRouter* account.

The `openai-codex` "Chat" server is the exception: it does not read an
`ASE_MCP_KEY_XXX` variable at all. Instead, it is bridged through the
locally installed *OpenAI Codex CLI* (`codex`), which is used purely in
a read-only, ephemeral query mode as a chat-completion substitute and
authenticates via the CLI's own configured credentials (a ChatGPT
subscription or an OpenAI API key, whichever the `codex` CLI itself is
set up with -- ASE neither sees nor manages it). Its activation is
therefore gated on the presence of the `codex` binary in `$PATH`
instead of an `ASE_MCP_KEY`:
when the `codex` binary is missing, activation fails hard if
`openai-codex` was named explicitly.

Unlike every other server, `openai-codex` is **never activated
implicitly**: a bare `ase setup mcp activate` (empty list or `all`)
deliberately skips it -- you must name it explicitly, i.e.

```
ase setup mcp activate openai-codex
```

The reason is a trust boundary: activating this server routes your
prompts to a foreign model (OpenAI) through your local `codex` login,
and its `query` calls are auto-approved by the ASE hook once the server
is registered. The mere presence of the `codex` binary in `$PATH` is
not, by itself, consent to send your prompts through it -- just as the
API-based servers opt in only through a deliberately provided
`ASE_MCP_KEY_<KEY>`, this server opts in only through being deliberately
named. Requiring an explicit activation makes that data egress a
conscious choice. As defense in depth on top of that, the bridge
switches off the built-in tool surfaces it can -- the shell/command
tool, web search, image generation, and the hosted `apps` MCP with its
connector tools -- additionally requests multi-agent spawning off,
ignores the user-level config, and runs the child under a `read-only`
sandbox. This is not a sealed box, though. Several channels stay
outside those switches: the built-in `view_image` reader has no feature
switch at 0.144, so a prompt-injected query could still make the model
read a locally readable file (as an image); the model catalog's
`model_info.multi_agent_version` takes precedence over the multi-agent
feature flags, so a model pinned to a multi-agent version re-enables the
spawn tools; and system- or cloud-level Codex configuration stays
outside the bridge's control. Treat this provider exactly like a
locally launched `codex` -- which is exactly why its activation is an
explicit, deliberate opt-in.

Contributor Setup
-----------------

### Prerequisites

- Operating System: macOS, Linux, Windows
- Agent Tool: [Anthropic Claude Code CLI](https://code.claude.com) or [GitHub Copilot CLI](https://github.com/features/copilot/cli)
- Runtime Engine: [Node.js](https://nodejs.org)
- Version Control: [Git](https://git-scm.com)

### Initial Setup

```
#   decide on a working directory
asedir=/path/to/ase

#   clone repository
git clone https://github.com/rse/ase $asedir

#   extend your Bash shell environment
echo "PATH=\$PATH:$asedir/bin" >>~/.bashrc
exec bash

#   build and install ASE tool and plugin
ase setup install
```

### Upgrade Setup (after foreign changes)

```
#   update repository (but keep local modifications)
git stash
git pull
git stash pop

#   re-build and re-install ASE tool and plugin
ase setup update
```

### Update Setup (after own local changes)

```
#   re-build and re-install ASE tool and plugin
ase setup update
```


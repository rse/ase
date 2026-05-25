
Setup
=====

User Setup
----------

### Prerequisites

- Operating System: macOS, Linux, Windows
- Agent Tool: [Claude Code](https://code.claude.com) or [GitHub Copilot CLI](https://github.com/features/copilot/cli)
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

Each MCP server reads its API key from an environment variable
`ASE_MCP_KEY_XXX`, where `XXX` is the server id in upper-case with
dashes replaced by underscores (e.g. the server `openai-chatgpt` uses
`ASE_MCP_KEY_OPENAI_CHATGPT`). These variables are also automatically
sourced from `.env` files. A server whose key variable is unset or
empty is silently skipped on activation. The following AI services are
currently defined:

-   Chat: OpenAI ChatGPT (`openai-chatgpt`)
-   Chat: Google Gemini (`google-gemini`)
-   Chat: DeepSeek (`deepseek`)
-   Chat: xAI Grok (`xai-grok`)
-   Chat: Alibaba Qwen (`alibaba-qwen`)
-   Chat: Z.AI GLM (`zai-glm`)
-   Search: Brave (`brave`)
-   Search: Perplexity (`perplexity`)
-   Search: Exa (`exa`)

All MCP servers of type "Chat" support both the native API of the LLM
vendor and the *OpenRouter* proxy API as an alternative, i.e., you can
leverage all paid "Chat" AI services by just providing the
`ASE_MCP_KEY_OPENROUTER` of an *OpenRouter* account.

Contributor Setup
-----------------

### Prerequisites

- Operating System: macOS, Linux, Windows
- Agent Tool: [Claude Code](https://code.claude.com) or [GitHub Copilot CLI](https://github.com/features/copilot/cli)
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


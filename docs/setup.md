
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


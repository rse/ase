
Setup
=====

User Setup
----------

### Installation

```
#   install ASE tool into PATH (bootstrapping only)
npm install -g @rse/ase

#   install ASE plugin into Claude Code
ase setup install
```

### Updating

```
#   update ASE tool in PATH and ASE plugin in Claude Code
ase setup update
```

### Uninstallation

```
#   uninstall ASE tool from PATH and ASE plugin from Claude Code
ase setup uninstall
```

Contributor Setup
-----------------

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


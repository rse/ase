# ase-setup-install(1) -- Install the ASE Plugin into an Agent Tool

## SYNOPSIS

`ase setup install`
\[`-h`|`--help`\]
\[`-t`|`--tool` *tool*\]
\[`-s`|`--scope` *scope*\]
\[`-d`|`--dev`\]
\[`--statusline`\]

## DESCRIPTION

**ase setup install** installs the *ASE* plugin into the agent tool
selected by `--tool`. It requires `npm`(1) and the CLI of the agent
tool (`claude`, `copilot`, or `codex`) to be found in `$PATH`.

The installation is performed in two steps through the plugin
commands of the agent tool CLI: first, the *ASE* plugin marketplace is
registered from a local directory (`<cli> plugin marketplace add`
*dir*), and then the plugin `ase@ase` is installed from it (`<cli>
plugin install ase@ase`, resp. `codex plugin add ase@ase` for *OpenAI
Codex CLI*), retried up to three times with a delay of one second.

The marketplace directory is the installed `@rse/ase` package
itself, which bundles the plugin, or, with `--dev`, the local *ASE*
working copy.

For `--tool claude`, the plugin-shipped output style `ase:ase-terse`
is additionally selected by writing `"outputStyle": "ase:ase-terse"`
into the `settings.json` of the installation scope, unless an
`outputStyle` is already selected there: an *ASE* one is left as is,
and a foreign one is preserved with a warning. For `--tool copilot`
and `--tool codex`, which have no output style concept, the `ase hook
session-start` handler injects the identical style instructions into
the session context instead (see `ase-hook`(1)).

For `--tool claude`, the function hooks of the plugin-shipped
*Claude Code* mods (e.g., the clickable grilling table and the help
bands above the prompt) are additionally enabled by writing
`"CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"` into the `env` of the
`settings.json` of the installation scope, unless the variable is
already present there: an *ASE* one (value `1`) is left as is, and a
foreign one (any other value) is preserved with a warning.

With `--statusline`, the *ASE* statusline is additionally activated
after the installation, exactly like a subsequent `ase setup
statusline activate` with the same `--tool` and `--scope` and its
default options (see `ase-setup-statusline`(1)).

The *ASE* tool itself is not installed by this command, as it is
already installed when running it (e.g., via `npm install -g
@rse/ase`).

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-t`|`--tool` *tool*\]:
  Select the target agent tool: `claude`, `copilot`, or `codex`
  (default: `$ASE_TOOL`, else `claude`).

- \[`-s`|`--scope` *scope*\]:
  Select the plugin installation scope: `user` (default; registered
  globally for the current user in `~/.claude/settings.json`),
  `project` (registered in `.claude/settings.json` of the current
  project, meant to be shared via version control), or `local`
  (registered in `.claude/settings.local.json` of the current
  project, kept out of version control).

  A non-`user` scope is passed as `--scope` *scope* to the agent tool
  CLI. Only supported for `--tool claude`; a non-`user` scope for
  `copilot` or `codex` fails with an error.

- \[`-d`|`--dev`\]:
  Development mode: register the plugin marketplace from the local
  *ASE* working copy (`$ASE_SETUP_DEV_BASEDIR`, else the parent
  directory of the `@rse/ase` package directory) instead of the
  bundled plugin of the installed package (default:
  `$ASE_SETUP_DEV`).

- \[`--statusline`\]:
  Additionally activate the *ASE* statusline after the installation
  (default: off). Not supported for `--tool codex`, which is then
  rejected with an error before anything is installed.

## ENVIRONMENT

- `ASE_TOOL`:
  The default of `--tool`.

- `ASE_SETUP_DEV`:
  The default of `--dev`: any non-empty value other than `0` and
  `false` (case-insensitive) enables it.

- `ASE_SETUP_DEV_BASEDIR`:
  The local *ASE* working copy used with `--dev`.

## FILES

- `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`:
  The settings file of the `user`, `project`, resp. `local` scope,
  receiving the `outputStyle` selection and the
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` variable for `--tool claude`,
  and the `statusLine` entry for `--statusline`.

## EXIT STATUS

`0` on success, `1` on any error (e.g., a missing `npm` or agent tool
CLI, an invalid option value, or a failing agent tool command, whose
output is then shown).

## EXAMPLES

```sh
# install for Anthropic Claude Code CLI, globally for the current user
$ ase setup install

# install for Anthropic Claude Code CLI, for the current project only
$ ase setup install --scope project

# install for GitHub Copilot CLI
$ ase setup install --tool copilot

# install from the local working copy
$ ase setup install --dev

# install and additionally activate the ASE statusline
$ ase setup install --statusline
```

## SEE ALSO

`ase`(1), `ase-setup`(1), `ase-setup-update`(1),
`ase-setup-uninstall`(1), `ase-setup-status`(1),
`ase-setup-statusline`(1), `ase-hook`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

# ase-setup-update(1) -- Update the ASE Tool and Plugin

## SYNOPSIS

`ase setup update`
\[`-h`|`--help`\]
\[`-t`|`--tool` *tool*\]
\[`-s`|`--scope` *scope*\]
\[`-f`|`--force`\]
\[`-d`|`--dev`\]

## DESCRIPTION

**ase setup update** updates the *ASE* tool and the *ASE* plugin of
the agent tool selected by `--tool` to their latest versions. It
requires `npm`(1) and the CLI of the agent tool to be found in
`$PATH`. First, a potentially running `ase service` of the current
project is stopped (on a best-effort basis), as it would otherwise
keep running the old code.

In the regular mode, the current version of the tool is compared with
the latest version of `@rse/ase` known from the NPM registry (as
determined by a direct query of the registry, falling back to the
result of the cached background check on failure). If both are equal,
the command reports that *ASE* is already at
the latest version and exits without any further action (unless
`--force` is given).

Otherwise, the tool is updated via `npm update -g @rse/ase` (prefixed
with `sudo`(8) if the global `npm` installation root is not writable by
the current user and `sudo` is available), the plugin marketplace
snapshot is refreshed (`<cli> plugin marketplace update ase`, resp.
`codex plugin marketplace upgrade ase`), and the plugin is updated
(`<cli> plugin update ase@ase`, resp. removed and re-added for *OpenAI
Codex CLI*, which has no plugin update command).

In the development mode (`--dev`), the local *ASE* working copy is
re-built instead (`npm install` and `npm start build` in its `tool/`
directory), and the plugin is re-installed (uninstalled and
installed again), as the local plugin files are already current, but
carry no version change in the plugin manifest.

Like `ase setup install`, for `--tool claude`, the output style
`ase:ase-terse` is finally selected in the `settings.json` of the
installation scope, unless a foreign `outputStyle` is already selected
there, which is preserved with a warning, and the function hooks are
enabled through `"CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"` in its
`env`, unless a foreign value of the variable is already present
there, which is preserved with a warning.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-t`|`--tool` *tool*\]:
  Select the target agent tool: `claude`, `copilot`, or `codex`
  (default: `$ASE_TOOL`, else `claude`).

- \[`-s`|`--scope` *scope*\]:
  Select the plugin installation scope: `user`, `project`, or
  `local`. The default is auto-detected from the existing
  installation: the scopes `local`, `project`, and `user` are probed
  in this order (strongest first), and the first one whose settings
  file registers the plugin `ase@ase` under `enabledPlugins` (enabled
  or disabled) is taken, falling back to `user` when no installation
  is found.

  For tools other than `claude`, the scope is always `user`, and an
  explicitly given non-`user` scope fails with an error.

- \[`-f`|`--force`\]:
  Always perform the update, even if the tool is already at the
  latest version (default: off). Without effect in combination with
  `--dev`, which always re-builds.

- \[`-d`|`--dev`\]:
  Development mode: re-build the local *ASE* working copy
  (`$ASE_SETUP_DEV_BASEDIR`, else the parent directory of the
  `@rse/ase` package directory) and re-install the plugin from it,
  instead of updating from the NPM registry (default:
  `$ASE_SETUP_DEV`).

## ENVIRONMENT

- `ASE_TOOL`:
  The default of `--tool`.

- `ASE_SETUP_DEV`:
  The default of `--dev`: any non-empty value other than `0` and
  `false` (case-insensitive) enables it.

- `ASE_SETUP_DEV_BASEDIR`:
  The local *ASE* working copy used with `--dev`.

## EXIT STATUS

`0` on success (including an already current version), `1` on any
error.

## EXAMPLES

```sh
# update ASE for Anthropic Claude Code CLI
$ ase setup update

# force the update for OpenAI Codex CLI
$ ase setup update --tool codex --force

# re-build and re-install from the local working copy
$ ase setup update --dev
```

## SEE ALSO

`ase`(1), `ase-setup`(1), `ase-setup-install`(1),
`ase-setup-uninstall`(1), `ase-service`(1), `npm`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

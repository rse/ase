# ase-config(1) -- Manage the Layered ASE Configuration

## SYNOPSIS

`ase config`
\[`-h`|`--help`\]
\[`--scope` *scope*\]
*command*
\[*args* \[...\]\]

`ase config` \[`--scope` *scope*\] `init` *type*

`ase config` \[`--scope` *scope*\] `list`

`ase config` \[`--scope` *scope*\] `edit`

`ase config` \[`--scope` *scope*\] `get` *key*

`ase config` \[`--scope` *scope*\] `set` *key* *value*

`ase config` \[`--scope` *scope*\] `delete` *key*

## DESCRIPTION

**ase config** manages the layered *ASE* configuration, a stack of
`config.yaml` files of the *scopes* `user` < `project` < `task:`*id* <
`session:`*id*, on top of a built-in `default` scope carrying the
default values. Reads cascade from the strongest scope down to the
weakest one and return the first defined value, while writes are
always confined to the file of the strongest scope of the chain (the
*target* scope).

All files are validated against the configuration schema: on read,
unknown or invalid entries are warned about and dropped from the
in-memory view, while on set, delete, and write they lead to a fatal
error. A target file still carrying invalid content is never
overwritten, as the skipped content would otherwise be lost: repair
it first (e.g. via `ase config edit`).

Obsolete (pre-1.1.0) entries `project.artifact.task.{basedir,files}`
and `agent.{task,skill}` are migrated in place on reading: a `basedir`
becomes `project.task.store.url` (as `ase:`*basedir*) unless the
latter is already set, and the other entries are dropped.

A *key* is a dotted path like `agent.persona`. Any unambiguous
trailing part of a known key is accepted, too, e.g., `persona` for
`agent.persona` or `store.url` for `project.task.store.url`, while an
ambiguous one (like `color.dim`) is an error.

Without a *command*, the usage information is shown and the command
exits with status `1`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`--scope` *scope*\]:
  Select the scope chain. This option belongs to `ase config` itself
  and hence has to be given *before* the *command*, e.g.,
  `ase config --scope user set agent.persona writer`.

  The *scope* value is a comma-separated list of scope terms, in any
  order, where each term is one of `user`, `project`, `task:`*id*, or
  `session:`*id* (with *id* matching `[A-Za-z0-9._-]+`, but neither `.`
  nor `..`). At most one term per kind is allowed. The chain is
  canonicalized into the fixed inheritance order `default` < `user` <
  `project` < `task` < `session`:

    - `user` is always implicitly added at the bottom of the chain.
    - `project` is implicitly added only when a *project context*
      exists, i.e., when the current working directory is inside a Git
      working tree or a `.ase` directory exists at or above it (except
      in the home directory), and only as long as it stays weaker than
      the strongest explicitly requested term, so an explicit `--scope
      user` is never silently retargeted to `project`.
    - Specifying `project` explicitly without a project context is an
      error.

  Without `--scope`, the chain is `project` (with `user` below it) when
  a project context exists, otherwise `user` only. Example: `--scope
  task:T1,session:S1` yields the chain `default` -> `user` -> `project`
  -> `task:T1` -> `session:S1` with `session:S1` as the target scope.

## COMMANDS

- `init` *type*:
  Initialize the target scope with the preset values of *type*
  (`default`, `vibe`, `pro`, or `industry`). See `ase-config-init`(1).

- `list`:
  List all configuration keys with their effective values and the
  scopes supplying them. See `ase-config-list`(1).

- `edit`:
  Edit the configuration file of the target scope with the text editor.
  See `ase-config-edit`(1).

- `get` *key*:
  Print the effective value of *key*. See `ase-config-get`(1).

- `set` *key* *value*:
  Set *key* to *value* on the target scope. See `ase-config-set`(1).

- `delete` *key*:
  Delete *key* from the target scope. See `ase-config-delete`(1).

## CONFIGURATION KEYS

The following keys are recognized. Every key is restricted to the
listed values (where *string* means any non-empty string) and is
writable on all scopes `user`, `project`, `task`, and `session`,
unless stated otherwise. A default stems from the built-in `default`
scope (shown by `ase config list` with scope `default`) or, where
stated, from the code using the key.

Project identity and classification:

- `project.id` (*string*):
  The unique id of the project. Default: the sanitized basename of the
  project root (with all characters other than `A-Z`, `a-z`, `0-9`,
  `_`, and `-` replaced by `_`), or *basedir*`-`*worktree* if the
  project root is a worktree *basedir*`/`*worktree* next to an `active`
  symbolic link in *basedir*. An explicit id is required for a remote
  task store and for the agent relay.

- `project.name` (*string*):
  The full name of the project (default: `Example Project`).

- `project.boxing` (`white`, `grey`, or `black`):
  Whether the project artifacts are treated as a white box (fully
  transparent and understood), grey box (partially), or black box (not
  at all), which modulates the work depth and output visibility of the
  skills (default: `white`).

- `project.users` (*string*, `user` and `project` scopes only):
  The comma-separated list of the known human assignees of the tasks
  (default: empty). If not empty, an assignment to anybody else than
  `none`, the current user, one of these users, or an agent present at
  the agent relay is warned about (see `ase-task-assign`(1)), and the
  assign popup of the task boards suggests these users (else the
  current user) besides the agents (see `ase-task-board`(1)).

Task plans (all writable on the `user` and `project` scopes only,
`project.task.store.token` on the `user` scope only):

- `project.task.lifecycle` (`solo`, `team`, or `enterprise`):
  The task lifecycle model: single-phase for a local solo developer,
  two-phase for a small team, or four-phase for a gated enterprise
  pipeline (default: `solo`). See `ase-task-lifecycle`(1).

- `project.task.idscheme` (`slug`\[`:`*words*\], `seq`\[`:`*template*\],
  or `any`):
  The task id scheme (default: `slug`). See `ase-task-idscheme`(1) and
  `ase-task-newid`(1).

- `project.task.store.url` (*string*):
  The URL of the task store: `ase:`*path* (local, default
  `ase:./.ase/task`), `ase://`*addr*`:`*port*\[`/`*token*\] resp.
  `ases://`*addr*`:`*port*\[`/`*token*\]\[`?insecure`\] (remote task
  store server), `github:`*owner*`/`*repo* (and
  `github+http`\[`s`\]`://`*host*`/`*owner*`/`*repo*),
  `gitlab:`*namespace*`/`*project* (and `gitlab://`*host*`/`...,
  `gitlab+http`\[`s`\]`://`*host*`/`...), or
  `gitea+http`\[`s`\]`://`*host*`/`*owner*`/`*repo*. See `ase-task`(1).

- `project.task.store.token` (*string*, `user` scope only):
  The bearer token of a remote task store, resp. the token of a GitHub,
  GitLab, or Gitea task store. Masked as `***` by `ase config list`.

- `project.task.store.crt`, `project.task.store.key` (*string*):
  The PEM certificate (chain) and private key files of the task store
  server, relative to the directory of the configuration file defining
  them. See `ase-task-store`(1).

- `project.task.default.source` (`worktree` or `branch:`*name*):
  The default of the `Source:` key of the task plans (default:
  `worktree`).

- `project.task.default.changeset` (`worktree`, `branch:`*name*, or
  `attachment:`*name*):
  The default of the `Changeset:` key of the task plans (default:
  `worktree`).

- `project.task.default.target` (`worktree`, `branch:`*name*, or
  `source`):
  The default of the `Target:` key of the task plans (default:
  `source`).

  A branch *name* has to start with a letter, digit, or `_`, consist of
  letters, digits, `_`, `.`, `/`, and `-`, must not end in `/`, `.`, or
  `.lock`, and must not contain `..` or `//`. An attachment *name*
  consists of letters, digits, `_`, and `-`. A branch or attachment
  *name* can carry the placeholder `{id}`, which reads as the id of the
  task (with every character other than letters, digits, `_`, and `-`
  replaced by `-`, runs of `-` reduced to one, and leading and trailing
  `-` and `_` removed, e.g., `12` for `#12` and `FOO-12` for `FOO#12`),
  e.g., `branch:cs-{id}` for a
  separate changeset branch per task.

- `project.task.effort.scale` (*xs*`,`*s*`,`*m*`,`*l*):
  The upper bounds of the effort size bands `XS`, `S`, `M`, and `L` of
  the `Effort:` key of the task plans, in strictly ascending human
  minutes, while `XL` is open-ended (default: `15,60,240,960`). The
  task boards sum the efforts via the band midpoints, counting `XL` as
  twice the `L` bound.

- `project.task.effort.factor` (*number*):
  The human minutes per point of the *attention score* of the effort
  estimation, i.e., of the weighted requirements, behaviors, and
  changes stated by the checklist items of a plan (default: `1`).
  Fitted and stored by `/ase-task-estimate --calibrate --save`.

- `project.task.effort.file`, `project.task.effort.line` (*number*):
  The additional human minutes per touched file resp. per predicted
  changed line of the *volume score* of the effort estimation, where
  the line minutes also cover the edge cases and polishing no plan
  describes, and a newly written line weighs three times a changed
  one (defaults: `1` resp. `0.025`). Fitted and stored by
  `/ase-task-estimate --calibrate --save`.

- `project.task.effort.iteration` (*number*):
  The multiplier of the estimated minutes of a task whose main
  deliverable is an interactive or visual user interface, covering
  its many rounds of post-adjustment, at least `1` (default: `2.5`).
  Not fitted by the calibration.

Agent relay (all writable on the `user` and `project` scopes only,
`project.relay.token` on the `user` scope only):

- `project.relay.url` (*string*):
  The URL of the agent relay, as `ase://`*addr*`:`*port*\[`/`*token*\]
  or `ases://`*addr*`:`*port*\[`/`*token*\]\[`?insecure`\] (default:
  none). See `ase-agent-relay`(1).

- `project.relay.token` (*string*, `user` scope only):
  The bearer token of the agent relay. Masked as `***` by `ase config
  list`.

- `project.relay.crt`, `project.relay.key` (*string*):
  The PEM certificate (chain) and private key files of the agent relay
  server, relative to the directory of the configuration file defining
  them.

Per-project service:

- `project.service.port` (*port* `1024`..`65535`, `project` scope
  only):
  The preferred port of the per-project background service on
  `127.0.0.1`, falling back to a random port out of the range
  `42000`..`44000` if unavailable (default: none). See
  `ase-service-start`(1).

Project artifacts (all writable on the `user` and `project` scopes
only), each kind defined by a `basedir` directory (relative to the
project root, empty for the root itself) and a whitespace-separated
`files` glob specification (relative to `basedir`, with `!` negating a
glob). See `ase-artifact`(1):

- `project.artifact.spec.basedir`, `project.artifact.spec.files`:
  The specification files (default: `docs/specbook` and
  `**/*.{md,txt,svg,png,jpg}`).

- `project.artifact.spec.schema` (*string*):
  The whitespace-separated list of *SpecBook* schema configuration
  files, where `std`, `meta`, and `pm` name the bundled standard, meta,
  and project management ones, `npm:`, `github:`, `http:`, and
  `https:` references name remote ones, and every other entry is a file
  or glob pattern relative to the project root (default: empty, i.e.,
  `std`). See `ase-spec`(1).

- `project.artifact.code.basedir`, `project.artifact.code.files`:
  The source code files (default: `src` and `** !**/etc/**
  !**/{.gitignore,.npmignore,package.json}`).

- `project.artifact.docs.basedir`, `project.artifact.docs.files`:
  The documentation files (default: `doc` and `**
  **/{README,LICENSE,CHANGELOG}.{md,txt} !{spec,arch}/**`).

- `project.artifact.infr.basedir`, `project.artifact.infr.files`:
  The infrastructure files (default: empty and
  `**/{.github,.claude*,etc}/**
  **/{AGENTS.md,{package,tsconfig*}.json,.{git,npm}ignore}`).

Agent:

- `agent.persona` (`writer`, `engineer`, `journalist`, `telegrapher`,
  or `caveman`):
  The communication style of the AI agent (default: `engineer`).

- `agent.guidance` (`none`, `minimal`, `normal`, or `verbose`):
  The amount of unsolicited help hints of the AI agent (default:
  `normal`).

- `agent.diagram.format` (`image` or `text`):
  The rendering of the diagrams of the skills: as an inline image
  where the terminal supports it, else as text, resp. always as text
  (default: `image`).

- `agent.diagram.theme` (`light` or `dark`):
  The theme style of the diagram images: dark node boxes with light
  labels on a light background, resp. vice versa (default: `light`).

- `agent.diagram.tone` (`#`*rgb* \[`#`*rgb*\]):
  The theme color tone of the diagram images, as one or two colors
  (`#rgb` or `#rrggbb`), from which the color spreads are derived,
  where a missing second one is derived as the complement of the
  first one (default: `#336699`, a blue with a derived brown).

AI usage accounting (see `ase-task-assign`(1) and
`ase-setup-telemetry`(1)):

- `telemetry.enabled` (`true` or `false`, `user` and `project` scopes
  only):
  Whether the AI usage accounting is enabled as a whole (default:
  `false`).

- `telemetry.implicit` (`true` or `false`, `user` and `project` scopes
  only):
  Whether the usage of an interactive session is also accounted onto
  its active task while the task is *unassigned*, i.e., without
  assigning it to oneself (default: `true`, never for task `default`).

- `telemetry.service.port` (*port* `1024`..`65535`, `user` scope only):
  The port of the per-user OTLP ingress on `127.0.0.1` (default:
  `44318`).

- `telemetry.service.token` (*string*, `user` scope only):
  The bearer token of the OTLP ingress, generated by `ase setup
  telemetry activate`. Masked as `***` by `ase config list`.

- `telemetry.service.interval` (*minutes*, `user` and `project` scopes
  only):
  The interval of the interim bookings of the open usage windows
  (default: `10`, `0` disables).

- `telemetry.service.idle` (*minutes*, `user` and `project` scopes
  only):
  The idle time after which a usage window pauses (default: `30`, `0`
  disables).

- `telemetry.prices.ai` (*table*, `user` scope only):
  The price table *model*`=`*input*`/`*output*\[`/`*cread*`/`*cwrite*\]
  \[...\] (whitespace-separated) in USD per million input, output,
  cache read, and cache write tokens (the cache prices defaulting to the
  input price), keyed by the model or the tool name, with `*` for all
  others (default: `*=4.00/20.00/0.20/5.00`).

- `telemetry.prices.hr` (*table*, `user` and `project` scopes only):
  The hourly rate table *user-id*`=`*usd-per-hour*\[`,`...\] of the
  human time, keyed by the assignee, with `*` for all others (default:
  `*=110`).

Task board (all writable on the `user` and `project` scopes only, see
`ase-task-board`(1)):

- `board.tui.color.dim`, `board.tui.color.normal`,
  `board.tui.color.accent`, `board.tui.color.signal`:
  The colors of the four color roles of the terminal board (defaults:
  `grey`, `default`, `blue`, and `red`), each either `default` (the
  foreground color of the terminal), a color name (like `blue` or
  `blueBright`), `#rgb`, `#rrggbb`, `ansi256(`*n*`)`, or
  `rgb(`*r*`,`*g*`,`*b*`)`.

- `board.web.color.dim`, `board.web.color.normal`,
  `board.web.color.accent`, `board.web.color.signal`:
  The base colors of the four color roles of the web board (defaults:
  `grey`, `black`, `blue`, and `orange`), each either `default`, a
  color name (`black`, `grey`, `gray`, `brown`, `red`, `orange`,
  `yellow`, `green`, `teal`, `cyan`, `blue`, `purple`, or `magenta`),
  `#rgb`, or `#rrggbb`. Each base color is expanded into a spread of 64
  colors over the entire lightness range, out of which the web board
  takes all its colors.

- `board.web.editor.keymap` (`default`, `vim`, or `emacs`):
  The key bindings of the task plan editor of the web board (default:
  `default`).

- `board.web.theme` (`auto`, `light`, or `dark`):
  The color theme of the web board, where `auto` follows the light or
  dark preference of the operating system resp. browser (default:
  `auto`).

## ENVIRONMENT

- `EDITOR`, `VISUAL`:
  The text editor of `ase config edit`.

- `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `APPDATA`, `LOCALAPPDATA`:
  The base directories of the *per-user configuration directory* and
  the *per-user state directory* (see **FILES**).

## FILES

- *per-user configuration directory*`/config.yaml`:
  The configuration of scope `user` (with file mode `0600`). The
  per-user configuration directory is `~/Library/Application
  Support/ase` on macOS, `%APPDATA%\ase` on Windows, and
  `$XDG_CONFIG_HOME/ase` (falling back to `~/.config/ase`) elsewhere.

- `.ase/config.yaml`:
  The configuration of scope `project`, searched upward from the
  current working directory up to the project root, else located in the
  project root.

- `.ase/task/`*id*`/config.yaml`:
  The configuration of scope `task:`*id*, located in the project root
  (or the current working directory outside of a project).

- *per-user state directory*`/session/`*id*`/config.yaml`:
  The configuration of scope `session:`*id*, independent of any
  project. The per-user state directory is `~/Library/Application
  Support/ase` on macOS, `%LOCALAPPDATA%\ase` on Windows, and
  `$XDG_STATE_HOME/ase` (falling back to `~/.local/state/ase`)
  elsewhere.

Every write happens under an advisory file lock and atomically. A file
carrying a secret key (a token) is written with file mode `0600`.

## EXIT STATUS

`0` on success, `1` on any error (including a missing *command*).

## EXAMPLES

```sh
# initialize the project configuration with the "industry" preset
$ ase config init industry

# show the effective configuration
$ ase config list

# set the persona of the agent on the user scope
$ ase config --scope user set agent.persona telegrapher

# read a value by an abbreviated key
$ ase config get persona
```

## SEE ALSO

`ase`(1), `ase-config-init`(1), `ase-config-list`(1),
`ase-config-edit`(1), `ase-config-get`(1), `ase-config-set`(1),
`ase-config-delete`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

# ase-task-store(1) -- Manage the per-user task store REST API server

## SYNOPSIS

`ase task store`
\[`-h`|`--help`\]
*command*
\[*options* \[...\]\]

`ase task store start`
\[`-a`|`--address` *host*\]
\[`-p`|`--port` *port*\]
\[`-t`|`--token` *token*\]
\[`-c`|`--cors` *origin*\]
\[`-m`|`--module` *name*\]
\[`-d`|`--basedir` *dir*\]
\[`-s`|`--solo`|`--no-solo`\]
\[`--with-agent-relay`|`--without-agent-relay`\]
\[`--tls-cert` *file* `--tls-key` *file*\]
\[`-f`|`--foreground`\]

`ase task store status`

`ase task store log`
\[`-f`|`--follow`\]
\[`-n`|`--lines` *n*\]

`ase task store stop`

## DESCRIPTION

**ase task store** manages the *task store server*: a per-user (not
per-project), bearer token authenticated REST API server, which
persists the task plans of *all* projects registered with it and which
the `ase task` commands of a project use through a remote
`project.task.store.url` of the form
`ase://`*addr*`:`*port*\[`/`*token*\] resp.
`ases://`*addr*`:`*port*\[`/`*token*\]\[`?insecure`\] (see
`ase-task`(1)).

It can run locally or on a central host, as long as all clients reach
it. The REST API itself, its task plan model, and its event
notifications are described in `docs/task-api.md` of the *ASE*
distribution.

The server is *storage agnostic*: it implements the authentication,
the validation, the task lifecycle model checks, and the event
notifications itself, and delegates the *persistence* of projects and
task plans to a single *storage plugin* loaded at its start (see
**STORAGE PLUGINS** below).

The server is configured through its per-user configuration file
*per-user configuration directory*`/store.yaml` (see **FILES**), into
which the effective configuration of every start is persisted again,
so later starts, `ase task store status`, and `ase task store stop`
find and probe the running server with the very same address, port,
token, and TLS setting. Optionally, the server additionally co-hosts
the *agent relay* (see `ase-agent-relay`(1)), so a central host needs a
single server process only.

Without a *command*, the usage information is shown and the command
exits with status `1`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information of `ase task store` resp. of the given
  *command* and exit.

## COMMANDS

The following commands exist:

### ase task store start

`ase task store start` \[*options*\]

Start the task store server in the background (detached, logging
into *per-user configuration directory*`/store.log`), or with
`--foreground` in the current process. Before the server is started,
the given port is validated, and the TLS certificate and key are
resolved (where both or none have to be given) and checked for
readability, so invalid options never leave no server running.

The start is *idempotent*: a server already running on the configured
address and port (as identified by probing its `/projects` endpoint) is
left alone and reported as `task store: already running on` *url*. If an
explicitly given option *deviates* from the configuration of the running
server (`--address`, `--port`, `--token`, `--cors`, `--tls-cert`,
`--tls-key`, `--module`, `--basedir`, `--solo`/`--no-solo`,
`--with-agent-relay`, or `--without-agent-relay`), the running server is
instead stopped and restarted with the new configuration.

A running server rejecting the configured token is an error. A
configured port held by a foreign service is re-allocated (with a
warning). Binding to a non-loopback *host* without TLS is warned about,
as the bearer token would then travel unencrypted over the network.

A detached server is awaited (for up to 10 seconds) until it responds
to the probe with the expected token, and is reported as `task store:
started on` *url* `(storage plugin "`*name*`")`. If it exits during
startup, does not respond, or its port is taken by a foreign service
meanwhile, it is terminated and the failure is reported together with
the last 20 lines of its log. The server terminates on `SIGTERM`,
`SIGINT`, `SIGHUP`, or `SIGQUIT`, stopping its storage plugin and
removing its `pid` from `store.yaml`. The options are:

- \[`-a`|`--address` *host*\]:
  The IP address (or hostname) to bind to (default: the configured
  `address`, else `127.0.0.1`). Use `0.0.0.0` resp. `::` to bind to
  all interfaces (the local probes then connect to `127.0.0.1`
  resp. `::1`).
- \[`-p`|`--port` *port*\]:
  The TCP port to bind to, an integer in the range `1`..`65535`
  (default: the configured `port`, else a free port allocated
  randomly in the range `42000`..`44000`).
- \[`-t`|`--token` *token*\]:
  The bearer token every request has to carry in its
  `Authorization: Bearer` *token* header (default:
  `$ASE_TASK_STORE_TOKEN`, else the configured `token`, else a
  freshly generated random token of 48 hexadecimal digits). The
  token grants *full* access to *all* projects of the server.
- \[`-c`|`--cors` *origin*\]:
  Allow cross-origin browser requests (Cross-Origin Resource
  Sharing, CORS) from *origin*, e.g. `http://localhost:5173`, or
  from any origin with `*`. Repeatable for multiple origins
  (default: the configured `cors` list, else none, i.e., no CORS
  headers are emitted and cross-origin browser requests fail).
- \[`-m`|`--module` *name*\]:
  The storage plugin to load: `ase` for the built-in file-based one,
  `github`, `gitlab`, resp. `gitea` for the built-in GitHub, GitLab,
  resp. Gitea Issues one, any other plain *name* (matching
  `[A-Za-z0-9_-]+`) for the NPM package `ase-task-store-`*name*
  (resolvable from the *ASE* installation), and a relative or absolute
  path for a local module (default: the configured `storage.plugin`,
  else `ase`).

  The given plugin is persisted as `storage.plugin`.
- \[`-d`|`--basedir` *dir*\]:
  The base directory of the built-in `ase` storage plugin (default:
  the configured `storage.options.basedir`, resolved relative to
  the per-user configuration directory, else `tasks` below it). A
  given *dir* is persisted as `storage.options.basedir`. Ignored for
  all other storage plugins.
- \[`-s`|`--solo`\]:
  Let the built-in `ase` storage plugin store a *single* project
  flat in its base directory, accepting *any* project id (default:
  the configured `storage.options.solo`, else one sub-directory per
  project). Persisted as `storage.options.solo`. Ignored for all
  other storage plugins.
- \[`--no-solo`\]:
  Let the built-in `ase` storage plugin store one sub-directory per
  project, removing a configured `storage.options.solo`.
- \[`--with-agent-relay`\]:
  Additionally co-host the agent relay (see `ase-agent-relay`(1)),
  i.e., its `/agents` and `/projects/`*id*`/agents`... endpoints,
  under the same address, port, and token (default: the configured
  `relay`, else not co-hosted). Persisted as `relay`. Mutually
  exclusive with `--without-agent-relay`.
- \[`--without-agent-relay`\]:
  Do not co-host the agent relay, removing a configured `relay`.
  Mutually exclusive with `--with-agent-relay`.
- \[`--tls-cert` *file*\]:
  Serve HTTPS (and `wss://` for the WebSocket event endpoint)
  instead of plain HTTP, with the PEM certificate (chain) in
  *file*. Requires `--tls-key`. Default: the `project.task.store.crt`
  configuration (resolved relative to the configuration file
  defining it), unless `project.task.store.url` selects plain HTTP
  via `ase://` on this host, else the configured `tls.cert`, else
  plain HTTP. The effective path is persisted as `tls.cert`.
- \[`--tls-key` *file*\]:
  The PEM private key in *file* for HTTPS. Requires `--tls-cert`.
  Default: the `project.task.store.key` configuration (under the
  same condition as for `--tls-cert`), else the configured
  `tls.key`. The effective path is persisted as `tls.key`.
- \[`-f`|`--foreground`\]:
  Run the server in the current process instead, logging to the
  terminal, until it is interrupted (e.g. via `CTRL+C`) or stopped
  via `ase task store stop`. An already running server with an
  unchanged configuration is then an error.
- \[`-h`|`--help`\]:
  Show usage information and exit.

### ase task store status

`ase task store status`

Report whether the task store server is running, by probing the
configured address and port with the configured token. Prints `task
store: running on` *url* `(pid` *pid*`)`, followed by `with agent
relay` if the server co-hosts the agent relay, and exits with status
`0`. Otherwise it prints why it is not running -- no port configured,
port not responding, port in use by a foreign service, or a running
server rejecting the configured token -- and exits with status `1`.

### ase task store log

`ase task store log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\]

Show the log *per-user configuration directory*`/store.log` of the
task store server run in the background. A server run with
`--foreground` logs to the terminal instead, and without a log file
just an informational message is printed. The log file is trimmed
down to its last 2000 lines whenever a server is started on a log
file larger than 1 MB. The options are:

- \[`-f`|`--follow`\]:
  Show the last *n* lines (default: `10`) and then, in the style of
  `tail -f`, follow all newly appended lines until interrupted,
  even once the server has stopped.
- \[`-n`|`--lines` *n*\]:
  Show the last *n* lines only, where *n* is a positive integer
  (default: all lines, or `10` with `--follow`).
- \[`-h`|`--help`\]:
  Show usage information and exit.

### ase task store stop

`ase task store stop`

Stop the task store server: it is first probed (as a stale process id
might meanwhile belong to a foreign process), then sent `SIGTERM`,
and awaited for up to 5 seconds until it is gone, and finally its
`pid` is removed from `store.yaml`. A server which is not running (or
not configured at all) is reported informationally with exit status
`0`. A responding server whose process id is unknown, resp. a server
not stopping within the timeout, is an error.

## STORAGE PLUGINS

A storage plugin is a Node.js module default-exporting a factory
function, which receives the `storage.options` of `store.yaml`
verbatim (see `docs/task-api.md` for the plugin API). The following
built-in storage plugins exist:

- `ase`:
  The default, file-based plugin, persisting the task plans in the
  textual task format as `TASK-`*id*`.md` files. Its options are
  `basedir` (the base directory, see `--basedir`), `solo` (see
  `--solo`), and `lifecycle` (the task lifecycle model of newly
  registered projects, default: `solo`).

  Without `solo`, every project is stored below
  *basedir*`/`*project-id*`/`, with its `PROJECT.yaml` as the project
  registry entry (carrying the task lifecycle model, the task id
  scheme, and the sequence number high-water mark). With `solo`, a
  single project is stored flat in *basedir* itself, with a single
  `PROJECT.yaml` there, and any project id is accepted -- which is
  exactly what the local `ase:`*path* form of `project.task.store.url`
  uses in-process, without any server.

- `github`:
  Persists the task plans as the *issues* of GitHub repositories,
  through the GitHub REST API.

  Its options are `url` (the web URL of the GitHub instance, default:
  `https://github.com`, else e.g. the one of a GitHub Enterprise
  Server or Cloud), `token` (default: `$GITHUB_TOKEN`, else
  `$GH_TOKEN`; required), `repos` (required, a mapping of each project
  id onto its *owner*`/`*repo*), and `poll` (the polling interval of
  the change detection in seconds, default: `60`, `0` disables it).

- `gitlab`:
  Persists the task plans as the *issues* of GitLab projects, through
  the GitLab REST API v4. Its options are `url` (the GitLab instance,
  default: `$GITLAB_HOST`, else `https://gitlab.com`), `token` (default:
  `$GITLAB_TOKEN`; required, a token with scope `api` and at least the
  role *Planner* in the projects), `repos` (required, a mapping of each
  project id onto its *namespace*`/`*project* path, with nested groups
  allowed), and `poll` (as for `github`).

- `gitea`:
  Persists the task plans as the *issues* of Gitea repositories,
  through the Gitea REST API v1. Its options are `url` (the Gitea
  instance, default: `https://gitea.com`), `token` (default:
  `$GITEA_TOKEN`; required, a token with the scopes `write:issue` and
  `read:repository` and write access to the repositories), `repos`
  (required, a mapping of each project id onto its *owner*`/`*repo*),
  and `poll` (as for `github`).

The issue tracker plugins register a project by the label
`ase:project` of its repository and map the task plan frontmatter onto
the issue state, assignees, labels, and dependencies, as detailed in
`docs/task-api.md`. The same plugins also run in-process (without any
server) for the `github:`, `gitlab:`, and `gitea+http[s]:` forms of
`project.task.store.url` (see `ase-task`(1)).

As issue trackers provide no locks and no conditional writes, these
plugins detect a concurrent change of an issue only through its update
time, checked right before a save modifies anything. This narrows, but
cannot close, the window for a lost update. Hence let only a *single*
task store server serve a repository, and let all clients access it
through this server instead of in-process.

## ENVIRONMENT

- `ASE_TASK_STORE_TOKEN`:
  The default bearer token of `ase task store start` (taking precedence
  over the configured `token`, but not over `--token`).

- `GITHUB_TOKEN`, `GH_TOKEN`:
  The default access token of the `github` storage plugin.

- `GITLAB_HOST`, `GITLAB_TOKEN`:
  The default instance and access token of the `gitlab` storage plugin.

- `GITEA_TOKEN`:
  The default access token of the `gitea` storage plugin.

## FILES

- *per-user configuration directory*`/store.yaml`:
  The configuration and runtime state of the task store server (see
  `ase`(1) for the location of the per-user configuration directory),
  written with mode `0600`, as it carries the token.

  Its keys are `address` (the bound address), `port` (the bound port),
  `token` (the expected bearer token), `pid` (the process id of the
  running server), `cors` (the list of allowed CORS origins),
  `tls.cert` and `tls.key` (the paths of the PEM certificate and key,
  resolved relative to the file), `relay` (`true` to co-host the agent
  relay), `storage.plugin` (the storage plugin), and `storage.options`
  (the options of the storage plugin, see **STORAGE PLUGINS**), as in
  the example below.

- *per-user configuration directory*`/store.log`:
  The log of the task store server run in the background.

- *per-user configuration directory*`/tasks/`:
  The default base directory of the built-in `ase` storage plugin.

An example `store.yaml` is:

```yaml
address: 127.0.0.1
port:    42042
token:   8f3c[...]
cors:
    - http://localhost:5173
storage:
    plugin: ase
    options:
        basedir: /Users/rse/Library/Application Support/ase/tasks
```

## EXIT STATUS

`ase task store status` exits with status `0` if the server is running
and with status `1` otherwise. All other commands exit with status `0`
on success and with status `1` on any error.

## EXAMPLES

```sh
# start the task store server locally and point the project to it
$ ase task store start --port 42042
$ ase config set project.task.store.url ase://127.0.0.1:42042

# start a central task store server with TLS and co-hosted agent relay
$ ase task store start --address 0.0.0.0 --port 42042 \
    --tls-cert /etc/ssl/tasks.example.com.crt \
    --tls-key /etc/ssl/tasks.example.com.key \
    --with-agent-relay

# start a task store server on the GitHub Issues storage plugin
# (after configuring "storage.options.repos" in "store.yaml")
$ ase task store start --module github

# check and follow the server
$ ase task store status
$ ase task store log -f

# stop the server
$ ase task store stop
```

## SEE ALSO

`ase`(1), `ase-task`(1), `ase-task-board`(1), `ase-agent-relay`(1),
`ase-config`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

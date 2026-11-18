# ase-agent-relay(1) -- Manage the Agent Relay Server

## SYNOPSIS

`ase agent relay start`
\[`-a`|`--address` *host*\]
\[`-p`|`--port` *port*\]
\[`-t`|`--token` *token*\]
\[`-c`|`--cors` *origin*\]
\[`--tls-cert` *file* `--tls-key` *file*\]
\[`-f`|`--foreground`\]

`ase agent relay status`

`ase agent relay log`
\[`-f`|`--follow`\]
\[`-n`|`--lines` *n*\]

`ase agent relay stop`

`ase agent relay restart`
\[*options of* `start`\]

## DESCRIPTION

`ase agent relay` manages the per-user *agent relay* server, which
passes the live presence of the agents (see `ase-agent`(1)) to the
task boards (see `ase-task-board`(1)) without any external
infrastructure. It can run locally or on a central host, as long as
both the agents and the task boards reach it, and serves any number of
projects (by their `project.id`).

The agent relay holds the presence of the agents in memory only: per
agent its kind, name, mode, the title and description of its operation
(for the agent logs view of `ase-task-board`(1)), request name, the lifecycle states it
operates on (of a phase agent: its incoming, activity, written, and
gate states, for the agent graph of `ase-task-board`(1)), host,
process id, current working directory, user name and user id, start time, state (`waiting` or `busy`), the ids of the
tasks it is busy with, its usage of the agent tool (in total and by its
last job), the time since which it is in its state, the time of its
latest announcement (its heartbeat), and its most recent 100
processing log lines (each message truncated to 500 characters).

An agent without heartbeat for 30 seconds is removed (checked every 5
seconds), and a project exists only while it has agents.

The agents announce their presence (see `--agent-relay` of
`ase-agent`(1)) on every change of their state, after each finished
job, with their new processing log lines, and as a heartbeat every 10
seconds, and remove it on their termination. The task boards subscribe
to the agents of their project.

Alternatively, `ase task store start --with-agent-relay` (see
`ase-task-store`(1)) co-hosts the agent relay in the task store server
under the same address, port, and token, so a central host needs a
single server process only. A fleet with the section `relay` owns the
agent relay instead (see `ase-agent-fleet`(1)).

The agent relay is selected by the agents and task boards via the
configuration `project.relay.url` (or their option `--agent-relay`),
as `ase://`*addr*`:`*port*\[`/`*token*\] for HTTP, resp.
`ases://`*addr*`:`*port*\[`/`*token*\]\[`?insecure`\] for HTTPS
(verifying the server certificate against the Node.js CA store,
extendable via `$NODE_EXTRA_CA_CERTS`, or, with `?insecure`, without
certificate verification). The relay requires an
explicit `project.id`.

The bearer token of a client is the one embedded in the URL (warned about
if configured on the `project` or a `task` scope, as it might be
committed), else `$ASE_AGENT_RELAY_TOKEN`, else `project.relay.token`
(intended for the `user` scope, and warned about on any other scope),
else the token of the locally started agent relay (resp. of the locally
started task store co-hosting it), but only if the URL addresses exactly
this server. Sending a token to a non-loopback host selected by a
repository-supplied scope is warned about.

## COMMANDS

- `ase agent relay start` \[*options*\]:
  Start the agent relay server in the background (spawning a detached
  process logging into `relay.log`) and wait until it responds (up to
  10 seconds), or with `--foreground` run it in the current process.

  The configuration of the server is resolved from the options, the
  environment, and the per-user `relay.yaml`, and its effective values
  (address, port, token, CORS origins, TLS certificate and key, and
  process id) are persisted in `relay.yaml` (readable by the current
  user only). The start is idempotent: an already running server is left
  alone, unless an explicitly given option (`--address`, `--port`,
  `--token`, `--cors`, `--tls-cert`, or `--tls-key`) deviates from its
  configuration, in which case the server is restarted to apply it.

  With `--foreground`, an already running server with an unchanged
  configuration is an error. A configured port held by a foreign service
  is re-allocated (with a warning). Binding to a non-loopback address
  without TLS is warned about, as the bearer token then travels
  unencrypted. All options are described under **OPTIONS** below.

- `ase agent relay status`:
  Report whether the agent relay server is running, as `relay: running
  on` *url* `(pid` *pid*`)`, after probing it on its configured address
  and port with its configured token. Exits with status 1 if it is not
  running (no port configured, the port not responding, or the port in
  use by a foreign service), or if it rejects the configured token.

- `ase agent relay log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\]:
  Show the log `relay.log` of the agent relay server run in the
  background. With `-n`|`--lines` *n*, only the last *n* lines are shown
  (default: all). With `-f`|`--follow`, the last *n* lines (default:
  10) are shown and then, in the style of `tail -f`, all newly appended
  lines are followed until interrupted. If no log file exists, this is
  just reported (at log level `info`). The server logs its requests at
  log level `debug` only, as the agents announce frequently.

- `ase agent relay stop`:
  Stop the agent relay server by sending it `SIGTERM` and waiting (up
  to 5 seconds) until it is gone, closing all subscriptions of the task
  boards. A not running server is reported as such, without an error.

- `ase agent relay restart` \[*options of* `start`\]:
  Restart the agent relay server: stop it like `ase agent relay stop`
  and then start it like `ase agent relay start` with the given
  options.

## OPTIONS

The following options exist for `ase agent relay start` and
`ase agent relay restart`:

- \[`-a`|`--address` *host*\]:
  The address to bind to (default: the configured `address` of
  `relay.yaml`, else `127.0.0.1`), e.g., `0.0.0.0` for all IPv4
  interfaces of a central host.

- \[`-p`|`--port` *port*\]:
  The TCP port to bind to, `1`..`65535` (default: the configured `port`
  of `relay.yaml`, else a randomly allocated free port in the range
  `42000`..`44000`).

- \[`-t`|`--token` *token*\]:
  The bearer token to expect from all clients (default:
  `$ASE_AGENT_RELAY_TOKEN`, else the configured `token` of
  `relay.yaml`, else a generated random token).

- \[`-c`|`--cors` *origin*\]:
  (repeatable) Allow cross-origin browser requests from *origin*, or
  from any origin with `*` (default: the configured `cors` origins of
  `relay.yaml`, else none).

- \[`--tls-cert` *file*\]:
  Serve HTTPS with the PEM certificate (chain) in *file*, which
  requires `--tls-key`, too (default: the configured `project.relay.crt`
  (unless `project.relay.url` selects HTTP via `ase://` on this host),
  else the configured `tls.cert` of `relay.yaml`, else plain HTTP). A
  relative path of a configuration is relative to its configuration
  file.

- \[`--tls-key` *file*\]:
  Serve HTTPS with the PEM private key in *file*, which requires
  `--tls-cert`, too (default: the configured `project.relay.key`
  (unless `project.relay.url` selects HTTP via `ase://` on this host),
  else the configured `tls.key` of `relay.yaml`).

- \[`-f`|`--foreground`\]:
  Run the server in the current process, logging to the terminal
  instead of `relay.log`, until it is interrupted (e.g., via `CTRL+C`)
  or stopped via `ase agent relay stop`.

- \[`-h`|`--help`\]:
  Show the usage information of the command and exit.

## PROTOCOL

All requests have to carry the bearer token in the `Authorization:
Bearer` *token* header (the WebSocket handshake alternatively in the
query parameter `token`), else they are rejected with status 401 and
an `application/problem+json` problem details response. The REST
endpoints are:

- `GET /agents`:
  The projects with agents, as `{ "projects": [ { "id":` *id*`,
  "agents":` *count* `} ] }`.

- `GET /projects/`*id*`/agents`:
  All agents of the project *id*, as `{ "agents": [` ... `] }`.

- `PUT /projects/`*id*`/agents/`*agent*:
  The announcement of the agent *agent* (also its heartbeat), as a JSON
  payload with its presence and only its processing log lines added
  since its previous announcement (at most 100), answered with status
  204.

- `DELETE /projects/`*id*`/agents/`*agent*:
  The removal of the agent *agent* (on its termination), answered with
  status 204.

The WebSocket event endpoint `/projects/`*id*`/agents/events` first
sends a snapshot frame of all agents of the project (with `reset:
true`) and then a frame on each change (the added or updated agents,
and the removed ones), where the processing log lines of an agent are
always to be appended to the already received ones.

Subscribers are pinged every 15 seconds and terminated if they did not
answer the previous ping, resp. if they cannot keep up (more than 1 MB
of not yet transmitted data). A plain HTTP request onto the event
endpoint is answered with status 426.

The project ids have to match `[A-Za-z0-9_-]+` and the agent ids
`[A-Za-z0-9][A-Za-z0-9_.-]*` (at most 128 characters), else the request
is rejected with status 422. To bound its memory, the relay holds at
most 128 projects with agents, 64 agents per project, and 1024 agents
in total, and accepts at most 64 subscribers per project and 1024
subscribers in total, where a request beyond these limits is rejected
with status 429.

## ENVIRONMENT

- `ASE_AGENT_RELAY_TOKEN`:
  The default of `--token` of `ase agent relay start`, and the bearer
  token of the agents and task boards connecting to the relay (if not
  embedded in its URL).

## FILES

- *per-user configuration directory*`/relay.yaml`:
  The configuration and runtime state of the agent relay server: the
  keys `address`, `port`, `token`, `cors` (a list of origins),
  `tls.cert`, `tls.key`, and `pid` (of the running server). It is
  written by `ase agent relay start` (readable by the current user
  only), and can be edited by hand to configure the defaults.

- *per-user configuration directory*`/relay.log`:
  The log of the agent relay server run in the background.

The *per-user configuration directory* is `$ASE_CONFIG_DIR`, if set,
else `~/Library/Application Support/ase` on macOS, `%APPDATA%\ase` on Windows, and
`$XDG_CONFIG_HOME/ase` (falling back to `~/.config/ase`) on Linux and
other Unix systems.

## EXIT STATUS

`start`, `stop`, and `restart` exit with status 0 on success (also for
a server already running resp. not running) and 1 on any error.
`status` exits with status 1 if the server is not running or rejects
the configured token. `log` exits with status 0.

## EXAMPLES

```sh
# start the agent relay locally and let the agents and task boards follow it
$ ase agent relay start -p 4711
$ ase config --scope project set project.id myproject
$ ase config --scope project set project.relay.url ase://127.0.0.1:4711

# start the agent relay on a central host via HTTPS
$ ase agent relay start -a 0.0.0.0 -p 4711 --tls-cert relay.crt --tls-key relay.key
$ ase config --scope user set project.relay.token <token>

# check and follow the agent relay
$ ase agent relay status
$ ase agent relay log -f
```

## SEE ALSO

`ase`(1), `ase-agent`(1), `ase-agent-fleet`(1), `ase-task-board`(1),
`ase-task-store`(1), `ase-config`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

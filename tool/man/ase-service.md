# ase-service(1) -- Manage the Per-Project Background Service

## SYNOPSIS

`ase service`
\[`-h`|`--help`\]
*command*
\[*options* \[...\]\]
\[*args* \[...\]\]

`ase service start` \[`-f`|`--foreground`\]

`ase service status`

`ase service send` *cmd*

`ase service log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\]

`ase service stop`

`ase service restart` \[`-f`|`--foreground`\]

## DESCRIPTION

**ase service** manages the per-project background HTTP service of
*ASE*. The service is bound to `127.0.0.1` on the preferred port
`project.service.port`, if configured and available, else on a random
port out of the range `42000`..`44000`, which is persisted in
`.ase/service.yaml` of the project, and logs into `.ase/service.log`. It is identified by the id
of the project (`project.id`, else derived from the project root), so a
port answered by the service of another project counts as a *foreign*
service.

Concurrent starts of the service of a project are serialized through
the lock `.ase/service.start.lock`, so only one service is spawned and
all other starts wait for it and reuse it.

The service provides:

- the MCP endpoint `/mcp` (Streamable HTTP), serving the `ase_*` MCP
  tools of the skills, bridged into the agent tool via `ase-mcp`(1),
  which auto-starts the service on demand,
- the command endpoint `/command` (see `ase-service-send`(1)) and the
  stop endpoint `/stop`,
- the endpoints `/usage/*` of the AI usage accounting of the task
  assignments (see `ase-task-assign`(1)), plus, while
  `telemetry.enabled` is `true`, the attempt to hold the per-user OTLP
  ingress on `127.0.0.1:`*port* (`telemetry.service.port`, default
  `44318`), routing the received records to the service of the project
  owning the session (see `ase-setup-telemetry`(1)),
- the web task board of `ase task board --web` (see
  `ase-task-board`(1)).

The service accepts requests with a loopback `Host` header only, to
defeat DNS rebinding attacks from browser pages. As every local process
of every user can reach the loopback interface, the service additionally
requires the bearer token it generates on each start, persisted next to
its port in the user-private `.ase/service.yaml` (mode `0600`), on every
request, except the page assets of the web task board, which logs in
through a one-time nonce (see `ase-task-board`(1)). With
`project.service.auth` set to `persisted`, the token is kept across
restarts, and with `none`, no request is authenticated at all (see
`ase-config`(1)). A detached service
stops itself after 30 minutes without any request, but never while a
request is in flight or while it holds open AI usage windows.

Without a *command*, the usage information is shown and the command
exits with status `1`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

## COMMANDS

- `start` \[`-f`|`--foreground`\]:
  Start the service in the background (or run it in the foreground).
  See `ase-service-start`(1).

- `status`:
  Report whether the service is running. See `ase-service-status`(1).

- `send` *cmd*:
  Send a command to the service. See `ase-service-send`(1).

- `log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\]:
  Show the log of the service. See `ase-service-log`(1).

- `stop`:
  Stop the service. See `ase-service-stop`(1).

- `restart` \[`-f`|`--foreground`\]:
  Stop the service and start it again. See `ase-service-restart`(1).

## FILES

- `.ase/service.yaml`:
  The per-project service state (the `port` and the bearer `token` of
  the running service), user-private and removed again once the service
  stopped (except a `persisted` token).

- `.ase/service.log`:
  The standard output and standard error of the detached service,
  appended to. As the service inherits the file descriptor for its
  entire lifetime, the file cannot be rotated while the service runs,
  and instead is trimmed down to its last 2000 lines whenever a
  service is started on a file larger than 1 MB.

  Routine MCP traffic (session handshakes, notifications, and stream
  opens) is logged at level `debug` only, and the arguments of the
  logged MCP tool calls are cut at 200 characters.

- `.ase/.gitignore`:
  The self-ignoring Git ignore file covering the machine-local runtime
  files, created on the first start if missing.

## EXIT STATUS

`0` on success, `1` on any error (including a missing *command*). See
the individual commands for details.

## EXAMPLES

```sh
# start the service with the full MCP traffic logged
$ ase --log-level debug service start

# check the service and follow its log
$ ase service status
$ ase service log -f
```

## SEE ALSO

`ase`(1), `ase-service-start`(1), `ase-service-status`(1),
`ase-service-send`(1), `ase-service-log`(1), `ase-service-stop`(1),
`ase-service-restart`(1), `ase-mcp`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

# ase-service-start(1) -- Start the Per-Project Background Service

## SYNOPSIS

`ase service start`
\[`-h`|`--help`\]
\[`-f`|`--foreground`\]

## DESCRIPTION

**ase service start** starts the per-project background HTTP service
of *ASE* (see `ase-service`(1)) for the project of the current working
directory.

If a service of this project already answers on the port persisted in
`.ase/service.yaml`, the command just reports `service: already running
on port` *port* and exits with status `0`. Otherwise, it allocates the
preferred port `project.service.port` (see `ase-config`(1)), if
configured and free, else (with a warning, if configured) a fresh
random free port out of the range `42000`..`44000` (trying up to 20
candidates), spawns the service as a detached background process
(with its standard output and standard error appended to
`.ase/service.log`, trimmed to its last 2000 lines beforehand if larger
than 1 MB), and probes its readiness for up to 5 seconds.

Once ready, the service persists its port and its bearer token (freshly
generated for a `temporary`, reused for a `persisted`, and absent for a
`none` `project.service.auth`) into the user-private `.ase/service.yaml`,
and the command reports `service: started on port` *port*. If the
spawned service exits during its startup, does not become ready in
time, or loses its port to a foreign listener, the attempt is aborted
(killing the process) and retried with a new port, up to three attempts
in total, after which the command fails with the reason and the last
20 lines of the log.

The detached service adopts the log level of the global `--log-level`
option of this command, e.g., `ase --log-level debug service start`
logs the full MCP traffic. It stops itself after 30 minutes without any
request (but never while a request is in flight or while it holds open
AI usage windows), on `ase service stop`, and removes its port from
`.ase/service.yaml` again.

Usually, the service does not have to be started explicitly, as the
MCP bridge `ase mcp`, `ase service send`, and the hooks start it on
demand.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-f`|`--foreground`\]:
  Run the service in the current process instead, on a port allocated
  as above, logging to the terminal (resp. the global `--log-file`) instead
  of `.ase/service.log` and without the idle timeout, until it is
  interrupted (via `SIGINT`, e.g., `CTRL+C`, `SIGTERM`, `SIGHUP`, or
  `SIGQUIT`) or stopped via `ase service stop`. A service of this
  project already running is an error in this mode.

## FILES

- `.ase/service.yaml`:
  The persisted port and bearer token of the running service.

- `.ase/service.log`:
  The log of the detached service.

- `.ase/.gitignore`:
  The self-ignoring Git ignore file covering the machine-local runtime
  files, created if missing.

## EXIT STATUS

`0` if the service was started or is already running (resp., in the
foreground, once it was stopped), `1` if it could not be started, or,
with `--foreground`, if it is already running.

## EXAMPLES

```sh
# start the service in the background
$ ase service start

# run the service in the foreground for debugging
$ ase --log-level debug service start --foreground
```

## SEE ALSO

`ase`(1), `ase-service`(1), `ase-service-status`(1),
`ase-service-stop`(1), `ase-service-restart`(1), `ase-service-log`(1),
`ase-config`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

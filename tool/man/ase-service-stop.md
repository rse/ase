# ase-service-stop(1) -- Stop the Background Service

## SYNOPSIS

`ase service stop`
\[`-h`|`--help`\]

## DESCRIPTION

**ase service stop** stops the per-project background service of
*ASE* (see `ase-service`(1)) via an HTTP `POST /stop` request to the
port persisted in `.ase/service.yaml`, and removes the persisted port
(and the file, if it becomes empty). This also stops a service running
in the foreground via `ase service start --foreground`. On stop, the
service persists the journal of its AI usage windows, so no usage is
lost. This also ends all task chats (see `ase-task-chat`(1)).

If no port is persisted, or nothing listens on the persisted port, an
informational message is logged, a stale port is removed, and the
command exits with status `0`. If the persisted port is answered by a
foreign service (e.g., the service of another project), it is left
alone and the command exits with status `1`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

## FILES

- `.ase/service.yaml`:
  The persisted port of the service, cleared on stop.

## EXIT STATUS

`0` if the service was stopped or was not running, `1` if the port is
in use by a foreign service or the stop request failed.

## EXAMPLES

```sh
$ ase service stop
```

## SEE ALSO

`ase`(1), `ase-service`(1), `ase-service-start`(1),
`ase-service-status`(1), `ase-service-restart`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

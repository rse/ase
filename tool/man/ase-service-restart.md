# ase-service-restart(1) -- Restart the Background Service

## SYNOPSIS

`ase service restart`
\[`-h`|`--help`\]
\[`-f`|`--foreground`\]

## DESCRIPTION

**ase service restart** restarts the per-project background service of
*ASE* (see `ase-service`(1)): it first stops the service like
`ase service stop` (see `ase-service-stop`(1)) and then starts it again
like `ase service start` (see `ase-service-start`(1)), e.g., to let
the service pick up an updated *ASE* installation.

If stopping fails, the service is not started again. A service not
running is just started.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-f`|`--foreground`\]:
  Run the service in the foreground after stopping it, exactly like
  `ase service start --foreground`.

## EXIT STATUS

`0` if the service was stopped (or was not running) and started again,
`1` if stopping or starting failed.

## EXAMPLES

```sh
$ ase service restart
```

## SEE ALSO

`ase`(1), `ase-service`(1), `ase-service-start`(1),
`ase-service-stop`(1), `ase-service-status`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

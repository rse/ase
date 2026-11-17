# ase-util-compat(1) -- Output Expected Probe Values of the Compatibility Self-Test

## SYNOPSIS

`ase util compat`
\[`-h`|`--help`\]

## DESCRIPTION

**ase util compat** writes the canonical expected values of all probes
of the `ase-meta-compat` self-test skill to standard output, one probe
per line as *id*`: `*value*, where *id* is
*category*`/`*probe-name*. The probe categories are `xml-placeholders`,
`control-flow`, `regex`, and `arithmetic`, which check whether the
model of the agent tool correctly interprets the pseudo-code
constructs the *ASE* skills are written in.

This command is intended for inspecting the expected values by humans
only. The skill itself instead submits all its actual probe results to
the MCP tool `ase_compat`, which grades them as *id*`: pass` resp.
*id*`: fail` lines and rejects an incomplete submission, so the model
never sees the expected values.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

## EXIT STATUS

Exits with status `0`.

## SEE ALSO

`ase`(1), `ase-util`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

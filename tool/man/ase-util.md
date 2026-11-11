# ase-util(1) -- Utility Commands

## SYNOPSIS

`ase util`
\[`-h`|`--help`\]

`ase util meta`
*name* \[...\]

`ase util compat`

`ase util diagram`
\[*options*\]

`ase util worktree`
`base`|`path`
\[*options*\]
\[*id*\]

`ase util mint`
\[`-t`|`--type` *type*\]
\[`-c`|`--count` *count*\]
\[*hint* \[...\]\]

`ase util metric`
\[`-f`|`--file` *file*\]
\[*text* \[...\]\]

`ase util rasterize`
\[*options*\]
*input-file*|`-`|`-d`|`--data` *data*

## DESCRIPTION

**ase util** is the entry point group for miscellaneous utility
commands. Most of them back the MCP tools of the per-project *ASE*
service and the *ASE* skills, but can be used standalone, too. Without
a sub-command, the usage information is shown and the command exits
with status `1`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

## COMMANDS

- `ase util meta` *name* \[...\]:
  Output the contents of one or more plugin meta files. See
  `ase-util-meta`(1).

- `ase util compat`:
  Output the expected probe values of the `ase-meta-compat` self-test
  skill. See `ase-util-compat`(1).

- `ase util diagram` \[*options*\]:
  Render a *Mermaid* or *D2* diagram specification as Unicode/ASCII art
  or SVG. See `ase-util-diagram`(1).

- `ase util worktree` `base`|`path` \[*options*\] \[*id*\]:
  Safely resolve the *ASE* worktree directories below
  `<repo-root>/.ase/worktree`. See `ase-util-worktree`(1).

- `ase util mint` \[*options*\] \[*hint* \[...\]\]:
  Mint hash-derived identifiers (UUID, SHA-1) out of a hint. See
  `ase-util-mint`(1).

- `ase util metric` \[*options*\] \[*text* \[...\]\]:
  Measure the words, lines, characters, and bytes of a file or a text.
  See `ase-util-metric`(1).

- `ase util rasterize` \[*options*\] *input-file*|`-`|`-d`|`--data` *data*:
  Rasterize an SVG document or PNG/GIF/JPEG image (raw, as `data:` URL, or
  as base64 data) into a PNG image, into the
  terminal graphics of the Kitty, iTerm2, or SIXEL protocol, or into
  Unicode half-block text art. See `ase-util-rasterize`(1).

## EXIT STATUS

The group command without a sub-command exits with status `1`.

## SEE ALSO

`ase`(1), `ase-util-meta`(1), `ase-util-compat`(1),
`ase-util-diagram`(1), `ase-util-worktree`(1), `ase-util-mint`(1),
`ase-util-metric`(1), `ase-util-rasterize`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

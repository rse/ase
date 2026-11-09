# ase-util-diagram(1) -- Render Mermaid or D2 Diagrams as Unicode/ASCII Art or SVG

## SYNOPSIS

`ase util diagram`
\[`-h`|`--help`\]
\[`-i`|`--input` *file*\]
\[`-l`|`--lang` `mermaid`|`d2`\]
\[`-f`|`--format` `ascii`|`svg`\]
\[`-t`|`--theme` `light`|`dark`\]
\[`-T`|`--tone` *tone*\]
\[`-a`|`--ascii`\]
\[`-c`|`--color-mode` `none`|`ansi16`|`ansi256`\]
\[`--node-margin-x` *n*\]
\[`--node-margin-y` *n*\]
\[`--node-padding` *n*\]
\[`--diagram-clip-x` *n*\]
\[`--diagram-clip-y` *n*\]
\[`--terminal-width` *n*\]
\[`--terminal-height` *n*\]

## DESCRIPTION

**ase util diagram** renders a diagram specification, written in the
*Mermaid* or *D2* diagram language and read from standard input or a
file, as Unicode box-drawing (or plain ASCII) art for the terminal, or
as a self-contained SVG document. The *Mermaid* diagrams are rendered
via *beautiful-mermaid* (supporting, e.g., flowcharts, UML state,
sequence, and class diagrams, ER diagrams, and XY-charts), and the
*D2* diagrams via the WebAssembly build of *D2*.

For the `svg` format, the diagrams are drawn in the colors of a theme
style (`light` or `dark`) and a theme color tone (one or two colors,
where a missing second one is derived as the complement of the first
one), from which a grey, an accent, and a signal color spread are
derived. For *Mermaid*, the node boxes are drawn in a darker accent
color with lighter labels on the `light` style, resp. vice versa on the
`dark` style. A `classDef default` in the diagram overrides their
`fill`, `stroke`, and `color`, while the nodes with their own class or
`style` keep their explicit properties. For *D2*, the colors override
the D2 themes "Neutral Default" (`light`) resp. "Dark Mauve" (`dark`),
while a `theme-overrides` of the diagram itself still wins. On the
`light` style, the *D2* shapes without own colors (except containers and
text, code, image, class, and SQL table shapes) are drawn in a darker
accent resp. signal color with lighter labels, too. The *D2*
diagrams have a transparent background, unless the diagram sets its
own via a top-level `style.fill`, and a padding of 20 instead of 100
pixels, unless the diagram sets its own via the `pad` of `d2-config`.

Any custom color of a diagram (like of a `classDef`, a `style`, or a
`style.fill`) is replaced by its perceptually nearest color of the three
color spreads, so the SVG document uses the theme colors only.

For the `ascii` format, the rendering is optionally clipped to the
terminal dimensions (reduced by the extra clipping amounts): lines
wider than the width budget are truncated (preserving and properly
terminating any ANSI color sequences), and lines beyond the height
budget are dropped.

A clipped rendering is followed by a warning paragraph which states
the overflow and advises how to regenerate the diagram source to fit
(e.g., by preferring a portrait orientation, reducing siblings per
row, abbreviating node labels, or nesting). The output always ends
with a newline.

The MCP tool `ase_diagram` provides the same to the skills.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-i`|`--input` *file*\]:
  Read the diagram specification from *file* instead of standard
  input. An empty (or whitespace-only) specification is an error.

- \[`-l`|`--lang` `mermaid`|`d2`\]:
  The diagram language: `mermaid` for *Mermaid* (default) or `d2` for
  *D2*.

- \[`-f`|`--format` `ascii`|`svg`\]:
  The output format: `ascii` for Unicode/ASCII art (default) or `svg`
  for an SVG document. The clipping options apply to `ascii` only.

- \[`-t`|`--theme` `light`|`dark`\]:
  The theme style of the SVG document (`svg` only).
  Default: the configured `agent.diagram.theme`, else `light`.

- \[`-T`|`--tone` *tone*\]:
  The theme color tone of the SVG document as one or two colors
  `#rgb` or `#rrggbb`, separated by whitespace (`svg` only). Default:
  the configured `agent.diagram.tone`, else `#336699`.

- \[`-a`|`--ascii`\]:
  Emit plain ASCII characters (`+`, `-`, `|`) instead of the Unicode
  box-drawing characters (for both languages).

- \[`-c`|`--color-mode` `none`|`ansi16`|`ansi256`\]:
  The color mode of the ANSI escape sequences in the rendered art
  (*Mermaid* and `ascii` only): `none` for no colors, `ansi16` for 16
  colors, or `ansi256` for 256 colors, where colors render the diagram
  in gray shades. Default: `$ASE_TERM_COLORS` if set to one of these
  values, else derived from the color depth of standard output if it is
  a terminal (`ansi256` for at least 8 bits, `ansi16` for at least 4
  bits), else `none`.

- \[`--node-margin-x` *n*\]:
  The horizontal margin between nodes in characters (*Mermaid* only,
  default: `3`).

- \[`--node-margin-y` *n*\]:
  The vertical margin between nodes in lines (*Mermaid* only, default:
  `3`).

- \[`--node-padding` *n*\]:
  The horizontal and vertical inner padding of each node in characters
  (*Mermaid* only, default: `1`).

- \[`--diagram-clip-x` *n*\]:
  The extra horizontal clipping: the width budget is the terminal width
  minus *n* characters (default: `0`).

- \[`--diagram-clip-y` *n*\]:
  The extra vertical clipping: the height budget is the terminal height
  minus *n* lines (default: `0`).

- \[`--terminal-width` *n*\]:
  The terminal width in characters for the clipping, where `0` disables
  the horizontal clipping. Default: `$ASE_TERM_WIDTH` if a positive
  integer, else the width of standard output if it is a terminal, else
  `0`.

- \[`--terminal-height` *n*\]:
  The terminal height in lines for the clipping, where `0` disables the
  vertical clipping. Default: `$ASE_TERM_HEIGHT` if a positive integer,
  else the height of standard output if it is a terminal, else `0`.

All numeric values *n* have to be non-negative integers.

## ENVIRONMENT

- `ASE_TERM_COLORS`:
  The default of `--color-mode` (`none`, `ansi16`, or `ansi256`).

- `ASE_TERM_WIDTH`, `ASE_TERM_HEIGHT`:
  The defaults of `--terminal-width` and `--terminal-height`.

## EXIT STATUS

Exits with status `0` on success, and with status `1` on an invalid
option value, an unreadable input file, an empty specification, or a
rendering failure (e.g., a syntax error in the specification).

## EXAMPLES

```sh
# render a Mermaid flowchart as Unicode art
$ printf 'flowchart LR\n    A --> B --> C\n' | ase util diagram

# render a D2 diagram from a file as plain ASCII art without colors
$ ase util diagram -l d2 -i arch.d2 -a -c none

# render a Mermaid diagram as an SVG document
$ ase util diagram -i flow.mmd -f svg >flow.svg

# render a Mermaid diagram as an SVG document in a dark purple theme
$ ase util diagram -i flow.mmd -f svg -t dark -T "#663399" >flow.svg
```

## SEE ALSO

`ase`(1), `ase-util`(1), `ase-config`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

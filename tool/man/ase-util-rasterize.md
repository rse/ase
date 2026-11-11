# ase-util-rasterize(1) -- Rasterize an SVG Document or Image for Files and Terminals

## SYNOPSIS

`ase util rasterize`
\[`-h`|`--help`\]
\[`-f`|`--format` `png`|`kitty`|`iip`|`sixel`|`text`|`auto`\]
\[`-o`|`--output` *file*|`-`\]
\[`-s`|`--scale` *factor*|`auto`\]
\[`--width` *columns*\]
\[`--height` *rows*\]
\[`-b`|`--background` *color*|`auto`\]
\[`--font` *file*\]
\[`--smart`\]
*input-file*|`-`|`-d`|`--data` *data*

## DESCRIPTION

**ase util rasterize** rasterizes an SVG document or a PNG, GIF, or JPEG
image (detected by its signature), read from *input-file*, from
standard input (`-`), or from the *data* of `--data`, and writes it as a PNG image, as the terminal
graphics escape sequences of the *Kitty Graphics Protocol*, the *iTerm2
Inline Image Protocol* (IIP), or the *SIXEL* protocol, or, for terminals
without graphics, as Unicode half-block text art with ANSI truecolor
escapes (each character cell showing two stacked pixels). An image passes
the same scaling and background filling as an SVG document (where of an
animated GIF only the first frame is used). A PNG image with an
effective scale *factor* of `1` and background `auto` is passed through
unchanged to the formats `png`, `kitty`, and `iip`.

The rasterizing uses the WebAssembly build of *resvg*, which cannot
access the system fonts. Hence, the fonts *Source Sans 3* (for
`sans-serif`, `serif`, and unknown families) and *Source Code Pro* (for
`monospace`) are bundled and always loaded, and additional fonts can be
loaded with `--font`.

The input, whether *input-file*, standard input, or *data*, can be the
raw SVG document or image, a `data:` URL of it, or its base64 encoding.

This backs the MCP tool `ase_rasterize`, which returns the PNG image of
an SVG document or PNG/GIF/JPEG image, given either by its content
(parameter `data`, in the same forms as *data*) or by its file path
(parameter `file`, relative to the project root), e.g., of a diagram
rendered by `ase util diagram`, with the same scale (default *factor*
`1`), width, height, background, and smart options, plus a parameter
`maximum`, bounding the width and height of the image in pixels, and a
parameter `output`, returning the PNG image as image content (`inline`,
the default), as a temporary file (`file`), as a temporary file only
above 2 MiB (`auto`), or as the text art of format `text` (`text`).

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-f`|`--format` `png`|`kitty`|`iip`|`sixel`|`text`|`auto`\]:
  The output format. The default `auto` chooses `png` for a *file*
  output and for a standard output which is not a terminal. For a
  terminal, it chooses the first supported protocol out of `kitty`,
  `iip`, and `sixel` (but `iip` first under *iTerm2*), and `text` if no
  protocol is detected (or *tmux* would drop it).

  Inside *tmux*, `auto` prefers the formats which *tmux* manages as
  regular pane content: first `kitty` if the outer terminal is *Kitty*
  or *Ghostty* (identified by its answer to *tmux*, its `TERM`, or its
  environment variables), then `sixel` if *tmux* supports SIXEL natively
  for its client (terminal feature `sixel`, e.g., enabled via `tmux set
  -as terminal-features ",xterm*:sixel"`). Otherwise, it detects the
  outer terminal from the *tmux* session environment and chooses `iip`
  or `sixel`, but never `kitty`. All other terminal formats are wrapped
  into *tmux* passthrough sequences (failing for an explicit format if
  the *tmux* option `allow-passthrough` is off). For `kitty`, the image is displayed
  through *Unicode placeholders* (supported by, e.g., *Kitty* and
  *Ghostty*), i.e., text cells which *tmux* manages like regular pane
  content. For `iip` and a passed through `sixel`, the rows of the image
  are reserved upfront, but as *tmux* is unaware of such an image, it
  stays on top of the pane content until the outer terminal redraws.
  The outer terminal is often hidden from the detection, so an explicit
  format may be needed. Besides a local *tmux* (`TMUX` set), a remote one,
  like for *SSH* from inside *tmux*, is assumed for a `TERM` of `tmux*`,
  or of `screen*` outside of *GNU screen* (`STY` unset).

- \[`-o`|`--output` *file*|`-`\]:
  Write the output to *file* instead of standard output (`-`, the
  default).

- \[`-s`|`--scale` *factor*|`auto`\]:
  Scale the image by *factor*, or with `auto` (the default) fit it into
  the width and height of the terminal (given by `--width` and
  `--height`, else determined from the `ASE_TERM_WIDTH` and
  `ASE_TERM_HEIGHT` environment variables or the standard output).
  For `kitty` and `iip`, the terminal itself scales
  the image onto the fitted character cells, while `text` fills them
  with two area-averaged pixels each. For the pixel size of the
  character cells, the one reported by *tmux* is used, else 10x20
  pixels are assumed. For `png`, or without a known
  terminal size, `auto` means *factor* `1`.

- \[`--width` *columns*\]:
  Use *columns* characters as the width of the terminal for scale
  `auto`, instead of determining it automatically (`0`, the default).

- \[`--height` *rows*\]:
  Use *rows* lines as the height of the terminal for scale `auto`,
  instead of determining it automatically (`0`, the default). As for
  the determined height, two lines are kept free for the subsequent
  output.

- \[`-b`|`--background` *color*|`auto`\]:
  Fill the transparent areas with the CSS *color*, or keep the
  transparency with `auto` (the default).

- \[`--font` *file*\]:
  Load the additional TrueType or OpenType font *file*. Can be given
  multiple times.

- \[`--smart`\]:
  Resolve the CSS custom properties (`var(...)`) and color mixings
  (`color-mix(in srgb, ...)` of hexadecimal colors) into plain values
  before rasterizing, as *resvg* supports neither of them. This is
  needed for the SVG output of `ase util diagram` for *Mermaid*.

- \[`-d`|`--data` *data*\]:
  Rasterize *data*, an SVG document, or an SVG document or PNG/GIF/JPEG
  image as `data:` URL or base64 data, instead of *input-file*.

## ARGUMENTS

- *input-file*|`-`:
  The SVG document or PNG/GIF/JPEG image to rasterize, or `-` for standard
  input. Required, unless `--data` is given.

## EXIT STATUS

Exits with status `0` on success, and with status `1` if the input
or a font file cannot be read or rasterized, or *tmux* drops the
terminal graphics of an explicit format.

## EXAMPLES

```sh
# show a Mermaid diagram in the terminal
$ echo -e "flowchart LR\nA --> B" | ase util diagram -f svg | ase util rasterize --smart -

# convert an SVG document into a PNG image on a white background
$ ase util rasterize -b white -s 2 -o logo.png logo.svg

# show a PNG image in the terminal
$ ase util rasterize screenshot.png

# show a PNG image in the terminal, fitted into 80x24 characters
$ ase util rasterize --width 80 --height 24 screenshot.png

# show a PNG image as text art, e.g., in a terminal without graphics
$ ase util rasterize -f text screenshot.png

# show an SVG document, given as a string, in the terminal
$ ase util rasterize -d "$(cat logo.svg)"

# show a base64-encoded PNG image in the terminal
$ ase util rasterize -d "$(base64 < screenshot.png)"
```

## SEE ALSO

`ase`(1), `ase-util`(1), `ase-util-diagram`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

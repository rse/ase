# ase-config-ui(1) -- Edit the Configuration Interactively

## SYNOPSIS

`ase config`
\[`--scope` *scope*\]
`ui`
\[`-h`|`--help`\]

## DESCRIPTION

**ase config ui** opens a full-screen terminal UI for browsing and
editing the layered configuration of the scope chain. It requires an
interactive terminal on both standard input and standard output, and
otherwise fails.

The screen shows a header (with the key count, the view, and the key
filter), the content of the current view, a box with
the description of the selected key, the key hints, and a status line
(reporting errors). The key `/` (or a click onto the header) starts
typing into the key filter, which reduces both views to the keys
containing the typed text. The key `v` toggles between the two views:

- *parameter view* (initial):
  A table of all configuration keys with their effective values and the
  scopes supplying them, like `ase config list`. Existing values are
  bold, and explicitly set ones (on a scope other than `default`) are
  additionally in the accent color, while a missing value is shown as a
  dimmed `~`. Too long values are truncated with an ellipsis.

- *scope view*:
  The scopes of the chain as tabs (initially the target scope), and
  below the selected tab a YAML rendering of the full configuration of
  its scope: keys not writable on the scope are dimmed, the others are
  in regular color, and keys carrying a value on the scope are bold
  (and, except on `default`, additionally in the accent color), while
  the others show the value inherited from the weaker scopes (or `~` if
  none). `RETURN` opens the modal on the scope of the tab
  (read-only for a key not writable on it). The key `e` opens the
  configuration file of the scope in the text editor (creating it if
  missing); after the editor exits, the file is strictly validated and
  an invalid file is reported in the status line.

`RETURN` on a key opens a modal, which shows the key, its description,
the scopes of the chain, and the value editor of the selected scope. In
the scope list, scopes the key is not writable on are dimmed, the
others are in regular color, scopes carrying a value are bold (and,
except for `default`, additionally in the accent color), and the
selected scope is inverse in the signal color. On a scope the key is
not writable on (like `default`), the value is shown read-only. The
value editor starts with the value of the selected scope, or else
(dimmed) with the value inherited from the weaker scopes, which an edit takes over. A boolean is toggled through
`true`, `false`, and unset, an enumeration is chosen from a pull-down
(including an `(unset)` entry), a number is typed (digits and `.`
only), and any other value is typed as text.

Every change is stored immediately into the
file of the selected scope, a typed value after 4 seconds without key
presses (or on switching the scope resp. closing the modal), where an
emptied value unsets the key. Values are stored as strings. An invalid
value is reported in the status line and not stored.

Secret keys (tokens) are masked as `***` in both views, but shown in
clear text in the modal.

## KEYS

- In both views:
  `CURSOR-UP`/`CURSOR-DOWN`, `PAGE-UP`/`PAGE-DOWN`, `HOME`/`END`, and
  the mouse wheel select a key, `RETURN` (or a click onto the selected
  key) opens its modal, a click selects a key, `v` toggles the view, `/`
  starts typing into the key filter, `?` hides resp. shows the key
  hints at the bottom (like in the task board), and `ESCAPE` or `q`
  quits (where `ESCAPE` first clears an active filter).

- In the key filter of the header:
  Typing filters the keys, `BACKSPACE` deletes a character, `RETURN`
  keeps the filter, and `ESCAPE` clears it, both leaving the field.

- In the scope view:
  `CURSOR-LEFT`/`CURSOR-RIGHT` (or a click) select the tab, `DELETE`
  deletes the selected key from the scope of the tab (if writable on
  it), and `e` edits the file of this scope (not on the `default` tab).

- In the modal:
  `TAB`/`SHIFT-TAB` (or a click) cycle through the scopes, and
  `CURSOR-LEFT`/`CURSOR-RIGHT` select the previous/next scope for a
  boolean, an enumeration, or a read-only scope,
  `SPACE` toggles a boolean, `SPACE`/`RETURN` open the pull-down of an
  enumeration (with `CURSOR-UP`/`CURSOR-DOWN` selecting and `RETURN`
  taking a choice and closing the modal), `CURSOR-LEFT`/`CURSOR-RIGHT`
  and `HOME`/`END` move the cursor of a number or text, `BACKSPACE`
  deletes the character before the cursor, `DELETE` unsets the value of
  the selected scope, `RETURN` takes the shown value (storing a typed
  value immediately, resp. an inherited value as the own value of the
  scope) and closes the modal, and `ESCAPE` closes the pull-down resp.
  the modal.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`--scope` *scope*\]:
  Select the scope chain, whose scopes are shown and editable. As an
  option of `ase config`, it has to be given *before* `ui`. See
  `ase-config`(1) for details. Default: `project` inside a project
  context, else `user`.

## ENVIRONMENT

- `VISUAL`, `EDITOR`:
  The editor command of the key `e`, taken from the first non-empty one
  of `VISUAL` and `EDITOR`, falling back to `vi`. It is run through the
  shell, with the file name appended as the last argument.

## FILES

The configuration files of the scopes of the chain. See `ase-config`(1).

## EXIT STATUS

`0` once the UI is quit, `1` without an interactive terminal.

## EXAMPLES

```sh
# edit the configuration of the user and project scopes
$ ase config ui

# edit the configuration including a task scope
$ ase config --scope task:T1 ui
```

## SEE ALSO

`ase`(1), `ase-config`(1), `ase-config-edit`(1), `ase-config-set`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

# ase-task-board(1) -- Show the interactive task board of the project

## SYNOPSIS

`ase task board`
\[`-h`|`--help`\]
\[`-w`|`--web`\]
\[`-t`|`--text`\]
\[`--agent-relay` *url*\]

## DESCRIPTION

**ase task board** shows the *task board* of the current project: all
persisted task plans of the task store of the project (see
`ase-task`(1)) as *cards* in the *lanes* of the effective task
lifecycle model (see `ase task lifecycle`), following all changes of
the task plans live. It comes in three variants:

- the interactive *terminal board* (the default, on a terminal),
- the *web board* in the browser (with `--web`), and
- the plain *text overview* (with `--text`, or without an interactive
  terminal on standard input or output).

The lanes are grouped by the phases of the lifecycle model plus a
final `Done` phase of the finished states, where within a phase the
entry state comes first, the active state second, and the parking
state last. The cards of the *active* lanes (the states a task is
actively worked on) are shown in the accent color (default: blue), the
cards of the *parking* lanes in the normal color, and the cards of the
finished lanes in the dim color (default: grey), while the selected
card is shown in the signal color (default: red).

A card shows the task id (inverse, behind a `≡`, and of an epic, i.e.,
a task being its own group, additionally behind a `♛`), its group (if
any, between `♛` and `▶`), its markers, and its title, the latter cut
onto a single line or, toggled with `t`, wrapped onto at most three
lines. The markers are:

- `[✎]`: an edit request of the task is pending (see `ase-agent-editor`(1)).
- `[✎…]`: an edit request of the task is being processed.
- `[✎✗]`: an edit request of the task failed.
- `[⚖`*size*`]`: the effort of the task, i.e., the T-shirt size
  (`XS`, `S`, `M`, `L`, or `XL`) of its valid `Effort:` key (see
  `ase-agent-estimator`(1)), absent for an unestimated task.
- `⚉` *name*: a badge on the top border of the card, naming an
  agent busy with the task (inverse), resp. the agent the task is
  assigned to.
- `☺` *name*: a badge on the top border of the card, naming the
  person the task is assigned to.

Besides the *task lanes* view, the boards show the *task graph* view,
the dependency graph of the tasks derived from their `After:` keys
(where an epic implicitly comes after all other tasks of its group),
the *statistics* view with the statistics of the tasks, and with an
agent relay the *agent logs* view and the *agent graph* view. All
views are cycled via `v` (or a click onto the `view:` value of the
header).

The last shown view, the minimized lanes, the collapsed phases, and the
shown flags are persisted in `.ase/board.yaml` (separately for the
terminal and the web board).

### Terminal Board

The terminal board runs in the alternate screen of the terminal and
requires a window of at least 40 columns and 16 rows.

Its header shows the project, the task lifecycle model, the number of
unfinished and of all tasks, the current view, and the `filter:` field
(with its `✕` clear button), below it the warnings of the board (e.g. on
dependency cycles), and its footer shows the information line, up to
three key hint lines (hidden and shown via `?`, where the information
line reminds of `?` while they are hidden), and the status line
with the kind and connection state of the task store (`●` connected,
`○` disconnected), the number of agents and the connection state of
the agent relay (if any), and the *ASE* version, or a notice instead.

In the task lanes view, lanes can be minimized (`m`), lane rows collapsed
(`C`), and phases collapsed (`c`), and the selected lane can be
*grown* via `g` to the full board, showing all its cards in a grid of
at least four columns.

A card opens its plan in a full-height *task dialog* (`⏎` or a mouse
double click), which shows the frontmatter keys, the predecessors and successors
of the task (a click onto one opens its task dialog), and the plan body,
followed by the attachments of the plan as further tabs, where a diff
attachment (type `text/x-diff`, like the implementation draft or the change
set snapshot `kind="changeset"` of the `implementer` and `integrator`
agents) is colored per line, YAML and JSON data are syntax-highlighted,
and a change set snapshot older than the plan is marked `(stale)`.

A task is moved into another state (changing its `Status:`) either by
picking it up with `SPACE` and dropping it with a second `SPACE` onto
the selected lane (only lanes whose state is reachable from the current
state in the lifecycle model accept the task, and are shown in bold),
or via the *transfer popup* of `T`, which lists all lane states (as
*phase* `▷` *state*, starting at the current state), where the states
not reachable from the current state are dimmed.

A task is assigned (changing its `Assignee:`) via the *assign popup* of
`A`: its assignee field, prefilled with the current assignee, accepts
any name, while its drop-down suggests the names containing the typed
one: `none` (unassigning the task, like an empty field), then the
users of `project.users` (else the current user) with `☺`, then the
agents present at the agent relay with `⚉`, each sorted, except the
agents which never take a task by its assignee (the request agents,
like `ase-agent-editor`(1), and the phase agents of an `unclaimed`
definition). With a
non-empty `project.users`, a name neither suggested nor the current
user is marked `unknown`, and its assignment is warned about (see
`ase-task-assign`(1)).

`e` edits the selected task plan with `$EDITOR` (default: `vi`, run
through the shell, with the file passed as `$ASE_TASK_FILE`), where a
draft which failed to save is offered again on the next `e`. `N`
creates a new task by editing a pre-filled task plan (all frontmatter
keys, a free placeholder id, the initial state, and the section
template of the task format), which is stored under the id of its `Id:`
line (refused for an existing id, while an unchanged text creates no
task at all), where a text which failed to save is offered again on the
next `N` (created again even if unchanged) until it is emptied, which
discards it. `D` deletes the selected task after a confirmation.

`E` requests the edit of the selected task by a prompt (refused for a
finished task and while an edit of it is in progress), which
`ase-agent-editor`(1) then processes via the `ase-task-edit` skill. The
prompt popup is prefilled with the prompt of a cancelled request resp.
of the most recent failed request (for a retry), and an empty prompt
is refused.

`R` requests the selected task by a prompt under a *request name*
(see `ase task request`), suggested from the request agents announced
to the agent relay (`edit` for `ase agent editor`, else the request
name of any other request agent), which the request agent of the name
then processes. An empty prompt is refused, unless all request agents
of the name announced to the agent relay accept the prompts of their
requests as optional (e.g., the `research` requests of `ase agent
researcher`, see `ase-agent-researcher`(1)) or ignore them. If all of
them ignore the prompts (e.g., the `estimate` requests of `ase agent
estimator --mode request`, see `ase-agent-estimator`(1)), the prompt
field is disabled, skipped by `TAB`, and no prompt is sent.

`/` focuses the `filter:` field of the header: its keywords are
matched case-insensitively against the task id and title, AND-combined
when separated by spaces and OR-combined when separated by commas. Each
OR-part first matches its keywords as literal substrings, and only if
this matches no task at all, it matches them *fuzzily* (keywords of at
least four characters also match words of a similar spelling). A
keyword `effort:`*size* (with *size* one of `XS`, `S`, `M`, `L`, or
`XL`, case-insensitively) instead exactly matches the tasks of this
effort size (its `Effort:` key), while a keyword of any other size is
an ordinary one. The lanes show only the matching tasks, the graph
additionally their direct predecessors and successors (dimmed and
dashed).

The terminal board supports the mouse (via SGR mouse reporting): a
click onto a card or a lane selects it, a double click onto a card
opens it, a double click onto a lane minimizes or maximizes it (resp.
shrinks a grown lane, resp. expands its collapsed phase), a click
onto the title of a phase selects it like `←`/`→` (its lane in the row
of the selected lane), a double click onto it collapses or expands it,
a click onto
the `view:` value of the header cycles the view, a click onto the
`filter:` field focuses it, a click onto its `✕` clears it, and the
mouse wheel over a lane scrolls it. In the task graph view, a click onto a
task selects it and a double click opens it.

`M` disables the mouse support to regain the regular text selection of
the terminal (and enables it again). The terminal board enables the
*kitty keyboard protocol* if the terminal supports it, as only then
`Shift`+`⏎` is distinguishable from `⏎`.

### Web Board

With `--web`, the web board is served through the *ASE* service of the
project (see `ase-service`(1), started if not yet running) under
`http://127.0.0.1:`*port*`/task-board`, which is printed on standard
output and opened in the default browser (via `open`, `xdg-open`, resp.
`start`).

It offers the same views and keys as the terminal board, where a task
is additionally moved by dragging its card onto a reachable lane, the
graph is zoomed by the mouse wheel (and `+`, `-`, and `0`) and panned
by dragging it, and an image attachment is zoomed by the mouse wheel.
Its minimized lanes and collapsed phases are stored once per project,
not per browser, so all open web boards share them and pick up a change
immediately.

In the task dialog of the web board, `e` (or `✎`) edits the task plan
in a Markdown editor (in the task lanes and task graph views, `e` opens the
selected task directly for editing): `Ctrl`/`⌘`+`S` saves it, but only
if the plan was not changed meanwhile (else it offers to overwrite or
discard), and `ESC` cancels (after a confirmation if changed). With the
Vim or Emacs key bindings of `board.web.editor.keymap`, `:w`/`:q` resp.
`C-x C-s`/`C-x C-c` save resp. cancel instead. A text which failed to
save is kept as a draft in the browser and offered on the next edit.

A running service with other *ASE* code is never restarted, as this
would break the MCP connections of the agent sessions using it: an
older service without the web board fails `--web` (restart it with
`ase service stop` once no agent session uses it), while a differing
build is only warned about.

### Text Overview

With `--text`, and also without an interactive terminal, the lane
overview is printed as plain text and the command exits: a header line
with the project, the lifecycle model, and the number of tasks, then
per phase (`━` *phase*) and lane (*state*, marked `(active)` for an
active lane, and its number of cards) the cards with their id (plus
the `✎` and `⚖` markers), title, and the agents busy with them (behind
`⚙`), followed, with an agent relay, by the agents (`●` busy, `○`
waiting) with their status and their last processing log line, and
finally all warnings of the board (behind `⚠`, e.g. on dependency
cycles).

### Statistics View

The third view *statistics* shows the statistics of the tasks matching the
`filter:` field (all tasks if empty), refreshed on every change of the
tasks, within the time range selected by the buttons `total` (all
tasks, with the number of days since the creation of the oldest
task), `within last 30 days`, and `within last 7 days` on its top
(selected via `←`/`→` or a click, initially `total`):

- `Tasks per State`: a column chart with the number of tasks of each
  state of the task lifecycle model, labeled by the state, below by the
  effort of its estimated tasks (blank without any), and below by its
  phase (of its lane), in the colors of the lanes, and with
  the `total tasks:` line below it. An effort is the sum of the
  representative human minutes of the effort sizes of the tasks on the
  scale `project.task.effort.scale` (see `ase-config`(1)), shown in
  minutes below one hour, else in hours, where the explicit epics carry
  no effort of their own.
- `Throughput` (besides `Tasks per State`): a column chart with the
  number of tasks finished (in a terminal state other than `CANCELLED`)
  in each of the last 12 weeks (a quarter, ending with the current
  week), labeled by the ISO week number and, below, by the total and
  average number of finished tasks per week. As the time of the
  completion of a task is not tracked, its `Modified:` frontmatter key
  is taken instead, so the throughput is just an approximation. It
  always covers the last 12 weeks, independent of the time range.

  Below it, the `forecast:` line shows the number of all unfinished
  tasks (*work-in-progress* and *open*, independent of the time range)
  and the number of weeks to finish them at the average throughput of
  the last 12 weeks, `n/a` without any finished task within them.
- `Task Progress`: one stacked bar of the *cancelled* tasks, the
  *finished* tasks (in a terminal state other than `CANCELLED`), the
  tasks *work-in-progress* (`wip`, in an active state, like `PLANNING` or
  `IMPLEMENTING`), and the *open* tasks (in any other state, like
  `DRAFTED`, `PLANNED`, or `STALLED`), each with its number and share.
- `Open Tasks` (besides `Task Progress`): one stacked bar of the open
  tasks, split into the *ready* tasks (all predecessors in a terminal
  state, or none at all) and the *blocked* tasks (any predecessor in
  another state, including the implicit predecessors of an epic),
  each with its number and share. The readiness is determined against
  all tasks, independent of the `filter:` field, as a predecessor
  hidden by the filter blocks a task nevertheless.
- `Usage`: bars of the total accumulated usage of the tasks (see
  `ase-task-assign`(1) and `ase-agent`(1)) by its `time` (AI request,
  human, and real time, in minutes below one hour, else in hours), its
  `token` (all tokens, stacked by the cache read, cache write, input,
  and output tokens), and its `cost` (AI and human costs, in USD), with
  the bars of a column scaled to the maximum of the column.
- `Effort` (besides `Usage`): a column chart with the
  number of estimated tasks of each effort size, from the smallest
  (`XS`) to the largest (`XL`), where the explicit epics carry no
  effort of their own, and with the `estimated:` line below it, the
  number of the estimated and of all tasks.
- `Top-5 Tasks`: a table of the (up to) five tasks of the highest usage, ranked
  by their total (AI and human) costs and then by their input and
  output tokens, with the columns `Task Id` (inverse behind `≡`, in the
  color of its lane), `Task Title` (cut with an ellipsis if too long),
  `Total Share` (a bar of its share of the total costs of all tasks,
  resp. of their input and output tokens without any costs), `Cost`,
  and `Token` (as *input* `▷` *output*, with the uncached input tokens,
  i.e., without the cache read and write tokens).
- `Finished Tasks` (besides `Top-5 Tasks`): the average (`⌀`) AI costs,
  human costs, and AI tokens (as *input* `▷` *output*, like in
  `Top-5 Tasks`) per finished task (the usage of the finished tasks
  divided by their number, including the finished tasks without any
  usage), and the *lead time* (the time from the `Created:` to the
  `Modified:` frontmatter key) of the finished tasks as its median
  (`lead (median)`) and its 85th percentile (`lead (p85)`), in minutes
  below one hour, in hours below two days, else in days, each `n/a`
  without any finished task.

  Like the throughput, the lead time is just an approximation, and
  median and percentile are robust against single outlier tasks.
- `Efficiency` (besides `Finished Tasks`): the *AI/HR time ratio* (the
  AI request time per human time, i.e., the higher, the more AI work
  per attended human minute) and the *AI/HR cost ratio* (the AI costs
  per human costs), each `n/a` without any human time resp. costs (as
  booked by the agents, see `ase-agent`(1)), and the *AI cache hit ratio*
  (the share of the cache read tokens of all input tokens, i.e., of the
  cache read, cache write, and uncached input tokens, the main lever on
  the AI costs), `n/a` without any input tokens.

Within the last 30 or 7 days, a task counts only if the period from
its `Created:` to its `Modified:` frontmatter key overlaps with the
time range, and the usage of a task counts only with the overlapping
part of the period from the `Created:` to the `Modified:` key of its
usage attachment (i.e., the times of its first and last booking). As
the usage attachment does not track when the usage accrued, the usage
is taken as being evenly spread over this period, so the usage within
these time ranges is just an approximation.

### Agent Logs View

With an agent relay (see `--agent-relay`), the boards additionally
follow the running agents (see `ase-agent`(1)) live in the view
*agent logs*: a master/detail view, with the framed master list `Agents` on
the left, showing each agent as a card with its name (inverse, behind
a `⚉`), a pulse on its top border while busy (resp. a circle while
waiting), and the fields `kind:` and `mode:` of its operation (or
`none` without a mode), and `task:` with the ids of the tasks it is busy
with (else `none (waiting)`).

The framed pane `Operation` on the right shows the operation of the
selected agent: its one-line title (in bold) and its brief description
(word-wrapped and cut after six lines), as given by its definition (see
`--title` and `--description` in `ase-agent-adhoc`(1)).

Two equally wide framed panes below it show the selected agent:
`Process` with its `host:`, its process id `pid:`, its user id and user
name `uid:` (e.g. `501 (rse)`), and its current working directory `cwd:` (cut at its
start if too long), where `uid:` and `cwd:` are `n/a` for an older agent
not reporting them, and `Accounting` with `uptime:`, the duration since its
start, `heartbeat:`, the age of its latest heartbeat, and `usage
(total):` resp. `usage (last job):`, its usage of the agent tool in
total since its start
resp. by its last finished job, each as wall time, output tokens, and
costs in USD (e.g. `12m, 9.2k tok, $3.41`, with `n/a` for what the agent
tool does not report, and `none` before the first finished job).

The framed detail view `Recent Log Entries` below them shows
the recent processing log lines of the selected agent, each with its
full timestamp, the id of its task (if any), and its level and content
(warnings and errors in the signal color), broken onto multiple rows
instead of being cut. The detail view follows the bottom of the log
while not scrolled up. When the selected agent vanishes, its neighbor
is selected instead.

The information line shows the selected agent and the title of its
operation (if any). Without an agent relay,
the agent logs view is skipped.

An agent stopping vanishes from the board immediately, while an agent
missing its heartbeat vanishes after 30 to 35 seconds. A relay
connection without any traffic for 15 to 30 seconds (e.g. after a
network partition) is detected, reported as disconnected (dropping the
shown agents), and re-established.

### Agent Graph View

With an agent relay, the boards additionally show, after the agent logs
view, the last view *agent graph*: like the task graph view, but with the
running agents as their agent cards (with the same fields as in the
agent logs view), plus the lifecycle states referenced by these agents as
state boxes. An edge from a state to an agent card shows a state the
agent observes (its incoming states), a dashed edge a state the `After:`
predecessors of its tasks have to reach first (its gate), and an edge
from an agent card to a state a state the agent writes (its success,
failure, and verdict states). The cards of the agents operating in the
same activity state (e.g. `IMPLEMENTING`) are drawn within a dashed
container labeled with this state (behind a `◉`), while unclaimed phase
agents (e.g. `estimator --mode phase`) and request agents (e.g.
`editor`) are drawn outside of any container, the latter without any
edges. The agent graph is laid out top to bottom: the request agents
in a row on top, below them the lifecycle states in the grid of the
task lanes view, i.e., per phase as a column, the entry states, then
the active states (the containers, plus the unclaimed phase agents),
and then the parking states. Several running agents of the same kind
and mode are merged into one card, with their number behind a `×` in
its name and the union of the tasks they are busy with.

The information line shows the selected agent card with its incoming,
activity, written, and gate states (resp. the name of its requests),
resp. the selected state with the agents observing, writing, and gating
on it. The states are announced by the agents themselves, so agents and
agent relay have to be of the same *ASE* version. Without an agent
relay, the agent graph view is skipped.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-w`|`--web`\]:
  Serve the web board through the *ASE* service of the project, print
  its URL, open it in the default browser, and exit (see **Web Board**).
  Takes precedence over `--text`.

- \[`-t`|`--text`\]:
  Print the lane overview as plain text and exit (see **Text
  Overview**), instead of starting the interactive terminal board.

- \[`--agent-relay` *url*\]:
  The agent relay to receive the live presence of the agents from, as
  `ase://`*addr*`:`*port*\[`/`*token*\] resp.
  `ases://`*addr*`:`*port*\[`/`*token*\]\[`?insecure`\] for HTTPS
  (optionally without certificate verification), with the bearer token
  embedded, else from `$ASE_AGENT_RELAY_TOKEN`, else from
  `project.relay.token`, else of the locally started agent relay
  (default: the configured `project.relay.url`, else none, i.e.,
  without agent logs and agent graph views).

  Honored by the terminal board and the text overview only, as the web
  board always follows the configured `project.relay.url` (and hence
  warns about the option).

## KEYS

The following keys are supported by the terminal board (and, unless
noted otherwise, equally by the web board). The keys `D`, `E`, `N`,
`R`, `T`, `A`, and `M` are also accepted as `Shift` with the lower-case
letter under the kitty keyboard protocol.

### Every View

- `v`: Cycle the view: task lanes, task graph, statistics, and (with an
  agent relay) agent logs and agent graph.
- `V`: Cycle the view backward.
- `/`: Focus the `filter:` field (not in the agent logs and agent graph
  views).
- `?`: Hide or show the key hint lines (persisted); while hidden, the
  information line ends with `?: show key hints`.
- `D`: Delete the selected task, after a confirmation (not in the
  agent logs and statistics views).
- `T`: Transfer the selected task to another state via the transfer
  popup (not in the agent logs and statistics views).
- `A`: Assign the selected task via the assign popup (not in the agent
  logs and statistics views).
- `E`: Request the edit of the selected task by a prompt (not in the
  agent logs and statistics views).
- `R`: Request the selected task by a prompt under a request name (not
  in the agent logs and statistics views).
- `M`: Disable or enable the mouse support (terminal board only).
- `q`, `Ctrl`+`C`: Quit (terminal board only).

### Task Lanes View

- `↑`/`↓`: Select the previous/next card of the phase (within a
  collapsed phase, the previous/next lane).
- `←`/`→`: Select the card of the same lane in the previous/next phase.
- `PgUp`/`PgDn`: Select the upper/lower lane of the phase.
- `Home`/`End`: Select the first/last card of the lane.
- `Tab`/`Shift`+`Tab`: Step through the lanes of the expanded phases
  lane row by lane row, wrapping around the board.
- `⏎`: Open the task dialog of the selected task.
- `e`: Edit the selected task plan (terminal: with `$EDITOR`; web: in
  the Markdown editor of its task dialog).
- `N`: Create a new task.
- `SPACE`: Pick up the selected task, resp. drop the picked-up task
  onto the selected lane (dropping it onto its own lane cancels).
- `ESC`: Cancel the move of a picked-up task.
- `m`: Minimize or maximize the selected lane (persisted).
- `c`: Collapse or expand the selected phase (persisted).
- `C`: Collapse the lane row of the selected lane, i.e., the lanes at
  the same position in all expanded phases, resp. expand it again if
  all its lanes are collapsed already (persisted).
- `g`: Grow the selected lane to the full board (only a maximized lane
  of an expanded phase), resp. shrink it back again.
- `t`: Cut the card titles onto a single line, resp. wrap them onto at
  most three lines (persisted).

### Grown Lane

- `↑`/`↓`/`←`/`→`: Select the card above/below/left/right in the grid.
- `PgUp`/`PgDn`: Select the card a page of rows above/below.
- `Home`/`End`: Select the first/last card.
- `g`, `ESC`: Shrink the lane back again.
- `⏎`, `e`, `N`, `SPACE`, `t`: As in the task lanes view.

### Task Graph View

- `↑`/`↓`/`←`/`→`: Select the nearest task in the direction of the arrow.
- `⏎`: Open the task dialog of the selected task.
- `e`, `N`, `t`: As in the task lanes view.
- `s`: Hide or show the standalone tasks, i.e., the tasks without any
  predecessors and successors (persisted).
- `+`/`-`/`0`: Zoom in, out, resp. reset the zoom (web board only).

### Statistics View

- `←`/`→`: Select the previous/next time range (`total`, `within last
  30 days`, or `within last 7 days`).

### Agent Logs View

- `↑`/`↓`: Select the previous/next agent.
- `Shift`+`↑`/`↓`: Scroll the log of the detail view by one line
  (terminal board only).
- `PgUp`/`PgDn`: Scroll the log of the detail view by one page.
- `Home`/`End`: Scroll to the top/bottom of the log of the detail view,
  where scrolling down to its bottom follows it again.

### Agent Graph View

- `↑`/`↓`/`←`/`→`, mouse click: Select the nearest agent card or state
  in the direction of the arrow, resp. the clicked one, where the edges
  of the selection are highlighted, and the information line of a
  selected state shows the agents observing, writing, and gating on it.
- `⏎`, mouse double click: Show the agent logs view with the agent of the
  selected card (of a merged card: its oldest agent) selected.
- `+`, `-`, `0`, mouse wheel: Zoom in, out, resp. reset the zoom (web
  board only), where dragging the background scrolls the agent graph.
- `PgUp`/`PgDn`, `Home`/`End`, mouse wheel: Scroll the agent graph by
  a page, resp. to its top/bottom (terminal board only).

### Task Dialog

- `←`/`→`, `Tab`/`Shift`+`Tab`: Select the previous/next tab.
- `↑`/`↓`: Scroll the content.
- `PgUp`/`PgDn`: Scroll the content by one page.
- `e`: Edit the task plan.
- `D`, `T`, `A`, `E`, `R`, `M`: As in every view.
- `⏎`, `ESC`: Close the task dialog.

### Filter Field

- *character*: Extend the filter query (applied live).
- `Backspace`: Remove the last character of the filter query.
- `⏎`: Keep the filter query and leave the field.
- `ESC`: Clear the filter query and leave the field.

### Prompt Popup

- *character*: Insert the character (also pasted text) at the cursor.
- `⏎`: Request the edit resp. the request (on the request name field:
  switch to the prompt; on a button: press it, also a click onto it).
- `Shift`+`⏎`, `Alt`+`⏎`, `Ctrl`+`J`: Insert a line break (terminal:
  `Shift`+`⏎` only under the kitty keyboard protocol, `Alt`+`⏎` only
  under the kitty keyboard protocol or where the terminal sends it as
  `ESC`+`⏎`, e.g. with "Option as Meta" on macOS, and `Ctrl`+`J` in
  every terminal; web: `Shift`+`⏎` only).
- `←`/`→`: Move the cursor by one character.
- `Home`/`End`: Move the cursor to the start/end of the prompt.
- `Backspace`/`Delete`: Remove the character before/at the cursor.
- `Tab`/`Shift`+`Tab`: Switch to the next/previous field: the request
  name (`R` only), the prompt, and the request and cancel buttons
  (terminal board: also a click onto a field; web: by the regular
  focus switching).
- `↑`/`↓`: Cycle through the suggested request names of the drop-down,
  which offers the names containing the typed request name, while on
  the request name (`R` only; also a click onto a name picks it).
- `ESC`: Cancel, keeping the prompt as a draft for the task.

### Transfer Popup

- `↑`/`↓`: Select the previous/next reachable state.
- `⏎`: Transfer the task into the selected state (also a click onto it).
- `ESC`: Cancel (also a click outside of the popup).

### Assign Popup

- *character*: Extend the assignee (web board: edit it freely).
- `Backspace`: Remove the last character of the assignee (terminal board).
- `↑`/`↓`: Cycle through the suggested assignees of the drop-down.
- `⏎`: Assign the task to the assignee (also a click onto a suggested
  assignee).
- `ESC`: Cancel (also a click outside of the popup).

### Deletion Confirmation

- `y`: Delete the task.
- `ESC`: Cancel (web board: also `n`).
- `←`/`→`, `Tab`: Switch between the `delete` and `cancel` buttons
  (terminal board; web board: by the regular focus switching).
- `⏎`: Press the selected button (default: `cancel`).

## CONFIGURATION

The following configuration keys (on scope `user` or `project`, see
`ase-config`(1)) customize the boards:

- `board.tui.color.dim`, `board.tui.color.normal`,
  `board.tui.color.accent`, `board.tui.color.signal`:
  The colors of the four color roles of the terminal board (default:
  `grey`, `default`, `blue`, and `red`), each either `default` (the
  foreground color of the terminal), a color name, `#rgb`, `#rrggbb`,
  `ansi256(`*n*`)`, or `rgb(`*r*`,`*g*`,`*b*`)`.

- `board.web.color.dim`, `board.web.color.normal`,
  `board.web.color.accent`, `board.web.color.signal`:
  The base colors of the four color roles of the web board (default:
  `grey`, `black`, `blue`, and `orange`), each either `default` (the
  default base color of the role), one of the color names `black`,
  `grey`, `gray`, `brown`, `red`, `orange`, `yellow`, `green`, `teal`,
  `cyan`, `blue`, `purple`, or `magenta`, `#rgb`, or `#rrggbb`.

- `board.web.editor.keymap`:
  The key bindings of the task plan editor of the web board: `default`,
  `vim`, or `emacs` (default: `default`).

- `project.relay.url`:
  The default agent relay of the boards (see `--agent-relay`).

## ENVIRONMENT

- `EDITOR`:
  The text editor of the terminal board for `e` and `N` (default:
  `vi`), run through the shell, so a value with arguments is supported.

- `ASE_AGENT_RELAY_TOKEN`:
  The bearer token of an agent relay URL without an embedded token.

## FILES

- `.ase/board.yaml`:
  The display state of the boards in the project root: separately for
  the terminal board (`tui`) and the web board (`web`), the shown `view`
  (`lanes`, `graph`, `stats`, `agents`, or `flow`), the `minimized` lanes, the
  `collapsed` phases, and whether the task `titles` are wrapped onto
  multiple lines, the key hint lines are shown (`keys`), and the graph
  shows the `standalone` tasks.

  The web state is shared by all browsers and tabs showing the web board.
  It never holds task content, and is covered by the self-ignoring
  `.ase/.gitignore`.

## EXIT STATUS

The command exits with status `0` once the terminal board is quit, the
text overview is printed, resp. the web board is opened, and with
status `1` on any error (e.g. an *ASE* service without web board on
`--web`).

## EXAMPLES

```sh
# show the interactive terminal board
$ ase task board

# show the web board in the browser
$ ase task board --web

# print the lane overview, including the agents of a remote agent relay
$ ase task board --text --agent-relay ase://relay.example.com:42043
```

## SEE ALSO

`ase`(1), `ase-task`(1), `ase-task-store`(1), `ase-agent`(1),
`ase-agent-editor`(1), `ase-agent-relay`(1), `ase-service`(1),
`ase-config`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

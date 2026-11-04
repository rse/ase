# ase-agent-adhoc(1) -- Run an Ad-Hoc Agent of a Definition Given by Options

## SYNOPSIS

`ase agent adhoc start`
\[`-n`|`--name` *name*\]
\[`-t`|`--tool` *tool*\]
\[`-p`|`--parallel` *num*\]
\[`-T`|`--timeout` *duration*\]
\[`-o`|`--one-shot`\]
\[`--agent-relay` *url*\]
\[`-r`|`--repo` *url*\]
\[`-d`|`--tempdir` *dir*\]
\[`-D`|`--definition` *file*|`builtin:`*kind*\[`-`*mode*\]\]
\[`--title` *text*\]
\[`--description` *text*\]
\[`--type` `phase`|`request`\]
\[`--workdir` *kind*\]
\[`--lifecycle` *model*\]
\[`--serial`\]
\[`--unclaimed`\]
\[`-M`|`--model` *model*\]
\[`--params` *name*`=`*value*\]
\[`--state-`*item* *state*\]
\[`--tag-`*item* *tag*\]
\[`--assign-`*item* *who*\]
\[`--request-`*item* *value*\]
\[`--prompt-`*item* *value*\]
\[`--prepare-run` *cmd*\]
\[`--success-`*item* *value*\]
\[`--verdict-`*item* *value*\]
\[`--attach-`*item* *value*\]
\[`--finish-`*item* \[*cmd*\]\]
\[`-f`|`--foreground`\]

`ase agent adhoc status`
\[`-n`|`--name` *name*\]

`ase agent adhoc log`
\[`-f`|`--follow`\]
\[`-n`|`--lines` *n*\]
\[`--name` *name*\]

`ase agent adhoc stop`
\[`-n`|`--name` *name*\]

`ase agent` *kind* `start`|`status`|`log`|`stop` \[...\]

## DESCRIPTION

`ase agent adhoc` runs an *ad-hoc agent*: an autonomous agent whose
*entire* behavior is given by its command-line options (optionally
based on the definition file or the built-in definition of
`--definition`), instead of by a definition file of its own. This
manual page is also the authoritative reference of the *agent
definitions* in general, i.e., of the options `--`*group*`-`*item*,
of the definition files, of the prompt templates, and of the hooks.

An agent definition configures the behavior of an agent declaratively.
All agents of **ase** are agents of a definition, run by the same
agent engine:

- *built-in agents* (`ase agent rebooter`, `condenser`, `implementer`,
  `qualifier`, `integrator`, `editor`, `estimator`, and `researcher`):
  each mode of them is a built-in definition, which can be referenced as
  `builtin:`*kind*`-`*mode* (resp. `builtin:`*kind* for its default
  mode): `builtin:rebooter-reboot`, `builtin:condenser-condense`,
  `builtin:implementer-implement`, `builtin:implementer-draft`,
  `builtin:qualifier-judge`, `builtin:qualifier-qualify`,
  `builtin:integrator-merge`, `builtin:integrator-rebase`,
  `builtin:integrator-squash`, `builtin:editor-edit`,
  `builtin:estimator-phase`, `builtin:estimator-request`,
  `builtin:researcher-phase`, and `builtin:researcher-request`.

  All options `--`*group*`-`*item* below are also accepted by the
  built-in agents, where they override the built-in definition (see
  `ase-agent-rebooter`(1) etc.).

- *definition kinds* (`ase agent` *kind*): an agent kind of its own,
  discovered from the definition file *kind*`.`*ext* of the project
  (`.ase/agents/`, intended to be versioned) or of the user (*per-user
  configuration directory*`/agents/`). A definition kind of the project
  shadows one of the user, and both shadow a built-in agent kind of the
  same name (whose `--mode` then no longer exists).

  For example, `.ase/agents/reviewer.mts` yields the commands
  `ase agent reviewer start|status|log|stop`, which take exactly the same
  options as `ase agent adhoc` described here, except `--definition` (as
  the definition file of the kind takes its place), and where the given
  options override the definition file.

  The definition files are discovered only on the commands `ase agent`
  ..., where a file of an invalid kind name (other than up to 64 letters,
  digits, underscores, and dashes, starting with a letter or digit), of
  the reserved kind names `adhoc`, `relay`, or `fleet`, or of an already
  discovered kind name in the same directory (by the precedence of the
  extensions `.yaml`, `.yml`, `.ts`, `.mts`, `.js`, `.mjs`, and `.cjs`,
  in this order) is skipped with a warning.

- *ad-hoc agents* (`ase agent adhoc`): an agent without a definition
  file of its own, e.g., for a one-off agent, or for an agent defined
  inline in a fleet (see `ase-agent-fleet`(1)).

Each agent runs in its own process, in the background (logging into
`.ase/agent/`*name*`.log`) or with `--foreground` in the current
process (logging to the terminal). Several agents are best run
together as a fleet (see `ase-agent-fleet`(1)).

With `--type phase` (default), an agent claims tasks by their
*lifecycle status*, like the built-in phase agents: it observes the
task store for the tasks in the state of `--state-incoming` which do
not carry its tag (see `--tag-name`), whose `Assignee:` is empty or
its own assignee name (see `--assign-name`), and whose predecessors
(the tasks of the `After:` key, and, for an explicit epic, the other
tasks of its `Group:`) all passed its phase (see `--state-passed` and
the hook `passes`).

It claims each such task (in natural task id order, or in the order of
the hook `order`) in a single conditional save, which moves it into the
state of `--state-activity`, tags it with the tag value `active` (as
`<tag-name>:active`), and assigns it to the agent.

It then processes the task through the headless agent tool of `--tool`
with the prompt of `--prompt-skill`, `--prompt-text`, or `--prompt-file`,
checks the success criteria, and finally, again in a single conditional
save, settles the task: it tags it according to `--tag-success` resp.
`--tag-failure` (or with the found verdict as the tag value), hands it
over to the assignee of `--assign-success` resp. `--assign-failure`, and
moves it into the state of `--state-success` resp. `--state-failure` (or
of `--state-verdict`), where `previous` restores the incoming state the
task was claimed from.

A task whose status the skill itself moved elsewhere is tagged, too, and
left in that state, except that for a `previous` success or failure
state, a task the skill itself moved back into one of the incoming
states (e.g., `ase-task-reboot`, which resets it into its default
state) is still settled as above. An interrupted processing puts the task back,
untagged and with its previous assignee, into the incoming state it was
claimed from.

With `--type phase` and `--unclaimed`, an agent instead processes the
tasks *unclaimed*, like the built-in `estimator` agent: it observes the
tasks in one of the states of `--state-incoming` (each adapted onto the
task lifecycle model of the project, e.g., `PLANNED` as `PLANNING` for
`team` and as `OPEN` for `solo`, so it supports all models) which do
not carry its tag, independent of their `Assignee:` and their
predecessors. It processes each such task without any change of it
(neither moving it into an activity state, nor tagging it as active,
nor assigning it), so it keeps no other agent off the task, and the
skill itself has to save its result conditionally (as another agent can
claim and change the task meanwhile). Finally, it settles the task by
its tag only (according to `--tag-success` resp. `--tag-failure`),
without ever changing its status or its assignee. An interrupted
processing leaves the task untouched.

With `--type request`, an agent processes the *prompt requests*
attached to tasks in any lifecycle status (see `ase task request` in
`ase-task-request`(1), or key `R` of the task boards), like the
built-in `editor` agent: it observes the tasks with pending requests
of the request name of `--request-name` (attachments of type
`text/plain; charset=utf-8; kind="<name>"`, mirrored in the tag
`ase-agent-<name>:pending`), claims the oldest request of such a task
by turning it into `kind="<name>-running"` and assigning the task to
the agent (remembering its previous assignee), processes it with the
request prompt available as `{prompt}`, and finally removes the
request on success, or turns it into `kind="<name>-failed"` (with the
reason of the failure as its description) on failure, resp. back into
`kind="<name>"` on interrupt, where the task keeps its status and its
tags (except the request state tag) and, by default, gets its previous
assignee back. An agent consumes the request prompts if its prompt
template references `{prompt}` (except within the conditional
`{?prompt:`*text*`}` only, which makes the prompt *optional*) or it
has a hook `prepare`, `prompt`, `model`, or `finish` (which receive
the request prompt in their *job*), where it then refuses a request
with an empty prompt as failed, else it accepts requests with an empty
prompt (which an agent with an optional prompt still passes on if
non-empty), and announces this to the agent relay, so the task boards
accept an empty prompt for its requests, too.

Only the prompt (and `--state-incoming` for `--type phase`) is
mandatory, while all other options default to the safe *annotate*
behavior: a `phase` task returns into its incoming state, tagged with
the plain tag `ase-agent-<name>` and unassigned, while a `request` task
keeps its status and tags and gets its previous assignee back. The
options are validated on the start (also before detaching the agent),
where an error names the offending option.

## COMMANDS

- `ase agent adhoc start` \[*options*\]:
  Start the ad-hoc agent named by `--name` in the background (spawning
  a detached process logging into `.ase/agent/`*name*`.log`), or with
  `--foreground` in the current process. The agent is validated and
  initialized (e.g., its agent tool is looked up and the task lifecycle
  model is checked against `--lifecycle`) before the command returns,
  so a failing agent is reported together with the tail of its log
  (waiting up to 30 seconds for its startup).

  An agent of the same name already running is left alone (and is an error
  with `--foreground`). All options are described under **OPTIONS** below.

- `ase agent adhoc status` \[`-n`|`--name` *name*\]:
  Report whether the agent named *name* (default: `adhoc`) is running,
  as `agent` *name*`: running (pid` *pid*`)` resp. `agent` *name*`: not
  running`. Exits with status 1 if it is not running.

- `ase agent adhoc log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\] \[`--name` *name*\]:
  Show the log `.ase/agent/`*name*`.log` of the agent named *name*
  (default: `adhoc`) run in the background (where an agent run in the
  foreground logs to the terminal, and an agent of a fleet into the log
  of the fleet instead, see `ase-agent-fleet`(1)).

  With `-n`|`--lines` *n*, only the last *n* lines are shown (default:
  all). With `-f`|`--follow`, the last *n* lines (default: 10) are shown
  and then, in the style of `tail -f`, all newly appended lines are
  followed until interrupted. As `-n` is the number of lines, the name is
  given via the long option `--name` only. If no log file exists, this is
  just reported (at log level `info`).

- `ase agent adhoc stop` \[`-n`|`--name` *name*\]:
  Stop the agent named *name* (default: `adhoc`) by sending it
  `SIGTERM`, and wait (up to 5 minutes) until it aborted its running
  processings and put their tasks back. A not running agent is reported
  as such, without an error.

- `ase agent` *kind* `start`|`status`|`log`|`stop` \[...\]:
  The same commands for an agent of the definition kind *kind* (see
  **DESCRIPTION**), with the same options (except `--definition`),
  where the name defaults to *kind*.

## OPTIONS

### Agent Options

The following options are shared by all agents (see also
`ase-agent`(1)):

- \[`-n`|`--name` *name*\]:
  The name of the agent (default: its kind, i.e., `adhoc`, resp. the
  definition kind *kind*), at most 64 letters, digits, underscores, and
  dashes, starting with a letter or digit, and neither the name of
  another agent kind, nor `relay` or `fleet`.

  It names the agent in its log lines (also in the shared processing
  log attachment `agent`), the `Assignee:` of the tasks it
  processes (see `--assign-name`), its default tag `ase-agent-`*name*
  (lower-cased, see `--tag-name`), its default request name (see
  `--request-name`), its temporary directory, and its process files
  `.ase/agent/`*name*`.yaml` and `.ase/agent/`*name*`.log`. Hence,
  multiple ad-hoc agents are started under different names.

- \[`-t`|`--tool` *tool*\]:
  The agent tool processing the tasks: `claude`, `copilot`, or `codex`
  (default: `$ASE_TOOL`, else `claude`). It is run headless (with
  `ASE_HEADLESS=true`), i.e., via `claude -p`, `copilot -p`, resp.
  `codex exec` (see `ase-agent`(1)), and has to be found in `$PATH`.

- \[`-p`|`--parallel` *num*\]:
  The maximum number of tasks processed in parallel, a positive
  integer (default: `1`). Ignored (with a warning) with `--serial`.

- \[`-T`|`--timeout` *duration*\]:
  The maximum duration of processing a task, as *number* *unit* with
  *unit* `s`, `m`, or `h` (default: `60m`), where a processing
  exceeding it fails. The preparing and the finishing of a processing
  are each limited to a fixed duration of 240 seconds in addition.

- \[`-o`|`--one-shot`\]:
  Terminate the agent, instead of observing for further tasks, once a
  check of the task store finds no dispatchable task while it
  processes no task anymore. Intended for CI contexts. Not allowed in
  a fleet. A failed check of the task store is retried after a growing
  delay, where `--one-shot` gives up after three failures in a row and
  terminates with a non-zero exit status.

- \[`--agent-relay` *url*\]:
  The agent relay to pass the live presence of the agent to, as
  `ase://`*addr*`:`*port*\[`/`*token*\] (HTTP) or
  `ases://`*addr*`:`*port*\[`/`*token*\]\[`?insecure`\] (HTTPS,
  optionally without certificate verification) (default: the
  configured `project.relay.url`, else none). See `ase-agent-relay`(1).

- \[`-r`|`--repo` *url*\]:
  The Git repository to clone temporarily into the temporary directory
  of the agent, for processing every task without a `worktree` flow
  value in a temporary Git worktree of this clone (default: the Git
  working copy the agent is started in). Requires a task store not
  located in the working copy (i.e., not a local `ase:`*path* one).
  Silently ignored with `--workdir project`.

- \[`-d`|`--tempdir` *dir*\]:
  The directory whose sub-directory *name* holds the temporary files
  of the agent, like the clone of `--repo`, where `%p` in *dir* is
  expanded to the process id of the agent, `%h` to a hash value unique
  to the process, and `%%` to `%` (default: a fresh, private directory
  below the system temporary directory).

  A missing *dir* is created private to the current user, while an
  existing *dir* has to be a directory (no symbolic link) owned by the
  current user. Silently ignored with `--workdir project`.

- \[`-f`|`--foreground`\]:
  Run the agent in the current process, logging to the terminal, until
  it is interrupted or stopped, instead of detaching it.

- \[`-h`|`--help`\]:
  Show the usage information of the command and exit.

### Definition Options

The following options form the *definition* of an agent. Each one is
a flat long option `--`*group*`-`*item* (except the ungrouped ones),
accepted by all agents (including the built-in ones), where the given
options override the definition of the agent (see `--definition` and
**DEFINITION FILES**). A *repeatable* option can be given multiple
times, each time adding a value.

A given option also replaces its mutually exclusive alternatives of the
definition: `--prompt-skill` replaces `--prompt-text` and
`--prompt-file`, `--prompt-text` and `--prompt-file` replace each other
and `--prompt-skill` with `--prompt-args`, and `--tag-retry` and
`--tag-failure` replace each other.

#### Ungrouped

- \[`-D`|`--definition` *file*|`builtin:`*kind*\[`-`*mode*\]\]:
  (`ase agent adhoc` only) The definition to base the agent on: a
  definition file (see **DEFINITION FILES**), or, as
  `builtin:`*kind*`-`*mode* (resp. `builtin:`*kind* for its default
  mode), the definition of a built-in agent (see **DESCRIPTION**),
  where all other given options override it. Example: `ase agent adhoc
  start -n reviewer -D builtin:qualifier-qualify --tag-name
  ase-agent-reviewer`.

- \[`--title` *text*\]:
  The one-line title of the operation of the agent (at most 80
  characters), shown on the task boards: in the information line of the
  agent logs view and above the description in its pane `Operation`
  (default: none).

- \[`--description` *text*\]:
  The brief description of the operation of the agent (about 3-6 lines,
  at most 600 characters, with its whitespace collapsed), shown on the
  task boards in the pane `Operation` of the agent logs view, word-wrapped
  onto its width (default: none).

- \[`--type` *type*\]:
  The processing type: `phase` (default) to claim tasks by their
  lifecycle status, or `request` to process the prompt requests
  attached to tasks (see **DESCRIPTION**). The options `--unclaimed`,
  `--state-`\*, `--tag-success`, `--tag-failure`, `--tag-retry`,
  `--assign-required`, and `--attach-skip` are allowed for `phase`
  only, the options `--request-`\* for `request` only.

- \[`--workdir` *kind*\]:
  The working directory of the processing (default: `project`), which
  determines the working directory of the agent tool, the directories
  granted to it (via `--add-dir`), the holds and deferrals of the
  tasks, and the values of the placeholders `{workdir}`, `{source-dir}`,
  and `{changeset-worktree}`.

  The temporary worktrees the agent creates itself are named
  *id*`-`*assign-name* resp. *id*`-`*changeset-name*`-`*assign-name*
  (with every `#` of the task id replaced by `_`), so they equal those
  of the built-in agents if `--assign-name` is set to the built-in
  kind, while the worktree of a `branch:` changeset is named after the
  branch (with every character other than letters, digits, `_`, and
  `-` replaced by `-`, runs of `-` reduced to one, and leading and
  trailing `-` and `_` removed), like by the skills:
    - `project`: the project root. `--repo` and `--tempdir` are
      silently ignored.
    - `source`: the working copy holding the `Source:` (the project
      root, or with `--repo` a worktree of its temporary clone), where a
      `branch:` source is additionally checked out in a temporary
      detached worktree *id*`-`*assign-name* (as `{source-dir}`,
      granted to the agent tool) only if the prompt template references
      `{source-dir}` (like `editor`).
    - `changeset` (*write* access, like `implementer`): a `worktree`
      changeset in the project root, which, processed serially, is
      held, deferred until free of uncommitted changes, and switched
      onto a `branch:` source, and, processed in parallel, yields the
      ASE worktree id of the task (created by the skill) as
      `{changeset-worktree}`; a `branch:` changeset is held and checked
      out in the agent worktree named after the branch (created from the
      source if missing, refused if its directory already exists, else
      reused if already checked out, but then required free of
      uncommitted changes), yielding its ASE worktree
      id (unless the project root) as `{changeset-worktree}`, and
      removed afterwards only if clean (else preserved); an
      `attachment:` changeset is left to the skill.
    - `changeset-read` (*review* access, like `qualifier`): a `worktree`
      changeset staged in its context worktree, which becomes the
      working directory; a `branch:` changeset left in place (to be
      addressed via `{changeset-name}`); an `attachment:` changeset
      applied staged in the temporary worktree
      *id*`-`*changeset-name*`-`*assign-name*, detached at its base
      commit, which becomes the working directory.
    - `target` (*integration* access, like `integrator`): the project
      root, with access granted to the context worktree of a `worktree`
      changeset (whose ASE worktree id becomes `{changeset-worktree}`)
      and to the worktree of a `branch:` changeset, where a `branch:`
      target is checked out in the temporary worktree
      *id*`-`*assign-name* unless checked out already, published
      afterwards if moved (or rescued if not publishable), and the
      merged `branch:` changeset is deleted from the origin.

- \[`--lifecycle` *model*\]:
  (repeatable) A supported task lifecycle model, `solo`, `team`, or
  `enterprise` (default: every model containing all given states, resp.
  all models for `request` and with `--unclaimed`). The agent refuses
  to start for a project of any other model. All given states have to
  exist in all supported models (except with `--unclaimed`, whose
  incoming states are adapted onto the model of the project).

- \[`--serial`\]:
  Process the tasks serially only, ignoring `--parallel`. A fleet
  refuses two serially processing agents of the same tag.

- \[`--unclaimed`\]:
  (`phase` only) Process the tasks *unclaimed* (see **DESCRIPTION**):
  every task in one of the states of `--state-incoming` (each adapted
  onto the task lifecycle model of the project) which does not carry
  the tag, independent of its assignee and its predecessors, without
  claiming it, and without ever changing its status and its assignee
  (the tag options still apply). An agent of the same kind on the same
  host does not pick up a task already processed by another one.

  Not allowed together with `--state-activity`, `--state-success`,
  `--state-failure`, `--state-phase`, `--state-passed`,
  `--state-verdict`, `--assign-required`, `--assign-success`,
  `--assign-failure`, the success criterion `status`, the hook
  `passes`, and `--workdir changeset` resp. `target` (as the task can
  be claimed by another agent meanwhile).

- \[`-M`|`--model` *model*\]:
  The model of the agent tool, passed to it as `--model` *model*
  verbatim (e.g., an alias like `sonnet` or a full model name), either a
  *model* for all tasks, or comma-separated *size*`=`*model* pairs per
  `Effort:` size of the task (`XS`, `S`, `M`, `L`, `XL`, or `*` for all
  other tasks, e.g., `XS=haiku,S=haiku,M=sonnet,*=opus`), where a task
  without a matching pair gets the default model of the agent tool (the
  default for all tasks). The hook `model` can override it per task (see
  **HOOKS**).

- \[`--params` *name*`=`*value*\]:
  (repeatable) The value of the parameter *name* declared by the
  definition (see **PARAMETERS**), where a later value of the same
  name wins. An undeclared *name* is refused.

#### State (`--type phase` only)

All states are case-insensitive (upper-cased), have to exist in the
supported task lifecycle models, and the transitions from the incoming
into the activity state, back (on interrupt), and from the activity
state into all target states have to be reachable in these models.
With `--unclaimed`, only `--state-incoming` is allowed instead, whose
states have to exist in any task lifecycle model only.

- \[`--state-incoming` *state*\]:
  The state of the tasks to claim. Mandatory for `phase`. Repeatable
  with `--unclaimed`, where each state is adapted onto the task
  lifecycle model of the project (a state of the model is kept, any
  other one is mapped onto its counterpart, e.g., `PLANNED` onto
  `PLANNING` for `team` and onto `OPEN` for `solo`), and with an
  explicit `--state-activity`, where a task is claimed from any of the
  states (e.g., `DRAFTED` and `PLANNING` into `PLANNING`).

- \[`--state-activity` *state*\]:
  The state of a task during its processing (default: the first
  incoming state, i.e., the claim is marked by the `:active` tag value
  only).

- \[`--state-success` *state*\]:
  The target state on success, or `previous` for the incoming state
  the task was claimed from (default: the first incoming state).

- \[`--state-failure` *state*\]:
  The target state on failure, or `previous` for the incoming state
  the task was claimed from (default: the first incoming state).

- \[`--state-phase` *state*\]:
  The *phase success state*, decoupled from the target state: a task
  the skill itself moves there counts as processed (see the success
  criterion `status`), and a task there carrying the tag counts as
  having passed the phase for its `After:` successors (default: the
  success state, resp. the activity state for a `previous` success
  state).

- \[`--state-passed` *state*\]:
  The first state of the lifecycle model from which on a task has
  passed the phase for its `After:` successors (default: the phase
  state).

- \[`--state-verdict` *VERDICT*`=`*STATE*\]:
  (repeatable) The target state per verdict (both upper-case words),
  overriding the success target state, but never the failure target
  state of a failed processing. Requires `--verdict-label` (or the hook
  `verdict`), and every verdict has to be accepted by `--verdict-allow`
  (if given).

#### Tag

- \[`--tag-name` *tag*\]:
  The tag of the processed tasks, of the form `ase-agent-`*word* in
  lower-case and without `:` (default: `ase-agent-`*name*, hence no
  sharing between differently named agents). It guards the tasks
  against a repeated processing: a task carrying it (plain or with any
  value) is not claimed again. For `request`, it is always the request
  state tag `ase-agent-`*request-name* (resp. `ase-agent-editor` for the
  request name `edit`), and any other value is refused.

- \[`--tag-success` *tag*\]:
  (`phase` only) The tag set on success: *tag-name* (default, the
  plain tag), *tag-name*`:`*value* (a lower-case *value* other than
  `active`), or `none` to untag the task. A foreign tag is refused, as
  the agent would claim the task again. `none` is refused if a task
  returns into an incoming state on success (unless guarded by
  `--attach-skip`, by the hook `ready` of a definition which itself
  declares `tag-success: none`, like the built-in `estimator`, as a hook
  `ready` inherited from a definition without it, like the one of the
  built-in `implementer`, does not guard against claiming the untagged
  task again, or by `--assign-required` with an `--assign-success`
  handing the task over to somebody else, like the built-in
  `rebooter`), e.g., always with `--unclaimed`. A found verdict is
  stored as the tag value instead.

- \[`--tag-failure` *tag*\]:
  (`phase` only) The tag set on failure, like `--tag-success` (default:
  *tag-name*), e.g., *tag-name*`:failed` to tell failures apart.

- \[`--tag-require` *tag*\]:
  (repeatable) A tag a claimable task has to carry, where a plain tag
  also matches the tag with any value.

- \[`--tag-exclude` *tag*\]:
  (repeatable) A tag a claimable task must not carry, where a plain tag
  also matches the tag with any value.

- \[`--tag-retry`\]:
  (`phase` only) A shorthand for `--tag-failure none` (not allowed
  together with it): a failed task returning into the incoming state is
  claimed again, but held off by the agent process for an exponentially
  growing delay from 1 minute up to 1 hour.

The tag options never apply to an interrupted task (released untagged)
or to a task left for a manual intervention (tagged
*tag-name*`:failed`, e.g., after a failed finishing or an unreachable
resulting state), which does not count as passed for its successors.

#### Assign

- \[`--assign-name` *who*\]:
  The assignee under which the agent claims, holds, recognizes, and
  releases the tasks, and which names its agent-owned worktrees and its
  mode as announced to the agent relay (default: the agent name), a
  name of letters, digits, `_`, `.`, `@`, and `-`, starting with a
  letter or digit. So a configured agent can act as, e.g., `rebooter`,
  although its agent name must not clash with a built-in kind.

- \[`--assign-required`\]:
  (`phase` only) Claim only the tasks explicitly assigned to *who* of
  `--assign-name` (like `rebooter`), instead of the unassigned ones,
  too.

- \[`--assign-success` *who*\]:
  The assignee to hand a task over to after its successful processing:
  a name, `none` to unassign it, or `previous` for the assignee before
  the claim (default: `none` for `phase`, `previous` for `request`).
  Applied only while the task is still assigned to the agent.

- \[`--assign-failure` *who*\]:
  The assignee to hand a task over to after its failed processing,
  like `--assign-success` (same defaults). An interrupted task always
  gets its previous assignee back, and a task left for a manual
  intervention is always unassigned.

#### Request (`--type request` only)

- \[`--request-name` *name*\]:
  The name of the processed requests, i.e., of the attachments
  `kind="<name>"`, `kind="<name>-running"`, and `kind="<name>-failed"`
  (default: the agent name), a lower-case word of letters, digits, and
  dashes, not ending in `-running` or `-failed`, and none of the
  built-in agent kinds. The name `edit` processes the edit requests of
  key `E` of the task boards.

- \[`--request-done` *word*\]:
  The word naming a processed task in the log lines (default:
  `processed`, e.g., `edited`).

#### Prompt

Exactly one of `--prompt-skill`, `--prompt-text`, or `--prompt-file`
is required. Flags of the skills like `--next DONE` are never added
implicitly, but always have to be given explicitly.

- \[`--prompt-skill` *name*\]:
  The skill to invoke, as *skill* or *plugin*`:`*skill* (letters,
  digits, `_`, `.`, and `-`).

  It is invoked like the built-in agents do, i.e., as `/`*skill*
  (`claude` and `copilot`) resp. `$`*skill* (`codex`), followed by a
  single space and the rendered arguments of `--prompt-args` only if
  these are non-empty, where an un-namespaced ASE skill (`ase-*`) gets
  the plugin namespace `ase:` for `claude` only, a *plugin*`:`*skill*
  stays verbatim, and any other name (e.g., a project skill generated by
  `ase-meta-workflow`) stays un-namespaced.

- \[`--prompt-args` *template*\]:
  The arguments of the skill, as a template (see **TEMPLATES**)
  (default: `{id}` for `phase`, `{id}: {prompt}` for `request`).
  Allowed with `--prompt-skill` only.

- \[`--prompt-text` *template*\]:
  The prompt text to pass as-is to the agent tool (instead of a skill),
  as a template (see **TEMPLATES**).

- \[`--prompt-file` *file*\]:
  A file with the prompt text (instead of a skill), whose content is a
  template (see **TEMPLATES**). It is read and validated on the start.
  In a definition file, a relative *file* is relative to the
  definition file.

#### Prepare

- \[`--prepare-run` *cmd*\]:
  (repeatable) A shell command run in the working directory before the
  prompt (e.g., `npm ci`), where a failing command fails the processing
  without running the prompt.

  It gets the environment variables `ASE_TASK_ID`, `ASE_TASK_TITLE`,
  `ASE_TASK_SOURCE`, `ASE_TASK_CHANGESET`, `ASE_TASK_TARGET` (the raw
  flow values or their configured defaults), `ASE_AGENT_NAME`,
  `ASE_AGENT_WORKDIR`, and `ASE_AGENT_PARAM_`*NAME* per parameter (see
  **PARAMETERS**). Empty commands are refused.

#### Success

- \[`--success-criterion` *criterion*\]:
  (repeatable) A success criterion, where all given criteria have to
  hold, replacing the default `exit` and `clean` for `phase`, resp.
  `clean` and `changed` for `request`:
    - `exit`: an exit code 0 of the agent tool without timeout or
      interrupt.
    - `clean`: no output line reporting an error of the skill (a line
      starting with `ERROR:` or containing `▶ ERROR:`).
    - `changed`: (`request` only) a plan content changed since the
      claim, hence also succeeding on an interrupt after the plan was
      saved (like `editor`).
    - `verdict`: a found verdict. Requires `--verdict-label` (or the
      hook `verdict`).
    - `attachment`: an attachment of `--attach-expect` created or
      changed by the processing (a leftover of an earlier processing
      does not count). Requires `--attach-expect`.
    - `status`: (`phase` only) the move into the phase success state
      (see `--state-phase`) by the skill itself.

- \[`--success-match` *regex*\]:
  (repeatable) A regular expression (JavaScript syntax) an output line
  has to match, e.g., `status:\W*plan integrated\b`.

An unmet criterion is logged, and a failed request is described in its
`<name>-failed` attachment by the first applicable reason: a failed
preparing or finishing command, `skill reported an error`, `agent tool
failed`, else the reason of the first unmet criterion (e.g., `plan not
changed`, `no verdict`, `no new or changed attachment "<spec>"`, or
`no output line matching "<regex>"`).

#### Verdict

- \[`--verdict-label` *label*\]:
  The label after which the verdict is given in the output of a
  successfully exited agent tool: the verdict is the upper-case word
  following the label (after any non-word characters) on the last
  output line carrying it, e.g., `APPROVE` for the label `REVIEW VERDICT`
  and the line `**REVIEW VERDICT**: **APPROVE**`. The hook `verdict` can
  determine it instead.

  A verdict is stored lower-cased as the tag value (e.g.,
  `ase-agent-qualifier:approve`, instead of `--tag-success`) and mapped to
  a target state via `--state-verdict`. It is honored on success only: on
  a failed processing, the task is settled by `--tag-failure` and
  `--state-failure` instead.

- \[`--verdict-allow` *VERDICT*\]:
  (repeatable) An accepted verdict, an upper-case word (default: the
  verdicts of `--state-verdict`, else any). A verdict not accepted
  counts as none. Requires `--verdict-label` (or the hook `verdict`).

#### Attach

An attachment *spec* is *kind* or *mime-type*`;`*kind* (e.g.,
`text/x-diff;draft`), matching the `kind` parameter of the attachment
type exactly and, if given, its MIME type.

- \[`--attach-output` *kind*\]:
  Store the output lines of the prompt as the task attachment of type
  `text/plain; charset=utf-8; kind="<kind>"`, replacing the one of an
  earlier processing.

- \[`--attach-expect` *spec*\]:
  The attachment the success criterion `attachment` requires, which
  must not match the attachment of `--attach-output` (as this one is
  always created).

- \[`--attach-skip` *spec*\]:
  (`phase` only) Leave every task already carrying such an attachment
  unclaimed (e.g., a task already carrying a draft).

- \[`--attach-changeset` *kind*\]:
  (with `--workdir changeset` or `target` only) Store the *change set
  snapshot* -- the view-only, text-only unified diff of the change set
  (without the `.ase` directory) -- as the task attachment of type
  `text/x-diff; charset=utf-8; kind="<kind>"`, captured by the agent
  itself after the processing (before `--finish-commit`) and replacing
  the one of an earlier processing in place (keeping its `Created:`
  key), like `implementer` and `integrator` with the kind `changeset`.

  With `--workdir changeset`, it covers the change set of a `worktree`
  or `branch:` changeset from its fork point from the `Source:` on, with
  `base` *commit* (plus `, partial` unless the task reached
  `--state-phase`) in its `Desc:` key, while an `attachment:` changeset
  other than `attachment:`*kind* removes it as obsolete.

  With `--workdir target`, it covers the change of the target branch by
  the integration of a `worktree` or `branch:` changeset, with `base`
  *commit*`, merged` *commit* in its `Desc:` key, unless the task did
  not reach `--state-phase` or the content of the target did not change.
  Without a change set, the task stays untouched.

#### Finish

- \[`--finish-commit`\]:
  (with `--workdir changeset` only) Commit the work onto a `branch:`
  changeset with the message *Kind*`:` *title* `(`*id*`)` and publish
  it, rescuing a branch which could not be published, like
  `implementer`.

- \[`--finish-success` *cmd*\]:
  A shell command run in the working directory after a successful
  processing, with the environment variables of `--prepare-run` plus
  `ASE_TASK_STATUS`, where a failing command fails the finishing.

- \[`--finish-failure` *cmd*\]:
  A shell command run in the working directory after a failed
  processing, with the same environment variables, where a failing
  command is only reported.

The preparing and finishing commands are limited by the fixed duration
of 240 seconds of the preparing resp. finishing of a processing.

## TEMPLATES

The templates of `--prompt-args`, `--prompt-text`, and `--prompt-file`
expand the following placeholders:

- `{id}`, `{title}`:
  The id and the title of the task.

- `{prompt}`:
  The request prompt, with its whitespace collapsed into single spaces
  (`request` only).

- `{source}`, `{changeset}`, `{target}`:
  The raw flow values of the frontmatter keys `Source:`, `Changeset:`,
  and `Target:`, or their configured defaults
  `project.task.default.*`, with their placeholder `{id}` replaced by
  the task id (with every character other than letters, digits, `_`,
  and `-` replaced by `-`, runs of `-` reduced to one, and leading and
  trailing `-` and `_` removed, e.g., `12` for `#12` and `FOO-12` for
  `FOO#12`).

- `{source-type}`, `{source-name}`, `{changeset-type}`, `{changeset-name}`, `{target-type}`, `{target-name}`:
  The parsed flow values: the type `worktree`, `branch`, or
  `attachment`, and the branch resp. attachment name, else empty, where
  a `Target:` of `source` reads as the `Source:`.

- `{workdir}`:
  The working directory of the processing (see `--workdir`).

- `{source-dir}`:
  The temporary worktree of a `branch:` source, else empty.

- `{changeset-worktree}`:
  The ASE worktree id under which the skill finds the changeset, else
  empty.

- `{key:`*Header*`}`:
  A frontmatter key *Header* of the task.

- `{param:`*name*`}`:
  The value of the parameter *name* declared by the definition (see
  **PARAMETERS**).

- `{?`*cond*`:`*text*`}`:
  A conditional, which emits *text* (with placeholders, but without
  nested conditionals) only if *cond* holds, either *placeholder* (the
  placeholder is non-empty) or *placeholder*`=`*value* (the placeholder
  equals *value*), e.g., `{?source-dir: --int-source-dir
  "{source-dir}"}` or `{?changeset-type=branch:--branch
  {changeset-name}}`. A `{prompt}` used only within `{?prompt:`*text*`}`
  makes the prompt of the requests optional, e.g., `{id}:{?prompt:
  {prompt}}`.

All other text, including whitespace, is kept verbatim, `{{` and `}}`
yield literal braces, and an unknown placeholder (or a malformed or
unbalanced one) fails the start.

## DEFINITION FILES

A definition file carries the same keys as the definition options
above (without the leading `--`), either flat (`state-incoming:
PLANNED`) or nested by group (`state: { incoming: PLANNED }`), where a
key must not be given both flat and nested, a list value repeats a
repeatable option, a flag takes a boolean, and a relative
`prompt-file` is relative to the definition file. A definition file is
either:

- a YAML file (`.yaml` or `.yml`), declarative only, or

- a TypeScript file (`.ts` or `.mts`, run via the type stripping of
  Node.js) or a JavaScript file (`.js`, `.mjs`, or `.cjs`), whose
  default export is the definition object or a (possibly asynchronous)
  function returning it, where `.mts` resp. `.mjs` avoid the reparsing
  warning of Node.js outside of a package of `"type": "module"`.

  It is typed via the type `AgentDefinition` of the package `@rse/ase`
  (`import type { AgentDefinition } from "@rse/ase"` and
  `export default { ... } satisfies AgentDefinition`, with `@rse/ase`
  as a development dependency for the editor only, as the type import is
  erased). Only such a file can additionally carry *hooks* (its key
  `hooks`, see **HOOKS**).

Every definition file can additionally declare *parameters* (its key
`params`, see **PARAMETERS**).

A definition file can extend a *base definition* via its key
`definition`: a further definition file (relative to the definition
file) or, as `builtin:`*kind*`-`*mode* (resp. `builtin:`*kind*), the
definition of a built-in agent.

Its options override those of the base definition (also replacing their
mutually exclusive alternatives, and with a false flag unsetting the
flag of the base definition), its parameter declarations extend those
of the same name of the base definition field-wise (e.g.,
`params: { severity: LOW }` changes just the default value), and its
hooks replace those of the same name of the base definition. Base
definitions can be chained arbitrarily deep, but never cyclic.

For example, a `.ase/agents/implementer.mts` of
`definition: "builtin:implementer-implement"` plus a `ready` hook shadows
the built-in `implementer` while keeping its definition and its `passes`
hook, and a `.ase/agents/reviewer.yaml` of
`definition: builtin:qualifier-judge` plus its own
`tag: { name: ase-agent-reviewer }` runs a further judging agent of its
own tag.

## PARAMETERS

A definition can declare *parameters* (its key `params`, typed via
`AgentParam` of the package `@rse/ase`): custom options of the agent,
whose values are given on its start via `--params` *name*`=`*value*
(resp. via the map `params` of its section of a fleet configuration,
see `ase-agent-fleet`(1)). A parameter *name* consists of up to 64
letters, digits, underscores, and dashes, starting with a letter, and
is declared by an object of the optional fields:

- `desc`:
  The description of the parameter, cited in its errors.

- `default`:
  The default value of the parameter (else empty).

- `required`:
  Whether a non-empty value is required (default: `false`).

- `allow`:
  The allowed values (a single value or a list), where an empty value
  is always allowed unless `required`.

A plain scalar instead of the object declares just the default value
(e.g., `params: { severity: HIGH }`). The values of all parameters are
validated on the start, where an undeclared parameter, a missing
required value, and a value not allowed are refused. Each declared
parameter provides its value (empty if neither given nor defaulted) as:

- the placeholder `{param:`*name*`}` of the templates (see **TEMPLATES**),
  also usable in a conditional like `{?param:`*name*`:`*text*`}`;

- `ctx.params.`*name* (resp. `ctx.params["`*name*`"]`) of the hooks (see
  **HOOKS**);

- the environment variable `ASE_AGENT_PARAM_`*NAME* of the commands of
  `--prepare-run`, `--finish-success`, and `--finish-failure`, with
  *NAME* the upper-cased *name* with every `-` replaced by `_`, where
  two parameters of the same such variable are refused.

## HOOKS

The *hooks* of a TypeScript or JavaScript definition file (its key
`hooks`, typed via `AgentHooks` of the package `@rse/ase`) are the
code-based extensions beyond the declarative options, which not only gate,
but also shape the processing. A thrown error never terminates a running
agent, but counts like a negative result with the error as its reason.

The hooks receive the *task* (its `id`, `title`, `status` adapted to the
task lifecycle model of the project, its flattened frontmatter `keys`,
and its `tags`) and a context *ctx*, which provides:

- `agent` and `lifecycle`:
  The agent (its `name`, `kind`, `mode`, and `tag`) and the task
  lifecycle model of the project (its `name` and its `states`).

- `params`:
  The values of all declared parameters, by their names (see
  **PARAMETERS**).

- `signal`:
  An `AbortSignal`, aborted on the interrupt of the agent (and, within
  the hooks of a job, on the timeout of its preparing resp. finishing),
  which a long-running hook should honor.

- `flow(task, key)`:
  The parsed `Source`, `Changeset`, or `Target` flow value (`type` and
  `name`) of the task, or its configured default (where a `Target:` of
  `source` reads as the `Source:`), else `null` if invalid.

- `attachments(task)`, `plan(task)`, `task(id)`, `tasks()`:
  The attachments of a task (their `type`, `desc`, and inline `data`),
  the plan body of a task (else `null`), a task by its id (else
  `null`), and all tasks, where *task* is a task or its id.

- `update(task, change)`:
  A change of a task in a single conditional update (retried on a
  concurrent change, resolving to `false` if the task vanished): `keys`
  to set (or to remove with `null`), except `Status`, `Assignee`,
  `Tags`, and `Modified`; `tags` to `add` (*tag* or *tag*`:`*value*,
  replacing the other occurrences of *tag*) and to `remove` (*tag* with
  any value, or exactly *tag*`:`*value*), except the tag of the agent
  itself; and `attach` attachments (`kind`, `mime` (default:
  `text/plain`), `desc`, `data`, replacing those of the same kind unless
  `replace: false`), except the processing logs and the processed
  requests of the agent.

- `exec(cmd, args, options)`:
  The run of a command without a shell (within the hooks of a job in
  the working directory of the job, else in the current directory, or
  in `options.cwd`, with the additional environment variables
  `options.env` and the standard input `options.input`), limited to 240
  seconds and cancelled by `signal`, resolving to its exit `code` (or
  `-1` if it did not exit regularly), `stdout`, and `stderr`.

- `log(level, message)`:
  A log line of level `error`, `warning`, or `info` (within the hooks of
  a job into the processing log of the task, else into the log of the
  agent).

The hooks of a job additionally receive the *job*: its working
directory `dir`, the additional directories `dirs` granted to the agent
tool, the temporary worktree `sourceDir` of a `branch:` source, the ASE
worktree id `changesetWorktree` of the changeset, and, for `request`,
the raw `request` prompt. The hooks are, in the order of their
invocation:

- `start(ctx)`:
  The initialization of the agent (e.g., opening a connection) on its
  start, where a thrown error refuses the start.

- `order(tasks, ctx)`:
  The prioritization of the dispatchable tasks (given in natural id
  order) on each dispatching: the tasks (or their ids) in the order to
  claim them, where an omitted task is not claimed this time (a failed
  hook keeps the natural id order and is warned about once per change).

- `passes(pred, succ, ctx)`:
  (`phase` without `--unclaimed` only, synchronous) Whether the
  predecessor *pred* passed the phase of the agent for its successor
  *succ*, or `undefined` for the default decision by `--state-phase`
  and `--state-passed` (a failed hook lets the successor wait and is
  warned about once).

- `ready(task, ctx)`:
  Whether a dispatchable task is claimed now, checked right before its
  claim (after `--attach-skip`): `true` to claim it, `false` to
  silently skip it (e.g., as the result of an earlier processing
  already guards it, like the valid `Effort:` key for `estimator`), or
  the reason to wait for (reported once per change of it).

- `prepare(task, job, ctx)`:
  The preparing of the job in its working directory, after the commands
  of `--prepare-run`, where a thrown error fails the processing without
  invoking the agent tool.

- `prompt(task, prompt, job, ctx)`:
  The prompt of the job, given the configured *prompt* rendered from
  its template (`{ skill, args }` or `{ text }`): `{ skill, args }`,
  `{ text }`, a plain prompt text, or `undefined` to keep the
  configured one, where a thrown error fails the processing.

- `model(task, model, job, ctx)`:
  The model of the agent tool for the job, given the configured *model*
  of `--model` for the `Effort:` size of the task (empty for the default
  model of the agent tool): a model (empty for the default one), or
  `undefined` to keep the configured one, where a thrown error fails the
  processing. This allows choosing the model per task by any means,
  e.g., by asking a cheap model via `ctx.exec`.

- `verdict(task, result, ctx)`:
  (after a successful agent tool only) The verdict of the result (an
  upper-case word, accepted only if listed by `--verdict-allow`), an
  empty string for none, or `undefined` to keep the one found after
  `--verdict-label` (if any). This hook can stand in for
  `--verdict-label` (also for the criterion `verdict` and for
  `--state-verdict`).

- `success(task, result, ctx)`:
  An additional success criterion after all others (where *result*
  carries `ok`, the `output` lines, and the found `verdict`): `true` if
  met, else `false` or the reason why it is not met.

- `settle(task, outcome, ctx)`:
  The settling of the processed task (where *outcome* carries its
  `success`, the `reasons` of the unmet success criteria, and the
  `result`), overriding the configured one: its target `state` (`phase`
  without `--unclaimed` only, still required to be reachable from the
  activity state), the value of its `tag` (`phase` only, a lower-case
  value, or `null` to untag it, refused if the task would return into
  an incoming state unguarded by `--attach-skip`, the hook `ready`, or
  the handover of a required assignment, see `--tag-success`),
  and its `assignee` (a name, `none`, or `previous`, but not with
  `--unclaimed`), where an omitted field (or `undefined` for all) keeps
  the configured settling, and a failed hook keeps the configured
  settling (and is warned about).

- `finish(task, outcome, job, ctx)`:
  The finishing of the job in its working directory, after the
  finishing of its work (e.g., the commit of `--finish-commit`) and
  before `--finish-success` resp. `--finish-failure`, where a thrown
  error fails the finishing of a successful processing (like a failed
  `--finish-success`), but is only reported for a failed one.

- `stop(ctx)`:
  The teardown of the agent (e.g., closing a connection) on its
  termination, with a fresh `signal` (a failed hook is only reported).

## AGENT RELAY AND RUNS

An agent of a definition kind resp. an ad-hoc agent announces itself
to the agent relay (see `ase-agent-relay`(1)) with its kind (resp.
`adhoc`), its `--assign-name` as its mode, and, for `request`, its
request name (suggested by key `R` of the task boards). Its runs are
recorded per tag (below `agent-tag-`*word*`/`*store-hash* of the
*per-user state directory* for the tag `ase-agent-`*word*), so the
recoveries of differently configured agents never affect each other.

## ENVIRONMENT

- `ASE_TOOL`:
  The default of `--tool`.

- `ASE_AGENT_RELAY_TOKEN`:
  The bearer token of the agent relay, if not embedded in its URL.

- `ASE_HEADLESS`:
  Set to `true` for the agent tool processes spawned by the agent.

- `ASE_TASK_ID`, `ASE_TASK_TITLE`, `ASE_TASK_SOURCE`, `ASE_TASK_CHANGESET`, `ASE_TASK_TARGET`, `ASE_AGENT_NAME`, `ASE_AGENT_WORKDIR`, `ASE_AGENT_PARAM_`*NAME*, `ASE_TASK_STATUS`:
  Set for the commands of `--prepare-run`, `--finish-success`, and
  `--finish-failure` (the latter only for the finishing commands).

## FILES

- `.ase/agents/`*kind*`.`*ext*:
  The definition files of the definition kinds of the project.

- *per-user configuration directory*`/agents/`*kind*`.`*ext*:
  The definition files of the definition kinds of the user.

- `.ase/agent/`*name*`.yaml`:
  The process state (process id and process start time) of the agent
  named *name*, existing while the agent runs.

- `.ase/agent/`*name*`.log`:
  The log of the agent named *name* run in the background.

- *per-user state directory*`/agent-tag-`*word*`/`*store-hash*`/`*run-id*`.lock` and `.json`:
  The run lock and run record of each agent process of the tag
  `ase-agent-`*word*, used to recover the tasks of terminated agent
  processes.

## EXIT STATUS

`start` and `stop` exit with status 0 on success (also for an agent
already running resp. not running) and 1 on any error. `status` exits
with status 1 if the agent is not running. `log` exits with status 0.

## EXAMPLES

```sh
# a qualification agent deciding on the task status by its verdict
$ ase agent adhoc start -n reviewer --state-incoming IMPLEMENTED \
    --state-activity QUALIFYING --state-phase QUALIFIED --workdir changeset-read \
    --prompt-skill ase-repo-review --prompt-args "{?changeset-type=branch:--branch {changeset-name}}" \
    --verdict-label "REVIEW VERDICT" --state-verdict APPROVE=QUALIFIED --state-verdict REJECT=DECLINED \
    --success-criterion exit --success-criterion verdict

# a request agent attaching a lint report (requested via "ase task request <id> lint <prompt>")
$ ase agent adhoc start -n linter --type request --request-name lint --workdir source \
    --prompt-text "Lint the source code changed by task {id} with focus on: {prompt}" \
    --success-criterion exit --success-criterion clean --attach-output lint-report

# an agent running a project skill generated by "ase-meta-workflow" on the planned tasks
$ ase agent adhoc start -n workflow --state-incoming PLANNED --tag-require workflow \
    --prompt-skill my-workflow --prompt-args "{id}"

# a further qualification agent of its own tag, based on a built-in definition
$ ase agent adhoc start -n reviewer -D builtin:qualifier-qualify --tag-name ase-agent-reviewer

# an agent of a definition kind of the project (see .ase/agents/reviewer.mts below)
$ ase agent reviewer start -p 2
$ ase agent reviewer log -f
```

A YAML definition file `.ase/agents/linter.yaml`, yielding the
definition kind `linter`:

```yaml
type:               request
workdir:            source
request:
    name:           lint
prompt:
    text:           "Lint the source code changed by task {id} with focus on: {prompt}"
success:
    criterion:      [ exit, clean ]
attach:
    output:         lint-report
```

A TypeScript definition file `.ase/agents/reviewer.mts` with hooks,
yielding the definition kind `reviewer`:

```ts
import type { AgentDefinition } from "@rse/ase"
export default {
    type:      "phase",
    lifecycle: "enterprise",
    workdir:   "changeset-read",
    state:     { incoming: "IMPLEMENTED", activity: "QUALIFYING", phase: "QUALIFIED" },
    tag:       { name: "ase-agent-reviewer", require: "security" },
    prompt:    { skill: "ase-repo-review", args: "{?changeset-type=branch:--branch {changeset-name}}" },
    verdict:   { label: "REVIEW VERDICT", allow: [ "APPROVE", "REJECT" ] },
    success:   { criterion: [ "exit", "verdict" ] },
    params: {
        severity: { desc: "severity of the findings a rejecting review has to cite", default: "HIGH", allow: [ "LOW", "MEDIUM", "HIGH" ] }
    },
    hooks: {
        /*  review a task only once its changeset is a branch  */
        ready: (task, ctx) =>
            ctx.flow(task, "Changeset")?.type === "branch" ? true : "a \"branch:\" changeset",

        /*  require a rejecting review to cite at least one finding of the configured severity  */
        success: (_task, result, ctx) =>
            result.verdict !== "REJECT" || result.output.some((line) => new RegExp(`\\b${ctx.params.severity}\\b`).test(line)) ||
            `rejecting review without ${ctx.params.severity} findings`
    }
} satisfies AgentDefinition
```

Started via `ase agent reviewer start --params severity=MEDIUM` (resp. with
`params: { severity: MEDIUM }` in its section of a fleet configuration).

## SEE ALSO

`ase`(1), `ase-agent`(1), `ase-agent-rebooter`(1),
`ase-agent-condenser`(1), `ase-agent-researcher`(1),
`ase-agent-implementer`(1), `ase-agent-qualifier`(1),
`ase-agent-integrator`(1), `ase-agent-editor`(1),
`ase-agent-estimator`(1), `ase-agent-relay`(1), `ase-agent-fleet`(1),
`ase-task-request`(1), `ase-task-board`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

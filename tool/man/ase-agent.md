# ase-agent(1) -- Autonomous Task Lifecycle Agents

## SYNOPSIS

`ase agent`
*agent*
`start`
\[*agent-options*\]
\[`-f`|`--foreground`\]

`ase agent`
*agent*
`status`
\[`-n`|`--name` *name*\]

`ase agent`
*agent*
`log`
\[`-f`|`--follow`\]
\[`-n`|`--lines` *n*\]
\[`--name` *name*\]

`ase agent`
*agent*
`stop`
\[`-n`|`--name` *name*\]

`ase agent`
*agent*
`restart`
\[*agent-options*\]
\[`-f`|`--foreground`\]

`ase agent relay`
`start`|`status`|`log`|`stop`|`restart`
\[*options*\]

`ase agent fleet`
`init`|`start`|`status`|`log`|`stop`|`restart`
\[*options*\]

## DESCRIPTION

**ase agent** runs the autonomous, headless agents of *ASE*. Each agent
observes the tasks of the task store of the project (see `ase-task`(1)),
claims the tasks it is responsible for, processes each of them by an
*ASE* skill (or a prompt text) through a headless agent tool (*Anthropic
Claude Code CLI*, *GitHub Copilot CLI*, or *OpenAI Codex CLI*), and
settles the task afterwards (status, tag, and assignee), until it is
interrupted or stopped.

The *agent* is one of the following agent kinds:

- the built-in phase agents `implementer`, `qualifier`, and
  `integrator`, which each drive one phase of the `enterprise` task
  lifecycle model, so that the three agents together realize the
  model from the planned to the integrated tasks,

- the built-in phase agents `rebooter`, `condenser`, and `griller`,
  which re-create, condense, resp. grill the plans of the tasks of the
  `Planning` phase of the `enterprise` task lifecycle model explicitly
  assigned to them (`DRAFTED` > `PLANNING` > `DRAFTED`),

- the built-in request agent `editor`, which processes the edit
  requests of tasks in any task lifecycle model,

- the built-in agent `estimator`, which estimates the effort of tasks
  in any task lifecycle model, without claiming them (mode `phase`,
  intended for the final estimation), resp. on request (mode `request`,
  intended for dry-runs),

- the built-in agent `researcher`, which researches and grounds the
  plans of the tasks of the `Planning` phase of the `enterprise` task
  lifecycle model explicitly assigned to it (mode `phase`), resp.
  researches a topic (or the plan itself) for tasks in any task
  lifecycle model on request (mode `request`, intended for topic-driven
  research),

- an agent of a *definition kind*, whose entire behavior is configured
  by a definition file *kind*`.`*ext* of the project or of the user,

- the `adhoc` agent, whose entire behavior is configured by its
  options.

Each agent runs in its own process, either detached in the background
(the default) or, with `--foreground`, in the current process. Several
agents are best run together as a *fleet* (see `ase-agent-fleet`(1)),
and each agent can pass its live presence to the task boards through
an *agent relay* (see `ase-agent-relay`(1)).

The nine built-in agents are not hard-coded, but each mode of them is a
declarative *definition*, run by the same agent engine as the agents of
the definition kinds and the `adhoc` agent. Hence, every agent accepts
all options `--`*group*`-`*item* of the definitions (see
`ase-agent-adhoc`(1)), which override the definition of the agent,
while a built-in agent keeps the identity of its kind: its runs, its
presence (with its mode), its tags, and its agent-owned worktrees
(*id*`-`*kind*) are named after its kind.

## AGENT NAMES

Every agent has a *name* (option `--name`, default: its kind, e.g.,
`implementer` or `adhoc`), which consists of up to 64 letters, digits,
underscores, and dashes, starting with a letter or digit, and which
must not be the name of another agent kind, `relay`, or `fleet`.

The name is used in the log lines of the agent (also in the shared
processing log attachment `agent`), as the `Assignee:` of the tasks it
processes, for its temporary directory, and for its process files
`.ase/agent/`*name*`.yaml` and `.ase/agent/`*name*`.log`. Hence,
multiple agents of the same kind are started under different names,
e.g., `ase agent implementer start -n impl-claude -t claude` and
`ase agent implementer start -n impl-codex -t codex`.

The agents of the same kind form a *pool*: they compete for the same
tasks, share the same tag (per mode), and process their tasks in
parallel to each other.

## TASK CLAIMING

A *phase* agent (all built-in agents except `editor`, `estimator`, and
`researcher` in the mode `request`, and every definition of `--type
phase` without `--unclaimed`) observes the tasks in its *incoming*
state(s) which do not yet carry its *tag*
(plain or with any value) in their `Tags:` frontmatter key, and whose
`Assignee:` frontmatter key is either still empty or already the
assignee name of the agent (default: its name), so a task can be
pre-assigned to a particular agent of a pool, while a task assigned to
anybody else (e.g., a human) is left alone.

An agent can require a task to be already assigned to it (like
`rebooter`, `condenser`, `griller`, and `researcher` in the mode `phase`, see
`--assign-required`). Such an agent can leave a processed task untagged
(see `--tag-success none`), as the unassignment of the task keeps it from
being claimed again, while assigning it to the agent again requests
another processing.

The tag of a built-in agent is `ase-agent-`*kind* (resp. `ase-agent-`*name*
for `rebooter`, `condenser`, `griller`, and `researcher` in the mode
`phase`), resp. one per mode for `implementer` in mode `draft`
(`ase-agent-implementer-draft`), resp. the request state tag of a
request agent (`ase-agent-editor`, `ase-agent-estimate` for
`estimator`, resp. `ase-agent-research` for `researcher`). The
tag of any other agent is `ase-agent-`*name* (see `--tag-name`).

The agent claims each dispatchable task (in natural task id order,
re-checked on every change of the task store) in a single conditional
save of the task (retried on a concurrent change), which moves it into
its *activity* state, tags it with the value `active` (so no other
agent of this kind picks it up, even if the skill itself puts it back
into the incoming state during its processing), and sets its
`Assignee:` to the agent (for information only, as the tag alone
guards the task).

A task meanwhile tagged or (re)assigned is silently skipped instead.

After the processing, again in a single conditional save, the task is
unassigned (only if still assigned to the agent, and not meanwhile to
somebody else, e.g., the `editor` agent), tagged with its plain tag
(or with the label of the processing as its value, like the verdict of
`qualifier`), so no agent of this kind picks it up again, and moved into
its *success* or *failure* (parking) state, where the pseudo state
`previous` restores the incoming state the task was claimed from (for an
agent claiming tasks from multiple incoming states).

A processing failure, a processing exceeding the duration of
`--timeout`, or a processing exhausting the costs of `--budget`, always
leads to the failure state. A task whose status the
skill itself moved elsewhere is tagged, too, and left in that state.

The preparing of a processing (e.g., creating a worktree) and its
finishing (e.g., committing and pushing a branch) are each limited to a
fixed duration of 240 seconds, where exceeding it also leads to the
failure state.

A task the skill already put into the success state, but whose
finishing failed (e.g., a branch which could not be pushed), and a task
whose resulting state is not reachable from its current state, is
instead tagged with the value `failed`, unassigned, and left in its
state for a manual intervention (which removes the tag), while the
failure is logged as an error. A final status update of a processed
task which fails even after its retries is retried in the background
with a growing delay.

A *request* agent (`editor`, `estimator` and `researcher` in the mode
`request`, and every definition of `--type request`) instead processes the prompt requests attached to tasks in
any lifecycle status (see `ase task request` in `ase-task-request`(1),
`ase-agent-editor`(1), and `ase-agent-researcher`(1)).

An *unclaimed* phase agent (`estimator` in the mode `phase`, and every definition of
`--type phase` with `--unclaimed`) instead processes every task in one
of its incoming states (each adapted onto the task lifecycle model of
the project, e.g., `PLANNED` as `PLANNING` for `team` and as `OPEN` for
`solo`) which does not carry its tag yet, independent of its assignee
and its predecessors, without claiming it: it neither moves the task
into an activity state, nor tags it as active, nor assigns it to
itself, and it settles the task by its tag only, so it never changes
its status and its assignee and keeps no other agent off it (see
`ase-agent-estimator`(1)).

## PREDECESSORS

A phase agent claims a task only once all its predecessors passed the
phase of the agent (or no longer exist). The predecessors of a task are
the tasks of its `After:` frontmatter key and, for an explicit epic (a
task whose `Group:` is its own id), implicitly all other tasks of its
group. An agent whose passed state (see below) is the first state of
the task lifecycle model (like `rebooter`, `condenser`, `griller`, and
`researcher` in the mode `phase`, with `DRAFTED`) hence imposes no gate,
except for a predecessor still being processed by an agent of its kind
or a cancelled `After:` predecessor.

A predecessor has passed the phase once it is in or beyond the
*passed* state of the agent (see `--state-passed`), or in the *success*
state and tagged as processed, where a predecessor still tagged by an
agent of this kind with the value `active` (while in the success state
or not finished) resp. `failed` (while still in the success state) has
not passed it yet.

A cancelled `After:` predecessor never passes (as the task might
depend on its never delivered result), while a cancelled member of an
epic counts as dropped from it. A predecessor status foreign to the
lifecycle model counts as the state it maps onto.

A task still waiting for its predecessors is reported once (per change
of the reason), while a task referencing unknown predecessors (treated
as passed), waiting for cancelled predecessors, or waiting in a
dependency cycle is warned about once. A task with predecessors is
re-checked against a fresh listing right before its claim.

## PROCESSING

Each task is processed through the headless agent tool of `--tool`,
with the environment variable `ASE_HEADLESS=true` and without any
standard input, i.e., via

- `claude` \[`--add-dir` *dir* ...\] \[`--model` *model*\]
  `--max-budget-usd` *usd* `-p
  --output-format stream-json --verbose --disallowedTools AskUserQuestion
  --permission-mode auto --permission-prompts none` *prompt*,

- `copilot` \[`--add-dir` *dir* ...\] \[`--model` *model*\]
  `--max-ai-credits` *credits*
  `--allow-all-tools --no-ask-user --no-color --output-format json -p`
  *prompt*, resp.

- `codex exec` \[`--add-dir` *dir* ...\] \[`--model` *model*\] `--json --approve-for-me
  --color never` *prompt*,

where risky actions are denied or automatically reviewed instead of
being prompted for, where *model* is the model of `--model` (none for
the default model of the agent tool), where *usd* resp. *credits* (of
$0.01 each, rounded up) is the budget of `--budget`, and where each
additional directory a skill needs
access to besides its working directory is granted through an
additional `--add-dir` *dir*. A skill *prompt* is `/`*skill* *args*
(`claude` and `copilot`) resp. `$`*skill* *args* (`codex`), where an
un-namespaced *ASE* skill (`ase-*`) gets the plugin namespace `ase:`
for `claude` only.

The agent tool and, for an agent of a working directory other than
`project` (i.e., all built-in agents except `rebooter`, `condenser`,
`griller`, and `estimator`, see `--workdir`), `git` have to be found in
`$PATH`.

All processing information, including the output of the agent tool
(which streams its agent messages, tool calls, failures, and final
result as JSONL events), is logged (to standard error, see `ase`(1),
resp. to the log file of the agent) with timestamp prefixes in real
time, followed by the usage of the agent tool as wall time (measured
locally), output tokens (of `claude` and `codex`), and costs in USD
(of `claude` only), with `n/a` for what the agent tool does not report.

At the end of each processing, the log lines of the processing (with at
most 20 lines of each agent message) are appended to the attachment of
the task with the type `text/plain; charset=utf-8; kind="agent"`
(created if not existing yet), which is shared by all agents, whose log
lines carry their name. If the AI usage accounting is enabled
(`telemetry.enabled`), the usage is additionally booked onto the usage
attachment of the task (without any human time and costs, as the agent
runs unattended).

After the finishing of the job (also of a failed skill, but not on an
interrupt), the agent tool continues the session of the skill in its
working directory with a fixed prompt (via `--resume` *id* of `claude`,
`--resume=`*id* of `copilot`, resp. `resume` *id* following the options
of `codex exec`), letting the agent report the decisions it made, each
with its impact (`HIGH`, `MEDIUM`, or `LOW`), its reason, and its
rejected alternatives, grouped by the focus areas `DOMAIN`,
`INTERFACE`, `ARCHITECTURE`, `IMPLEMENTATION`, `REGRESSION`, and
`CONFIRMATION` of the grilling (see `ase-task-grill`) and ordered by
impact. This report costs an additional request of the agent tool
(answered mostly from its prompt cache), is limited to `--timeout`, but
at most 240 seconds, is capped by the remaining `--budget` of the skill
(of `claude`, else by `--budget` itself, and skipped once exhausted), is
kept from using tools by its prompt only (as restricting the tools
would invalidate the prompt cache), and is logged and booked like the
skill (with its own usage only), where an interrupt of it does not
affect the settling of the task. Unless it fails or reports none, the
decisions are appended, under a heading with the agent name and the
time, to the attachment of the task with the type
`text/markdown; charset=utf-8; kind="decisions"` (created if not
existing yet), which is shared by all agents.

## INTERRUPTS AND RECOVERY

On an interrupt (`SIGINT`, `SIGTERM`, `SIGHUP`, or `SIGQUIT`, e.g., by
`ase agent` *agent* `stop`), and on the failure of a concurrently run
agent, the running processings are aborted and their tasks are put
back, untagged and with their previous assignee, into the incoming
state (while a task processed unclaimed is left untouched), while a
repeated signal terminates the process at once (leaving the claimed
tasks to the recovery described below).

The claimed tasks of each run are recorded under a run lock in the
*per-user state directory* (below a sub-directory per task store, as
task ids are unique per task store only).

Hence, the tasks of an agent terminated without this cleanup (e.g.,
killed or crashed) are recovered on the next start of an agent of its
kind for the same task store on the same host by the same user: a task
still in the activity state is put back the same way, and any other
task still tagged as `active` is tagged plain (as processed), but only
while it is still assigned to the terminated agent and not claimed
meanwhile by a live agent, where concurrently started agents never
recover the same run.

The requests left in processing by a terminated request agent are
marked as failed instead, and the previous assignees of their tasks
are restored.

## WORKING COPY, CLONES, AND WORKTREES

The agents follow the `Source:`, `Changeset:`, and `Target:`
frontmatter keys of a task (or their configured defaults
`project.task.default.source`, `project.task.default.changeset`, and
`project.task.default.target`, see `ase-config`(1)). Their values are:

- `worktree`:
  the Git working copy of the agent (the one it is started in, or the
  one of `--cwd`). For it, the agents
  create no own Git worktree, but work in the working copy directly,
  just adjusting its checked-out branch.

  As concurrently processed tasks would interfere there, an agent
  handles at most one task at a time in the working copy itself
  (other tasks waiting until it is free again). This coordination does
  not extend to other agents (each running in its own process, also
  within a fleet) or humans working in the same working copy, so a
  working copy should be used directly by a single agent only, while
  the other agents are given `--repo` (or process tasks without
  `worktree` values only).

- `branch:`*name*:
  the Git branch *name*, checked out in an *ASE* worktree below
  `.ase/worktree/` where needed, which is named after the branch (with
  every character other than letters, digits, `_`, and `-` replaced by
  `-`, runs of `-` reduced to one, and leading and trailing `-` and `_`
  removed, e.g., `feature-x` for `feature/x`).

- `attachment:`*name*:
  the task attachment *name* (a change set as a diff), handled by the
  skills (`Changeset:` only).

- `source` (`Target:` only):
  the `Source:` of the task.

The placeholder `{id}` of a branch or attachment *name* reads as the id
of the task (with every character other than letters, digits, `_`, and
`-` replaced by `-`, runs of `-` reduced to one, and leading and
trailing `-` and `_` removed, e.g., `12` for `#12` and `FOO-12` for
`FOO#12`), e.g., the `Changeset:`
default `branch:cs-{id}` implements every task onto its own branch.

Without `--repo`, all tasks are processed in the Git working copy the
agent is started in, which is hence mandatory (except for an agent of
the working directory `project`, like `rebooter`, `condenser`,
`griller`, and `estimator`, which work in the project root only, where
`rebooter`, `condenser`, `griller`, and `estimator` do not accept
`--repo` and `--tempdir` at all, while any other such agent ignores
them).

With `-C`|`--cwd` *dir*, every agent instead runs the agent tool in the
Git top-level of *dir* (or, for an agent of the working directory
`project`, in *dir* itself outside a Git working copy), which then is
the Git working copy of the agent, e.g., a persistent clone of its own
per agent of a fleet. The agent itself keeps the project context it is
started in: its configuration, its task store, its definition kinds, and
its process files.

As the skills resolve their project context from *dir*, `--cwd`
requires a task store not located in the project (i.e., not a local
`ase:`*path* one), and the configuration of *dir* should provide the
same `project.id` and task store. `--cwd` and `--repo` are mutually
exclusive.

With `--repo` *url*, each agent instead clones the Git repository *url* once
into its temporary directory (removed on termination) and processes every
task without a `worktree` value in its own temporary Git worktree of this
clone (below `work/` of the temporary directory), where the Git operations
on the clone are serialized: before each task, its default branch and the
branches of the task (unless checked out for another task) are refreshed
from the origin, and afterwards a changed `branch:` changeset resp. target
is pushed back to the origin, where a rejected push fails the task.

If such a push fails after the skill already put the task into its
success state, the work is kept as the branch `ase-agent-rescue/`*id*
in the clone, the task is tagged with the value `failed`, and the
temporary directory is preserved (instead of being removed on
termination) for a manual recovery.

Only a task with a `worktree` value then requires the agent to be
started inside a Git working copy. As the skills run inside the clone,
`--repo` requires a task store not located in the working copy (i.e.,
not a local `ase:`*path* one).

In the names of all *ASE* worktrees derived from a task id, a `#` of
the id (e.g., of the `seq:#%d` id scheme of the issue tracker task
stores) is replaced by `_`, as neither a worktree name nor a branch name
can carry it.

The temporary directory of an agent holds the clone and other
temporary files: by default, it is securely created as a fresh, private
directory `ase-agent-`*name*`-`*random* below the system temporary
directory, while `--tempdir` *dir* forces it to be the sub-directory
*name* of *dir*, where `%p` in *dir* is expanded to the process id of
the agent, `%h` to a hash value unique to the process, and `%%` to `%`.

A missing *dir* is created private to the current user (and removed
again on termination if empty), while an existing *dir* has to be a
directory (no symbolic link) owned by the current user. A sub-directory
*name* left over by an earlier run is removed only if its owning
process is no longer alive and it holds no work preserved for a manual
recovery, and otherwise refused.

## AGENT RELAY

With an agent relay (`--agent-relay` *url*, else the configured
`project.relay.url`, given as `ase://`*addr*`:`*port*\[`/`*token*\]
resp. `ases://`*addr*`:`*port*\[`/`*token*\]\[`?insecure`\] for HTTPS,
optionally without certificate verification), each agent additionally
passes its live presence to the task boards (see `ase-task-board`(1)):
its state (`waiting`, or `busy` with the ids of its tasks) immediately
on every change, its usage of the agent tool (in total and by its last
job) immediately after each finished job, its new processing log lines
(coalesced to at most four announcements per second), and a heartbeat
every 10 seconds, and it removes its presence on termination.

The relay requires an explicit `project.id`. Its bearer token is the
one embedded in the URL, else `$ASE_AGENT_RELAY_TOKEN`, else
`project.relay.token`, else the token of the locally started agent
relay (or of the locally started task store co-hosting it), if the URL
addresses it.

An unreachable relay is warned about once per outage and never disturbs
the processing of the tasks, where the not yet passed log lines are
kept (at most 100) and passed once the relay is reachable again. A
presence rejected by the relay is warned about with its reason and
retried after a growing delay (from 1 up to 15 minutes).

## DEFINITION KINDS

A *definition kind* is an agent kind of its own, discovered from a
definition file *kind*`.`*ext* of the project (`.ase/agents/`, intended
to be versioned) or of the user (*per-user configuration
directory*`/agents/`), where a definition kind of the project shadows
one of the user, and both shadow a built-in agent of the same kind
(whose `--mode` then no longer exists). For instance,
`.ase/agents/reviewer.mts` yields `ase agent reviewer start`.

The extensions are, in descending precedence, `.yaml`, `.yml`, `.ts`,
`.mts`, `.js`, `.mjs`, and `.cjs`. The definition files are discovered
on the commands `ase agent` ... only, where a file of an invalid kind
name (other than up to 64 letters, digits, underscores, and dashes,
starting with a letter or digit), of the kind name `adhoc`, `relay`, or
`fleet`, or of an already discovered kind name in the same directory
is skipped with a warning.

An agent of a definition kind accepts the same options as
`ase agent adhoc start`, except `--definition`, and `--repo` and
`--tempdir` are silently ignored with `--workdir project`. See
`ase-agent-adhoc`(1) for the format of the definition files, all
options of the definitions, their templates, their hooks, and example
definitions.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information of `ase agent` (or of the given sub-command)
  only.

All other options belong to the sub-commands (see **COMMANDS** and the
manual pages of the agent kinds).

## COMMANDS

The following sub-command groups exist:

- `ase agent rebooter` `start`|`status`|`log`|`stop`|`restart`:
  The agent re-creating the plans of the `DRAFTED` tasks of the
  `enterprise` task lifecycle model explicitly assigned to it from
  scratch, putting them back into `DRAFTED` afterwards. See
  `ase-agent-rebooter`(1).

- `ase agent condenser` `start`|`status`|`log`|`stop`|`restart`:
  The agent compressing the wording of the plans of the `DRAFTED` tasks
  of the `enterprise` task lifecycle model explicitly assigned to it,
  putting them back into `DRAFTED` afterwards. See
  `ase-agent-condenser`(1).

- `ase agent griller` `start`|`status`|`log`|`stop`|`restart`:
  The agent grilling the plans of the `DRAFTED` tasks of the
  `enterprise` task lifecycle model explicitly assigned to it, with
  grounded and automatically chosen answers, putting them back into
  `DRAFTED` afterwards. See `ase-agent-griller`(1).

- `ase agent implementer` `start`|`status`|`log`|`stop`|`restart`:
  The agent of the `Implementation` phase of the `enterprise` task
  lifecycle model, implementing the tasks from their `Source:` into
  their `Changeset:`, resp. drafting their implementation. See
  `ase-agent-implementer`(1).

- `ase agent qualifier` `start`|`status`|`log`|`stop`|`restart`:
  The agent of the `Qualification` phase of the `enterprise` task
  lifecycle model, reviewing the `Changeset:` of the tasks. See
  `ase-agent-qualifier`(1).

- `ase agent integrator` `start`|`status`|`log`|`stop`|`restart`:
  The agent of the `Integration` phase of the `enterprise` task
  lifecycle model, integrating the `Changeset:` of the tasks into their
  `Target:`. See `ase-agent-integrator`(1).

- `ase agent editor` `start`|`status`|`log`|`stop`|`restart`:
  The agent processing the edit requests of tasks in any task lifecycle
  model. See `ase-agent-editor`(1).

- `ase agent estimator` `start`|`status`|`log`|`stop`|`restart`:
  The agent estimating the effort of the tasks without a valid
  `Effort:` key in any task lifecycle model, without claiming them
  (mode `phase`, intended for the final estimation), resp. of the tasks
  of the `estimate` requests (mode `request`, intended for dry-runs).
  See `ase-agent-estimator`(1).

- `ase agent researcher` `start`|`status`|`log`|`stop`|`restart`:
  The agent researching the plans of the `DRAFTED` tasks of the
  `enterprise` task lifecycle model explicitly assigned to it
  (mode `phase`, intended for researching and grounding the plan
  content), resp. processing the research requests of tasks in any task
  lifecycle model (mode `request`, intended for topic-driven research),
  appending a research report, grounded in the Web and in the source
  artifacts of the project, to the `research` attachment of the tasks.
  See `ase-agent-researcher`(1).

- `ase agent` *kind* `start`|`status`|`log`|`stop`|`restart`:
  The agent of the definition kind *kind* (see **DEFINITION KINDS**),
  with the same sub-commands and options as `ase agent adhoc`, except
  `--definition`. See `ase-agent-adhoc`(1).

- `ase agent adhoc` `start`|`status`|`log`|`stop`|`restart`:
  An ad-hoc agent, whose entire behavior is given by its options. See
  `ase-agent-adhoc`(1).

- `ase agent relay` `start`|`status`|`log`|`stop`|`restart`:
  The per-user agent relay server, passing the live presence of the
  agents to the task boards. See `ase-agent-relay`(1).

- `ase agent fleet` `init`|`start`|`status`|`log`|`stop`|`restart`:
  A fleet of agents (and of the agent relay they report to), running
  each in its own process and restarting it whenever it exits. See
  `ase-agent-fleet`(1).

The sub-commands of every agent kind *agent* are:

- `ase agent` *agent* `start` \[*agent-options*\] \[`-f`|`--foreground`\]:
  Start the agent in the background, logging into
  `.ase/agent/`*name*`.log`. The agent is validated and initialized
  (e.g., its agent tool is looked up and the task lifecycle model is
  checked) before the command returns (waiting up to 30 seconds), so a
  failing agent is reported together with the tail of its log. An agent
  of the same name already running is left alone (exit status 0).

  With `--foreground`, the agent runs in the current process instead,
  logging to the terminal, until it is interrupted or stopped, where an
  agent of the same name already running is an error.

- `ase agent` *agent* `status` \[`-n`|`--name` *name*\]:
  Report whether the agent of the name *name* (default: its kind) is
  running (with its process id).

- `ase agent` *agent* `log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\] \[`--name` *name*\]:
  Show the log `.ase/agent/`*name*`.log` of the agent of the name *name*
  (default: its kind) run in the background, where an agent of a fleet
  logs into the log of the fleet instead (see `ase-agent-fleet`(1)).
  With `--lines`, only the last *n* lines are shown. With `--follow`,
  the last *n* lines (default: 10) are shown and then all newly appended
  lines are followed until interrupted. As `-n` is the short form of
  `--lines`, the name is given via `--name` only.

- `ase agent` *agent* `stop` \[`-n`|`--name` *name*\]:
  Stop the agent of the name *name* (default: its kind) by `SIGTERM`,
  waiting (up to 5 minutes) until it aborted its running processings
  and put their tasks back.

- `ase agent` *agent* `restart` \[*agent-options*\] \[`-f`|`--foreground`\]:
  Restart the agent of the name *name* of `--name` (default: its kind):
  stop it like `ase agent` *agent* `stop` and then start it like
  `ase agent` *agent* `start` with the given options, which are the
  same as those of `start` (so the options of the stopped agent are not
  carried over). A failing stop leaves the agent not started again.

## ENVIRONMENT

- `ASE_TOOL`:
  The default agent tool of `--tool` (default: `claude`).

- `ASE_AGENT_RELAY_TOKEN`:
  The bearer token of the agent relay, if not embedded in the URL of
  `--agent-relay` resp. `project.relay.url`.

- `ASE_HEADLESS`:
  Set to `true` for the agent tool processes spawned by the agents.

- `PATH`:
  Searched for the agent tool (`claude`, `copilot`, or `codex`) and
  `git`.

## FILES

- `.ase/agent/`*name*`.yaml`:
  The process state (kind, process id, and process start time) of the
  agent named *name*, existing while the agent runs.

- `.ase/agent/`*name*`.log`:
  The log of the agent named *name* run in the background.

- `.ase/agents/`*kind*`.`*ext*, *per-user configuration directory*`/agents/`*kind*`.`*ext*:
  The definition files of the definition kinds of the project resp. of
  the user.

- `.ase/worktree/`:
  The *ASE* worktrees created by the agents (and the skills).

- *per-user state directory*`/agent-`*kind*`/`*store-hash*`/`*run-id*`.lock` and `.json`:
  The run lock (a directory, refreshed periodically and considered stale
  after 30 seconds without refresh) and the run record (process id, process
  start time, and claimed tasks) of each agent process of agent *kind*
  (`rebooter`, `condenser`, `griller`, `implementer`, `qualifier`, `integrator`,
  `editor`, `estimator`, or `researcher`, resp. `tag-`*word* per tag `ase-agent-`*word* of the
  agents of the definition kinds and of `adhoc`), where *store-hash* is
  the first 12 hex digits of the SHA-1 digest of the identity of the
  task store.

  On termination, the lock is removed, and so is the record, unless it
  still records claimed tasks.

## EXIT STATUS

`ase agent` *agent* `start` (and `restart`) exits with status `0` once
the agent started (or was already running), resp. once a foreground
agent terminated regularly, and with status `1` on any error (e.g., an
invalid option, a missing agent tool, an unsupported task lifecycle
model, or, with `--one-shot`, a task store failing three checks in a
row). `ase agent` *agent* `status` exits with status `1` if the agent is
not running. `ase agent` without a sub-command shows its usage
information and exits with status `1`.

## EXAMPLES

```sh
# start the phase agents of the "enterprise" lifecycle model
$ ase agent rebooter start
$ ase agent condenser start
$ ase agent griller start
$ ase agent researcher start
$ ase agent implementer start -p 2
$ ase agent qualifier start -m judge
$ ase agent integrator start -m squash

# start two implementers of different agent tools as a pool
$ ase agent implementer start -n impl-claude -t claude
$ ase agent implementer start -n impl-codex -t codex

# follow the log of an agent, restart it with other options, and stop it again
$ ase agent implementer log -f --name impl-codex
$ ase agent implementer restart -n impl-codex -t codex -p 2
$ ase agent implementer stop -n impl-codex
```

## SEE ALSO

`ase`(1), `ase-agent-rebooter`(1), `ase-agent-condenser`(1), `ase-agent-griller`(1),
`ase-agent-implementer`(1), `ase-agent-qualifier`(1), `ase-agent-integrator`(1),
`ase-agent-editor`(1), `ase-agent-estimator`(1), `ase-agent-researcher`(1),
`ase-agent-adhoc`(1), `ase-agent-relay`(1), `ase-agent-fleet`(1), `ase-task`(1),
`ase-task-board`(1), `ase-task-request`(1), `ase-config`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

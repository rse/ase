# ase-agent-researcher(1) -- Research Agent

## SYNOPSIS

`ase agent researcher start`
\[`-n`|`--name` *name*\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]
\[`-p`|`--parallel` *num*\]
\[`-T`|`--timeout` *duration*\]
\[`-o`|`--one-shot`\]
\[`--agent-relay` *url*\]
\[`-r`|`--repo` *url*\]
\[`-d`|`--tempdir` *dir*\]
\[`-m`|`--mode` `phase`|`request`\]
\[`-M`|`--model` *model*\]
\[`--`*group*`-`*item* *value* \[...\]\]
\[`-f`|`--foreground`\]

`ase agent researcher status`
\[`-n`|`--name` *name*\]

`ase agent researcher log`
\[`-f`|`--follow`\]
\[`-n`|`--lines` *n*\]
\[`--name` *name*\]

`ase agent researcher stop`
\[`-n`|`--name` *name*\]

## DESCRIPTION

**ase agent researcher** researches for the plans of tasks, combining
a Web research with a grounding in the source artifacts of the project
(see the skill `ase-task-research`). It runs in one of two modes (see
`--mode`): the mode `phase` (the default) researches the plans of the
tasks explicitly assigned to it in the `Planning` phase of the
`enterprise` task lifecycle model and is intended for *researching and
grounding the plan content*, while the mode `request` processes the
research requests of tasks in any task lifecycle model and is intended
for *topic-driven research*.

In the mode `phase` (refused for any task lifecycle model other than
`enterprise`), as a plan is researched only on the explicit request of
a human, the researcher claims only the tasks in the state `DRAFTED`
whose `Assignee:` frontmatter key already is its agent name
(default: `researcher`), i.e., which a human assigned to the
researcher. Such a task is claimed immediately, without waiting for its
`After:` predecessors (and, for an explicit epic, its group members),
except for a predecessor still being processed by a researcher in the
mode `phase` or a cancelled `After:` predecessor. It moves each claimed task
into `PLANNING`, tags it with `ase-agent-researcher:active`, and
researches the plan itself via the skill invocation `ase-task-research
--refine` *id* in the working copy, grounded in the `Source:` of the
task (like in the mode `request`, see below), appending the research
report to the `research` attachment of the task and refining the plan
by the recommendations of the report. The processing succeeds under the
same conditions as in the mode `request`. Afterwards, on success as
well as on failure, the researcher puts the task back into `DRAFTED`,
removes its tag, and unassigns it. As the task is no longer assigned to
the researcher, it is not claimed again, while assigning it to the
researcher again requests another research. On an interrupt, the task
is put back, untagged and with its previous assignee (i.e., still
assigned to the researcher), into `DRAFTED`.

In the mode `request`, the researcher processes the research requests
of tasks. Like the request agent `editor`, it is then bound to no phase
and supports all task lifecycle models (`solo`, `team`, and
`enterprise`).

A research request is added by key `R` of the task board (see
`ase-task-board`(1)) or by `ase task request` *id* `research`
\[*topic*\] (see `ase-task-request`(1)) as an attachment of type
`text/plain; charset=utf-8; kind="research"` with the topic as its
data, mirrored in the tag `ase-agent-research:pending` of the task
(aggregated as `:active` while one is processed and as `:failed` once
one failed). The topic is optional: a request without a topic
researches the task plan itself.

The researcher observes the tasks with this tag, except those in an
activity status of the task lifecycle model, where the task is actively
worked on (`team`: `IMPLEMENTING`; `enterprise`: `PLANNING`,
`IMPLEMENTING`, `QUALIFYING`, and `INTEGRATING`), and those still held
by a phase agent (tagged `ase-agent-`*kind*`:active`), which wait until
their status changes resp. their tag is released.

It claims the oldest request of such a task in a single conditional
save by turning it into `kind="research-running"` and setting the
`Assignee:` of the task to its agent name (remembering the previous
assignee in the request), which keeps all other agents off the task
during the research without touching its status. The request of a
finished task is turned into `kind="research-failed"` instead.

It then researches the topic via the skill invocation
`ase-task-research --refine` *id*`:` \[*topic*\] (with the whitespace
of the topic collapsed) in the working copy, grounded in the `Source:`
of the task, where a `branch:`*name* source is checked out in the
temporary, detached Git worktree `.ase/worktree/.temp/`*id*`-researcher`,
passed to the skill via its internal option `--int-source-dir`, and
removed afterwards. The skill combines a Web research with a grounding
in the source artifacts of the project, appends its research report to
the `research` attachment of the task (of type `text/markdown;
charset=utf-8; kind="research"`), and refines the plan by the
recommendations of the report, all in a single save, which happens
only if the task was not changed meanwhile.

Finally, in a single save, the researcher restores the previous
assignee of the task (unless reassigned meanwhile) and removes the
request if the `research` attachment was created or changed and the
skill reported the attached research, or else turns it back into
`kind="research"` on an interrupt, resp. into `kind="research-failed"`
(with the reason, e.g., `skill reported an error`, `agent tool failed`,
or `no new or changed attachment "text/markdown;research"`) otherwise.

A finalization failing even after its retries is retried on every
further dispatching.

On its start in the mode `request`, the researcher marks the requests left in
`kind="research-running"` by any terminated researcher process of the
same user on the same host (whose run lock is gone or stale and whose
process is no longer alive) as failed (`kind="research-failed"`), and
restores the previous assignees of their tasks.

Both modes can run side by side as two agents of the kind `researcher`
under different names (e.g., `researcher` and `researcher-request`).
See `ase-agent`(1) for the common mechanics of all agents.

## OPTIONS

- \[`-h`|`--help`\]: Show usage information of `ase agent researcher`
  (or of the given sub-command) only.

All other options belong to the sub-commands (see **COMMANDS**).

## COMMANDS

- `ase agent researcher start` \[*options*\]: Start the researcher agent
  in the background, logging into `.ase/agent/`*name*`.log`. The agent
  is validated and initialized (e.g., its agent tool is looked up and
  the task lifecycle model is checked) before the command returns
  (waiting up to 30 seconds), so a failing agent is reported together
  with the tail of its log. An agent of the same name already running is
  left alone. The options are:

    - \[`-n`|`--name` *name*\]: The name of the agent (default:
      `researcher`): up to 64 letters, digits, underscores, and dashes,
      starting with a letter or digit, other than the name of another
      agent kind, `relay`, or `fleet`.

      It names the agent in its log lines (also in the shared processing
      log attachment `agent`), the `Assignee:` of the tasks it processes, its
      temporary directory, and its process files `.ase/agent/`*name*`.yaml`
      and `.ase/agent/`*name*`.log`. Agents of the kind `researcher`
      under different names form a pool, competing for the same tasks and
      processing them in parallel to each other.

    - \[`-t`|`--tool` *tool*\]: The headless agent tool processing the
      tasks: `claude` (*Anthropic Claude Code CLI*), `copilot` (*GitHub
      Copilot CLI*), or `codex` (*OpenAI Codex CLI*) (default:
      `$ASE_TOOL`, else `claude`). Its command has to be found in
      `$PATH`.

    - \[`-p`|`--parallel` *num*\]: The maximum number of tasks processed
      in parallel by this agent (default: `1`), a positive integer.

    - \[`-T`|`--timeout` *duration*\]: The maximum duration of
      processing a task (the run of the agent tool), as *number* *unit*
      (without a space) with *unit* `s` (seconds), `m` (minutes), or `h`
      (hours) (default: `60m`). A processing exceeding it is aborted and
      counts as failed.

    - \[`-o`|`--one-shot`\]: Terminate the agent, instead of observing
      for further tasks, once a check of the task store finds no
      dispatchable task while the agent processes no task anymore --
      intended for CI contexts like GitHub Actions, and not allowed in a
      fleet. A check of the task store failing three times in a row then
      terminates the agent with a non-zero exit status (instead of being
      retried endlessly after a growing delay).

    - \[`--agent-relay` *url*\]: The agent relay to pass the live
      presence of the agent to, as `ase://`*addr*`:`*port*\[`/`*token*\]
      resp. `ases://`*addr*`:`*port*\[`/`*token*\]\[`?insecure`\] for
      HTTPS (default: the configured `project.relay.url`, else none).
      See **AGENT RELAY** in `ase-agent`(1). In the mode `request`, the
      agent is announced there as processing the `research` requests,
      which may have an empty prompt.

    - \[`-r`|`--repo` *url*\]: The Git repository to clone once into the
      temporary directory of the agent, where every task without a
      `worktree` value is processed in its own temporary Git worktree of
      this clone (default: none, i.e., all tasks are processed in the
      Git working copy the agent is started in, which is hence
      mandatory).

      Requires a task store not located in the working copy (i.e., not a
      local `ase:`*path* one). See **WORKING COPY, CLONES, AND WORKTREES**
      in `ase-agent`(1).

    - \[`-d`|`--tempdir` *dir*\]: Create the temporary directory of the
      agent as the sub-directory *name* of *dir*, where `%p` is expanded
      to the process id of the agent, `%h` to a hash value unique to the
      process, and `%%` to `%` (default: a fresh, private directory
      below the system temporary directory). A missing *dir* is created
      private to the current user, while an existing *dir* has to be a
      directory (no symbolic link) owned by the current user.

    - \[`-m`|`--mode` *mode*\]: The mode of the agent (default:
      `phase`): `phase` researches and grounds the plans of the tasks
      explicitly assigned to the researcher in `DRAFTED`,
      while `request` researches the topics of the `research` requests
      of the tasks in any task lifecycle model. An invalid mode is an
      error. The built-in values of the following options are given per
      mode where they differ, and in the mode `request`, the options for
      `phase` only (`--unclaimed`, `--state-`\*, `--tag-success`,
      `--tag-failure`, `--tag-retry`, `--assign-required`, and
      `--attach-skip`) are not allowed.

    - \[`--title` *text*\]: The one-line title of the operation of the
      agent (at most 80 characters), shown on the task boards. Built-in:
      `Research and ground the plans of assigned tasks` (mode `phase`)
      resp. `Research topics for tasks on request` (mode `request`).

    - \[`--description` *text*\]: The brief description of the operation
      of the agent (about 3-6 lines, at most 600 characters, with its
      whitespace collapsed), shown on the task boards. Built-in: a
      description of the operation of the mode.

    - \[`--type` `phase`|`request`\]: The processing type: `phase`
      claims the tasks by their lifecycle status, `request` processes
      the prompt requests attached to the tasks. Generic default:
      `phase`. Built-in: `phase` (mode `phase`) resp. `request` (mode
      `request`).

    - \[`--workdir` *kind*\]: The working directory of the agent tool:
      `project`, `source`, `changeset`, `changeset-read`, or `target`.
      Generic default: `project`. Built-in: `source`.

    - \[`--lifecycle` *model*\]: A supported task lifecycle model
      (`solo`, `team`, or `enterprise`, repeatable). Generic default:
      every model containing all given states, resp. all models for
      `request` and with `--unclaimed`. Built-in: `enterprise` (mode
      `phase`) resp. not set (mode `request`). Hence, all task lifecycle
      models are supported in the mode `request`.

    - \[`--serial`\]: Process the tasks serially only, ignoring
      `--parallel`. Built-in: not set.

    - \[`--unclaimed`\]: Process the tasks of the incoming states
      without claiming them (`phase` only). Built-in: not set.

    - \[`-M`|`--model` *model*\]: The model of the agent tool: a model
      for all tasks, or comma-separated *size*`=`*model* pairs per
      `Effort:` size (`XS`, `S`, `M`, `L`, `XL`, or `*` for all other
      tasks), see `ase-agent-adhoc`(1). Generic default: the default
      model of the agent tool. Built-in: none.

    - \[`--params` *name*`=`*value*\]: The value of a parameter
      declared by the definition (repeatable). Built-in: none declared.

    - \[`--state-incoming` *state*\]: A state of the tasks to claim
      (mandatory for `phase`, repeatable with `--unclaimed` or
      `--state-activity` only). Built-in: `DRAFTED` (mode `phase`).

    - \[`--state-activity` *state*\]: The state of a task during its
      processing. Built-in: `PLANNING` (mode `phase`).

    - \[`--state-success` *state*\], \[`--state-failure` *state*\]: The
      target state on success resp. failure, or `previous` for the
      incoming state of the claim. Built-in: `DRAFTED` (mode `phase`).

    - \[`--state-phase` *state*\]: The phase success state. Built-in: not
      set (mode `phase`), hence `DRAFTED`.

    - \[`--state-passed` *state*\]: The first state from which on a task
      has passed the phase for its `After:` successors. Built-in: not
      set (mode `phase`), hence `DRAFTED`, the first state, so the
      predecessors impose no gate.

    - \[`--tag-name` *tag*\]: The tag of the processed tasks
      (`ase-agent-`*word*). Generic default: `ase-agent-`*name*, resp.
      for `request` always `ase-agent-`*request-name*. Built-in: not set
      (mode `phase`, hence `ase-agent-researcher`) resp.
      `ase-agent-research` (mode `request`, derived from the request
      name `research`).

    - \[`--tag-success` *tag*\], \[`--tag-failure` *tag*\]: The tag on
      success resp. failure (`phase` only). Built-in: `none` (mode
      `phase`), as the unassignment of a processed task keeps it from
      being claimed again.

    - \[`--tag-require` *tag*\]: A tag a claimable task has to carry
      (repeatable). Built-in: not set.

    - \[`--tag-exclude` *tag*\]: A tag a claimable task must not carry
      (repeatable). Built-in: not set.

    - \[`--assign-name` *who*\]: The assignee under which the tasks are
      claimed, held, recognized, and released, and which names the
      agent-owned worktrees. Generic default: the agent name. Built-in:
      not set.

    - \[`--assign-required`\]: Claim only the tasks explicitly assigned
      to *who* of `--assign-name` (`phase` only). Built-in: enabled
      (mode `phase`).

    - \[`--assign-success` *who*\]: The assignee of a task after its
      successful processing: a name, `none`, or `previous`. Generic
      default: `none` for `phase`, `previous` for `request`. Built-in:
      not set.

    - \[`--assign-failure` *who*\]: The assignee of a task after its
      failed processing: a name, `none`, or `previous`. Generic default:
      `none` for `phase`, `previous` for `request`. Built-in: not set.

    - \[`--request-name` *name*\]: The name of the processed requests
      (`request` only). Generic default: the agent name. Built-in:
      `research` (mode `request`).

    - \[`--request-done` *word*\]: The word naming a processed task in
      the log lines (`request` only). Generic default: `processed`.
      Built-in: `researched` (mode `request`).

    - \[`--prompt-skill` *name*\]: The skill to invoke (mutually
      exclusive with `--prompt-text` and `--prompt-file`). Built-in:
      `ase-task-research`.

    - \[`--prompt-args` *template*\]: The argument template of the
      skill. Generic default: `{id}` for `phase`, `{id}: {prompt}` for
      `request`. Built-in: `--refine{?source-dir: --int-source-dir
      "{source-dir}"} {id}` (mode `phase`) resp. `--refine{?source-dir:
      --int-source-dir "{source-dir}"} {id}:{?prompt: {prompt}}` (mode
      `request`), where the conditional `{?prompt:...}` makes the prompt
      optional.

    - \[`--prompt-text` *template*\]: The prompt text template to invoke
      instead of a skill. Built-in: not set.

    - \[`--prompt-file` *file*\]: The file with the prompt text template
      to invoke instead of a skill. Built-in: not set.

    - \[`--prepare-run` *cmd*\]: A shell command run in the working
      directory before the prompt (repeatable). Built-in: not set.

    - \[`--success-criterion` *criterion*\]: A success criterion:
      `exit`, `clean`, `changed`, `verdict`, `attachment`, or `status`
      (repeatable). Generic default: `exit` and `clean` for `phase`,
      `clean` and `changed` for `request`. Built-in: `exit`, `clean`,
      and `attachment`.

    - \[`--success-match` *regex*\]: A regular expression an output line
      has to match (repeatable). Built-in: `status:\W*research
      attached\b`.

    - \[`--verdict-label` *label*\]: The label after which the verdict
      is given in the output. Built-in: not set.

    - \[`--verdict-allow` *VERDICT*\]: An accepted verdict (repeatable).
      Generic default: the verdicts of `--state-verdict`, else any.
      Built-in: not set.

    - \[`--attach-output` *kind*\]: The kind of the attachment storing
      the output lines of the prompt. Built-in: not set.

    - \[`--attach-expect` *spec*\]: The attachment
      \[*mime-type*`;`\]*kind* to be created or changed by the
      processing for the success criterion `attachment`. Built-in:
      `text/markdown;research`.

    - \[`--finish-success` *cmd*\]: A shell command run in the working
      directory after a successful processing. Built-in: not set.

    - \[`--finish-failure` *cmd*\]: A shell command run in the working
      directory after a failed processing. Built-in: not set.

    - \[`-f`|`--foreground`\]: Run the agent in the current process
      instead, logging to the terminal, until it is interrupted (e.g.,
      via `CTRL+C`) or stopped, where an agent of the same name already
      running is an error.

    - \[`-h`|`--help`\]: Show the usage information of the sub-command
      only.

  The options `--`*group*`-`*item* above override the built-in
  definition of the mode of the agent (where an option also replaces its
  mutually exclusive alternatives, e.g., `--prompt-text` replaces the
  skill of `--prompt-skill`), while the agent keeps the identity of its
  kind (its runs, its presence, and its agent-owned worktrees are named
  after `researcher`). See `ase-agent-adhoc`(1) for their full
  semantics.

- `ase agent researcher status` \[`-n`|`--name` *name*\]: Report whether
  the researcher agent of the name *name* (default: `researcher`) is
  running, as `agent` *name*`: running (pid` *pid*`)` resp. `agent`
  *name*`: not running` (exit status 1).

- `ase agent researcher log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\]
  \[`--name` *name*\]: Show the log `.ase/agent/`*name*`.log` of the
  researcher agent of the name *name* (default: `researcher`) run in the
  background, where an agent of a fleet logs into the log of the fleet
  instead (see `ase-agent-fleet`(1)). Without a log file, an
  informational message is shown only. The options are:

    - \[`-f`|`--follow`\]: Show the last *n* lines (default: 10) and
      then follow all newly appended lines, in the style of `tail -f`,
      until interrupted.

    - \[`-n`|`--lines` *n*\]: Show the last *n* lines only (default:
      all, or 10 with `--follow`).

    - \[`--name` *name*\]: The name of the agent (default: `researcher`),
      given in its long form only, as `-n` is the short form of
      `--lines`.

- `ase agent researcher stop` \[`-n`|`--name` *name*\]: Stop the
  researcher agent of the name *name* (default: `researcher`) by
  `SIGTERM`, waiting (up to 5 minutes) until it aborted its running
  processings and put their tasks back. An agent not running is reported
  informationally only.

## ENVIRONMENT

- `ASE_TOOL`: The default agent tool of `--tool` (default: `claude`).

- `ASE_AGENT_RELAY_TOKEN`: The bearer token of the agent relay, if not
  embedded in the URL of `--agent-relay` resp. `project.relay.url`.

- `ASE_HEADLESS`: Set to `true` for the agent tool processes spawned by
  the agent.

## FILES

- `.ase/agent/`*name*`.yaml`: The process state (kind, process id, and
  process start time) of the agent, existing while it runs.

- `.ase/agent/`*name*`.log`: The log of the agent run in the background.

- `.ase/worktree/.temp/`*id*`-researcher`: The temporary, detached Git
  worktree of a `branch:` source of a task during its research (where a
  `#` of the task id is replaced by `_`).

- *per-user state
  directory*`/agent-researcher/`*store-hash*`/`*run-id*`.lock` and
  `.json`: The run lock and the run record of each researcher agent
  process, used to recover the research requests of terminated agent
  processes (see **INTERRUPTS AND RECOVERY** in `ase-agent`(1)).

## EXIT STATUS

`ase agent researcher start` exits with status `0` once the agent
started (or was already running), resp. once a foreground agent
terminated regularly, and with status `1` on any error (e.g., an invalid
option, a task lifecycle model other than `enterprise` in the mode
`phase`, or a missing agent tool). `ase agent researcher status` exits
with status `1` if the agent is not running.

## EXAMPLES

```sh
# research and ground the plans of the tasks assigned to the researcher
$ ase agent researcher start

# request the research of a drafted task by assigning it to the researcher
$ ase task assign FOO-42 researcher

# process the research requests of the task board
$ ase agent researcher start -n researcher-request -m request

# request a research of a topic for a task from the command line
$ ase task request FOO-42 research "streaming JSON serialization of large data sets"

# request a research of the task plan itself (without a topic)
$ ase task request FOO-42 research
```

## SEE ALSO

`ase`(1), `ase-agent`(1), `ase-agent-rebooter`(1),
`ase-agent-condenser`(1), `ase-agent-implementer`(1), `ase-agent-qualifier`(1),
`ase-agent-integrator`(1), `ase-agent-editor`(1),
`ase-agent-estimator`(1), `ase-task-request`(1), `ase-agent-adhoc`(1),
`ase-agent-fleet`(1), `ase-agent-relay`(1), `ase-task`(1),
`ase-task-board`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

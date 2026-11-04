# ase-agent-estimator(1) -- Effort Estimation Agent

## SYNOPSIS

`ase agent estimator start`
\[`-n`|`--name` *name*\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]
\[`-p`|`--parallel` *num*\]
\[`-T`|`--timeout` *duration*\]
\[`-o`|`--one-shot`\]
\[`--agent-relay` *url*\]
\[`-m`|`--mode` `phase`|`request`\]
\[`-M`|`--model` *model*\]
\[`--`*group*`-`*item* *value* \[...\]\]
\[`-f`|`--foreground`\]

`ase agent estimator status`
\[`-n`|`--name` *name*\]

`ase agent estimator log`
\[`-f`|`--follow`\]
\[`-n`|`--lines` *n*\]
\[`--name` *name*\]

`ase agent estimator stop`
\[`-n`|`--name` *name*\]

## DESCRIPTION

**ase agent estimator** estimates the effort of tasks, i.e., it stores
the expected human time of a task as a T-shirt size in its `Effort:`
frontmatter key (see the skill `ase-task-estimate`). Unlike the phase
agents, it drives no phase and supports all task lifecycle models
(`solo`, `team`, and `enterprise`). It runs in one of two modes (see
`--mode`): the mode `phase` (the default) estimates the unestimated
planned tasks automatically and is intended for the *final* estimation
of the tasks, once their plans are complete, while the mode `request`
(re-)estimates the tasks in any unfinished status on request and is
intended for *dry-runs*, i.e., provisional estimations of plans still
in progress.

In the mode `phase`, the estimator observes the tasks in the state `PLANNED`, adapted onto
the task lifecycle model of the project, i.e., `PLANNED` for
`enterprise`, `PLANNING` for `team`, and `OPEN` for `solo` (see
`--state-incoming`), which do not carry its tag `ase-agent-estimator`
yet, independent of their `Assignee:` and their `After:` predecessors.
Of these, it processes every task which carries no valid `Effort:` key
yet, whose plan is not empty, and which is no explicit epic (a task
whose `Group:` is its own id, as its effort is the sum of the efforts
of its members).

The estimator processes each such task *unclaimed* (see
`--unclaimed`): it neither moves the task into an activity state, nor
tags it as active, nor assigns it to itself, and it never changes its
status or its assignee. Hence, it keeps no other agent and no human off
the task. However, the built-in `implementer` by default waits with a
`PLANNED` task until the estimator is done with it (see its parameter
`effort-wait` in `ase-agent-implementer`(1)), so with both agents
running, the tasks are estimated before their implementation. An agent
of the kind `estimator` does not pick up a task already processed by
another one on the same host.

It estimates the effort via the skill invocation `ase-task-estimate`
*id*, which writes just the `Effort:` key in a conditional save, i.e.,
only if the plan was not changed meanwhile (re-estimating the task
otherwise), so a concurrent change of the task by another agent or a
human is never lost. It writes neither the `Status:` nor the
`Modified:` key of the task.

The estimation succeeds only if the agent tool succeeded, the skill
reported no error, and the task afterwards carries a valid `Effort:`
key. A successfully estimated task is left untagged, as its valid
`Effort:` key itself keeps it from being estimated again, until its
plan content changes, which drops its then stale `Effort:` key, so it
is estimated again. A task not estimated is tagged with
`ase-agent-estimator` instead, so it is not processed again and again
(removing this tag requests another estimation).

In the mode `request`, the estimator instead processes the `estimate`
requests attached to tasks in any lifecycle status except a finished
one (e.g., `DRAFTED`, which the mode `phase` never picks up), as
requested via `ase task request` *id* `estimate` (see
`ase-task-request`(1)) resp. key `R` of the task boards, where a
prompt is ignored and hence may be empty. Like the request
agent `editor` (see `ase-agent-editor`(1)), it claims such a task by
tagging it with `ase-agent-estimate:active` and assigning it to itself
(deferring a task in an activity status until it changes), estimates
its effort via the skill invocation `ase-task-estimate --force` *id*,
i.e., even if it already carries a valid `Effort:` key, restores its
previous assignee, and removes the request on success, else turns it
into a failed request (to be re-requested). The estimation succeeds
under the same conditions as in the mode `phase`, so a request for an
explicit epic or a task with an empty plan fails.

Both modes can run side by side as two agents of the kind `estimator`
under different names (e.g., `estimator` and `estimator-request`).

On an interrupt, a task being processed in the mode `phase` is left
untouched, while the request of a task being processed in the mode
`request` is turned back into a pending one. The
estimator works in the project root only, so it neither requires a Git
working copy nor `git`, and it accepts no `--repo` and `--tempdir`. See
`ase-agent`(1) for the common mechanics of all agents.

## OPTIONS

- \[`-h`|`--help`\]: Show usage information of `ase agent estimator`
  (or of the given sub-command) only.

All other options belong to the sub-commands (see **COMMANDS**).

## COMMANDS

- `ase agent estimator start` \[*options*\]: Start the estimator agent
  in the background, logging into `.ase/agent/`*name*`.log`. The agent
  is validated and initialized (e.g., its agent tool is looked up)
  before the command returns (waiting up to 30 seconds), so a failing
  agent is reported together with the tail of its log. An agent of the
  same name already running is left alone. The options are:

    - \[`-n`|`--name` *name*\]: The name of the agent (default:
      `estimator`): up to 64 letters, digits, underscores, and dashes,
      starting with a letter or digit, other than the name of another
      agent kind, `relay`, or `fleet`.

      It names the agent in its log lines (also in the shared processing
      log attachment `agent`), and its process files
      `.ase/agent/`*name*`.yaml` and `.ase/agent/`*name*`.log`. Agents
      of the kind `estimator` under different names form a pool,
      competing for the same tasks and processing them in parallel to
      each other.

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
      See **AGENT RELAY** in `ase-agent`(1).

    - \[`-m`|`--mode` *mode*\]: The mode of the agent (default:
      `phase`): `phase` estimates the unestimated tasks in `PLANNED`
      automatically and unclaimed (intended for the final estimation),
      while `request` (re-)estimates the tasks of the `estimate`
      requests in any unfinished status (intended for dry-runs). An
      invalid mode is an error. The built-in values of the following
      options are given per mode where they differ, and in the mode
      `request`, the options for `phase` only (`--unclaimed`,
      `--state-`\*, `--tag-success`, `--tag-failure`, `--tag-retry`,
      `--assign-required`, and `--attach-skip`) are not allowed.

    - \[`--title` *text*\]: The one-line title of the operation of the
      agent (at most 80 characters), shown on the task boards. Built-in:
      `Estimate the effort of unestimated planned tasks` (`phase`) resp.
      `Re-estimate the effort of tasks on request` (`request`).

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
      Generic default: `project`. Built-in: `project`.

    - \[`--lifecycle` *model*\]: A supported task lifecycle model
      (`solo`, `team`, or `enterprise`, repeatable). Generic default:
      every model containing all given states, resp. all models for
      `request` and with `--unclaimed`. Built-in: not set. Hence, all
      task lifecycle models are supported.

    - \[`--serial`\]: Process the tasks serially only, ignoring
      `--parallel`. Built-in: not set.

    - \[`--unclaimed`\]: Process the tasks of the incoming states
      without claiming them, independent of their assignee and
      predecessors, and without ever changing their status and assignee
      (`phase` only). Built-in: enabled (mode `phase`) resp. not set
      (mode `request`).

    - \[`-M`|`--model` *model*\]: The model of the agent tool: a model
      for all tasks, or comma-separated *size*`=`*model* pairs per
      `Effort:` size (`XS`, `S`, `M`, `L`, `XL`, or `*` for all other
      tasks), see `ase-agent-adhoc`(1). Generic default: the default
      model of the agent tool. Built-in: none.

    - \[`--params` *name*`=`*value*\]: The value of a parameter
      declared by the definition (repeatable). Built-in: none declared.

    - \[`--state-incoming` *state*\]: The state of the tasks to process
      (mandatory for `phase`, repeatable with `--unclaimed` only), where
      each state is adapted onto the task lifecycle model of the project.
      Built-in: `PLANNED` (i.e., `PLANNING` for `team` and `OPEN` for
      `solo`) (mode `phase`) resp. not set (mode `request`). For
      instance, `--state-incoming DRAFTED --state-incoming PLANNED`
      additionally estimates the drafted tasks of the `enterprise`
      model in the mode `phase`.

    - \[`--state-activity` *state*\]: The state of a task during its
      processing. Generic default: the incoming state. Built-in: not
      set. Not allowed, as the estimator processes the tasks unclaimed.

    - \[`--state-success` *state*\]: The target state on success.
      Generic default: the incoming state. Built-in: not set. Not
      allowed, as the estimator processes the tasks unclaimed.

    - \[`--state-failure` *state*\]: The target state on failure.
      Generic default: the incoming state. Built-in: not set. Not
      allowed, as the estimator processes the tasks unclaimed.

    - \[`--state-phase` *state*\]: The phase success state, into which
      the skill itself can move a task. Generic default: the success
      state. Built-in: not set. Not allowed, as the estimator processes
      the tasks unclaimed.

    - \[`--state-passed` *state*\]: The first state from which on a task
      has passed the phase for its `After:` successors. Generic default:
      the phase success state. Built-in: not set. Not allowed, as the
      estimator processes the tasks unclaimed.

    - \[`--state-verdict` *VERDICT*`=`*state*\]: The target state per
      verdict (repeatable). Built-in: not set. Not allowed, as the
      estimator processes the tasks unclaimed.

    - \[`--tag-name` *tag*\]: The tag of the processed tasks
      (`ase-agent-`*word*). Generic default: `ase-agent-`*name*, resp.
      for `request` always `ase-agent-`*request-name*. Built-in:
      `ase-agent-estimator` (mode `phase`) resp. `ase-agent-estimate`
      (mode `request`).

    - \[`--tag-success` *tag*\]: The tag on success: *tag-name*,
      *tag-name*`:`*value*, or `none` (`phase` only). Generic default:
      *tag-name*. Built-in: `none` (mode `phase`), as the valid
      `Effort:` key of an estimated task keeps it from being estimated
      again, resp. not set (mode `request`).

    - \[`--tag-failure` *tag*\]: The tag on failure: *tag-name*,
      *tag-name*`:`*value*, or `none` (`phase` only). Generic default:
      *tag-name*. Built-in: not set.

    - \[`--tag-require` *tag*\]: A tag a claimable task has to carry
      (repeatable). Built-in: not set.

    - \[`--tag-exclude` *tag*\]: A tag a claimable task must not carry
      (repeatable). Built-in: not set.

    - \[`--tag-retry`\]: A shorthand for `--tag-failure none`, so a
      failed task is processed again after a growing delay (`phase`
      only). Built-in: not set.

    - \[`--assign-name` *who*\]: The assignee under which the tasks are
      claimed, held, recognized, and released, and which names the
      agent-owned worktrees. Generic default: the agent name. Built-in:
      not set. As the estimator never assigns a task in the mode
      `phase`, it then names the mode of the agent as announced to the
      agent relay only.

    - \[`--assign-required`\]: Claim only the tasks explicitly assigned
      to *who* of `--assign-name` (`phase` only). Built-in: not set. Not
      allowed, as the estimator processes the tasks unclaimed.

    - \[`--assign-success` *who*\]: The assignee of a task after its
      successful processing: a name, `none`, or `previous`. Generic
      default: `none` for `phase`, `previous` for `request`. Built-in:
      not set. Not allowed in the mode `phase`, as the estimator then
      processes the tasks unclaimed.

    - \[`--assign-failure` *who*\]: The assignee of a task after its
      failed processing: a name, `none`, or `previous`. Generic default:
      `none` for `phase`, `previous` for `request`. Built-in: not set.
      Not allowed in the mode `phase`, as the estimator then processes
      the tasks unclaimed.

    - \[`--request-name` *name*\]: The name of the processed requests
      (`request` only). Generic default: the agent name. Built-in: not
      set (mode `phase`) resp. `estimate` (mode `request`).

    - \[`--request-done` *word*\]: The word naming a processed task in
      the log lines (`request` only). Generic default: `processed`.
      Built-in: not set (mode `phase`) resp. `estimated` (mode
      `request`).

    - \[`--prompt-skill` *name*\]: The skill to invoke (mutually
      exclusive with `--prompt-text` and `--prompt-file`). Built-in:
      `ase-task-estimate`.

    - \[`--prompt-args` *template*\]: The argument template of the
      skill. Generic default: `{id}` for `phase`, `{id}: {prompt}` for
      `request`. Built-in: `{id}` (mode `phase`) resp. `--force {id}`
      (mode `request`), the latter ignoring the request prompt.

    - \[`--prompt-text` *template*\]: The prompt text template to invoke
      instead of a skill. Built-in: not set.

    - \[`--prompt-file` *file*\]: The file with the prompt text template
      to invoke instead of a skill. Built-in: not set.

    - \[`--prepare-run` *cmd*\]: A shell command run in the working
      directory before the prompt (repeatable). Built-in: not set.

    - \[`--success-criterion` *criterion*\]: A success criterion:
      `exit`, `clean`, `changed`, `verdict`, `attachment`, or `status`
      (repeatable). Generic default: `exit` and `clean` for `phase`,
      `clean` and `changed` for `request`. Built-in: `exit` and
      `clean` (in both modes, as a re-estimation of the same size leaves
      the plan content unchanged), where additionally the task has to
      carry a valid `Effort:` key afterwards.

    - \[`--success-match` *regex*\]: A regular expression an output line
      has to match (repeatable). Built-in: not set.

    - \[`--verdict-label` *label*\]: The label after which the verdict
      is given in the output. Built-in: not set.

    - \[`--verdict-allow` *VERDICT*\]: An accepted verdict (repeatable).
      Generic default: the verdicts of `--state-verdict`, else any.
      Built-in: not set.

    - \[`--attach-output` *kind*\]: The kind of the attachment storing
      the output lines of the prompt. Built-in: not set.

    - \[`--attach-expect` *spec*\]: The attachment
      \[*mime-type*`;`\]*kind* to be created or changed by the
      processing for the success criterion `attachment`. Built-in: not
      set.

    - \[`--attach-skip` *spec*\]: The attachment
      \[*mime-type*`;`\]*kind* leaving a task unclaimed (`phase` only).
      Built-in: not set.

    - \[`--attach-changeset` *kind*\]: The kind of the attachment
      `text/x-diff;`*kind* storing the change set snapshot of the task
      (with `--workdir changeset` or `target` only). Built-in: not set.
      Not allowed, as the estimator works in the project root.

    - \[`--finish-commit`\]: Commit the work onto a `branch:` changeset
      and publish it (with `--workdir changeset` only). Built-in: not
      set. Not allowed, as the estimator works in the project root.

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
  definition of the agent (where an option also replaces its mutually
  exclusive alternatives, e.g., `--prompt-text` replaces the skill of
  `--prompt-skill`), while the agent keeps the identity of its kind (its
  runs and its presence are named after `estimator`). See
  `ase-agent-adhoc`(1) for their full semantics.

- `ase agent estimator status` \[`-n`|`--name` *name*\]: Report whether
  the estimator agent of the name *name* (default: `estimator`) is
  running, as `agent` *name*`: running (pid` *pid*`)` resp. `agent`
  *name*`: not running` (exit status 1).

- `ase agent estimator log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\]
  \[`--name` *name*\]: Show the log `.ase/agent/`*name*`.log` of the
  estimator agent of the name *name* (default: `estimator`) run in the
  background, where an agent of a fleet logs into the log of the fleet
  instead (see `ase-agent-fleet`(1)). Without a log file, an
  informational message is shown only. The options are:

    - \[`-f`|`--follow`\]: Show the last *n* lines (default: 10) and
      then follow all newly appended lines, in the style of `tail -f`,
      until interrupted.

    - \[`-n`|`--lines` *n*\]: Show the last *n* lines only (default:
      all, or 10 with `--follow`).

    - \[`--name` *name*\]: The name of the agent (default:
      `estimator`), given in its long form only, as `-n` is the short
      form of `--lines`.

- `ase agent estimator stop` \[`-n`|`--name` *name*\]: Stop the
  estimator agent of the name *name* (default: `estimator`) by
  `SIGTERM`, waiting (up to 5 minutes) until it aborted its running
  processings. An agent not running is reported informationally only.

## CONFIGURATION

The estimation itself is configured by the keys
`project.task.effort.scale`, `project.task.effort.factor`,
`project.task.effort.file`, `project.task.effort.line`, and
`project.task.effort.iteration` of the skill
`ase-task-estimate` (see `ase-config`(1)).

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

- *per-user state
  directory*`/agent-estimator/`*store-hash*`/`*run-id*`.lock` and
  `.json`: The run lock and the run record of each estimator agent
  process, which records the tasks it currently processes, so no other
  agent of the kind `estimator` on the same host picks them up.

## EXIT STATUS

`ase agent estimator start` exits with status `0` once the agent
started (or was already running), resp. once a foreground agent
terminated regularly, and with status `1` on any error (e.g., an
invalid option or a missing agent tool). `ase agent estimator status`
exits with status `1` if the agent is not running.

## EXAMPLES

```sh
# start the estimator, estimating the planned tasks without a valid effort
$ ase agent estimator start

# estimate all drafted and planned tasks once, e.g., in a CI context
$ ase agent estimator start -f -o --state-incoming DRAFTED --state-incoming PLANNED

# start a second estimator of another agent tool as a pool
$ ase agent estimator start -n estimator-codex -t codex

# additionally start an estimator processing the "estimate" requests,
# and request the (re-)estimation of a drafted task
$ ase agent estimator start -n estimator-request -m request
$ ase task request example-task estimate re-estimate
```

## SEE ALSO

`ase`(1), `ase-agent`(1), `ase-agent-rebooter`(1),
`ase-agent-condenser`(1), `ase-agent-researcher`(1),
`ase-agent-implementer`(1), `ase-agent-qualifier`(1),
`ase-agent-integrator`(1), `ase-agent-editor`(1), `ase-agent-adhoc`(1),
`ase-agent-fleet`(1), `ase-agent-relay`(1), `ase-task`(1),
`ase-task-board`(1), `ase-config`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

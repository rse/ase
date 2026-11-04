# ase-agent-rebooter(1) -- Plan Rebooting Agent

## SYNOPSIS

`ase agent rebooter start`
\[`-n`|`--name` *name*\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]
\[`-p`|`--parallel` *num*\]
\[`-T`|`--timeout` *duration*\]
\[`-o`|`--one-shot`\]
\[`--agent-relay` *url*\]
\[`-M`|`--model` *model*\]
\[`--`*group*`-`*item* *value* \[...\]\]
\[`-f`|`--foreground`\]

`ase agent rebooter status`
\[`-n`|`--name` *name*\]

`ase agent rebooter log`
\[`-f`|`--follow`\]
\[`-n`|`--lines` *n*\]
\[`--name` *name*\]

`ase agent rebooter stop`
\[`-n`|`--name` *name*\]

## DESCRIPTION

**ase agent rebooter** re-creates the plans of tasks in the `Planning`
phase of the `enterprise` task lifecycle model (refused for any other
model) from scratch.

As a plan is re-created only on the explicit request of a human, the
rebooter claims only the tasks in the state `DRAFTED` whose `Assignee:`
frontmatter key already is its agent name (default: `rebooter`), i.e.,
which a human assigned to the rebooter. Such a task is claimed
immediately, without waiting for its `After:` predecessors (and, for an
explicit epic, its group members), except for a predecessor still being
processed by a rebooter or a cancelled `After:` predecessor.

The rebooter moves each claimed task into `PLANNING`, tags it with
`ase-agent-rebooter:active`, and reboots its plan via the skill
invocation `ase-task-reboot --next DONE` *id*. The skill itself resets a
successfully rebooted plan into `DRAFTED` (the processing succeeds only
then). Afterwards, on success as well as on failure, the rebooter puts
the task back into `DRAFTED` (for its review and its promotion into
`PLANNED` by a human), removes its tag, and unassigns it. As the task is
no longer assigned to the rebooter, it is not claimed again, while
assigning it to the rebooter again requests another reboot.

On an interrupt, a task being processed is put back, untagged and with
its previous assignee (i.e., still assigned to the rebooter), into
`DRAFTED`. The rebooter works in the project root only, so it
neither requires a Git working copy nor `git`, and it accepts no
`--repo` and `--tempdir`. See `ase-agent`(1) for the common mechanics of
all agents.

## OPTIONS

- \[`-h`|`--help`\]: Show usage information of `ase agent rebooter` (or
  of the given sub-command) only.

All other options belong to the sub-commands (see **COMMANDS**).

## COMMANDS

- `ase agent rebooter start` \[*options*\]: Start the rebooter agent in
  the background, logging into `.ase/agent/`*name*`.log`. The agent is
  validated and initialized (e.g., its agent tool is looked up and the
  task lifecycle model is checked) before the command returns (waiting
  up to 30 seconds), so a failing agent is reported together with the
  tail of its log. An agent of the same name already running is left
  alone. The options are:

    - \[`-n`|`--name` *name*\]: The name of the agent (default:
      `rebooter`): up to 64 letters, digits, underscores, and dashes,
      starting with a letter or digit, other than the name of another
      agent kind, `relay`, or `fleet`.

      It names the agent in its log lines (also in the shared processing
      log attachment `agent`), the `Assignee:` of the tasks it
      processes, and its process files `.ase/agent/`*name*`.yaml` and
      `.ase/agent/`*name*`.log`. Agents of the kind `rebooter` under
      different names form a pool, competing for the same tasks, but each
      claims only the tasks explicitly assigned to its own name.

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
      fleet. A task still waiting for its predecessors at that time is
      left for a later run. A check of the task store failing three
      times in a row then terminates the agent with a non-zero exit
      status (instead of being retried endlessly after a growing delay).

    - \[`--agent-relay` *url*\]: The agent relay to pass the live
      presence of the agent to, as `ase://`*addr*`:`*port*\[`/`*token*\]
      resp. `ases://`*addr*`:`*port*\[`/`*token*\]\[`?insecure`\] for
      HTTPS (default: the configured `project.relay.url`, else none).
      See **AGENT RELAY** in `ase-agent`(1).

    - \[`--title` *text*\]: The one-line title of the operation of the
      agent (at most 80 characters), shown on the task boards. Built-in:
      `Reboot the plans of assigned tasks`.

    - \[`--description` *text*\]: The brief description of the operation
      of the agent (about 3-6 lines, at most 600 characters, with its
      whitespace collapsed), shown on the task boards. Built-in: a
      description of the operation.

    - \[`--type` `phase`|`request`\]: The processing type: `phase`
      claims the tasks by their lifecycle status, `request` processes
      the prompt requests attached to the tasks. Generic default:
      `phase`. Built-in: `phase`.

    - \[`--workdir` *kind*\]: The working directory of the agent tool:
      `project`, `source`, `changeset`, `changeset-read`, or `target`.
      Generic default: `project`. Built-in: `project`.

    - \[`--lifecycle` *model*\]: A supported task lifecycle model
      (`solo`, `team`, or `enterprise`, repeatable). Generic default:
      every model containing all given states, resp. all models for
      `request` and with `--unclaimed`. Built-in: `enterprise`.

    - \[`--serial`\]: Process the tasks serially only, ignoring
      `--parallel`. Built-in: not set.

    - \[`--unclaimed`\]: Process the tasks of the incoming states
      without claiming them, independent of their assignee and
      predecessors, and without ever changing their status and assignee
      (`phase` only). Built-in: not set. Not allowed, as the rebooter
      claims the tasks into its activity state.

    - \[`-M`|`--model` *model*\]: The model of the agent tool: a model
      for all tasks, or comma-separated *size*`=`*model* pairs per
      `Effort:` size (`XS`, `S`, `M`, `L`, `XL`, or `*` for all other
      tasks), see `ase-agent-adhoc`(1). Generic default: the default
      model of the agent tool. Built-in: none.

    - \[`--params` *name*`=`*value*\]: The value of a parameter
      declared by the definition (repeatable). Built-in: none declared.

    - \[`--state-incoming` *state*\]: A state of the tasks to claim
      (mandatory for `phase`, repeatable with `--unclaimed` or
      `--state-activity` only). Built-in: `DRAFTED`.

    - \[`--state-activity` *state*\]: The state of a task during its
      processing. Generic default: the incoming state. Built-in:
      `PLANNING`.

    - \[`--state-success` *state*\]: The target state on success, or
      `previous` for the incoming state of the claim. Generic default:
      the incoming state. Built-in: `DRAFTED`.

    - \[`--state-failure` *state*\]: The target state on failure, or
      `previous` for the incoming state of the claim. Generic default:
      the incoming state. Built-in: `DRAFTED`.

    - \[`--state-phase` *state*\]: The phase success state, into which
      the skill itself can move a task. Generic default: the success
      state, resp. the activity state for a `previous` success state.
      Built-in: not set (hence `DRAFTED`, the default state, into which
      the skill resets a rebooted plan).

    - \[`--state-passed` *state*\]: The first state from which on a task
      has passed the phase for its `After:` successors. Generic default:
      the phase success state. Built-in: not set (hence `DRAFTED`, the
      first state, so the predecessors impose no gate).

    - \[`--state-verdict` *VERDICT*`=`*state*\]: The target state per
      verdict (repeatable). Built-in: not set.

    - \[`--tag-name` *tag*\]: The tag of the processed tasks
      (`ase-agent-`*word*). Generic default: `ase-agent-`*name*, resp.
      for `request` always `ase-agent-`*request-name*. Built-in: not set.

    - \[`--tag-success` *tag*\]: The tag on success: *tag-name*,
      *tag-name*`:`*value*, or `none` (`phase` only). Generic default:
      *tag-name*. Built-in: `none`.

    - \[`--tag-failure` *tag*\]: The tag on failure: *tag-name*,
      *tag-name*`:`*value*, or `none` (`phase` only). Generic default:
      *tag-name*. Built-in: `none`.

    - \[`--tag-require` *tag*\]: A tag a claimable task has to carry
      (repeatable). Built-in: not set.

    - \[`--tag-exclude` *tag*\]: A tag a claimable task must not carry
      (repeatable). Built-in: not set.

    - \[`--tag-retry`\]: A shorthand for `--tag-failure none`, so a
      failed task is claimed again after a growing delay (`phase` only).
      Built-in: not set.

    - \[`--assign-name` *who*\]: The assignee under which the tasks are
      claimed, held, recognized, and released, and which names the
      agent-owned worktrees. Generic default: the agent name. Built-in:
      not set.

    - \[`--assign-required`\]: Claim only the tasks explicitly assigned
      to *who* of `--assign-name` (`phase` only). Built-in: enabled.

    - \[`--assign-success` *who*\]: The assignee of a task after its
      successful processing: a name, `none`, or `previous`. Generic
      default: `none` for `phase`, `previous` for `request`. Built-in:
      not set.

    - \[`--assign-failure` *who*\]: The assignee of a task after its
      failed processing: a name, `none`, or `previous`. Generic default:
      `none` for `phase`, `previous` for `request`. Built-in: not set.

    - \[`--request-name` *name*\]: The name of the processed requests
      (`request` only). Generic default: the agent name. Built-in: not
      set. Not allowed, as the rebooter is of type `phase`.

    - \[`--request-done` *word*\]: The word naming a processed task in
      the log lines (`request` only). Generic default: `processed`.
      Built-in: not set. Not allowed, as the rebooter is of type `phase`.

    - \[`--prompt-skill` *name*\]: The skill to invoke (mutually
      exclusive with `--prompt-text` and `--prompt-file`). Built-in:
      `ase-task-reboot`.

    - \[`--prompt-args` *template*\]: The argument template of the
      skill. Generic default: `{id}` for `phase`, `{id}: {prompt}` for
      `request`. Built-in: `--next DONE {id}`.

    - \[`--prompt-text` *template*\]: The prompt text template to invoke
      instead of a skill. Built-in: not set.

    - \[`--prompt-file` *file*\]: The file with the prompt text template
      to invoke instead of a skill. Built-in: not set.

    - \[`--prepare-run` *cmd*\]: A shell command run in the working
      directory before the prompt (repeatable). Built-in: not set.

    - \[`--success-criterion` *criterion*\]: A success criterion:
      `exit`, `clean`, `changed`, `verdict`, `attachment`, or `status`
      (repeatable). Generic default: `exit` and `clean` for `phase`,
      `clean` and `changed` for `request`. Built-in: `status`.

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

    - \[`--finish-commit`\]: Commit the work onto a `branch:` changeset
      and publish it (with `--workdir changeset` only). Built-in: not
      set. Not allowed, as the rebooter works in the project root.

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
  runs, its presence, and its agent-owned worktrees are named after
  `rebooter`). See `ase-agent-adhoc`(1) for their full semantics.

- `ase agent rebooter status` \[`-n`|`--name` *name*\]: Report whether
  the rebooter agent of the name *name* (default: `rebooter`) is
  running, as `agent` *name*`: running (pid` *pid*`)` resp. `agent`
  *name*`: not running` (exit status 1).

- `ase agent rebooter log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\]
  \[`--name` *name*\]: Show the log `.ase/agent/`*name*`.log` of the
  rebooter agent of the name *name* (default: `rebooter`) run in the
  background, where an agent of a fleet logs into the log of the fleet
  instead (see `ase-agent-fleet`(1)). Without a log file, an
  informational message is shown only. The options are:

    - \[`-f`|`--follow`\]: Show the last *n* lines (default: 10) and
      then follow all newly appended lines, in the style of `tail -f`,
      until interrupted.

    - \[`-n`|`--lines` *n*\]: Show the last *n* lines only (default:
      all, or 10 with `--follow`).

    - \[`--name` *name*\]: The name of the agent (default: `rebooter`),
      given in its long form only, as `-n` is the short form of
      `--lines`.

- `ase agent rebooter stop` \[`-n`|`--name` *name*\]: Stop the rebooter
  agent of the name *name* (default: `rebooter`) by `SIGTERM`, waiting
  (up to 5 minutes) until it aborted its running processings and put
  their tasks back. An agent not running is reported informationally
  only.

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
  directory*`/agent-rebooter/`*store-hash*`/`*run-id*`.lock` and `.json`:
  The run lock and the run record of each rebooter agent process, used
  to recover the tasks of terminated agent processes (see **INTERRUPTS
  AND RECOVERY** in `ase-agent`(1)).

## EXIT STATUS

`ase agent rebooter start` exits with status `0` once the agent started
(or was already running), resp. once a foreground agent terminated
regularly, and with status `1` on any error (e.g., an invalid option, a
task lifecycle model other than `enterprise`, or a missing agent tool).
`ase agent rebooter status` exits with status `1` if the agent is not
running.

## EXAMPLES

```sh
# start the rebooter, rebooting the plans of the tasks assigned to it
$ ase agent rebooter start

# request the reboot of a drafted task by assigning it to the rebooter
$ ase task assign FOO-42 rebooter
```

## SEE ALSO

`ase`(1), `ase-agent`(1), `ase-agent-condenser`(1),
`ase-agent-researcher`(1), `ase-agent-implementer`(1),
`ase-agent-qualifier`(1), `ase-agent-integrator`(1),
`ase-agent-editor`(1), `ase-agent-estimator`(1), `ase-agent-adhoc`(1),
`ase-agent-fleet`(1), `ase-agent-relay`(1), `ase-task`(1),
`ase-task-board`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>


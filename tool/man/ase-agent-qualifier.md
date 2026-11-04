# ase-agent-qualifier(1) -- Qualification Phase Agent

## SYNOPSIS

`ase agent qualifier start`
\[`-n`|`--name` *name*\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]
\[`-p`|`--parallel` *num*\]
\[`-T`|`--timeout` *duration*\]
\[`-o`|`--one-shot`\]
\[`--agent-relay` *url*\]
\[`-r`|`--repo` *url*\]
\[`-d`|`--tempdir` *dir*\]
\[`-m`|`--mode` `judge`|`qualify`\]
\[`-M`|`--model` *model*\]
\[`--`*group*`-`*item* *value* \[...\]\]
\[`-f`|`--foreground`\]

`ase agent qualifier status`
\[`-n`|`--name` *name*\]

`ase agent qualifier log`
\[`-f`|`--follow`\]
\[`-n`|`--lines` *n*\]
\[`--name` *name*\]

`ase agent qualifier stop`
\[`-n`|`--name` *name*\]

## DESCRIPTION

**ase agent qualifier** drives the `Qualification` phase of the
`enterprise` task lifecycle model (refused for any other model).

It claims every task in the state `IMPLEMENTED` which is unassigned or
assigned to the agent, which does not carry any tag `ase-agent-qualifier`
yet (i.e., without its verdict yet, so a task already carrying a
verdict of the qualifier is never picked up again), and whose `After:`
predecessors (and, for an explicit epic, its group members) are
`QUALIFIED` or later, moves it into `QUALIFYING`, and reviews its
`Changeset:` (or the configured `project.task.default.changeset`) via
the skill `ase-repo-review`:

- `worktree`: The change set staged in its working copy, i.e., the Git
  worktree `.ase/worktree/`*id* of a parallel implementer if existing,
  else the working copy of the project.

- `branch:`*name*: The branch against its base, via `ase-repo-review
  --branch` *name*.

- `attachment:`*name*: The change set staged in a temporary Git
  worktree, detached at the `base` commit of the attachment and removed
  afterwards.

The verdict `APPROVE` resp. `REJECT` of the review (the last upper-case
word after the label `REVIEW VERDICT` in the output of the successfully
exited agent tool) is added as the tag `ase-agent-qualifier:approve`
resp. `ase-agent-qualifier:reject`, while a failed or skipped review,
which yields no verdict, adds the plain tag `ase-agent-qualifier`.

In the default mode `judge`, the task is then put back into `IMPLEMENTED`
for a human decision, while in mode `qualify`, it is put into `QUALIFIED`
on the verdict `APPROVE`, into `DECLINED` on the verdict `REJECT`, and
back into `IMPLEMENTED` without a verdict. In both modes, the task is
unassigned afterwards.

On an interrupt, a task being processed is put back, untagged and with
its previous assignee, into `IMPLEMENTED`. See `ase-agent`(1) for the
common mechanics of all agents.

## OPTIONS

- \[`-h`|`--help`\]: Show usage information of `ase agent qualifier` (or
  of the given sub-command) only.

All other options belong to the sub-commands (see **COMMANDS**).

## COMMANDS

- `ase agent qualifier start` \[*options*\]: Start the qualifier agent in
  the background, logging into `.ase/agent/`*name*`.log`. The agent is
  validated and initialized (e.g., its agent tool is looked up and the
  task lifecycle model is checked) before the command returns (waiting
  up to 30 seconds), so a failing agent is reported together with the
  tail of its log. An agent of the same name already running is left
  alone. The options are:

    - \[`-n`|`--name` *name*\]: The name of the agent (default:
      `qualifier`): up to 64 letters, digits, underscores, and dashes,
      starting with a letter or digit, other than the name of another
      agent kind, `relay`, or `fleet`. It names the agent in its log
      lines (also in the shared processing log attachment `agent`), the
      `Assignee:` of the tasks it processes, its temporary directory,
      and its process files `.ase/agent/`*name*`.yaml` and
      `.ase/agent/`*name*`.log`.

      Agents of the kind `qualifier` under different names form a pool,
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
      fleet. A task still waiting for its predecessors at that time is
      left for a later run. A check of the task store failing three
      times in a row then terminates the agent with a non-zero exit
      status (instead of being retried endlessly after a growing delay).

    - \[`--agent-relay` *url*\]: The agent relay to pass the live
      presence of the agent to, as `ase://`*addr*`:`*port*\[`/`*token*\]
      resp. `ases://`*addr*`:`*port*\[`/`*token*\]\[`?insecure`\] for
      HTTPS (default: the configured `project.relay.url`, else none).
      See **AGENT RELAY** in `ase-agent`(1).

    - \[`-r`|`--repo` *url*\]: The Git repository to clone once into the
      temporary directory of the agent, where every task without a
      `worktree` value is processed in its own temporary Git worktree of
      this clone, and changed branches are pushed back to its origin
      (default: none, i.e., all tasks are processed in the Git working
      copy the agent is started in, which is hence mandatory).

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
      `judge`): `judge` just adds the verdict tag and puts the task back
      into `IMPLEMENTED` for a human decision, while `qualify`
      additionally qualifies resp. declines the task by its verdict,
      i.e., puts it into `QUALIFIED` on the verdict `APPROVE`, into
      `DECLINED` on the verdict `REJECT`, and back into `IMPLEMENTED`
      without a verdict. An invalid mode is an error.

    - \[`--title` *text*\]: The one-line title of the operation of the
      agent (at most 80 characters), shown on the task boards. Built-in:
      `Review implemented tasks and tag their verdict` (`judge`) resp.
      `Review implemented tasks and decide by verdict` (`qualify`).

    - \[`--description` *text*\]: The brief description of the operation
      of the agent (about 3-6 lines, at most 600 characters, with its
      whitespace collapsed), shown on the task boards. Built-in: a
      description of the operation of the mode.

    - \[`--type` `phase`|`request`\]: The processing type: `phase`
      claims the tasks by their lifecycle status, `request` processes
      the prompt requests attached to the tasks. Generic default:
      `phase`. Built-in: `phase`.

    - \[`--workdir` *kind*\]: The working directory of the agent tool:
      `project`, `source`, `changeset`, `changeset-read`, or `target`.
      Generic default: `project`. Built-in: `changeset-read`.

    - \[`--lifecycle` *model*\]: A supported task lifecycle model
      (`solo`, `team`, or `enterprise`, repeatable). Generic default:
      every model containing all given states, resp. all models for
      `request` and with `--unclaimed`. Built-in: `enterprise`.

    - \[`--serial`\]: Process the tasks serially only, ignoring
      `--parallel`. Built-in: not set.

    - \[`--unclaimed`\]: Process the tasks of the incoming states
      without claiming them, independent of their assignee and
      predecessors, and without ever changing their status and assignee
      (`phase` only). Built-in: not set. Not allowed, as the qualifier
      claims the tasks into its activity state.

    - \[`-M`|`--model` *model*\]: The model of the agent tool: a model
      for all tasks, or comma-separated *size*`=`*model* pairs per
      `Effort:` size (`XS`, `S`, `M`, `L`, `XL`, or `*` for all other
      tasks), see `ase-agent-adhoc`(1). Generic default: the default
      model of the agent tool. Built-in: none.

    - \[`--params` *name*`=`*value*\]: The value of a parameter
      declared by the definition (repeatable). Built-in: none declared.

    - \[`--state-incoming` *state*\]: The state of the tasks to claim
      (mandatory for `phase`, repeatable with `--unclaimed` only).
      Built-in: `IMPLEMENTED`.

    - \[`--state-activity` *state*\]: The state of a task during its
      processing. Generic default: the incoming state. Built-in:
      `QUALIFYING`.

    - \[`--state-success` *state*\]: The target state on success.
      Generic default: the incoming state. Built-in: `IMPLEMENTED`.

    - \[`--state-failure` *state*\]: The target state on failure.
      Generic default: the incoming state. Built-in: `IMPLEMENTED`.

    - \[`--state-phase` *state*\]: The phase success state, into which
      the skill itself can move a task. Generic default: the success
      state. Built-in: `QUALIFIED`.

    - \[`--state-passed` *state*\]: The first state from which on a task
      has passed the phase for its `After:` successors. Generic default:
      the phase success state. Built-in: `QUALIFIED`.

    - \[`--state-verdict` *VERDICT*`=`*state*\]: The target state per
      verdict (repeatable). Built-in: not set (mode `judge`),
      `APPROVE=QUALIFIED` and `REJECT=DECLINED` (mode `qualify`).

    - \[`--tag-name` *tag*\]: The tag of the processed tasks
      (`ase-agent-`*word*). Generic default: `ase-agent-`*name*, resp.
      for `request` always `ase-agent-`*request-name*. Built-in:
      `ase-agent-qualifier`.

    - \[`--tag-success` *tag*\]: The tag on success: *tag-name*,
      *tag-name*`:`*value*, or `none` (`phase` only). Generic default:
      *tag-name*. Built-in: not set.

    - \[`--tag-failure` *tag*\]: The tag on failure: *tag-name*,
      *tag-name*`:`*value*, or `none` (`phase` only). Generic default:
      *tag-name*. Built-in: not set.

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
      to *who* of `--assign-name` (`phase` only). Built-in: not set.

    - \[`--assign-success` *who*\]: The assignee of a task after its
      successful processing: a name, `none`, or `previous`. Generic
      default: `none` for `phase`, `previous` for `request`. Built-in:
      not set.

    - \[`--assign-failure` *who*\]: The assignee of a task after its
      failed processing: a name, `none`, or `previous`. Generic default:
      `none` for `phase`, `previous` for `request`. Built-in: not set.

    - \[`--request-name` *name*\]: The name of the processed requests
      (`request` only). Generic default: the agent name. Built-in: not
      set. Not allowed, as the qualifier is of type `phase`.

    - \[`--request-done` *word*\]: The word naming a processed task in
      the log lines (`request` only). Generic default: `processed`.
      Built-in: not set. Not allowed, as the qualifier is of type
      `phase`.

    - \[`--prompt-skill` *name*\]: The skill to invoke (mutually
      exclusive with `--prompt-text` and `--prompt-file`). Built-in:
      `ase-repo-review`.

    - \[`--prompt-args` *template*\]: The argument template of the
      skill. Generic default: `{id}` for `phase`, `{id}: {prompt}` for
      `request`. Built-in: `{?changeset-type=branch:--branch
      {changeset-name}}`.

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
      `verdict`.

    - \[`--success-match` *regex*\]: A regular expression an output line
      has to match (repeatable). Built-in: not set.

    - \[`--verdict-label` *label*\]: The label after which the verdict
      is given in the output. Built-in: `REVIEW VERDICT`.

    - \[`--verdict-allow` *VERDICT*\]: An accepted verdict (repeatable).
      Generic default: the verdicts of `--state-verdict`, else any.
      Built-in: `APPROVE` and `REJECT`.

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
      set. Not allowed, as the qualifier works with `--workdir
      changeset-read`.

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
  after `qualifier`). See `ase-agent-adhoc`(1) for their full semantics.

- `ase agent qualifier status` \[`-n`|`--name` *name*\]: Report whether
  the qualifier agent of the name *name* (default: `qualifier`) is
  running, as `agent` *name*`: running (pid` *pid*`)` resp. `agent`
  *name*`: not running` (exit status 1).

- `ase agent qualifier log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\]
  \[`--name` *name*\]: Show the log `.ase/agent/`*name*`.log` of the
  qualifier agent of the name *name* (default: `qualifier`) run in the
  background, where an agent of a fleet logs into the log of the fleet
  instead (see `ase-agent-fleet`(1)). Without a log file, an
  informational message is shown only. The options are:

    - \[`-f`|`--follow`\]: Show the last *n* lines (default: 10) and
      then follow all newly appended lines, in the style of `tail -f`,
      until interrupted.

    - \[`-n`|`--lines` *n*\]: Show the last *n* lines only (default:
      all, or 10 with `--follow`).

    - \[`--name` *name*\]: The name of the agent (default: `qualifier`),
      given in its long form only, as `-n` is the short form of
      `--lines`.

- `ase agent qualifier stop` \[`-n`|`--name` *name*\]: Stop the qualifier
  agent of the name *name* (default: `qualifier`) by `SIGTERM`, waiting
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
  directory*`/agent-qualifier/`*store-hash*`/`*run-id*`.lock` and
  `.json`: The run lock and the run record of each qualifier agent
  process, used to recover the tasks of terminated agent processes (see
  **INTERRUPTS AND RECOVERY** in `ase-agent`(1)).

## EXIT STATUS

`ase agent qualifier start` exits with status `0` once the agent started
(or was already running), resp. once a foreground agent terminated
regularly, and with status `1` on any error (e.g., an invalid option, a
task lifecycle model other than `enterprise`, or a missing agent tool).
`ase agent qualifier status` exits with status `1` if the agent is not
running.

## EXAMPLES

```sh
# review the implemented tasks, leaving the decision to a human
$ ase agent qualifier start -m judge -p 2

# review the implemented tasks and decide on them by the verdict
$ ase agent qualifier start -m qualify
```

## SEE ALSO

`ase`(1), `ase-agent`(1), `ase-agent-rebooter`(1),
`ase-agent-condenser`(1), `ase-agent-researcher`(1),
`ase-agent-implementer`(1), `ase-agent-integrator`(1),
`ase-agent-editor`(1), `ase-agent-estimator`(1), `ase-agent-adhoc`(1),
`ase-agent-fleet`(1), `ase-agent-relay`(1), `ase-task`(1),
`ase-task-board`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

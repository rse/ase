# ase-agent-editor(1) -- Edit Request Agent

## SYNOPSIS

`ase agent editor start`
\[`-n`|`--name` *name*\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]
\[`-p`|`--parallel` *num*\]
\[`-T`|`--timeout` *duration*\]
\[`-o`|`--one-shot`\]
\[`--agent-relay` *url*\]
\[`-r`|`--repo` *url*\]
\[`-d`|`--tempdir` *dir*\]
\[`-M`|`--model` *model*\]
\[`--`*group*`-`*item* *value* \[...\]\]
\[`-f`|`--foreground`\]

`ase agent editor status`
\[`-n`|`--name` *name*\]

`ase agent editor log`
\[`-f`|`--follow`\]
\[`-n`|`--lines` *n*\]
\[`--name` *name*\]

`ase agent editor stop`
\[`-n`|`--name` *name*\]

## DESCRIPTION

**ase agent editor** processes the edit requests of tasks. Unlike the
phase agents, it is bound to no phase and supports all task lifecycle
models (`solo`, `team`, and `enterprise`).

An edit request is added by key `E` of the task board (see
`ase-task-board`(1)) or by `ase task request` *id* `edit` *prompt* (see
`ase-task-request`(1)) as an attachment of type
`text/plain; charset=utf-8; kind="edit"` with the prompt as its data,
mirrored in the tag `ase-agent-editor:pending` of the task (aggregated
as `:active` while one is processed and as `:failed` once one failed).

The editor observes the tasks with this tag, except those in an activity
status of the task lifecycle model, where the task is actively worked on
(`team`: `IMPLEMENTING`; `enterprise`: `PLANNING`, `IMPLEMENTING`,
`QUALIFYING`, and `INTEGRATING`), and those still held by a phase agent
(tagged `ase-agent-`*kind*`:active`), which wait until their status
changes resp. their tag is released.

It claims the oldest request of such a task in a single conditional
save by turning it into `kind="edit-running"` and setting the
`Assignee:` of the task to its agent name (remembering the previous
assignee in the request), which keeps all other agents off the task
during the edit without touching its status. The request of a finished
task, resp. a request with an empty prompt, is turned into
`kind="edit-failed"` instead.

It then edits the plan via the skill invocation `ase-task-edit --plan
REFINE --next DONE` *id*`:` *prompt* (with the whitespace of the prompt
collapsed) in the working copy, grounded in the `Source:` of the task,
where a `branch:`*name* source is checked out in the temporary, detached
Git worktree `.ase/worktree/.temp/`*id*`-editor`, passed to the skill
via its internal option `--int-source-dir`, and removed afterwards. The
skill saves the plan only if it was not changed meanwhile (e.g., by a
further edit request).

Finally, in a single save, the editor restores the previous assignee of
the task (unless reassigned meanwhile) and removes the request if the
plan content actually changed (its frontmatter, except `Status:`,
`Tags:`, and `Assignee:`, which other agents change, and its body) and
the skill reported no error, or else turns it back into `kind="edit"` on
an interrupt, resp. into `kind="edit-failed"` (with the reason, e.g.,
`skill reported an error`, `agent tool failed`, or `plan not changed`)
otherwise.

A finalization failing even after its retries is retried on every
further dispatching.

On its start, the editor marks the requests left in
`kind="edit-running"` by any terminated editor process of the same user
on the same host (whose run lock is gone or stale and whose process is
no longer alive) as failed (`kind="edit-failed"`), and restores the
previous assignees of their tasks. See `ase-agent`(1) for the common
mechanics of all agents.

## OPTIONS

- \[`-h`|`--help`\]: Show usage information of `ase agent editor` (or of
  the given sub-command) only.

All other options belong to the sub-commands (see **COMMANDS**).

## COMMANDS

- `ase agent editor start` \[*options*\]: Start the editor agent in the
  background, logging into `.ase/agent/`*name*`.log`. The agent is
  validated and initialized (e.g., its agent tool is looked up and the
  task lifecycle model is checked) before the command returns (waiting
  up to 30 seconds), so a failing agent is reported together with the
  tail of its log. An agent of the same name already running is left
  alone. The options are:

    - \[`-n`|`--name` *name*\]: The name of the agent (default:
      `editor`): up to 64 letters, digits, underscores, and dashes,
      starting with a letter or digit, other than the name of another
      agent kind, `relay`, or `fleet`.

      It names the agent in its log lines (also in the shared processing
      log attachment `agent`), the `Assignee:` of the tasks it processes, its
      temporary directory, and its process files `.ase/agent/`*name*`.yaml`
      and `.ase/agent/`*name*`.log`. Agents of the kind `editor` under
      different names form a pool, competing for the same tasks and
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

    - \[`--title` *text*\]: The one-line title of the operation of the
      agent (at most 80 characters), shown on the task boards. Built-in:
      `Edit task plans by the prompts of edit requests`.

    - \[`--description` *text*\]: The brief description of the operation
      of the agent (about 3-6 lines, at most 600 characters, with its
      whitespace collapsed), shown on the task boards. Built-in: a
      description of the operation of the editor.

    - \[`--type` `phase`|`request`\]: The processing type: `phase`
      claims the tasks by their lifecycle status, `request` processes
      the prompt requests attached to the tasks. Generic default:
      `phase`. Built-in: `request`.

    - \[`--workdir` *kind*\]: The working directory of the agent tool:
      `project`, `source`, `changeset`, `changeset-read`, or `target`.
      Generic default: `project`. Built-in: `source`.

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
      (`phase` only). Built-in: not set. Not allowed, as the editor is
      of type `request`.

    - \[`-M`|`--model` *model*\]: The model of the agent tool: a model
      for all tasks, or comma-separated *size*`=`*model* pairs per
      `Effort:` size (`XS`, `S`, `M`, `L`, `XL`, or `*` for all other
      tasks), see `ase-agent-adhoc`(1). Generic default: the default
      model of the agent tool. Built-in: none.

    - \[`--params` *name*`=`*value*\]: The value of a parameter
      declared by the definition (repeatable). Built-in: none declared.

    - \[`--state-incoming` *state*\]: The state of the tasks to claim
      (mandatory for `phase`, repeatable with `--unclaimed` only).
      Built-in: not set. Not allowed, as the editor is of type
      `request`.

    - \[`--state-activity` *state*\]: The state of a task during its
      processing. Generic default: the incoming state. Built-in: not
      set. Not allowed, as the editor is of type `request`.

    - \[`--state-success` *state*\]: The target state on success.
      Generic default: the incoming state. Built-in: not set. Not
      allowed, as the editor is of type `request`.

    - \[`--state-failure` *state*\]: The target state on failure.
      Generic default: the incoming state. Built-in: not set. Not
      allowed, as the editor is of type `request`.

    - \[`--state-phase` *state*\]: The phase success state, into which
      the skill itself can move a task. Generic default: the success
      state. Built-in: not set. Not allowed, as the editor is of type
      `request`.

    - \[`--state-passed` *state*\]: The first state from which on a task
      has passed the phase for its `After:` successors. Generic default:
      the phase success state. Built-in: not set. Not allowed, as the
      editor is of type `request`.

    - \[`--state-verdict` *VERDICT*`=`*state*\]: The target state per
      verdict (repeatable). Built-in: not set. Not allowed, as the
      editor is of type `request`.

    - \[`--tag-name` *tag*\]: The tag of the processed tasks
      (`ase-agent-`*word*). Generic default: `ase-agent-`*name*, resp.
      for `request` always `ase-agent-`*request-name*. Built-in:
      `ase-agent-editor` (derived from the request name `edit`).

    - \[`--tag-success` *tag*\]: The tag on success: *tag-name*,
      *tag-name*`:`*value*, or `none` (`phase` only). Generic default:
      *tag-name*. Built-in: not set. Not allowed, as the editor is of
      type `request`.

    - \[`--tag-failure` *tag*\]: The tag on failure: *tag-name*,
      *tag-name*`:`*value*, or `none` (`phase` only). Generic default:
      *tag-name*. Built-in: not set. Not allowed, as the editor is of
      type `request`.

    - \[`--tag-require` *tag*\]: A tag a claimable task has to carry
      (repeatable). Built-in: not set.

    - \[`--tag-exclude` *tag*\]: A tag a claimable task must not carry
      (repeatable). Built-in: not set.

    - \[`--tag-retry`\]: A shorthand for `--tag-failure none`, so a
      failed task is claimed again after a growing delay (`phase` only).
      Built-in: not set. Not allowed, as the editor is of type
      `request`.

    - \[`--assign-name` *who*\]: The assignee under which the tasks are
      claimed, held, recognized, and released, and which names the
      agent-owned worktrees. Generic default: the agent name. Built-in:
      not set.

    - \[`--assign-required`\]: Claim only the tasks explicitly assigned
      to *who* of `--assign-name` (`phase` only). Built-in: not set. Not
      allowed, as the editor is of type `request`.

    - \[`--assign-success` *who*\]: The assignee of a task after its
      successful processing: a name, `none`, or `previous`. Generic
      default: `none` for `phase`, `previous` for `request`. Built-in:
      not set.

    - \[`--assign-failure` *who*\]: The assignee of a task after its
      failed processing: a name, `none`, or `previous`. Generic default:
      `none` for `phase`, `previous` for `request`. Built-in: not set.

    - \[`--request-name` *name*\]: The name of the processed requests
      (`request` only). Generic default: the agent name. Built-in:
      `edit`.

    - \[`--request-done` *word*\]: The word naming a processed task in
      the log lines (`request` only). Generic default: `processed`.
      Built-in: `edited`.

    - \[`--prompt-skill` *name*\]: The skill to invoke (mutually
      exclusive with `--prompt-text` and `--prompt-file`). Built-in:
      `ase-task-edit`.

    - \[`--prompt-args` *template*\]: The argument template of the
      skill. Generic default: `{id}` for `phase`, `{id}: {prompt}` for
      `request`. Built-in: `--plan REFINE --next DONE{?source-dir:
      --int-source-dir "{source-dir}"} {id}: {prompt}`.

    - \[`--prompt-text` *template*\]: The prompt text template to invoke
      instead of a skill. Built-in: not set.

    - \[`--prompt-file` *file*\]: The file with the prompt text template
      to invoke instead of a skill. Built-in: not set.

    - \[`--prepare-run` *cmd*\]: A shell command run in the working
      directory before the prompt (repeatable). Built-in: not set.

    - \[`--success-criterion` *criterion*\]: A success criterion:
      `exit`, `clean`, `changed`, `verdict`, `attachment`, or `status`
      (repeatable). Generic default: `exit` and `clean` for `phase`,
      `clean` and `changed` for `request`. Built-in: `clean` and
      `changed`.

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
      Built-in: not set. Not allowed, as the editor is of type
      `request`.

    - \[`--attach-changeset` *kind*\]: The kind of the attachment
      `text/x-diff;`*kind* storing the change set snapshot of the task
      (with `--workdir changeset` or `target` only). Built-in: not set.

    - \[`--finish-commit`\]: Commit the work onto a `branch:` changeset
      and publish it (with `--workdir changeset` only). Built-in: not
      set. Not allowed, as the editor works with `--workdir source`.

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
  after `editor`). See `ase-agent-adhoc`(1) for their full semantics.

- `ase agent editor status` \[`-n`|`--name` *name*\]: Report whether the
  editor agent of the name *name* (default: `editor`) is running, as
  `agent` *name*`: running (pid` *pid*`)` resp. `agent` *name*`: not
  running` (exit status 1).

- `ase agent editor log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\]
  \[`--name` *name*\]: Show the log `.ase/agent/`*name*`.log` of the
  editor agent of the name *name* (default: `editor`) run in the
  background, where an agent of a fleet logs into the log of the fleet
  instead (see `ase-agent-fleet`(1)). Without a log file, an
  informational message is shown only. The options are:

    - \[`-f`|`--follow`\]: Show the last *n* lines (default: 10) and
      then follow all newly appended lines, in the style of `tail -f`,
      until interrupted.

    - \[`-n`|`--lines` *n*\]: Show the last *n* lines only (default:
      all, or 10 with `--follow`).

    - \[`--name` *name*\]: The name of the agent (default: `editor`),
      given in its long form only, as `-n` is the short form of
      `--lines`.

- `ase agent editor stop` \[`-n`|`--name` *name*\]: Stop the editor
  agent of the name *name* (default: `editor`) by `SIGTERM`, waiting (up
  to 5 minutes) until it aborted its running processings and put their
  tasks back. An agent not running is reported informationally only.

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

- `.ase/worktree/.temp/`*id*`-editor`: The temporary, detached Git
  worktree of a `branch:` source of a task during its edit (where a `#`
  of the task id is replaced by `_`).

- *per-user state
  directory*`/agent-editor/`*store-hash*`/`*run-id*`.lock` and `.json`:
  The run lock and the run record of each editor agent process, used to
  recover the edit requests of terminated agent processes (see
  **INTERRUPTS AND RECOVERY** in `ase-agent`(1)).

## EXIT STATUS

`ase agent editor start` exits with status `0` once the agent started
(or was already running), resp. once a foreground agent terminated
regularly, and with status `1` on any error (e.g., an invalid option, or
a missing agent tool). `ase agent editor status` exits with status `1`
if the agent is not running.

## EXAMPLES

```sh
# process the edit requests of the task board
$ ase agent editor start

# request an edit of a task from the command line
$ ase task request FOO-42 edit "split step 3 into two steps"
```

## SEE ALSO

`ase`(1), `ase-agent`(1), `ase-agent-rebooter`(1),
`ase-agent-condenser`(1), `ase-agent-researcher`(1),
`ase-agent-implementer`(1), `ase-agent-qualifier`(1),
`ase-agent-integrator`(1), `ase-agent-estimator`(1),
`ase-task-request`(1), `ase-agent-adhoc`(1), `ase-agent-fleet`(1),
`ase-agent-relay`(1), `ase-task`(1), `ase-task-board`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

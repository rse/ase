# ase-agent-implementer(1) -- Implementation Phase Agent

## SYNOPSIS

`ase agent implementer start`
\[`-n`|`--name` *name*\]
\[`-t`|`--tool` `claude`|`copilot`|`codex`\]
\[`-p`|`--parallel` *num*\]
\[`-T`|`--timeout` *duration*\]
\[`-o`|`--one-shot`\]
\[`--agent-relay` *url*\]
\[`-r`|`--repo` *url*\]
\[`-d`|`--tempdir` *dir*\]
\[`-m`|`--mode` `implement`|`draft`\]
\[`-M`|`--model` *model*\]
\[`--`*group*`-`*item* *value* \[...\]\]
\[`-f`|`--foreground`\]

`ase agent implementer status`
\[`-n`|`--name` *name*\]

`ase agent implementer log`
\[`-f`|`--follow`\]
\[`-n`|`--lines` *n*\]
\[`--name` *name*\]

`ase agent implementer stop`
\[`-n`|`--name` *name*\]

## DESCRIPTION

**ase agent implementer** drives the `Implementation` phase of the
`enterprise` task lifecycle model (refused for any other model). It claims
every task in the state `PLANNED` which is unassigned or assigned to the
agent, which does not carry the tag `ase-agent-implementer` yet, and whose
`After:` predecessors (and, for an explicit epic, its group members) are
*integrated*, i.e., `INTEGRATED` and not still tagged by the integrator
with the value `active` or `failed`, as the task is implemented from its
`Source:`, which contains the change set of a predecessor only then.

For a task *stacked* onto a predecessor (i.e., with the `branch:`
changeset of the predecessor as its `Source:`), the predecessor passes
already once `IMPLEMENTED` or later (and not still tagged by the
implementer with the value `active` or `failed` while `IMPLEMENTED`).
This predecessor rule is the hook `passes` of the built-in definition.

By default, the implementer additionally waits with a task until the
`estimator` agent (see `ase-agent-estimator`(1)) is done with it, as the
latter processes the `PLANNED` tasks unclaimed and would else race
against the implementer: it claims a task only once the task carries a
valid `Effort:` key, is an explicit epic, has an empty plan, or carries
the tag `ase-agent-estimator` (i.e., its estimation failed). Without an
estimator agent, disable this with `--params effort-wait=false`, as the
unestimated tasks would else wait forever. This rule is the hook `ready`
of the built-in definition (in both modes).

In its default mode `implement`, the implementer moves each claimed task
into `IMPLEMENTING`, tags it with `ase-agent-implementer:active`, and
implements the plan from its `Source:` into its `Changeset:` via the
skill invocation `ase-task-implement --next DONE` *id* (see
**CHANGESETS**). The skill itself puts a successfully implemented task
into `IMPLEMENTED`, while a task left in `IMPLEMENTING` is put into
`STALLED`. Afterwards, the task is unassigned and tagged with
`ase-agent-implementer`.

A task already `IMPLEMENTED`, but whose changeset branch could not be
committed or pushed, is instead tagged `ase-agent-implementer:failed`
and left for a manual intervention.

In mode `draft`, the implementer instead claims only the `PLANNED` tasks
without an implementation draft attachment (type `text/x-diff;
charset=utf-8; kind="draft"`) yet and without the separate tag
`ase-agent-implementer-draft` (so a drafted task is still implemented
later by an implementer in mode `implement`), drafts the implementation
from the `Source:` into this attachment only, ignoring the `Changeset:`,
via `ase-task-implement --next DONE --draft --stateless` *id* (in a
temporary worktree of the skill, leaving the working copy untouched),
and puts the task back into `PLANNED`: untagged if the draft attachment
was created or changed, as the attachment itself keeps the agent from
drafting it again, and otherwise tagged with
`ase-agent-implementer-draft`, so a failed drafting is not retried
endlessly.

On an interrupt, a task being processed is put back, untagged and with
its previous assignee, into `PLANNED`. See `ase-agent`(1) for the common
mechanics of all agents.

## CHANGESETS

In mode `implement`, the `Changeset:` of the task (or the configured
`project.task.default.changeset`) is handled as follows:

- `worktree`: The change set stays *uncommitted* in the Git working copy
  the agent is started in, which is switched to the branch of a
  `branch:`*name* source beforehand, and where a task waits while the
  working copy still carries uncommitted changes (e.g., of an earlier
  task not yet integrated). With `--parallel` greater than `1`, it is
  instead implemented in the own Git worktree `.ase/worktree/`*id* of
  each task (via the skill option `--worktree` *id*).

- `branch:`*name*: The branch is checked out (created from the source if
  missing) in the Git worktree `.ase/worktree/`*branch-id* of the agent,
  named after the branch (with every character other than letters,
  digits, `_`, and `-` replaced by `-`, runs of `-` reduced to one, and
  leading and trailing `-` and `_` removed, and refused if its
  directory already exists), unless already checked out in the working copy or
  another *ASE* worktree, which then has to be without uncommitted
  changes, as they would be committed, too. It is implemented there in
  place (via the skill options `--changeset worktree --worktree`
  *branch-id*, keeping
  the `Source:` of the plan, so the change set snapshot of the agent
  shows the entire branch), and afterwards *committed* onto the branch
  with the message *Kind*`:` *title* `(`*id*`)` (where *Kind* is the
  `Kind:` frontmatter key of the task, default `CRAFTING`) -- also a
  partial result of a failed processing, as the plan tracks it --, where
  the `.ase` directory is never committed.

  The worktree of the agent is removed again only if clean. Under
  `--repo`, the branch is pushed to the origin of the clone and, if
  the push is rejected, kept as the branch `ase-agent-rescue/`*id* in
  the preserved clone, also for a partial change set of a task put
  into `STALLED`.

- `attachment:`*name*: The change set is entirely handled by the skill.

For a `worktree` or `branch:` changeset, the agent itself (and not the
skill) afterwards attaches the *change set snapshot* to the task: the
view-only, text-only unified diff of the change set from its fork point
from the `Source:` on (without the `.ase` directory), in the attachment
of type `text/x-diff; charset=utf-8; kind="changeset"` (see
`--attach-changeset`), replaced in place on every processing, with
`base` *commit* (plus `, partial` for a task not put into
`IMPLEMENTED`) in its `Desc:` key, so the change set can be viewed
wherever the task is visible, e.g., on the task boards during its
qualification.

For an `attachment:` changeset other than `attachment:changeset`, an
existing snapshot is removed as obsolete.

## OPTIONS

- \[`-h`|`--help`\]: Show usage information of `ase agent implementer`
  (or of the given sub-command) only.

All other options belong to the sub-commands (see **COMMANDS**).

## COMMANDS

- `ase agent implementer start` \[*options*\]: Start the implementer
  agent in the background, logging into `.ase/agent/`*name*`.log`. The
  agent is validated and initialized (e.g., its agent tool is looked up
  and the task lifecycle model is checked) before the command returns
  (waiting up to 30 seconds), so a failing agent is reported together
  with the tail of its log. An agent of the same name already running is
  left alone. The options are:

    - \[`-n`|`--name` *name*\]: The name of the agent (default:
      `implementer`): up to 64 letters, digits, underscores, and dashes,
      starting with a letter or digit, other than the name of another
      agent kind, `relay`, or `fleet`. It names the agent in its log
      lines (also in the shared processing log attachment `agent`), the
      `Assignee:` of the tasks it processes, its temporary directory,
      and its process files `.ase/agent/`*name*`.yaml` and
      `.ase/agent/`*name*`.log`.

      Agents of the kind `implementer` under different names form a
      pool, competing for the same tasks and processing them in parallel
      to each other.

    - \[`-t`|`--tool` *tool*\]: The headless agent tool processing the
      tasks: `claude` (*Anthropic Claude Code CLI*), `copilot` (*GitHub
      Copilot CLI*), or `codex` (*OpenAI Codex CLI*) (default:
      `$ASE_TOOL`, else `claude`). Its command has to be found in
      `$PATH`.

    - \[`-p`|`--parallel` *num*\]: The maximum number of tasks processed
      in parallel by this agent (default: `1`), a positive integer. With
      more than one, a task with a `worktree` changeset is implemented
      in its own Git worktree `.ase/worktree/`*id* (created by the skill
      via its option `--worktree` *id*) instead of the working copy
      itself.

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
      `implement`): `implement` implements the task from its `Source:`
      into its `Changeset:` via the skill `ase-task-implement` and moves
      it on into `IMPLEMENTED`, while `draft` just drafts its
      implementation into its implementation draft attachment `draft`
      and puts it back into `PLANNED`. An invalid mode is an error.

    - \[`--title` *text*\]: The one-line title of the operation of the
      agent (at most 80 characters), shown on the task boards. Built-in:
      `Implement planned tasks into their changesets` (`implement`)
      resp. `Draft the implementation of planned tasks` (`draft`).

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
      Generic default: `project`. Built-in: `changeset` (mode
      `implement`), `source` (mode `draft`).

    - \[`--lifecycle` *model*\]: A supported task lifecycle model
      (`solo`, `team`, or `enterprise`, repeatable). Generic default:
      every model containing all given states, resp. all models for
      `request` and with `--unclaimed`. Built-in: `enterprise`.

    - \[`--serial`\]: Process the tasks serially only, ignoring
      `--parallel`. Built-in: not set.

    - \[`--unclaimed`\]: Process the tasks of the incoming states
      without claiming them, independent of their assignee and
      predecessors, and without ever changing their status and assignee
      (`phase` only). Built-in: not set. Not allowed, as the implementer
      claims the tasks into its activity state.

    - \[`-M`|`--model` *model*\]: The model of the agent tool: a model
      for all tasks, or comma-separated *size*`=`*model* pairs per
      `Effort:` size (`XS`, `S`, `M`, `L`, `XL`, or `*` for all other
      tasks), see `ase-agent-adhoc`(1). Generic default: the default
      model of the agent tool. Built-in: none.

    - \[`--params` *name*`=`*value*\]: The value of a parameter
      declared by the definition (repeatable). Built-in: `effort-wait`
      (`true` or `false`, default: `true`), whether to wait for the
      effort estimation of a task by the `estimator` agent (see
      **DESCRIPTION**).

    - \[`--state-incoming` *state*\]: The state of the tasks to claim
      (mandatory for `phase`, repeatable with `--unclaimed` only).
      Built-in: `PLANNED`.

    - \[`--state-activity` *state*\]: The state of a task during its
      processing. Generic default: the incoming state. Built-in:
      `IMPLEMENTING`.

    - \[`--state-success` *state*\]: The target state on success.
      Generic default: the incoming state. Built-in: `IMPLEMENTED` (mode
      `implement`), `PLANNED` (mode `draft`).

    - \[`--state-failure` *state*\]: The target state on failure.
      Generic default: the incoming state. Built-in: `STALLED` (mode
      `implement`), `PLANNED` (mode `draft`).

    - \[`--state-phase` *state*\]: The phase success state, into which
      the skill itself can move a task. Generic default: the success
      state. Built-in: not set (mode `implement`), `IMPLEMENTED` (mode
      `draft`).

    - \[`--state-passed` *state*\]: The first state from which on a task
      has passed the phase for its `After:` successors. Generic default:
      the phase success state. Built-in: `IMPLEMENTED`. The predecessor
      rule is decided by the hook `passes` of the built-in definition
      instead (see **DESCRIPTION**).

    - \[`--state-verdict` *VERDICT*`=`*state*\]: The target state per
      verdict (repeatable). Built-in: not set.

    - \[`--tag-name` *tag*\]: The tag of the processed tasks
      (`ase-agent-`*word*). Generic default: `ase-agent-`*name*, resp.
      for `request` always `ase-agent-`*request-name*. Built-in:
      `ase-agent-implementer` (mode `implement`),
      `ase-agent-implementer-draft` (mode `draft`).

    - \[`--tag-success` *tag*\]: The tag on success: *tag-name*,
      *tag-name*`:`*value*, or `none` (`phase` only). Generic default:
      *tag-name*. Built-in: not set (mode `implement`), `none` (mode
      `draft`).

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
      set. Not allowed, as the implementer is of type `phase`.

    - \[`--request-done` *word*\]: The word naming a processed task in
      the log lines (`request` only). Generic default: `processed`.
      Built-in: not set. Not allowed, as the implementer is of type
      `phase`.

    - \[`--prompt-skill` *name*\]: The skill to invoke (mutually
      exclusive with `--prompt-text` and `--prompt-file`). Built-in:
      `ase-task-implement`.

    - \[`--prompt-args` *template*\]: The argument template of the
      skill. Generic default: `{id}` for `phase`, `{id}: {prompt}` for
      `request`. Built-in: `--next DONE{?changeset-type=branch:
      --changeset worktree}{?changeset-worktree: --worktree
      {changeset-worktree}} {id}` (mode `implement`), `--next DONE
      --draft --stateless {id}` (mode `draft`).

    - \[`--prompt-text` *template*\]: The prompt text template to invoke
      instead of a skill. Built-in: not set.

    - \[`--prompt-file` *file*\]: The file with the prompt text template
      to invoke instead of a skill. Built-in: not set.

    - \[`--prepare-run` *cmd*\]: A shell command run in the working
      directory before the prompt (repeatable). Built-in: not set.

    - \[`--success-criterion` *criterion*\]: A success criterion:
      `exit`, `clean`, `changed`, `verdict`, `attachment`, or `status`
      (repeatable). Generic default: `exit` and `clean` for `phase`,
      `clean` and `changed` for `request`. Built-in: `status` (mode
      `implement`), `exit` and `attachment` (mode `draft`).

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
      set (mode `implement`), `text/x-diff;draft` (mode `draft`).

    - \[`--attach-skip` *spec*\]: The attachment
      \[*mime-type*`;`\]*kind* leaving a task unclaimed (`phase` only).
      Built-in: not set (mode `implement`), `text/x-diff;draft` (mode
      `draft`).

    - \[`--attach-changeset` *kind*\]: The kind of the attachment
      `text/x-diff;`*kind* storing the change set snapshot of the task
      (with `--workdir changeset` or `target` only). Built-in:
      `changeset` (mode `implement`), not set (mode `draft`).

    - \[`--finish-commit`\]: Commit the work onto a `branch:` changeset
      and publish it (with `--workdir changeset` only). Built-in:
      enabled (mode `implement`), not set (mode `draft`).

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
  after `implementer`). See `ase-agent-adhoc`(1) for their full
  semantics.

- `ase agent implementer status` \[`-n`|`--name` *name*\]: Report
  whether the implementer agent of the name *name* (default:
  `implementer`) is running, as `agent` *name*`: running (pid` *pid*`)`
  resp. `agent` *name*`: not running` (exit status 1).

- `ase agent implementer log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\]
  \[`--name` *name*\]: Show the log `.ase/agent/`*name*`.log` of the
  implementer agent of the name *name* (default: `implementer`) run in
  the background, where an agent of a fleet logs into the log of the
  fleet instead (see `ase-agent-fleet`(1)). Without a log file, an
  informational message is shown only. The options are:

    - \[`-f`|`--follow`\]: Show the last *n* lines (default: 10) and
      then follow all newly appended lines, in the style of `tail -f`,
      until interrupted.

    - \[`-n`|`--lines` *n*\]: Show the last *n* lines only (default:
      all, or 10 with `--follow`).

    - \[`--name` *name*\]: The name of the agent (default:
      `implementer`), given in its long form only, as `-n` is the short
      form of `--lines`.

- `ase agent implementer stop` \[`-n`|`--name` *name*\]: Stop the
  implementer agent of the name *name* (default: `implementer`) by
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

- `.ase/worktree/`*id*, `.ase/worktree/`*branch-id*: The Git worktree
  of a task with a `worktree` changeset under `--parallel` greater than
  `1` (where a `#` of the task id is replaced by `_`), resp. the Git
  worktree of the agent for a `branch:` changeset, named after the
  branch.

- *per-user state
  directory*`/agent-implementer/`*store-hash*`/`*run-id*`.lock` and
  `.json`: The run lock and the run record of each implementer agent
  process, used to recover the tasks of terminated agent processes (see
  **INTERRUPTS AND RECOVERY** in `ase-agent`(1)).

## EXIT STATUS

`ase agent implementer start` exits with status `0` once the agent
started (or was already running), resp. once a foreground agent
terminated regularly, and with status `1` on any error (e.g., an invalid
option, a task lifecycle model other than `enterprise`, or a missing
agent tool). `ase agent implementer status` exits with status `1` if the
agent is not running.

## EXAMPLES

```sh
# implement up to two tasks in parallel
$ ase agent implementer start -p 2

# implement the tasks in a temporary clone, pushing their branches back
$ ase agent implementer start -r git@github.com:example/project.git

# just draft the implementations of the planned tasks
$ ase agent implementer start -n drafter -m draft
```

## SEE ALSO

`ase`(1), `ase-agent`(1), `ase-agent-rebooter`(1),
`ase-agent-condenser`(1), `ase-agent-researcher`(1),
`ase-agent-qualifier`(1), `ase-agent-integrator`(1),
`ase-agent-editor`(1), `ase-agent-estimator`(1), `ase-agent-adhoc`(1),
`ase-agent-fleet`(1), `ase-agent-relay`(1), `ase-task`(1),
`ase-task-board`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

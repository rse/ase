# ase-agent-fleet(1) -- Manage a Fleet of Agents

## SYNOPSIS

`ase agent fleet init`
\[`-c`|`--config` *file*\]
\[`-t`|`--tool` *tool*\]
\[`--lifecycle` *model*\]
\[`--force`\]

`ase agent fleet start`
\[`-c`|`--config` *file*\]
\[`-f`|`--foreground`\]

`ase agent fleet status`

`ase agent fleet log`
\[`-f`|`--follow`\]
\[`-n`|`--lines` *n*\]

`ase agent fleet stop`

## DESCRIPTION

`ase agent fleet` manages a *fleet* of agents (see `ase-agent`(1)),
and optionally of the agent relay they report to (see
`ase-agent-relay`(1)), as given by a YAML configuration file (default:
`.ase/fleet.yaml`). A supervising process runs each member in its own
child process (in its own process group) via `ase agent` *agent*
`start --foreground` resp. `ase agent relay start --foreground`, and
restarts it whenever it exits.

All members log into the shared log `.ase/agent/fleet.log` of the
fleet (or, with `--foreground`, to the terminal), where each line is
prefixed with the name of the member writing it (resp. `fleet` for the
fleet itself), padded to the longest name and followed by ` | `
(e.g., `implementer | ase: [...]: [INFO]: ...`), and, on a terminal,
colored by the name (the fleet in bold red, the relay in red, and all
agents in blue).

On its start, the fleet first starts the agent relay (if any, waiting
up to 10 seconds until it persisted its runtime state), and then all
agents in parallel (waiting up to 30 seconds for each one), where it
passes the URL of the agent relay via `--agent-relay` and its actual
token via `$ASE_AGENT_RELAY_TOKEN` to all agents. If any member fails
to start, all members are stopped again and the failure is reported. A
member exiting during the startup of the others is restarted once the
fleet is ready.

Afterwards, the fleet restarts every member whenever it exits (e.g.,
crashed, or stopped individually via `ase agent` *agent* `stop`) after
a delay starting at 1 second and doubled on each restart in a row up
to 5 minutes, which is reset once the member ran for 10 minutes.

On termination (`SIGTERM`, `SIGINT`, `SIGHUP`, or `SIGQUIT`), the fleet
first stops all agents (each of which aborts its running processings
and puts their tasks back) and then the agent relay (as the agents
remove their presence from it), where a repeated signal is forwarded
to all remaining members (terminating the agents at once).

As each agent runs in its own process, the agents of a fleet do not
coordinate their direct use of the Git working copy they are started
in, so a working copy should be used directly by a single agent only,
while the other agents are given `repo` (see `ase-agent`(1)).

As the members run in their own process groups, they survive a fleet
process killed without a chance to stop them (e.g., via `SIGKILL`).
Such *orphaned* members, identified by their own runtime state still
recording the process recorded by the runtime state of the fleet
(resp., for the agent relay, by `relay.yaml` still recording it), are
stopped by the next `ase agent fleet start` (before starting the new
members) or `ase agent fleet stop`.

## COMMANDS

- `ase agent fleet init` \[`-c`|`--config` *file*\] \[`-t`|`--tool` *tool*\] \[`--lifecycle` *model*\] \[`--force`\]:
  Create the initial YAML configuration *file* of a fleet for a task
  lifecycle model. For all models, it contains the section `relay`
  (with all its options commented out, so they fall back to
  `project.relay.url`, `project.relay.crt`, and `project.relay.key`),
  the section `default` (with `tool`, `parallel: 1`, and `timeout: 60m`,
  plus `model`, `repo`, and `tempdir` commented out), the edit request agent
  `editor`, the effort estimation agent `estimator` (mode `phase`,
  estimating the planned tasks, i.e., the `OPEN` tasks for `solo`, the
  `PLANNING` tasks for `team`, and the `PLANNED` tasks for `enterprise`,
  intended for the final estimation), a commented-out effort estimation
  request agent `estimator-request` (mode `request`, (re-)estimating the
  tasks in any unfinished status on request, intended for dry-runs), a
  commented-out research request agent `researcher-request` (mode
  `request`, intended for topic-driven research), and a
  commented-out example of an ad-hoc request agent `lint` (see
  `ase-agent-adhoc`(1)).

  Additionally, it contains per task lifecycle model:
    - `solo`: no phase agents, as the model has no activity states, so
      its tasks are driven interactively, while the agents only assist.
    - `team`: the ad-hoc implementation phase agent `developer` (as the
      built-in phase agents support the `enterprise` model only), which
      claims only the `PLANNING` tasks explicitly assigned to
      `developer` (as the other ones are still planned) into
      `IMPLEMENTING`, implements them from their `Source:` into their
      `Changeset:` via the `ase-task-implement` skill, and puts them
      into `STALLED` unless they became `IMPLEMENTED`.
    - `enterprise`: the planning phase agents `rebooter`, `condenser`,
      and `researcher` (mode `phase`), each processing only the `DRAFTED`
      tasks explicitly assigned to it, and the phase agents
      `implementer` (mode `implement`, 2 tasks in parallel, waiting for
      the effort estimation, with its parameter `effort-wait` commented
      out, to be set to `false` if the `estimator` is removed),
      `qualifier` (mode `judge`, 2 tasks in parallel, so a human still
      decides on the qualification), and `integrator` (mode `squash`).

  The configuration is checked like on `ase agent fleet start` before
  it is written, and an already existing *file* is overwritten only
  with `--force`. Options:
    - \[`-c`|`--config` *file*\]: the YAML configuration file to create
      (default: `.ase/fleet.yaml` of the project).
    - \[`-t`|`--tool` *tool*\]: the agent tool of all agents, `claude`,
      `copilot`, or `codex` (default: `$ASE_TOOL`, else `claude`).
    - \[`--lifecycle` *model*\]: the task lifecycle model, `solo`, `team`,
      or `enterprise` (default: the configured `project.task.lifecycle`,
      else `solo`).
    - \[`--force`\]: overwrite an already existing configuration file.
    - \[`-h`|`--help`\]: show the usage information and exit.

- `ase agent fleet start` \[`-c`|`--config` *file*\] \[`-f`|`--foreground`\]:
  Start the fleet of the YAML configuration *file* (see
  **CONFIGURATION**) in the background (spawning a detached supervising
  process logging into `.ase/agent/fleet.log`), and return once all
  members started successfully, or with `--foreground` run the fleet in
  the current process.

  The configuration is validated before the fleet starts. An already
  running fleet is left alone (and is an error with `--foreground`).
  With the section `relay`, the fleet owns the per-user agent
  relay, which hence must not run already (stop it first via
  `ase agent relay stop`, or remove the section `relay`). Options:
    - \[`-c`|`--config` *file*\]: the YAML configuration file (default:
      `.ase/fleet.yaml` of the project).
    - \[`-f`|`--foreground`\]: run the fleet in the current process,
      logging to the terminal, until it is interrupted (e.g., via
      `CTRL+C`) or stopped via `ase agent fleet stop` (default: the
      option `foreground` of the section `fleet`).
    - \[`-h`|`--help`\]: show the usage information and exit.

- `ase agent fleet status`:
  Report whether the fleet is running (with its process id and
  configuration file, and whether it is still starting up), and for
  each member (with its kind) whether it is running (with its process
  id) or awaiting its restart, and how often it was restarted. Exits
  with status 1 if the fleet is not running.

- `ase agent fleet log` \[`-f`|`--follow`\] \[`-n`|`--lines` *n*\]:
  Show the log `.ase/agent/fleet.log` of the fleet run in the
  background, aggregating the lines of the fleet itself and of all its
  members, each one prefixed with its name, where the name and the log
  level tag are colored if the output is a terminal.

  With `-n`|`--lines` *n*, only the last *n* lines are shown (default:
  all). With `-f`|`--follow`, the last *n* lines (default: 10) are shown
  and then, in the style of `tail -f`, all newly appended lines are
  followed until interrupted. If no log file exists, this is just
  reported (at log level `info`).

- `ase agent fleet stop`:
  Stop the fleet with all its members, first all agents and then the
  agent relay, by sending `SIGTERM` to the fleet process and waiting
  (up to 5 minutes) until it is gone. With the fleet process already
  gone (e.g., killed via `SIGKILL`), its orphaned members are stopped
  instead (see **DESCRIPTION**). A not running fleet is reported as
  such, without an error.

## CONFIGURATION

The YAML configuration file of a fleet consists of the following
top-level sections, where all options are given by their long names
(without the leading `--`), `true` enables a flag, `false` or an empty
value omits an option, and a list repeats an option:

- `fleet`:
  (optional) The options of the fleet itself. The only option is
  `foreground` (a boolean, the same as `--foreground` of `ase agent
  fleet start`).

- `relay`:
  (optional) The options `address`, `port`, `token`, `cors`,
  `tls-cert`, and `tls-key` of `ase agent relay start` (see
  `ase-agent-relay`(1)). The presence of this section (even if empty)
  lets the fleet run and own the per-user agent relay.

  Its options not given fall back as follows: `address`, `port`, and
  `token` to those of the configured `project.relay.url` (its embedded
  token, else `$ASE_AGENT_RELAY_TOKEN`, else `project.relay.token`), if
  it addresses a local address of this host (else this is warned about
  and `project.relay.url` is not adopted), where a deviating `address`
  or `port` (resp. a `tls-cert` with an adopted `project.relay.url`
  selecting HTTP) is warned about, as the task boards following
  `project.relay.url` then do not see the agents of the fleet; and
  `tls-cert` and `tls-key` to `project.relay.crt` and `project.relay.key`
  (unless an adopted `project.relay.url` selects HTTP), where an adopted
  `project.relay.url` selecting HTTPS requires both.

- `default`:
  (optional) The default options of all agents: `tool`, `model`,
  `parallel`, `timeout`, `repo`, `tempdir`, and `agent-relay` (see
  `ase-agent`(1) and `ase-agent-adhoc`(1)),
  each one applied only to the agents supporting it (e.g., `repo` not to
  `rebooter`), and overridden by the section of an agent. The option
  `agent-relay` is not allowed together with the section `relay`.

- *name*:
  One section per agent, named by its agent name (at most 64 letters,
  digits, underscores, and dashes, starting with a letter or digit, and
  neither the name of another agent kind, nor `relay` or `fleet`), with
  the options of `ase agent` *kind* `start` and an optional `kind`
  (default: the section name), i.e., one of the built-in kinds
  `rebooter`, `condenser`, `implementer`, `qualifier`, `integrator`,
  `editor`, `estimator`, and `researcher`, a definition kind of the project or the user, or `adhoc`
  (see `ase-agent-adhoc`(1)). Hence, an agent of a definition kind is
  given by a section of its kind (or with `kind:` *kind*), and an agent
  defined inline by a section with `kind: adhoc`.

  The options of the definitions can also be nested by group, like in a
  definition file (e.g., `prompt: { text: ... }`), where a key must not
  be given both flat and nested. The values of the parameters
  declared by the definition are given by the map `params` (e.g.,
  `params: { severity: high }`), which repeats the option `--params`
  *name*`=`*value* per parameter.

  The `definition` of `kind: adhoc` (unless a `builtin:` one) is
  relative to the configuration file, where hooks can be given only
  through a TypeScript or JavaScript definition file. A section without
  any options (an empty value) runs the agent of the kind of its name
  with its defaults.

The following is refused, as the definitions of all agents are already
resolved and validated on the start of the fleet:

- the options `name` (given by the section name), `one-shot` (as the
  members are restarted), `foreground`, and `help` in the section of an
  agent, and `agent-relay` there together with the section `relay`;

- an unknown section option of `fleet`, `relay`, or `default`, an
  invalid option name (other than lower-case letters, digits, and
  dashes), and a value other than a string, a number, a boolean, or a
  list of strings and numbers (resp., for `params`, a map of strings,
  numbers, and booleans);

- an unknown agent kind, and an option unknown to the `start` command
  of the agent kind;

- more than one agent of a built-in kind processing serially only
  (i.e., `integrator`), and two agents processing serially only on the
  same tag (e.g., two agents of `--serial` definitions of the same
  resolved `--tag-name`, or one next to `integrator` with its tag
  `ase-agent-integrator`);

- a configuration without any agent.

Before the fleet starts, the structure of the configuration, the
option names, the option syntax, and the definitions of the agents are
checked, while the remaining option values (e.g., `parallel` or `tool`)
are checked only once the corresponding member starts.

## ENVIRONMENT

- `ASE_TOOL`:
  The default of `--tool` of `ase agent fleet init`, and of the agents
  without a `tool` option.

- `ASE_AGENT_RELAY_TOKEN`:
  The fallback token of the agent relay of the section `relay`, if not
  embedded in `project.relay.url`. The fleet passes the actual token of
  its agent relay to all agents through this variable.

## FILES

- `.ase/fleet.yaml`:
  The default configuration of the fleet, written by the user (or
  initially created via `ase agent fleet init`) and intended to be
  versioned.

- `.ase/agent/fleet.yaml`:
  The process state of the running fleet: its process id and process
  start time, its configuration file, whether all its members completed
  their initial startup, and the kind, process id (`null` while awaiting
  its restart), and number of restarts of each member. It exists while
  the fleet runs.

- `.ase/agent/fleet.log`:
  The shared log of the fleet run in the background and of all its
  members.

- `.ase/agent/`*name*`.yaml`:
  The process state of the member agent named *name*, existing while
  it runs.

## EXIT STATUS

`init`, `start`, and `stop` exit with status 0 on success (also for a
fleet already running resp. not running) and 1 on any error. `status`
exits with status 1 if the fleet is not running. `log` exits with
status 0.

## EXAMPLES

```sh
# create the initial configuration of a fleet, and start and follow it
$ ase agent fleet init -t claude --lifecycle enterprise
$ ase agent fleet start
$ ase agent fleet status
$ ase agent fleet log -f

# stop the fleet with all its members
$ ase agent fleet stop
```

A configuration `.ase/fleet.yaml` with the agent relay, the built-in
agents (with an implementer using cheaper models for smaller tasks),
two editors of different agent tools, an agent of the
definition file `.ase/agents/reviewer.mts`, and an ad-hoc request
agent:

```yaml
fleet:
    foreground: true
relay:
    port:     4711
default:
    tool:     claude
rebooter:
implementer:
    parallel: 2
    model:    XS=haiku,S=haiku,*=sonnet
editor-claude:
    kind:     editor
editor-codex:
    kind:     editor
    tool:     codex
reviewer:
    parallel: 2
    params:
        severity: high
lint:
    kind:     adhoc
    type:     request
    prompt:
        text: "Lint the source code of task {id} with focus on: {prompt}"
```

## SEE ALSO

`ase`(1), `ase-agent`(1), `ase-agent-adhoc`(1), `ase-agent-relay`(1),
`ase-agent-rebooter`(1), `ase-agent-condenser`(1),
`ase-agent-researcher`(1), `ase-agent-implementer`(1),
`ase-agent-qualifier`(1), `ase-agent-integrator`(1),
`ase-agent-editor`(1), `ase-agent-estimator`(1), `ase-task-board`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

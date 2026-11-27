# ase-task-chat(1) -- Chat with the Agent Tool about a Task

## SYNOPSIS

`ase task chat`
\[`-h`|`--help`\]
\[`-t`|`--tool` *tool*\]
\[*id*\]

## DESCRIPTION

**ase task chat** runs the agent tool interactively in the terminal,
in the root directory of the project and with the task *id* as the
active task of its session, so the skills of *ASE* default to this
task. The agent tool keeps the terminal until it ends.

Each task has its own *task chat*: the first chat about a task starts
a new session of the agent tool, and every later chat about the task
resumes this session, so the conversation continues where it ended.
If the agent tool ends with a non-zero exit status (not when ended by a
signal), the session is forgotten, and the next chat about the task
starts a new session.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-t`|`--tool` *tool*\]:
  The agent tool to chat with: `claude`, `copilot`, or `codex`. Only
  supported for `--tool claude`. Default: `$ASE_TOOL`, else `claude`.

## ARGUMENTS

- \[*id*\]:
  The id of the task, matching `[A-Za-z0-9#][A-Za-z0-9#_-]*`
  (default: `$ASE_TASK_ID`, else `default`).

## ENVIRONMENT

- `ASE_TASK_ID`:
  The default task id (default: `default`).

- `ASE_TOOL`:
  The default of `--tool`.

## FILES

- *per-user state directory*`/chat/`*project-id*`.yaml`:
  The session of the agent tool of the task chat of each task of the
  project, where the per-user state directory is described in
  **ase**(1).

## EXIT STATUS

The exit status of the agent tool, resp. `1` on a failure before (like
a missing terminal on standard input or output, or an unsupported
agent tool).

## EXAMPLES

```sh
# chat about a task, and later continue this chat
$ ase task chat json-export
```

## SEE ALSO

`ase`(1), `ase-task`(1), `ase-task-board`(1),
`ase-hook-session-start`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

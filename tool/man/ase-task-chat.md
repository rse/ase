# ase-task-chat(1) -- Chat with the Agent Tool about a Task

## SYNOPSIS

`ase task chat`
\[`-h`|`--help`\]
\[`-t`|`--tool` *tool*\]
\[*id*\]

## DESCRIPTION

**ase task chat** chats with the agent tool about the task *id*: the
agent tool runs interactively, in the root directory of the project and
with the task as the active task of its session, so the skills of *ASE*
default to this task. The chat is kept running by the *ASE* service
of the project (started on demand, see `ase-service`(1)), and the
terminal is attached to it, so

- the chat is detached from with `Alt`+`X` (or by closing the
  terminal) and keeps running, and a later **ase task chat** about the
  task shows its entire output again and continues it,

- the chats about different tasks run in parallel, each attached to
  from one terminal at a time (a second terminal is refused, as the
  chat is attached to elsewhere).

In macOS terminals, `Option`+`X` detaches where `Option` acts as
`Alt` (resp. Meta), and also as is where it types `≈` (e.g., in the
US, British, German, Swiss, French, and Spanish layouts).

A chat which no terminal is attached to ends after 30 minutes, and all
chats end with the *ASE* service. When the
agent tool ends (e.g., through its `/exit`), **ase task chat** ends,
too, and a later chat about the task starts the agent tool again.

Each task has its own *task chat*: the first chat about a task starts
a new session of the agent tool, and every later start of the agent
tool for the task resumes this session, so the conversation continues
where it ended. If the agent tool ends with a non-zero exit status by
itself (not when ended by a signal), the session is forgotten, and the
next chat about the task starts a new session.

The agent tool runs in a pseudo-terminal of the companion program
`pty-to-stdio`: the one found in `$PATH`, else the one fetched on
demand through `npx` (install it with `npm install -g pty-to-stdio`
to save this on every start).

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

`0` on detaching, the exit status of the agent tool on its end, and `1`
on a failure (like a missing terminal on standard input or output, an
unsupported agent tool, a failed start of `pty-to-stdio`, or a lost
connection to the *ASE* service).

## EXAMPLES

```sh
# chat about a task, and detach from it with Alt+X
$ ase task chat json-export

# later continue the chat
$ ase task chat json-export
```

## SEE ALSO

`ase`(1), `ase-task`(1), `ase-task-board`(1), `ase-service`(1),
`ase-hook-session-start`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

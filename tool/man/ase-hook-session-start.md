# ase-hook-session-start(1) -- Handle the SessionStart Hook Event

## SYNOPSIS

`ase hook session-start`
\[`-h`|`--help`\]
\[`-t`|`--tool` *tool*\]

## DESCRIPTION

**ase hook session-start** handles the `SessionStart` hook event of
*Anthropic Claude Code CLI* and *OpenAI Codex CLI*, resp. the
`sessionStart` hook event of *GitHub Copilot CLI*. It is intended to be
invoked by the agent tool internally as a configured hook handler only,
and not directly by end users.

The handler reads the event payload from standard input, a JSON object
with the session id (field `session_id`, resp. `sessionId` for *GitHub
Copilot CLI*) and the working directory (field `cwd`), and performs the
following steps:

1. It determines the plugin root directory from the environment
   variable `CLAUDE_PLUGIN_ROOT` (`claude`), `COPILOT_PLUGIN_ROOT`
   (`copilot`), resp. `PLUGIN_ROOT` or `CLAUDE_PLUGIN_ROOT` (`codex`),
   and reads the plugin manifest `.claude-plugin/plugin.json` (for the
   plugin version), the constitution `meta/ase-constitution.md`, and the
   output style `output-styles/ase-terse.md` from it.

2. It determines a version hint: a warning on a version mismatch
   between the tool and the plugin, a notice on a newer tool version
   available in the NPM registry (checked in the background at most
   once per hour), and a notice on a development setup (environment
   variable `ASE_SETUP_DEV` set).

3. For `--tool copilot` only, it changes into the project directory
   `cwd` of the payload, as *GitHub Copilot CLI* runs its hooks in the
   plugin installation directory.

4. It removes all session state directories below the *per-user state
   directory*`/session/` (except the one of the current session) which
   were not modified for more than 7 days, i.e., the leftovers of agent
   tool sessions which ended without running `ase hook session-end`.

5. It determines the project directory (the Git top-level directory of
   `cwd`, else `cwd` itself) and, for a valid session id (matching
   `[A-Za-z0-9._-]+`), persists the active task id (`$ASE_TASK_ID`,
   else `default`) and the project directory into the internal session
   state *per-user state directory*`/session/`*id*`/state.yaml`.

6. Inside a *tmux* pane, it sets the per-pane user option
   `@ase_agent_status` to `⏸` (ready).

7. It resolves the session information from the configuration
   cascade (with the scope `session:`*id* for a valid session id):
   the project id (a valid configured `project.id`, else derived from
   the project directory), the user id (`$USER`, else `$LOGNAME`, else
   `unknown`), the persona style `agent.persona`, the guidance level
   `agent.guidance`, the diagram format `agent.diagram.format`, the boxing
   transparency `project.boxing`, the task
   lifecycle model `project.task.lifecycle`, the defaults
   `project.task.default.source`, `project.task.default.changeset`, and
   `project.task.default.target`, the specification base directory
   `project.artifact.spec.basedir`, and the schema configuration
   `project.artifact.spec.schema`.

   A setting not explicitly configured in any scope falls back to the
   environment variables `ASE_PERSONA_STYLE`, `ASE_GUIDANCE_LEVEL`,
   `ASE_DIAGRAM_FORMAT`, `ASE_PROJECT_BOXING`, `ASE_PROJECT_TASK_LIFECYCLE`,
   `ASE_PROJECT_TASK_DEFAULT_SOURCE`,
   `ASE_PROJECT_TASK_DEFAULT_CHANGESET`, and
   `ASE_PROJECT_TASK_DEFAULT_TARGET`, and finally to the defaults
   `engineer`, `normal`, `auto`, `white`, `solo`, `worktree`,
   `worktree`, and `source`, where `agent.diagram.format` falls back
   to `auto`.

   Additionally, it probes the terminal environment on whether the
   agent tool can show inline images (Kitty or Ghostty, directly or
   through *tmux* with passthrough), yielding `image` or `text`, and
   resolves the diagram format `auto` to this probe result.

8. For `--tool claude` only, it appends `export` statements of the
   variables `ASE_VERSION`, `ASE_PLUGIN_ROOT`, `ASE_USER_ID`,
   `ASE_PROJECT_ID`, `ASE_PROJECT_BOXING`, `ASE_PROJECT_TASK_LIFECYCLE`,
   `ASE_PROJECT_TASK_DEFAULT_SOURCE`,
   `ASE_PROJECT_TASK_DEFAULT_CHANGESET`,
   `ASE_PROJECT_TASK_DEFAULT_TARGET`, `ASE_SPEC_BASEDIR`,
   `ASE_SPEC_SCHEMA`, `ASE_TASK_ID`, `ASE_SESSION_ID`, `ASE_HEADLESS`,
   and `ASE_AGENT_TOOL` to the file of the environment variable
   `CLAUDE_ENV_FILE` (if set), so they are available to all shell
   commands of the session.

9. It synchronizes the shim skills of the full aliases of the user and
   the project for the agent tool of the session (see `ase-alias`(1)),
   e.g., after a pull of a changed project alias file, and determines the
   skills with option aliases or option defaults. A failure is logged as
   a warning only.

10. It writes the hook output payload to standard output: the session
    information as XML-style tags (`<ase-version>`, `<ase-version-hint>`,
    `<ase-plugin-root>`, `<ase-persona-style>`, `<ase-guidance-level>`,
    `<ase-diagram-format>`, `<ase-diagram-probe>`, `<ase-user-id>`, `<ase-project-id>`, `<ase-project-boxing>`,
    `<ase-project-task-lifecycle>`,
    `<ase-project-task-default-source>`,
    `<ase-project-task-default-changeset>`,
    `<ase-project-task-default-target>`, `<ase-spec-basedir>`,
    `<ase-spec-schema>`, `<ase-getopt-tuned>` (the space-separated
    skills with option aliases or option defaults), `<ase-task-id>`,
    `<ase-session-id>`, `<ase-headless>`, and `<ase-agent-tool>`),
    followed by the constitution, with all `@`*file* references expanded
    recursively (relative to the referencing file, `~/` denoting the
    home directory).

    The persona rules are not part of this output, but are injected
    separately by `ase hook session-persona`, as agent tools like
    *Anthropic Claude Code CLI* show only a preview of a hook output
    beyond 10,000 characters.

    For `--tool copilot` and `--tool codex` only, the instructions of the
    output style `ase-terse` (with its YAML frontmatter stripped) are
    appended, as these agent tools have no output style concept, whereas
    *Anthropic Claude Code CLI* applies the plugin output style natively.
    The context is emitted as `hookSpecificOutput.additionalContext`
    (`claude` and `codex`), resp. as the top-level field
    `additionalContext` (`copilot`).

    Additionally, for `claude` and `codex`, unless running headless
    (`ASE_HEADLESS` is `true`) or with guidance level `none`, a
    deterministic *ASE* banner (version, user, project, task, session,
    persona, guidance, and boxing, plus usage hints for guidance level
    `normal` and `verbose`) is emitted as the top-level field
    `systemMessage`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

- \[`-t`|`--tool` *tool*\]:
  The agent tool whose event payload is read and whose hook output
  format is written: `claude` (*Anthropic Claude Code CLI*), `copilot`
  (*GitHub Copilot CLI*), or `codex` (*OpenAI Codex CLI*). Default:
  `$ASE_TOOL`, else `claude`.

## ENVIRONMENT

- `CLAUDE_PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT`, `PLUGIN_ROOT`:
  The plugin root directory, provided by the agent tool. The handler
  fails if the variable of the selected tool is unset or empty.

- `CLAUDE_ENV_FILE`:
  The environment file of *Anthropic Claude Code CLI*, receiving the
  exported session information.

- `ASE_TOOL`:
  The default of `--tool`.

- `ASE_TASK_ID`:
  The active task id of the session (default: `default`).

- `ASE_HEADLESS`:
  If `true`, the session runs headless, and no banner is emitted.

- `ASE_SETUP_DEV`:
  If set, the version hint notes a development setup.

- `ASE_PERSONA_STYLE`, `ASE_GUIDANCE_LEVEL`, `ASE_DIAGRAM_FORMAT`,
  `ASE_PROJECT_BOXING`, `ASE_PROJECT_TASK_LIFECYCLE`, `ASE_PROJECT_TASK_DEFAULT_SOURCE`,
  `ASE_PROJECT_TASK_DEFAULT_CHANGESET`,
  `ASE_PROJECT_TASK_DEFAULT_TARGET`:
  The fallbacks of the settings not explicitly configured.

- `USER`, `LOGNAME`:
  The user id.

- `TMUX`, `TMUX_PANE`:
  The *tmux* pane whose user option `@ase_agent_status` is set.

## FILES

- *per-user state directory*`/session/`*id*`/state.yaml`:
  The internal session state, holding the active task id and the
  project directory of the session.

## EXIT STATUS

Exits with status `0` on success, and with status `1` if the plugin
root directory cannot be determined, a plugin file cannot be read, or
`--tool` is invalid.

## SEE ALSO

`ase`(1), `ase-hook`(1), `ase-hook-session-persona`(1),
`ase-hook-session-end`(1), `ase-config`(1),
`ase-statusline`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

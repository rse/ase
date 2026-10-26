# ase-mcp(1) -- Bridge Stdio MCP to the Per-Project Service

## SYNOPSIS

`ase mcp`
\[`-h`|`--help`\]

## DESCRIPTION

**ase mcp** is a Model-Context-Protocol (MCP) server speaking the
stdio transport: it accepts MCP messages on standard input, forwards
them to the per-project background service of `ase-service`(1) via the
Streamable HTTP transport (`http://127.0.0.1:`*port*`/mcp`), and writes
the responses to standard output.

It is configured as the stdio MCP server `ase` of the *ASE* plugin in
the agent tool and is not intended to be invoked directly by end users.
All log messages go to standard error (or to the file of the global
`--log-file` option), as standard output carries the MCP protocol.

On start, the service of the project is probed and auto-started (via
`ase service start`) if it is not running yet. The bridge then lives as
long as its standard input is open, and is robust against a vanishing
service:

- Messages arriving while no service connection exists are buffered
  (up to 100 messages, dropping the oldest ones on overflow) and sent
  once the connection is (re-)established.

- A message whose connection breaks before the service responds is sent
  once more, and a request still failing is answered with a JSON-RPC
  error (`ase service unreachable:` *reason*).

- On a lost or refused connection, the service is auto-started again
  and the connection is re-established, with a delay growing from 0.5
  up to 10 seconds between the attempts.

- Every 30 seconds, the service is probed, and a vanished service
  triggers the same reconnect.

Under *GitHub Copilot CLI* (detected by the environment variable
`COPILOT_PLUGIN_ROOT`), the MCP server is started in the plugin
installation directory instead of the project. Hence, the bridge first
answers all MCP messages in-process through the same set of MCP tools
the service provides (covering the MCP handshake and the tool listing),
holds back all tool calls, and waits until the `SessionStart` hook (see
`ase-hook`(1)) recorded the project directory of the session (with id
`COPILOT_AGENT_SESSION_ID`).

It then switches into this directory, starts or connects the service
of the project there, and forwards the held tool calls. If no project
directory is recorded within 30 seconds of the first held tool call, it
falls back to the current directory.

The service provides the `ase_*` MCP tools of the skills, e.g.,
`ase_ping`, `ase_config_get`, `ase_config_set`, `ase_config_delete`,
`ase_config_list`, `ase_state_get`, `ase_state_set`,
`ase_state_delete`, `ase_kv_get`, `ase_kv_set`, `ase_kv_delete`,
`ase_kv_clear`, `ase_kv_batch`, the `ase_task_*` tools, `ase_artifact_list`,
`ase_artifact_name`, `ase_specbook_lint`, `ase_specbook_export`,
`ase_diagram`, `ase_worktree_path`, `ase_mint`, `ase_text_metric`,
`ase_getopt`, `ase_markdown_prepare`, `ase_timestamp`, `ase_sleep`,
`ase_compat`, `ase_component_info`, and `ase_decision_matrix`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information and exit.

## ENVIRONMENT

- `COPILOT_PLUGIN_ROOT`, `COPILOT_AGENT_SESSION_ID`:
  Exported by *GitHub Copilot CLI* to its MCP servers. When both are
  set (and the session id matches `[A-Za-z0-9._-]+`), the service is
  deferred until the project directory of the session is known (see
  **DESCRIPTION**).

## FILES

- `.ase/service.yaml`:
  The persisted port of the per-project service.

- *per-user state directory*`/session/`*id*`/state.yaml`:
  The internal session state, from which the project directory
  (`basedir`) recorded by the `SessionStart` hook is read under *GitHub
  Copilot CLI*.

## EXIT STATUS

`0` once standard input is closed, `1` if the service cannot be
started initially.

## EXAMPLES

```sh
# register the bridge manually as an MCP server in Claude Code
$ claude mcp add ase -- ase mcp
```

## SEE ALSO

`ase`(1), `ase-service`(1), `ase-hook`(1), `ase-setup`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>

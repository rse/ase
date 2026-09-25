
Task REST API
=============

SCOPE
-----

The API manages the persisted *task plans* of one or more *projects*,
each project identified by a *project id* (`prjId`) and each task plan
by a *task id* (`taskId`) unique within its project. It covers:

- listing, loading, saving, deleting, and renaming task plans,
- getting and setting the lifecycle status of a task plan, and
- purging task plans by age.

The API is *stateless*: every request is self-contained and carries the project
*prjId* and (where applicable) the task *taskId* it operates on, and there is
*no session concept*. In particular, the API has no notion of an *active task
id* -- that is a concern of the agent session, not of task management.

SERVER
------

The API is served by a *dedicated* HTTP server, separate from the
`ase service` background service (which keeps serving `/mcp` and
`/command` only) and with its own port and lifecycle. A single server
is *per user* (not per project) and serves *all* projects registered
with it (see the *project* endpoints below); a *prjId* not registered
is rejected with `404`. How the server maps a registered project onto
its storage is a server configuration concern outside this API. Its
wiring is proposed as:

- `ase task store start` \[`-a`|`--address` *host*\] \[`-p`|`--port` *port*\]
  \[`-t`|`--token` *token*\] \[`-c`|`--cors` *origin*\] \[`-m`|`--module` *name*\]
  \[`-d`|`--basedir` *dir*\] \[`-s`|`--solo`|`--no-solo`\] \[`--tls-cert` *file* `--tls-key` *file*\]:
  Start the server in the background, binding to *host* (default
  `127.0.0.1`) and *port* (default: allocated randomly and persisted
  into *per-user config dir*`/store.yaml`), expecting the bearer
  *token* (see below), allowing cross-origin browser requests from
  *origin* (repeatable, see *CORS* below), and loading the storage
  plugin *name* (default: the `storage.plugin` key of *per-user config
  dir*`/store.yaml`, else the built-in `ase` plugin, see *Storage
  plugin API* below), with *dir* and `--solo`/`--no-solo` configuring the
  built-in plugin, and serving HTTPS with the PEM certificate and key *file*s
  (see *TLS* below). Idempotent if already running, but restarts the
  server if an explicitly given option deviates from its configuration. The
  server logs into *per-user config dir*`/store.log`.

- `ase task store status`:
  Report whether the server is running, and on which address and port.

- `ase task store stop`:
  Stop the server.

Every request has to carry a *bearer token* in the `Authorization`
header:

```
Authorization: Bearer <token>
```

The token is taken from the `--token` option, else the `ASE_TASK_STORE_TOKEN`
environment variable, else the `token` key of *per-user config
dir*`/store.yaml`; if none is set, `ase task store start` generates a
random token. The effective token is persisted into *per-user config
dir*`/store.yaml` alongside the address, port, and process id, so `ase
task store status` and `ase task store stop` probe with the token the
running server expects. A missing, malformed, or wrong token is
rejected with `401`. The token
grants *full* access to *all* projects, as the API has no per-project or
per-operation authorization.

A *browser-based* client (like a Kanban dashboard) served from another
origin is subject to the browser's same-origin policy, so the server
supports *Cross-Origin Resource Sharing* (CORS) for the origins listed
under the `cors` key of *per-user config dir*`/store.yaml` (a list of
origins like `http://localhost:5173`, or the single entry `*` for any
origin), overridable by `--cors`. With no origin configured (the
default), no CORS headers are emitted and cross-origin browser requests
fail. For an allowed origin, *every* response (including error
responses like `401`) carries `Access-Control-Allow-Origin` (plus
`Vary: Origin` unless `*`) and `Access-Control-Expose-Headers:
Location`, and a preflight `OPTIONS` request is answered with `204`,
`Access-Control-Allow-Methods: GET, PUT, POST, PATCH, DELETE`,
`Access-Control-Allow-Headers: Authorization, Content-Type`, and
`Access-Control-Max-Age`, *without* requiring the bearer token (a
preflight carries none). WebSocket handshakes are not subject to CORS
and authenticate via the `token` query parameter instead.

As the bearer token travels in every request, a server reachable beyond
the local host *SHOULD* be accessed via *TLS* only, and `ase task store
start` warns about binding to a non-loopback address without TLS. The
server can terminate TLS *itself*: with `--tls-cert` and `--tls-key`
(PEM files, default: the `tls.cert` and `tls.key` keys of *per-user
config dir*`/store.yaml`, into which the effective paths are persisted),
it serves HTTPS (and `wss://` for the event endpoint) instead of HTTP,
and `ase task store status` and `ase task store stop` probe it via
HTTPS, without verifying the certificate, as it rarely covers the
loopback address being probed:

```sh
ase task store start --address 0.0.0.0 --port 42042 \
    --tls-cert /etc/ssl/tasks.example.com.crt \
    --tls-key /etc/ssl/tasks.example.com.key
```

Alternatively, the server stays bound to the loopback address and a
*TLS reverse proxy* in front of it terminates TLS, like *Caddy*
(which also obtains the certificate automatically and proxies WebSocket
handshakes transparently):

```
tasks.example.com {
    reverse_proxy 127.0.0.1:42042
}
```

or *nginx* (where the WebSocket handshake of the event endpoint needs
the explicit `Upgrade` and `Connection` header forwarding):

```
server {
    listen              443 ssl;
    server_name         tasks.example.com;
    ssl_certificate     /etc/ssl/tasks.example.com.crt;
    ssl_certificate_key /etc/ssl/tasks.example.com.key;
    location / {
        proxy_pass         http://127.0.0.1:42042;
        proxy_http_version 1.1;
        proxy_set_header   Host       $host;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_read_timeout 1h;
    }
}
```

In both cases, a client connects with the `ases://` URL scheme (see
*Clients* below), e.g. `ases://tasks.example.com:443`.

CLIENTS
-------

The `ase task` CLI sub-commands and the `ase_task_*` MCP tools are the
primary clients of this API. A client resolves the server *address*,
*port*, and optional *token* from the `project.task.store` configuration URL
`ase://`*addr*`:`*port*\[`/`*token*\] (without an embedded *token*, the
token is taken from `ASE_TASK_STORE_TOKEN`, else the user-scoped
`project.task.token` configuration, else the `token` key of *per-user
config dir*`/store.yaml`) -- or, via HTTPS, from the URL
`ases://`*addr*`:`*port*\[`/`*token*\]\[`?insecure`\], verifying the
server certificate against the Node.js CA store (extendable via
`NODE_EXTRA_CA_CERTS` for a private CA or a self-signed certificate)
unless `?insecure` skips the verification --, and the *prjId* of the current
working copy from the `project.id` configuration value (required
here, as the basename of the project root would likely collide with
unrelated projects), registering the project on first use via
`PUT /projects/{prjId}` with `If-None-Match: *` and its
`project.task.lifecycle`, and otherwise adopting the lifecycle model
of the registered project (see `ase task lifecycle`). The
alternative URL form `ase:`*path* (the default `ase:./.ase/task`)
runs the very same API functionality *in-process* on the built-in
storage plugin in `solo` mode below *path*, without any server. The
following responsibilities stay on the *client* side, as the API is
deliberately agnostic of them:

- **Serialization**: the client converts between the textual task
  format (see `ase-format-task.md`) used by `ase task load`/`save` and
  `ase_task_load`/`save` and the JSON task plan structure of the API.
  The server serializes only if its own storage happens to be this
  textual representation; for any other storage mechanism only the
  client serializes and unserializes.

- **Normalization**: the client lifts a *legacy* plan (glyph header
  lines, missing `Type`, legacy `Status` values, `Properties` key) into
  the current task format *before* a `PUT`, as the API rejects a
  non-conformant plan with `422` instead of storing it as-is.

- **Minimal header**: a client creating a plan without content (like
  `ase task edit` for a not yet existing *taskId*) synthesizes the
  minimal header `{ "Type": "text/vnd.ase.task", "Id": "<taskId>" }`
  with an empty `body`, as `PUT` requires both parts.

- **Effective status**: the client derives the effective lifecycle
  status of a plan as its `Status` header key, falling back to the
  `initial` state of the project's lifecycle model
  (`GET /projects/{prjId}`) when the key is absent.

- **Rendering**: the rendering-prepared form of a plan (the `render`
  variant of `ase_task_load` and the `render` option of
  `ase_task_save`) is produced by the client.

- **Active task id**: the session-scoped active task id
  (`ase_task_id`, `agent.task`) is kept in the client's configuration.

CONVENTIONS
-----------

- **Base path**: all endpoints are relative to `http://`*host*`:`*port*
  (resp. `https://`*host*`:`*port* with TLS) and are *unversioned*.

- **Project ids**: a project *prjId* matches `[A-Za-z0-9_-]+` and
  identifies a project registered with the server (its `project.id`
  configuration value); a *prjId* violating this constraint is rejected
  with `422`, an unregistered one with `404`.

- **Task ids**: a task *taskId* matches `[A-Za-z0-9_-]+` and is unique
  within its project; a *taskId* violating this constraint is rejected
  with `422`.

- **Request bodies**: JSON, sent with `Content-Type: application/json`.
  A malformed body is rejected with `400`.

- **Response bodies**: JSON (`application/json`) for successful
  responses, *problem details* (`application/problem+json`, RFC 9457)
  for error responses. A `204` response has no body.

- **Task plans**: a task plan is exchanged as a JSON structure with the
  three top-level keys `header`, `body`, and `attachment`, mirroring
  the three parts of the task format (its frontmatter, body, and
  backmatter, see `ase-format-task.md`):

  ```json
  {
      "header": {
          "Type":     "text/vnd.ase.task",
          "Id":       "T1",
          "Created":  "2026-09-14 21:27",
          "Modified": "2026-09-14 21:27",
          "Group":    "rest-api",
          "After":    [ "T0" ],
          "Status":   "OPEN",
          "Kind":     "CRAFTING",
          "Tags":     [ "grilled:specification", "grilled:design" ],
          "Branch":   "current"
      },
      "body": "#   TASK: Add REST API\n\n##  SPECIFICATION (WHAT)\n\n-   [ ] DOM: **[...]**: [...]\n[...]",
      "attachment": [
          {
              "Type":     "text/x-diff; charset=utf-8; kind=\"preflight\"",
              "Desc":     "implementation draft",
              "Created":  "2026-09-14 21:30",
              "Modified": "2026-09-14 21:30",
              "Data":     "diff --git a/[...]"
          },
          {
              "Type":     "image/png",
              "Desc":     "architecture sketch",
              "File":     "T1-sketch.png"
          }
      ]
  }
  ```

  - `header`: a flat key/value object of the header metadata
    with the following keys and value types:

    | Key        | Type       | Value                                                        |
    | ---------- | ---------- | ------------------------------------------------------------ |
    | `Type`     | `string`   | always `text/vnd.ase.task`                                   |
    | `Id`       | `string`   | always the *taskId* of the request path                      |
    | `Created`  | `string`   | creation timestamp (`YYYY-MM-DD HH:MM`)                      |
    | `Modified` | `string`   | body modification timestamp (`YYYY-MM-DD HH:MM`)             |
    | `Group`    | `string`   | name of the group (epic) the task belongs to                 |
    | `Phase`    | `string`   | name of the phase (stage, sprint) the task belongs to        |
    | `After`    | `string[]` | ids of the tasks this task is executed after                 |
    | `Status`   | `string`   | lifecycle state (see *Lifecycle model* below)                |
    | `Assignee` | `string`   | name of the assigned human or agent                          |
    | `Kind`     | `string`   | `SPECIFYING`, `CRAFTING`, `REFACTORING`, or `RESOLVING`      |
    | `Tags`     | `string[]` | tags, each a plain `key` marker or a `key:value` pair        |
    | `Branch`   | `string`   | Git branch of the implementation (`current` for checked-out) |

    Every key except `Type` and `Id` is optional and, when absent,
    reads as its default value (an empty array for the array-typed
    keys). Unknown keys are passed through as plain strings. A key
    carrying a value of the wrong type is rejected with `422`.

  - `body`: the Markdown source of the plan body. Outside a fenced code
    block, it *MUST NOT* contain a line consisting of just `---` directly
    followed by a line starting with `Type:` (which would be read as the
    start of an attachment), and it *MUST NOT* end within an unclosed
    fenced code block (which would swallow all attachments).

  - `attachment`: an array of attachments, each a flat key/value object
    with the mandatory key `Type` (a MIME type other than
    `text/vnd.ase.task`), the optional keys `Desc`, `Created`, and
    `Modified`, and *exactly one* of `Data` (the embedded content) or
    `File` (a reference to externally stored content), all values plain
    strings. An empty array denotes no attachments.

  The API neither renders nor otherwise transforms the plan beyond the
  following *normalization on input*, which mirrors what the textual
  task plan format can represent: header string values, array items,
  and attachment values other than `Data` are trimmed of surrounding
  whitespace; empty array items are dropped; the `Status` value is
  upper-cased; `body` and `Data` get LF line endings; and a non-empty
  `body` ends with exactly one newline (an empty `body` stays empty).
  `Data` is otherwise stored verbatim, including an empty value or a
  missing trailing newline. Hence, what is loaded is exactly what was
  saved after this normalization, and the responses of write
  operations report the normalized values.

- **Task titles**: the *title* of a task plan is not a header key but
  the `<task-title/>` of the leading heading line `#   TASK:
  <task-title/>` of its body (see `ase-format-task.md`). It is
  *derived* as the text following `TASK:` on the first body line
  matching `^#\s+TASK:\s*(.*)$`, with surrounding whitespace trimmed,
  and reads as the empty string if no such line exists. The listing
  and the events report it, so a client can render a task overview
  (like a Kanban board) without loading the plans.

- **Lifecycle model**: the `Status` header key of a plan is
  interpreted against the task lifecycle model of its *project*
  (selected at project registration, see `PUT /projects/{prjId}`, and
  queryable via `GET /projects/{prjId}`):

  | Model        | States (initial first)                                                                                                                                | Finished                   |
  | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
  | `solo`       | `OPEN`, `SHELVED`, `CLOSED`, `CANCELLED`                                                                                                              | `CLOSED`, `CANCELLED`      |
  | `team`       | `PLANNING`, `SHELVED`, `IMPLEMENTING`, `STALLED`, `IMPLEMENTED`, `CANCELLED`                                                                          | `IMPLEMENTED`, `CANCELLED` |
  | `enterprise` | `DRAFTED`, `SHELVED`, `PLANNING`, `PLANNED`, `STALLED`, `IMPLEMENTING`, `IMPLEMENTED`, `DECLINED`, `APPROVING`, `APPROVED`, `DEFERRED`, `INTEGRATING`, `INTEGRATED`, `CANCELLED` | `INTEGRATED`, `CANCELLED`  |

  A plan without a `Status` key reads as the *initial* state of the
  model. States are matched *case-insensitively* on input and reported
  *upper-case* on output.

- **Transitions**: a changed status has to be a state of the model and
  *reachable* from the previous status via one or more transitions of
  the model (as one operation may perform several lifecycle stages in
  one go); otherwise the request is rejected with `422`. An unchanged
  status is always accepted, and a previous status which is no state of
  the model may change to any state of the model.

- **Errors**: a problem details body has the shape

  ```json
  {
      "type":     "about:blank",
      "title":    "Not Found",
      "status":   404,
      "detail":   "no task \"T1\" in project \"ase\"",
      "instance": "/projects/ase/tasks/T1"
  }
  ```

  with the status codes `400` (malformed request), `401` (missing or
  invalid bearer token), `404` (no such project, task, header
  key, attachment, or attachment key), `409` (conflict, e.g. rename
  target exists), `422` (invalid id, state, or field value), and `500`
  (internal error, with a generic `detail` only, as the actual cause
  is written to the service log).

ENDPOINTS
---------

The *project* endpoints register the projects and expose their
lifecycle model:

| Method   | Path                | Purpose                                       |
| -------- | ------------------- | --------------------------------------------- |
| `GET`    | `/projects`         | List the registered projects                  |
| `GET`    | `/projects/{prjId}` | Get a project and its lifecycle model         |
| `PUT`    | `/projects/{prjId}` | Register a project or change its lifecycle    |
| `DELETE` | `/projects/{prjId}` | Unregister a project                          |

The *task plan* endpoints operate on entire plans:

| Method   | Path                               | Purpose                                               |
| -------- | ---------------------------------- | ----------------------------------------------------- |
| `GET`    | `/projects/{prjId}/tasks`          | List task plans (optionally filtered and with header) |
| `DELETE` | `/projects/{prjId}/tasks`          | Purge task plans older than a given age               |
| `GET`    | `/projects/{prjId}/tasks/{taskId}` | Load a task plan                                      |
| `PUT`    | `/projects/{prjId}/tasks/{taskId}` | Create or overwrite a task plan                       |
| `PATCH`  | `/projects/{prjId}/tasks/{taskId}` | Change the lifecycle status and/or rename a task plan |
| `DELETE` | `/projects/{prjId}/tasks/{taskId}` | Delete a task plan                                    |

The *part* endpoints operate on the three parts of an *existing* plan
(`{task}` abbreviates `/projects/{prjId}/tasks/{taskId}` below):

| Method   | Path                              | Purpose                                             |
| -------- | --------------------------------- | --------------------------------------------------- |
| `GET`    | `{task}/header`                   | Get the entire header                               |
| `PUT`    | `{task}/header`                   | Replace the entire header                           |
| `GET`    | `{task}/header/{key}`             | Get a header value                                  |
| `PUT`    | `{task}/header/{key}`             | Create or update a header value                     |
| `DELETE` | `{task}/header/{key}`             | Delete a header key                                 |
| `GET`    | `{task}/body`                     | Get the body                                        |
| `PUT`    | `{task}/body`                     | Replace the body                                    |
| `GET`    | `{task}/attachment`               | Get all attachments, or find them by `Type`         |
| `POST`   | `{task}/attachment`               | Append an attachment                                |
| `GET`    | `{task}/attachment/{index}`       | Get an attachment                                   |
| `PUT`    | `{task}/attachment/{index}`       | Replace an attachment                               |
| `DELETE` | `{task}/attachment/{index}`       | Delete an attachment                                |
| `GET`    | `{task}/attachment/{index}/{key}` | Get an attachment value                             |
| `PUT`    | `{task}/attachment/{index}/{key}` | Create or update an attachment value                |
| `DELETE` | `{task}/attachment/{index}/{key}` | Delete an attachment key                            |

All part endpoints respond with `404` if no project *prjId* or no task
plan *taskId* exists, and with `422` for an invalid *taskId*. The API
never touches the `Created` and `Modified` keys itself: keeping them
up-to-date is the responsibility of the caller.

The *event* endpoint pushes modification notifications:

| Method      | Path                       | Purpose                                    |
| ----------- | -------------------------- | ------------------------------------------ |
| `WebSocket` | `/projects/{prjId}/events` | Subscribe to task plan change events       |

### GET /projects

List all projects registered with the server in lexicographic *prjId*
order.

Response `200`:

```json
{
    "projects": [
        { "id": "ase",  "lifecycle": "solo" },
        { "id": "shop", "lifecycle": "team" }
    ]
}
```

- `id`: the project identifier.
- `lifecycle`: the name of the project's task lifecycle model.

An empty `projects` array is returned if no project is registered.

```sh
curl -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects"
```

### GET /projects/{prjId}

Get the project *prjId* and its task lifecycle model, so a client can
validate states, derive the effective status of a plan, and expand
the `finished` sentinel itself.

Response `200`:

```json
{
    "id": "ase",
    "lifecycle": {
        "name":     "solo",
        "states":   [ "OPEN", "SHELVED", "CLOSED", "CANCELLED" ],
        "initial":  "OPEN",
        "finished": [ "CLOSED", "CANCELLED" ],
        "transitions": {
            "OPEN":      [ "SHELVED", "CLOSED", "CANCELLED" ],
            "SHELVED":   [ "OPEN", "CANCELLED" ],
            "CLOSED":    [],
            "CANCELLED": []
        }
    }
}
```

- `id`: the project identifier.
- `lifecycle.name`: the name of the lifecycle model.
- `lifecycle.states`: all states of the model.
- `lifecycle.initial`: the state an absent `Status` key reads as.
- `lifecycle.finished`: the states the `finished` sentinel expands to.
- `lifecycle.transitions`: the allowed successor states per state.

Errors: `404` if no project *prjId* is registered, `422` for an
invalid *prjId*.

```sh
curl -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase"
```

### PUT /projects/{prjId}

Register the project *prjId* with the server, or change the lifecycle
model of an already registered project. Registering is idempotent: a
repeated `PUT` with the same lifecycle changes nothing. With the request
header `If-None-Match: *`, the project is registered only if not yet
registered, so a client can register on first use without overriding
the lifecycle model other clients already share.

Request body:

```json
{
    "lifecycle": "solo"
}
```

- `lifecycle` (optional): the name of the task lifecycle model,
  `solo`, `team`, or `enterprise`. If omitted, a registered project
  keeps its current model and a new project gets `solo`. Changing the model of a
  registered project *maps* the explicit `Status` of its existing plans
  onto the new model: a state of the new model with the same name or
  closest meaning (a *finished* state onto a *finished* state), else the
  *initial* (resp. first *finished*) state of the new model (e.g. `solo`
  → `team`: `OPEN` → `PLANNING`, `CLOSED` → `IMPLEMENTED`). A status
  which is no state of the old model is kept as-is.

Response `201` (registered) or `200` (changed), with the same shape as
`GET /projects/{prjId}`.

Errors: `400` for a malformed body, `412` for an already registered
project under `If-None-Match: *`, `422` for an invalid *prjId* or an
unknown `lifecycle`.

```sh
curl -X PUT -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{ "lifecycle": "solo" }' \
    "http://127.0.0.1:42042/projects/ase"
```

### DELETE /projects/{prjId}

Unregister the project *prjId*. Its task plans are no longer reachable
through the API, but are *not* deleted (purge or delete them
beforehand if intended); event subscriptions of the project are closed
with close code `1001`.

Response `204` without body.

Errors: `404` if no project *prjId* is registered, `422` for an
invalid *prjId*.

```sh
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase"
```

### GET /projects/{prjId}/tasks

List all persisted task plans of the project *prjId* in lexicographic
*taskId* order.

Query parameters:

- `include` (optional): comma-separated list of lifecycle states to
  list, `finished` for the finished states of the model, or `none`
  (default) for no restriction.

- `exclude` (optional): comma-separated list of lifecycle states to
  *not* list, `finished` for the finished states of the model, or
  `none` (default) for no exclusion. Applied after `include`.

- `fields` (optional): `header` to additionally include the entire
  header of each plan (so a client can group or filter by `Group`,
  `Phase`, `Assignee`, `Kind`, or `Tags` without loading the plans),
  or `none` (default) for the minimal entries.

A state which is not a state of the model is rejected with `422`, as is
an `include`/`exclude` combination cancelling out to an empty state set
or a `fields` value other than the ones above. A task plan carrying an
*unknown* status is always listed.

Response `200`:

```json
{
    "tasks": [
        { "id": "T1", "status": "OPEN",   "title": "Add REST API",   "mtime": "2026-09-14 21:27" },
        { "id": "T2", "status": "CLOSED", "title": "Fix CLI parser", "mtime": "2026-09-12 08:03" }
    ]
}
```

- `id`: the task identifier.
- `status`: the lifecycle status of the plan.
- `title`: the title of the plan (see *Task titles* above).
- `mtime`: the last modification time of the task plan, formatted as
  `YYYY-MM-DD HH:MM`.
- `header`: the entire header of the plan (present only with
  `fields=header`), as in the task plan structure.

An empty `tasks` array is returned if no task plans exist.

Errors: `404` if no project *prjId* is registered.

```sh
curl -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase/tasks?exclude=finished"
curl -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase/tasks?fields=header"
```

### DELETE /projects/{prjId}/tasks

Purge all task plans of the project *prjId* whose last modification
time is older than a given age.

Query parameters:

- `age` (mandatory): maximum age as `<number><unit>`, where *unit* is
  one of `h` (hour), `d` (day), `m` (month, 30 days), or `y` (year, 365
  days). Unlike `ase task purge`, there is *no* default: a missing or
  malformed `age` is rejected with `400`, so a bulk deletion is always
  explicit.

Response `200`:

```json
{
    "purged": [ "T2", "T7" ]
}
```

- `purged`: the ids of the removed task plans (empty if none).

Errors: `404` if no project *prjId* is registered.

```sh
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase/tasks?age=31d"
```

### GET /projects/{prjId}/tasks/{taskId}

Load the task plan *taskId* of the project *prjId*.

Response `200`: the task plan structure (see *Task plans* above):

```json
{
    "header": {
        "Type":     "text/vnd.ase.task",
        "Id":       "T1",
        "Created":  "2026-09-14 21:27",
        "Modified": "2026-09-14 21:27",
        "Status":   "OPEN"
    },
    "body": "#   TASK: Add REST API\n\n##  SPECIFICATION (WHAT)\n[...]",
    "attachment": []
}
```

- `header`: the header metadata of the plan.
- `body`: the Markdown source of the plan body.
- `attachment`: the attachments of the plan.

Errors: `404` if no project *prjId* or no task plan *taskId* exists,
`422` for an invalid *taskId*.

```sh
curl -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase/tasks/T1"
```

### PUT /projects/{prjId}/tasks/{taskId}

Create or overwrite the task plan *taskId* of the project *prjId* with
the given task plan structure.

Request body: the task plan structure (see *Task plans* above):

```json
{
    "header": {
        "Type":     "text/vnd.ase.task",
        "Id":       "T1",
        "Created":  "2026-09-14 21:27",
        "Modified": "2026-09-14 21:27",
        "Status":   "CLOSED"
    },
    "body": "#   TASK: Add REST API\n\n##  SPECIFICATION (WHAT)\n[...]",
    "attachment": []
}
```

- `header` (mandatory): the header metadata of the plan. A
  `Type` other than `text/vnd.ase.task` or an `Id` other than *taskId*
  is rejected with `422`; both keys are filled in if absent.
- `body` (mandatory): the Markdown source of the plan body.
- `attachment` (optional): the attachments of the plan (default: none).

The `Status` header key is checked against the lifecycle model:
an unknown state or a state not reachable from the previously saved
status is rejected (see *Transitions*).

Response `201` (created) or `200` (overwritten):

```json
{
    "id":     "T1",
    "status": "OPEN"
}
```

- `id`: the task identifier.
- `status`: the lifecycle status of the saved plan.

Errors: `400` for a malformed body or a missing `header` or
`body` field, `404` if no project *prjId* is registered, `422` for an invalid
*taskId*, a mismatching `Type` or `Id`, a header value of the
wrong type, an unknown or unreachable `Status`, a `body` violating
the body structure, or an attachment violating the attachment structure.

```sh
curl -X PUT -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @plan.json \
    "http://127.0.0.1:42042/projects/ase/tasks/T1"
```

### PATCH /projects/{prjId}/tasks/{taskId}

Change the lifecycle status of the task plan *taskId* of the project
*prjId* and/or rename it.

Request body (at least one field is mandatory):

```json
{
    "status": "closed",
    "id":     "T1-done"
}
```

- `status` (optional): the new lifecycle status, a state of the model
  (case-insensitive). Only the `Status` header key is rewritten;
  the `Modified` key is left alone, as it tracks body changes only. A
  state not reachable from the current status is rejected.

- `id` (optional): the new task identifier, unique within the project.
  The `Id` header key of the plan is rewritten accordingly. A task
  plan cannot be moved to another project.

If both fields are given, the status change is applied *before* the
rename. The response reports the *resulting* task.

Response `200`:

```json
{
    "id":     "T1-done",
    "status": "CLOSED",
    "from":   "OPEN"
}
```

- `id`: the (possibly new) task identifier.
- `status`: the (possibly new) lifecycle status.
- `from`: the previous lifecycle status (present only if `status` was given).

Errors: `400` for a malformed body or a body without any field, `404`
if no project *prjId* or no task plan *taskId* exists, `409` if the
rename target already exists, `422` for an invalid *taskId*, an invalid
new `id`, or an unknown or unreachable `status`.

```sh
curl -X PATCH -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{ "status": "closed" }' \
    "http://127.0.0.1:42042/projects/ase/tasks/T1"
```

### DELETE /projects/{prjId}/tasks/{taskId}

Delete the task plan *taskId* of the project *prjId*.

Response `204` without body.

Errors: `404` if no project *prjId* or no task plan *taskId* exists,
`422` for an invalid *taskId*.

```sh
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase/tasks/T1"
```

### GET {task}/header

Get the entire header of the task plan.

Response `200`: the `header` object of the task plan structure.

```sh
curl -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/header"
```

### PUT {task}/header

Replace the entire header of the task plan; keys absent from the
request are removed.

Request body: the `header` object of the task plan structure. A
`Type` other than `text/vnd.ase.task` or an `Id` other than *taskId* is
rejected with `422`; both keys are filled in if absent.

The `Status` key is checked against the lifecycle model: an unknown
state or a state not reachable from the current status is rejected
(see *Transitions*).

Response `200`:

```json
{
    "id":     "T1",
    "status": "OPEN"
}
```

- `id`: the task identifier.
- `status`: the lifecycle status of the plan.

Errors: `400` for a malformed body, `422` for a mismatching `Type` or
`Id`, a value of the wrong type, or an unknown or unreachable `Status`.

```sh
curl -X PUT -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @header.json \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/header"
```

### GET {task}/header/{key}

Get the value of the header key *key*.

Response `200`:

```json
{
    "value": [ "grilled:specification", "grilled:design" ]
}
```

- `value`: the value of the key, typed as defined for the key (`string`
  or `string[]`).

Errors: `404` if the key is absent.

```sh
curl -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/header/Tags"
```

### PUT {task}/header/{key}

Create or update the header key *key*.

Request body:

```json
{
    "value": "closed"
}
```

- `value`: the new value of the key, typed as defined for the key
  (`string` or `string[]`).

Setting `Status` behaves like `PATCH {task}` with `status`: the value
is matched case-insensitively against the lifecycle model, an unknown
or unreachable state is rejected with `422`. Setting
`Type` or `Id` to a value other than the fixed one is rejected with
`422`.

Response `200` (updated) or `201` (created):

```json
{
    "key":   "Status",
    "value": "CLOSED"
}
```

- `key`: the key.
- `value`: the stored value (a status is reported upper-case).

Errors: `400` for a malformed body or a missing `value`, `422` for a
value of the wrong type, an unknown or unreachable `Status` state, or a mismatching
`Type` or `Id`.

```sh
curl -X PUT -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{ "value": "closed" }' \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/header/Status"
```

### DELETE {task}/header/{key}

Delete the header key *key*, so it reads as its default value
again.

Response `204` without body.

Errors: `404` if the key is absent, `422` for the non-deletable keys
`Type` and `Id`.

```sh
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/header/Branch"
```

### GET {task}/body

Get the body of the task plan.

Response `200`:

```json
{
    "body": "#   TASK: Add REST API\n\n##  SPECIFICATION (WHAT)\n[...]"
}
```

- `body`: the Markdown source of the plan body.

```sh
curl -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/body"
```

### PUT {task}/body

Replace the body of the task plan.

Request body: the same shape as the `GET {task}/body` response.

Response `204` without body.

Errors: `400` for a malformed body or a missing `body` string, `422`
for a `body` violating the body structure.

```sh
curl -X PUT -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @body.json \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/body"
```

### GET {task}/attachment

Get all attachments of the task plan, or find the attachments of a
particular `Type`.

Query parameters:

- `type` (optional): the `Type` to find. A value *with* MIME
  parameters (like `text/x-diff; charset=utf-8; kind="preflight"`)
  matches an attachment `Type` *exactly*; a value *without* parameters
  (like `text/x-diff`) matches every attachment whose `Type` has this
  media type, regardless of its parameters. Matching is
  case-insensitive.

Response `200` without `type`: the `attachment` array of the task plan
structure, in attachment order (the array position is the *index* of
the attachment).

Response `200` with `type`: the matching attachments, each with its
*index*, as the positions are no longer implicit:

```json
{
    "found": [
        {
            "index": 0,
            "attachment": {
                "Type":     "text/x-diff; charset=utf-8; kind=\"preflight\"",
                "Desc":     "implementation draft",
                "Created":  "2026-09-14 21:30",
                "Modified": "2026-09-14 21:30",
                "Data":     "diff --git a/[...]"
            }
        }
    ]
}
```

- `found`: the matching attachments in attachment order (empty if
  none matches).
- `found[].index`: the zero-based position of the attachment.
- `found[].attachment`: the attachment object.

```sh
curl -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/attachment"
curl -H "Authorization: Bearer $TOKEN" \
    --data-urlencode 'type=text/x-diff; charset=utf-8; kind="preflight"' --get \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/attachment"
```

### POST {task}/attachment

Append an attachment to the task plan.

Request body: an attachment object (see *Task plans* above).

Response `201` with a `Location` header pointing to the new
attachment:

```json
{
    "index": 2
}
```

- `index`: the zero-based position of the new attachment.

Errors: `400` for a malformed body, `422` for an attachment violating
the attachment structure.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @attachment.json \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/attachment"
```

### GET {task}/attachment/{index}

Get the attachment at the zero-based position *index*.

Response `200`: the attachment object.

Errors: `404` if no attachment exists at *index*, `422` for a
non-numeric *index*.

```sh
curl -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/attachment/0"
```

### PUT {task}/attachment/{index}

Replace the attachment at the zero-based position *index*; keys absent
from the request are removed.

Request body: an attachment object (see *Task plans* above).

Response `204` without body.

Errors: `400` for a malformed body, `404` if no attachment exists at
*index*, `422` for a non-numeric *index* or an attachment violating the
attachment structure.

```sh
curl -X PUT -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @attachment.json \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/attachment/0"
```

### DELETE {task}/attachment/{index}

Delete the attachment at the zero-based position *index*. The
subsequent attachments move up by one position.

Response `204` without body.

Errors: `404` if no attachment exists at *index*, `422` for a
non-numeric *index*.

```sh
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/attachment/0"
```

### GET {task}/attachment/{index}/{key}

Get the value of the key *key* of the attachment at *index*.

Response `200`:

```json
{
    "value": "implementation draft"
}
```

- `value`: the value of the key (a `string`).

Errors: `404` if no attachment exists at *index* or the key is absent,
`422` for a non-numeric *index*.

```sh
curl -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/attachment/0/Desc"
```

### PUT {task}/attachment/{index}/{key}

Create or update the key *key* of the attachment at *index*.

Request body:

```json
{
    "value": "implementation draft (revised)"
}
```

- `value`: the new value of the key (a `string`).

Setting `Data` removes a present `File` key and vice versa, so the
attachment always carries exactly one of them. Setting `Type` to
`text/vnd.ase.task` is rejected with `422`.

Response `200` (updated) or `201` (created):

```json
{
    "key":   "Desc",
    "value": "implementation draft (revised)"
}
```

- `key`: the key.
- `value`: the stored value.

Errors: `400` for a malformed body or a missing `value` string, `404`
if no attachment exists at *index*, `422` for a non-numeric *index* or
an invalid `Type`.

```sh
curl -X PUT -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{ "value": "implementation draft (revised)" }' \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/attachment/0/Desc"
```

### DELETE {task}/attachment/{index}/{key}

Delete the key *key* of the attachment at *index*.

Response `204` without body.

Errors: `404` if no attachment exists at *index* or the key is absent,
`422` for a non-numeric *index* or the non-deletable keys `Type`,
`Data`, and `File` (delete the entire attachment instead).

```sh
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:42042/projects/ase/tasks/T1/attachment/0/Desc"
```

### WebSocket /projects/{prjId}/events

Subscribe to the addition, modification, and deletion events of the
task plans of the project *prjId*. The endpoint is opened with a regular WebSocket handshake
(`GET` with `Upgrade: websocket`, RFC 6455) and stays open until either
side closes it; the server closes all subscriptions with close code
`1001` when it shuts down.

Query parameters:

- `tasks` (optional): comma-separated list of task ids to subscribe
  to. If omitted, the events of *all* task plans of the project are
  delivered, including those of task plans created later. A listed
  task plan does not have to exist yet.

Authentication: the bearer token is passed in the `Authorization`
header as for every other endpoint, or -- for clients which cannot set
handshake headers, like browsers -- in the `token` query parameter.

Messages: the server sends one *text frame* per modifying request
(`PUT`, `PATCH`, `POST`, or `DELETE` on a plan or one of its parts,
or a purge), after the request has completed. Each frame carries a
*single-line* JSON structure with at least one of the three keys
`added`, `updated`, and `deleted` (each present only if non-empty):

```json
{ "added": { "T3": { "status": "OPEN", "title": "Add Kanban board" } }, "updated": { "T1": { "status": "CLOSED", "title": "Add REST API", "parts": [ "header", "body" ] } }, "deleted": [ "T2" ] }
```

- `added`: an object mapping each newly created task id onto its
  `status` and `title` (as in the listing), so a client can render
  the new plan without loading it.
- `updated`: an object mapping each modified task id onto its current
  `status` and `title` and the array `parts` of its modified parts, a
  non-empty subset of `header`, `body`, and `attachment`, in this
  order.
- `deleted`: an array of the ids of the removed task plans.

The keys and parts are determined by the request: a plan-level `PUT`
reports a newly created plan under `added` and an overwritten plan
under `updated` with all three parts, a `PATCH` with `status` reports
`header`, a part endpoint reports its part, a `DELETE` of a plan
reports it under `deleted`, a purge reports all purged plans under
`deleted` in a *single* frame (no frame if nothing was purged), and a
rename reports the *old* task id under `deleted` and the *new* task id
under `added` (after an accompanying status change was applied). Only
changes made through the API are reported.

Messages sent by the client are ignored. Ping frames are answered with
pong frames as per RFC 6455.

Errors (as regular HTTP responses before the upgrade): `401` for a
missing or invalid token, `404` if no project *prjId* is registered, `422` for
an invalid task id in `tasks`, `426` if the request is not a WebSocket
handshake.

```sh
websocat -H "Authorization: Bearer $TOKEN" \
    "ws://127.0.0.1:42042/projects/ase/events?tasks=T1,T2"
```

STORAGE PLUGIN API
------------------

The server implementing the REST API (`ase task store`) is *storage
agnostic*: it implements authentication, validation, the lifecycle
model checks, the part endpoints (as read-modify-write cycles on entire
plans, serialized per project inside the server), the purge (as list
plus delete), and the event notifications *itself*, and delegates the
*persistence* of projects and task plans to a single *storage plugin*
loaded at startup. A plugin is a Node.js module which is selected by
the `storage.plugin` key of *per-user config dir*`/store.yaml`,
overridable by `--module`, and configured by the `storage.options`
key, passed verbatim to the plugin. The name `ase` (the default)
selects the *built-in* plugin, any other plain *name* (matching
`[A-Za-z0-9_-]+`) selects the NPM package `ase-task-store-`*name*,
which has to be resolvable from the server (installed globally
alongside `@rse/ase`, or in its dependency tree), and a relative or
absolute path selects a local module:

```yaml
address: 127.0.0.1
port:    42042
token:   8f3c[...]
cors:
    - http://localhost:5173
storage:
    plugin: ase
    options:
        basedir: /Users/rse/.ase/tasks
```

The built-in `ase` plugin (`ase-task-store-plugin-ase.ts`) is the one
storage mechanism which persists the task plans in the *textual* task
format (see `ase-format-task.md`) and hence serializes and
unserializes them (through the codec of `ase-task-format.ts`, which
also normalizes legacy plans on load); any other plugin (a database, a
remote service, etc.) persists the JSON task plan structure in
whatever shape suits it. The built-in plugin takes the options
`basedir` (the base directory, overridable by `--basedir`, default:
`tasks` below the per-user config directory), `solo` (overridable by
`--solo` and `--no-solo`), and `lifecycle` (the default lifecycle model name, default
`solo`). Without `solo`, every project is stored below
`<basedir>/<prjId>/` as `TASK-<taskId>.md` files, with the
`PROJECT.yaml` file of a project directory serving as the project
registry entry and carrying the lifecycle model name; unregistering a
project removes its `PROJECT.yaml` file, but its directory only if it
carries no task plans any more. With `solo`,
a *single* project is stored flat in `basedir` itself, with a single
`PROJECT.yaml` file there (additionally carrying the project id it was
first registered under, which a later registration under a different
id does not rewrite), and *any* project id is accepted, so it is the
caller's responsibility to use such a store for one project only --
which is exactly what the `ase:`*path* form of `project.task.store`
does. Every plugin reports the task *title* (see *Task titles* above)
in its listing, as only the plugin knows how to obtain it efficiently: the
built-in plugin fully parses every task plan file on listing and
derives it from the body, which is sufficient for the typical number
of plans, while a database plugin would extract it on save and persist
it denormalized alongside the plan.

The *concurrency guarantees* are: *all* requests of a project (reads
included) are strictly serialized in arrival order through a
per-project queue, while distinct projects stay independent and the
project listing is not queued at all. If the plugin provides the
optional `lock` method, every such request additionally runs under the
*cross-process* lock of its project. The built-in plugin implements
it as an advisory lock beside the project directory
(*project-directory*`.lock`), so the ASE service, the CLI, and a store
server working on the same directory cannot lose updates of each
other, and it writes the `TASK-<taskId>.md` and `PROJECT.yaml` files
*atomically* (temporary file plus rename), so no reader ever sees a
partially written file. The very same guarantees hold for the
`ase:`*path* form of `project.task.store`, as it runs the same
functionality in-process.

The plugin module has to *default export* a `TaskStoragePluginFactory`
and to conform to the following TypeScript definition:

```ts
/*  the JSON task plan structure as exchanged by the REST API:
    the header is a flat key/value object (with the array-typed
    keys "After" and "Tags"), the body is the Markdown source, and
    the attachments are flat key/value objects with string values  */
export type TaskHeaderValue = string | string[]
export type TaskHeader      = Record<string, TaskHeaderValue>
export type TaskAttachment  = Record<string, string>
export type TaskPlan        = {
    header:     TaskHeader
    body:       string
    attachment: TaskAttachment[]
}

/*  a registered project: its id and the name of its task lifecycle
    model ("solo", "team", or "enterprise")  */
export type ProjectEntry = {
    id:        string
    lifecycle: string
}

/*  a task plan listing entry: its id, its title (derived from the
    body as defined by the "Task titles" convention), its raw header
    (from which the server derives the effective status, applying the
    initial state of the lifecycle model if "Status" is absent), and
    the time of its last modification  */
export type TaskEntry = {
    id:     string
    title:  string
    header: TaskHeader
    mtime:  Date
}

/*  the outcome of an idempotent write: whether the entity was
    newly created or an existing one updated  */
export type WriteResult = "created" | "updated"

/*  the context handed to the plugin at load time: the verbatim
    "storage.options" configuration and a logging function  */
export type TaskStorageContext = {
    options: Record<string, unknown>
    log:     (level: "error" | "warning" | "info" | "debug", message: string) => void
}

/*  the storage plugin: every method is asynchronous, every id was
    already validated by the server against "[A-Za-z0-9_-]+", and
    every method throws on an infrastructure error only (which the
    server maps onto a "500" response) -- the "not found", "conflict",
    and "already exists" cases are expressed through the return values  */
export interface TaskStoragePlugin {
    /*  the plugin name, for diagnostics  */
    readonly name: string

    /*  open the storage (connect, create directories, etc.) and
        close it again (flush, disconnect, etc.); "close" is called
        exactly once on server shutdown after a successful "open"  */
    open  (): Promise<void>
    close (): Promise<void>

    /*  optionally run an operation under the exclusive cross-process
        lock of a project, in case the storage is shared with other
        processes and provides no transactions of its own  */
    lock? <T> (prjId: string, op: () => Promise<T>): Promise<T>

    /*  list all registered projects (in any order)  */
    projectList (): Promise<ProjectEntry[]>

    /*  get a registered project, or null if not registered  */
    projectGet (prjId: string): Promise<ProjectEntry | null>

    /*  register a project with the given lifecycle model name, or
        change the lifecycle model name of a registered project  */
    projectSet (prjId: string, lifecycle: string): Promise<WriteResult>

    /*  unregister a project without deleting its task plans;
        returns false if the project was not registered  */
    projectDelete (prjId: string): Promise<boolean>

    /*  list all task plans of a registered project (in any order),
        each with its title, its raw header, and its modification time  */
    taskList (prjId: string): Promise<TaskEntry[]>

    /*  load a task plan, or null if it does not exist  */
    taskLoad (prjId: string, taskId: string): Promise<TaskPlan | null>

    /*  create or overwrite a task plan with the given (already
        validated) structure and refresh its modification time  */
    taskSave (prjId: string, taskId: string, plan: TaskPlan): Promise<WriteResult>

    /*  delete a task plan; returns false if it did not exist  */
    taskDelete (prjId: string, taskId: string): Promise<boolean>

    /*  rename a task plan by moving it from "oldId" to "newId" and
        rewriting its "Id" header key accordingly; returns false if
        the source did not exist; the server guarantees that the
        target does not exist  */
    taskRename (prjId: string, oldId: string, newId: string): Promise<boolean>
}

/*  the plugin factory: the default export of the plugin module,
    called exactly once by the server at startup  */
export type TaskStoragePluginFactory = (ctx: TaskStorageContext) => TaskStoragePlugin
```

The division of labor between server and plugin is:

| Concern                                           | Server | Plugin |
| ------------------------------------------------- | ------ | ------ |
| Bearer token authentication and CORS              | ✓      |        |
| Id, structure, and type validation (`400`/`422`)  | ✓      |        |
| Lifecycle model definitions and state checks      | ✓      |        |
| Effective status (`initial` fallback) in listing  | ✓      |        |
| `include`/`exclude` state filtering, `fields`     | ✓      |        |
| Part endpoints (read-modify-write cycles)         | ✓      |        |
| Request serialization (per-project queue)         | ✓      |        |
| Cross-process locking (optional `lock` method)    |        | ✓      |
| Purge by age (list plus delete)                   | ✓      |        |
| Rename conflict detection (`409`)                 | ✓      |        |
| Event notifications (WebSocket), incl. titles     | ✓      |        |
| Project registry persistence                      |        | ✓      |
| Task plan persistence and modification time       |        | ✓      |
| Task title extraction in listing                  |        | ✓      |
| Textual task format (built-in `ase` plugin only)  |        | ✓      |

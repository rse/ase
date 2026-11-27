# ase-task(1) -- Manage Persisted Task Plans

## SYNOPSIS

`ase task`
\[`-h`|`--help`\]
*command*
\[*options* \[...\]\]
\[*args* \[...\]\]

## DESCRIPTION

**ase task** manages the persisted *task plans* of the current project.
A task plan is a Markdown document in the textual *ASE* task format
(see `ase util meta format-task`): a frontmatter block with the keys
`Type`, `Id`, `Created`, `Modified`, `Group`, `Phase`, `After`,
`Status`, `Assignee`, `Kind`, `Effort`, `Tags`, `Source`, `Changeset`,
and `Target`, followed by the plan body and optional attachment blocks.

The optional `Effort` key carries the estimated effort of the task as
*size* *hash*, with *size* one of the T-shirt sizes `XS`, `S`, `M`, `L`,
or `XL` (see `project.task.effort.scale` in `ase-config`(1)) and *hash*
the content hash of the plan body the size was given for. The task
store drops a *stale* `Effort` (whose *hash* no longer matches the
body, ignoring checkboxes, whitespace, and cancelled or deferred
bullet-points) on load and save, and stamps an `Effort` given without
*hash* with the content hash of the body on save.

All commands are forwarded to the *task store* selected by the
`project.task.store.url` configuration (see **TASK STORES** below). The
project is identified in the task store by `project.id` (default: the
sanitized basename of the project root, i.e., the Git top-level
directory, or the current working directory outside a Git working
tree).

The `Status` of the task plans follows the *task lifecycle model* of
the project (see **TASK LIFECYCLE MODELS** below), and new task ids
are generated after the *task id scheme* of the project (see
**TASK ID SCHEMES** below).

Without a *command*, the usage information is shown and the command
exits with status `1`.

## OPTIONS

- \[`-h`|`--help`\]:
  Show usage information of `ase task`, including the list of all
  sub-commands, and exit.

## COMMANDS

- `ase task list` \[`-v`|`--verbose`\] \[`-i`|`--include` *states*\] \[`-e`|`--exclude` *states*\]:
  List the persisted task ids. See `ase-task-list`(1).

- `ase task status` \[*id*\[`:`\]\] \[*status*\]:
  Get or set the lifecycle status of a task. See `ase-task-status`(1).

- `ase task request` *id* *name* \[*prompt* ...\]:
  Request the processing of a task by a prompt. See
  `ase-task-request`(1).

- `ase task assign` \[`-s`|`--session` *id*\] \[*id*\[`:`\]\] *assignee*:
  Assign a task (and handle the AI usage window of a session). See
  `ase-task-assign`(1).

- `ase task load` *id*:
  Write a task plan to standard output. See `ase-task-load`(1).

- `ase task view` *id*:
  Show a task plan in the pager. See `ase-task-view`(1).

- `ase task edit` *id*:
  Edit a task plan in the editor. See `ase-task-edit`(1).

- `ase task save` \[`-c`|`--create`\] *id*:
  Save a task plan read from standard input. See `ase-task-save`(1).

- `ase task delete` *id*:
  Delete a task plan. See `ase-task-delete`(1).

- `ase task rename` *old-id* *new-id*:
  Rename a task plan and its references. See `ase-task-rename`(1).

- `ase task newid` \[`-p`|`--proposal` *id*\] \[`-t`|`--taken` *ids*\] \[`-v`|`--verbose`\] \[*title*\]:
  Print the next free task id. See `ase-task-newid`(1).

- `ase task purge` \[*age*\]:
  Remove all task plans older than an age. See `ase-task-purge`(1).

- `ase task lifecycle` \[*name*\]:
  Get or set the task lifecycle model of the project. See
  `ase-task-lifecycle`(1).

- `ase task idscheme` \[*scheme*\]:
  Get or set the task id scheme of the project. See
  `ase-task-idscheme`(1).

- `ase task store` *command* \[...\]:
  Manage the per-user task store REST API server. See
  `ase-task-store`(1).

- `ase task board` \[*options*\]:
  Show the interactive task board in the terminal or the browser. See
  `ase-task-board`(1).

- `ase task chat` \[*id*\]:
  Chat with the agent tool about a task. See `ase-task-chat`(1).

## TASK IDS

A task id consists of the characters `A-Z`, `a-z`, `0-9`, `#`, `_`,
and `-`, where it has to start with a letter, a digit, or `#`, i.e.,
it has to match `[A-Za-z0-9#][A-Za-z0-9#_-]*`. The id `default` is the
reserved id of the default task of a session. As `#` starts a comment
in the shell, an id containing `#` has to be quoted on the command
line, e.g., `ase task view "#7"`.

## TASK STORES

The task store is selected by the `project.task.store.url`
configuration URL (see `ase-config`(1)):

- `ase:`*path*:
  The built-in file-based storage plugin, running in-process, storing
  each plan as a file `TASK-`*id*`.md` directly in the directory
  *path*, which is resolved relative to the project root (default:
  `ase:./.ase/task`).

  On the `project` and `task:`*id* scopes, *path* must not escape the
  project root (also not through symbolic links), as a cloned
  repository could otherwise direct task writes anywhere; a directory
  outside of it is accepted on the `user` or `session` scope only. The
  lifecycle model and task id scheme of a local task store always
  follow `project.task.lifecycle` and `project.task.idscheme`.

- `ase://`*addr*`:`*port*\[`/`*token*\]:
  A remote task store server (see `ase-task-store`(1)), connected via
  HTTP. It requires an explicitly configured `project.id`, as a
  basename-derived one likely collides on a shared server.

  On first use, the project is registered in the task store under the
  configured `project.task.lifecycle` and `project.task.idscheme`;
  afterwards the registered model and scheme apply to all clients of
  the project, and a deviating configuration is warned about once per
  deviation only (see `ase-task-lifecycle`(1)).

  The bearer token is the embedded *token* (warned about if the URL is
  configured on the `project` or a `task:`*id* scope, as it might be
  committed), else `$ASE_TASK_STORE_TOKEN`, else
  `project.task.store.token` (warned about if not configured on the
  `user` scope), else the `token` of the per-user `store.yaml` of a
  locally started task store server (only if the URL addresses exactly
  this server). Sending a token to a non-loopback host selected on the
  `project` or a `task:`*id* scope is warned about.

- `ases://`*addr*`:`*port*\[`/`*token*\]\[`?insecure`\]:
  The same as `ase://`, but connecting via HTTPS, verifying the server
  certificate against the Node.js CA store (extendable via
  `$NODE_EXTRA_CA_CERTS`). With the suffix `?insecure`, the
  verification of the server certificate is skipped.

- `github:`*owner*`/`*repo*, `github+https://`*host*`/`*owner*`/`*repo*, or `github+http://`*host*`/`*owner*`/`*repo*:
  The built-in GitHub storage plugin, running in-process, storing the
  plans as the issues of the repository *owner*`/`*repo* on GitHub
  resp. on the GitHub (Enterprise) instance *host*. It requires a `seq`
  task id scheme (e.g., `seq:#%d`), as the task ids are the issue
  numbers. The GitHub token is `project.task.store.token`, else
  `$GITHUB_TOKEN`, else `$GH_TOKEN`.

- `gitlab:`*namespace*`/`*project*, `gitlab://`*host*`/`*namespace*`/`*project*, `gitlab+https://`*host*`/`*namespace*`/`*project*, or `gitlab+http://`*host*`/`*namespace*`/`*project*:
  The built-in GitLab storage plugin, running in-process, storing the
  plans as the issues of the GitLab project *namespace*`/`*project*
  (with nested groups allowed) on the GitLab instance *host*, else
  `$GITLAB_HOST`, else `gitlab.com`. It also requires a `seq` task id
  scheme. The GitLab token is `project.task.store.token`, else
  `$GITLAB_TOKEN`.

- `gitea+https://`*host*`/`*owner*`/`*repo* or `gitea+http://`*host*`/`*owner*`/`*repo*:
  The built-in Gitea storage plugin, running in-process, storing the
  plans as the issues of the repository *owner*`/`*repo* on the Gitea
  instance *host*. It also requires a `seq` task id scheme. The Gitea
  token is `project.task.store.token`, else `$GITEA_TOKEN`.

For the GitHub, GitLab, and Gitea task stores, a repository selected
on the `project` or a `task:`*id* scope is warned about once per
project and repository only (remembered in the *per-user state
directory* as `task-github.json`, `task-gitlab.json`, resp.
`task-gitea.json`), and a `project.task.store.token` not configured on
the `user` scope is warned about.

## TASK LIFECYCLE MODELS

The `Status` frontmatter key of a task plan holds a state of the task
lifecycle model of the project, selected by `project.task.lifecycle`
for a local task store resp. registered in a remote task store (see
`ase-task-lifecycle`(1)). A plan without a `Status` key reads as the
*initial* state of the model.

A status change has to be reachable from the current state via one or
more transitions of the model (a status foreign to the model can be
changed to any state, to allow its correction). The *finished* states
end the lifecycle, and in the *activity* states a task is actively
worked on (by a human or an agent), so its plan must not be changed
concurrently.

- `solo`:
  The single-phase lifecycle for a local solo developer (default).
  States: `OPEN` (initial), `SHELVED`, `CLOSED` (finished), and
  `CANCELLED` (finished); no activity states. Transitions: `OPEN` to
  `SHELVED`, `CLOSED`, or `CANCELLED`; `SHELVED` to `OPEN` or
  `CANCELLED`.

- `team`:
  The two-phase lifecycle for a distributed small team. States:
  `PLANNING` (initial), `SHELVED`, `IMPLEMENTING` (activity),
  `STALLED`, `IMPLEMENTED` (finished), and `CANCELLED` (finished).
  Transitions: `PLANNING` to `SHELVED`, `IMPLEMENTING`, or
  `CANCELLED`; `SHELVED` to `PLANNING` or `CANCELLED`; `IMPLEMENTING`
  to `PLANNING`, `STALLED`, `IMPLEMENTED`, or `CANCELLED`; `STALLED`
  to `IMPLEMENTING` or `CANCELLED`.

- `enterprise`:
  The four-phase lifecycle (planning, implementation, qualification, and
  integration) for a gated enterprise pipeline, driven headless by the
  agents of `ase-agent`(1). States: `DRAFTED` (initial), `SHELVED`,
  `PLANNING` (activity), `PLANNED`, `STALLED`, `IMPLEMENTING`
  (activity), `IMPLEMENTED`, `DECLINED`, `QUALIFYING` (activity),
  `QUALIFIED`, `DEFERRED`, `INTEGRATING` (activity), `INTEGRATED`
  (finished), and `CANCELLED` (finished).

  Transitions: `DRAFTED` to `SHELVED`, `PLANNING`, or `CANCELLED`;
  `SHELVED` to `DRAFTED` or `CANCELLED`; `PLANNING` to `DRAFTED`,
  `SHELVED`, `PLANNED`, or `CANCELLED`; `PLANNED` to `STALLED`,
  `IMPLEMENTING`, or `CANCELLED`; `STALLED` to `PLANNED` or
  `CANCELLED`; `IMPLEMENTING` to `DRAFTED`, `PLANNED`, `STALLED`,
  `IMPLEMENTED`, or `CANCELLED`; `IMPLEMENTED` to `DECLINED`,
  `QUALIFYING`, or `CANCELLED`; `DECLINED` to `IMPLEMENTED` or
  `CANCELLED`; `QUALIFYING` to `DRAFTED`, `PLANNED`, `IMPLEMENTED`,
  `DECLINED`, `QUALIFIED`, or `CANCELLED`; `QUALIFIED` to `DEFERRED`,
  `INTEGRATING`, or `CANCELLED`; `DEFERRED` to `QUALIFIED` or
  `CANCELLED`; `INTEGRATING` to `DRAFTED`, `PLANNED`, `QUALIFIED`,
  `DEFERRED`, `INTEGRATED`, or `CANCELLED`.

In all models, no transition leaves a finished state.

## TASK ID SCHEMES

New task ids are generated by `ase-task-newid`(1) after the task id
scheme of the project, selected by `project.task.idscheme` for a local
task store resp. registered in a remote task store (see
`ase-task-idscheme`(1)):

- `slug`\[`:`*words*\]:
  The slug of the first *words* (`1`-`16`, default: `2`) words of the
  task title, starting with the first word beginning with a letter,
  with diacritics stripped, lower-cased, and joined with `-`, e.g.,
  `json-export` (default scheme). Conforming ids match
  `^[a-z][a-z0-9]*(?:-[a-z0-9]+){0,`*words-1*`}(?:-[0-9]+)?$`.

- `seq`\[`:`*template*\]:
  A continuously increasing sequence number, rendered through the
  sprintf-style *template* (default: `%d`) with exactly one `%d` or
  `%0`*width*`d` (*width* `0`-`16`) and otherwise only the characters
  `A-Z`, `a-z`, `#`, `_`, and `-` (but not starting with `_` or `-`),
  e.g., `FOO-%03d` (`FOO-007`) or `#%d` (`#7`). Conforming ids match
  *prefix*`([0-9]+)`*suffix* (resp. with at least *width* digits).

- `flex`\[`:`*template*\]:
  Like `seq`, but the *template* (default: `%d-%s`) additionally
  contains exactly one `%s` before or after the number (if before,
  separated from it by at least one character), which is the slug of
  the task title as for `slug:2`, e.g., `%d-%s` (`50-fleet-files`),
  `%03d-%s` (`050-fleet-files`), or `%s-%d` (`fleet-files-50`). This
  scheme is not supported by the GitHub, GitLab, and Gitea task stores.

- `any`:
  An arbitrary id, as proposed by the caller. Conforming ids match
  `^[A-Za-z0-9#][A-Za-z0-9#_-]*$`.

An id not conforming to the scheme is accepted, but warned about on
`ase task save`, `ase task edit`, and `ase task rename` (the reserved
id `default` always conforms).

## ENVIRONMENT

- `ASE_TASK_ID`:
  The default task id of `ase task status`, `ase task assign`, and
  `ase task chat` (default: `default`).

- `ASE_TASK_STORE_TOKEN`:
  The bearer token of a remote (`ase://` or `ases://`) task store.

- `GITHUB_TOKEN`, `GH_TOKEN`, `GITLAB_TOKEN`, `GITLAB_HOST`, `GITEA_TOKEN`:
  The tokens resp. the default host of the GitHub, GitLab, and Gitea
  task stores (see **TASK STORES**).

## FILES

- `.ase/task/TASK-`*id*`.md`:
  The persisted task plans of the default local task store
  `ase:./.ase/task`, relative to the project root.

- `.ase/config.yaml`:
  The `project` scope configuration with the `project.id`,
  `project.task.store.url`, `project.task.lifecycle`, and
  `project.task.idscheme` keys.

- *per-user state directory*`/task-lifecycle.json`:
  The deviations of the configured lifecycle model and task id scheme
  from the ones of a remote task store already warned about.

- *per-user state directory*`/task-github.json`, `task-gitlab.json`, `task-gitea.json`:
  The repositories of the issue tracker task stores already warned
  about.

## EXAMPLES

```sh
# list all unfinished tasks with their status, time, effort, and title
$ ase task list -v

# create a new task from a title and a plan file
$ id=$(ase task newid "Export as JSON")
$ ase task save --create "$id" <plan.md

# move the task forward in the lifecycle
$ ase task status "$id" CLOSED

# use a shared remote task store
$ ase config --scope project set project.id myproject
$ ase config --scope project set project.task.store.url ase://127.0.0.1:4711
```

## SEE ALSO

`ase`(1), `ase-task-list`(1), `ase-task-status`(1),
`ase-task-request`(1), `ase-task-assign`(1), `ase-task-load`(1),
`ase-task-view`(1), `ase-task-edit`(1), `ase-task-save`(1),
`ase-task-delete`(1), `ase-task-rename`(1), `ase-task-newid`(1),
`ase-task-purge`(1), `ase-task-lifecycle`(1), `ase-task-idscheme`(1),
`ase-task-store`(1), `ase-task-board`(1), `ase-task-chat`(1),
`ase-config`(1), `ase-agent`(1).

## AUTHOR

Dr. Ralf S. Engelschall <rse@engelschall.com>


Configuration Variables
=======================

In **ASE**, the following classification system can be configured on
the following scopes (and in this order, with later scopes overriding
earlier scopes):

-   `default`: (id: *none*,            storage: *built-in*)
-   `user`:    (id: `$ASE_USER_ID`,    storage: *per-user config dir*`/config.yaml`)
-   `project`: (id: `$ASE_PROJECT_ID`, storage: `.ase/config.yaml`)
-   `task`:    (id: `$ASE_TASK_ID`,    storage: `.ase/task/<task-id>/config.yaml`)
-   `session`: (id: `$ASE_SESSION_ID`, storage: `~/.ase/session/<session-id>/config.yaml`)

The following configuration parameters control the project:

-   **project.id**: the unique id of the project
    (default: the basename of the project root; required for a remote
    task store, as a basename likely collides with unrelated projects
    on a shared task store server)

-   **project.name**: the full name of the project

-   **project.boxing**: the project *source artifacts* (of any kind:
    specification, architecture, source code, documentation,
    infrastructure, task plan, and other artifacts) are treated as a...

    -   `white`:     ...white box, i.e., the artifacts are intentionally fully transparent and understood.
    -   `grey`:      ...grey  box, i.e., the artifacts are intentionally partially non-transparent or not understood.
    -   `black`:     ...black box, i.e., the artifacts are intentionally fully non-transparent and not understood.

    The boxing level modulates both the *work depth* (how deeply
    artifact-touching skills inspect and produce artifacts) and the
    *output visibility* (how much artifact content and how many findings
    they surface): `white` yields full inspection and full exposure,
    `grey` yields inspection of significant parts and exposure of
    material findings only, and `black` yields minimal inspection with
    suppressed findings and hidden artifact internals.

-   **project.task.lifecycle**: the project *task plans* follow a...

    -   `solo`:       ...single-phase  lifecycle for a local solo developer (default).
    -   `team`:       ...two-phase     lifecycle for a distributed small team.
    -   `enterprise`: ...four-phase    lifecycle for a gated enterprise pipeline.

    The lifecycle is exported by the session-start hook as the
    `<ase-project-task-lifecycle/>` placeholder (and as the
    `ASE_PROJECT_TASK_LIFECYCLE` environment variable).

-   **project.task.store**: the *task store* URL the `ase task` commands
    and `ase_task_*` MCP tools forward the project *task plans* to:

    -   `ase:`*path*: the built-in storage plugin, running in-process,
        persisting the plans as `TASK-<id>.md` files directly in *path*,
        which is resolved relative to the project root
        (default: `ase:./.ase/task`). On the `project` and `task`
        scopes, *path* must not escape the project root (also not
        through symlinks); a directory outside of it (like a shared
        one) is accepted on the `user` or `session` scope only.
    -   `ase://`*addr*`:`*port* or `ase://`*addr*`:`*port*`/`*token*:
        a remote task store server (see `task-api.md`, `ase task store`),
        authenticated by a bearer token, with the (explicitly configured)
        `project.id` registered under `project.task.lifecycle` on first
        use only (afterwards the registered lifecycle model applies, see
        `ase task lifecycle`). The token is the
        embedded *token* (warned about on every task operation if the URL
        is configured on the `project` scope, as `.ase/config.yaml` is
        usually committed), else `$ASE_TASK_STORE_TOKEN`, else
        `project.task.token`, else the `token` of the per-user
        `store.yaml` of a locally started task store server.
    -   `ases://`*addr*`:`*port*\[`/`*token*\]\[`?insecure`\]: the same,
        but connecting via HTTPS, verifying the server certificate against
        the Node.js CA store (extendable via `$NODE_EXTRA_CA_CERTS`), or,
        with `?insecure`, skipping the certificate verification.

    Other URL schemes (like `github:`*project*) are reserved.

-   **project.task.token**: the bearer token of a remote task store
    server, used if the `project.task.store` URL embeds no token and
    `$ASE_TASK_STORE_TOKEN` is not set. It is writable on the `user`
    scope only (a hand-edited value on another scope is used, but warned
    about) and masked as `***` in `ase config list`.

    For compatibility, the obsolete (pre-1.1.0) variables
    `project.artifact.task.{basedir,files}` are migrated in place on
    reading a configuration file: a `basedir` becomes `project.task.store`
    (as `ase:`*basedir*) unless the latter is already set in the same
    file, and `files` is dropped.

The project *artifacts* are configured per kind, each kind defined by a
`.basedir` anchor and a `.files` miniglob spec. The `.basedir` is a
directory resolved relative to the project root (empty means the project
root itself); the `.files` whitespace-separated glob spec resolves
relative to `.basedir`. The four configurable kinds are `spec`,
`code`, `docs`, and `infr`; in addition, the implicit `othr`
catch-all collects all remaining files and is resolved last (it has no
configurable `.basedir`/`.files`). The *task plans* are not artifacts
in this sense, as they live in the *task store* selected by
`project.task.store`:

-   **project.artifact.spec.{basedir,files}**: anchor directory and glob spec matching the project *specification* files,
    i.e. the *SpecBook*-based specification covering both requirements and architecture
    (default: `docs/specbook` and `*.{md,txt,svg,png,jpg}`).

-   **project.artifact.code.{basedir,files}**: anchor directory and glob spec matching the project *source code* files.

-   **project.artifact.docs.{basedir,files}**: anchor directory and glob spec matching the project *documentation* files.

-   **project.artifact.infr.{basedir,files}**: anchor directory and glob spec matching the project *infrastructure* files.

The project *specification* is additionally controlled by:

-   **project.artifact.spec.schema**: the whitespace-separated list of *SpecBook* YAML schema
    configuration files governing the specification, merged in the given order (default: empty).
    The entry `std` names the standard schema configuration `ase-format-specbook.yaml` bundled
    with the ASE plugin, while every other entry is a file path resolved relative to the project
    root. If unset or empty, the list is treated as the single entry `std`.

Both `project.artifact.spec.basedir` and `project.artifact.spec.schema` are exported by the
session-start hook as the `<ase-spec-basedir/>` and `<ase-spec-schema/>` placeholders (and as
the `ASE_SPEC_BASEDIR` and `ASE_SPEC_SCHEMA` environment variables), so the specification format
description `ase-format-spec.md` can reference the effective schema and base directory.

The following configuration parameters control the agent:

-   **agent.persona**: the Agentic AI *persona* has the communication style of a...
    -    `writer`:      ...writer: decorative, eloquent, and explaining.
    -    `engineer`:    ...engineer: brief, factual and accurate.
    -    `journalist`:  ...journalist: layered, pyramid-structured (title, terse core, bracketed detail).
    -    `telegrapher`: ...telegrapher: very brief, factual, and abbreviating.
    -    `caveman`:     ...caveman: ultra brief, rough and stuttering.

-   **agent.guidance**: the Agentic AI gives *help hints* -- unsolicited pointers to the
    available *ASE* skills and operations, like the hint on `/ase-help-skill` and
    `/ase-help-intent` in the session start banner -- in the amount of...

    -    `none`:    ...none: no help hints at all.
    -    `minimal`: ...minimal: the single most essential help hint only.
    -    `normal`:  ...normal: the essential help hints only.
    -    `verbose`: ...verbose: all available help hints.

-   **agent.task**: the Agentic AI *task* unique id

-   **agent.skill**: the Agentic AI *skill* unique id of the currently active skill


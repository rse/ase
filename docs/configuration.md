
Configuration Variables
=======================

In **ASE**, the following classification system can be configured on
the following scopes (and in this order, with later scopes overriding
earlier scopes):

-   `default`: (id: *none*,            storage: *built-in*)
-   `user`:    (id: `$ASE_USER_ID`,    storage: *per-user config dir*`/config.yaml`)
-   `project`: (id: `$ASE_PROJECT_ID`, storage: `.ase/config.yaml`)
-   `task`:    (id: `$ASE_TASK_ID`,    storage: `.ase/task/<task-id>/config.yaml`)
-   `session`: (id: `$ASE_SESSION_ID`, storage: *per-user state dir*`/session/<session-id>/config.yaml`)

The following configuration parameters control the project:

-   **project.id**: the unique id of the project
    (default: the basename of the project root, or `<basedir>-<worktree>`
    if the project root is a worktree `<basedir>/<worktree>/` next to an
    `active` symlink in `<basedir>/`; required for a remote
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
    `ASE_PROJECT_TASK_LIFECYCLE` environment variable). The effective
    lifecycle model also fixes the lane layout of `ase task board`, which
    offers no lane configuration of its own. It is writable on the `user`
    and `project` scopes only, as the task store follows these two scopes only.

-   **project.task.idscheme**: the project *task ids* are generated after the scheme...

    -   `slug[:`*words*`]`:     ...slug of the first *words* (default: 2) title words,
        starting with the first word beginning with a letter,
        lower-cased and joined with `-`, like `json-export` (default).
        Conforming ids match `^[a-z][a-z0-9]*(?:-[a-z0-9]+){0,`*words-1*`}(?:-[0-9]+)?$`.
    -   `seq[:`*template*`]`:   ...continuously increasing sequence number, rendered through
        the sprintf-style *template* with exactly one `%d` or `%0`*width*`d`
        and otherwise only the characters `A-Z`, `a-z`, `#`, `_`, and `-`
        (but not starting with `_` or `-`),
        like `FOO-%03d` (`FOO-007`), `#%d` (`#7`), or `%d` (`7`, the default).
        Conforming ids match `^`*prefix*`([0-9]+)`*suffix*`$` (resp. `[0-9]{`*width*`,}`).
        **Caution:** `#` starts a comment in the shell, so a leading `#`
        has to be quoted on the command line: `ase task view #7` silently
        drops the id, while `ase task view "#7"` passes it.
    -   `any`:                  ...arbitrary unique id, as proposed by the agent.
        Conforming ids match `^[A-Za-z0-9#][A-Za-z0-9#_-]*$`.

    A new id is determined by `ase task newid` resp. the `ase_task_newid`
    MCP tool by searching all existing task ids: for `seq` the highest
    number of all ids matching the template and of the high-water mark
    of all ids ever removed or allocated via the task store (its `seqmark`) plus one,
    so the number of a deleted, purged, renamed, or concurrently allocated task is never reused
    (as ids not matching the current template are ignored, changing the
    template, e.g. from `#%d` to `T-%03d`, continues the numbering at
    the `seqmark` plus one instead of the highest existing number), and for `slug` and
    `any` the slug resp. proposed id, suffixed with `-2`, `-3`, etc. if
    already taken. Both also report the regular expression of the ids
    conforming to the scheme. Only a `seq` id is reserved (by raising the
    `seqmark` atomically); for the other schemes, the first save of the new
    task should be a create-only one (`ase task save --create` resp.
    `ase_task_save` with `create: true`), failing instead of overwriting a
    concurrently created task with the same id. A task id consists of the
    characters `A-Z`, `a-z`, `0-9`, `#`, `_`, and `-`, and an id not
    conforming to the scheme is accepted, but warned about on every save,
    rename, and switch. Like `project.task.lifecycle`, the scheme is
    registered per project in a remote task store (see `ase task
    idscheme`), and it is writable on the `user` and `project` scopes only.

-   **project.task.default.{source,changeset,target}**: the *defaults* of
    the change set flow frontmatter keys `Source:`, `Changeset:`, and
    `Target:` of the project *task plans* (see `ase-format-task.md`):

    -   `source`:    ...`worktree` (default) or `branch:`*name*.
    -   `changeset`: ...`worktree` (default), `branch:`*name*, or `attachment:`*name*.
    -   `target`:    ...`worktree`, `branch:`*name*, or `source` (default).

    An *absent* key of a task plan reads as its configured default at
    the time of use, so newly created and rebooted plans leave these keys
    out, and a key whose value equals the configured default is left out
    as well. The defaults are exported by the session-start hook as the
    `<ase-project-task-default-{source,changeset,target}/>` placeholders
    (and as the `ASE_PROJECT_TASK_DEFAULT_{SOURCE,CHANGESET,TARGET}`
    environment variables), and they are writable on the `user` and
    `project` scopes only.

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
    -   `github:`*owner*`/`*repo*, `github+https://`*host*`/`*owner*`/`*repo*,
        or `github+http://`*host*`/`*owner*`/`*repo*: the built-in GitHub
        storage plugin, running in-process, persisting the plans as the
        issues of the repository *owner*`/`*repo* on GitHub resp. on the
        GitHub instance `https://`*host* (resp. `http://`*host*), like a
        GitHub Enterprise Server or `<sub>.ghe.com` (see *GitHub storage plugin*
        in `task-api.md`), which requires a `seq` task id scheme in
        `project.task.idscheme` (like `seq:#%d`), as the task ids are
        the issue numbers. The GitHub token is `project.task.token`,
        else `$GITHUB_TOKEN`, else `$GH_TOKEN`. On the `project` and
        `task` scopes, the repository is warned about once per project
        and repository (remembered in the per-user state directory as
        `task-github.json`), i.e. again only if the repository changes.
    -   `gitlab:`*namespace*`/`*project*,
        `gitlab://`*host*`/`*namespace*`/`*project*,
        `gitlab+https://`*host*`/`*namespace*`/`*project*, or
        `gitlab+http://`*host*`/`*namespace*`/`*project*: the built-in GitLab
        storage plugin, running in-process, persisting the plans as the
        issues of the GitLab project *namespace*`/`*project* (with nested
        groups allowed) on the GitLab instance `https://`*host* (resp.
        `http://`*host* for `gitlab+http://`), else
        `$GITLAB_HOST`, else `https://gitlab.com` (see *GitLab storage
        plugin* in `task-api.md`), which also requires a `seq` task id
        scheme. The GitLab token is `project.task.token`, else
        `$GITLAB_TOKEN`. On the `project` and `task` scopes, the project
        is warned about as for `github:` (remembered as `task-gitlab.json`).
    -   `gitea+https://`*host*`/`*owner*`/`*repo* or
        `gitea+http://`*host*`/`*owner*`/`*repo*: the built-in Gitea
        storage plugin, running in-process, persisting the plans as the
        issues of the repository *owner*`/`*repo* on the Gitea instance
        `https://`*host* resp. `http://`*host* (see *Gitea storage
        plugin* in `task-api.md`), which also requires a `seq` task id
        scheme. The Gitea token is `project.task.token`, else
        `$GITEA_TOKEN`. On the `project` and `task` scopes, the
        repository is warned about as for `github:` (remembered as
        `task-gitea.json`).

-   **project.task.token**: the bearer token of a remote task store
    server, used if the `project.task.store` URL embeds no token and
    `$ASE_TASK_STORE_TOKEN` is not set, or the GitHub, GitLab, resp. Gitea
    token of a `github:`, `gitlab:`, resp. `gitea+`*scheme*`:` task store. It is writable on the `user`
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

The following configuration parameters control the terminal and web
user interfaces of the task board (`ase task board`), and are writable
on the `user` and `project` scopes only:

-   **board.tui.color.{dim,normal,accent,signal}**: the colors of the
    four color roles of the terminal board:

    -   `dim`:    secondary information like borders, done tasks, and hints (default: `grey`).
    -   `normal`: regular text, like idle tasks (default: `default`).
    -   `accent`: active lanes and tasks, code, and done or in-progress checklist items (default: `blue`).
    -   `signal`: the selection, warnings, status notices, and open or flagged checklist items (default: `red`).

    A color is either `default` (the foreground color of the terminal),
    a color name (like `blue` or `blueBright`), a hex value `#rrggbb`
    (or `#rgb`), `ansi256(`*n*`)`, or `rgb(`*r*`,`*g*`,`*b*`)`. The
    colors are read once on start of the board.

-   **board.web.color.{dim,normal,accent,signal}**: the base colors of
    the four color roles of the web board (`ase task board --web`):

    -   `dim`:    borders, lane grounds, done tasks, and secondary texts (default: `grey`).
    -   `normal`: regular text, task id boxes, and card grounds (default: `black`).
    -   `accent`: active lanes and tasks, tabs, and chips (default: `blue`).
    -   `signal`: warnings (default: `orange`).

    A color is either `default` (the built-in base color of the role:
    `normal` `#1a1a1a`, `dim` `#999999`, `accent` `#336699`, `signal`
    `#b06820`), a color name (`black`, `grey`, `gray`, `brown`, `red`,
    `orange`, `yellow`, `green`, `teal`, `cyan`, `blue`, `purple`, or
    `magenta`), or a hex value `#rrggbb` (or `#rgb`). Each base color is
    expanded via *MRCS* (`@rse/mrcs`) into a spread of 64 colors over the
    entire lightness range, out of which the web board takes all its
    colors. The `accent` color also tints the rendered task plans. The
    colors are read on each load of the web board page.

-   **board.web.editor.keymap**: the key bindings of the task plan
    editor of the web board: `default` (the standard key bindings, where
    `Ctrl`/`⌘`+`S` saves and `ESC` cancels), `vim` (Vim key bindings,
    where `:w` saves, `:q` cancels, and `:q!` discards), or `emacs` (Emacs
    key bindings, where `C-x C-s` saves and `C-x C-c` cancels). The key
    bindings are read on each start of editing.


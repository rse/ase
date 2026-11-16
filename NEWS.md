
NEWS
====

ASE 2.0 to ASE 2.1
------------------

*ASE 2.1 sharpens the planning and improves the daily work with the agent tool!*

The **grilling** became considerably smarter: every grilling table recommends the answer judged
best with a `★`, reveals details and rationales of questions and answers in hover cards, can run
fully automatically by picking all recommendations, and selects the approach as its own round.
A new **griller agent** grills the plans of the drafted tasks headless.

The new **configuration editor** `ase config edit` shows and edits all configuration keys across
all scopes in a terminal UI. The **task boards** now keep their display state per user resp. per
browser, and allow you to resize their lanes.

Task plans can now be **grounded** in the project artifacts and the Internet/Web already while
editing them, and a new skill reverse-engineers any **change set** (staged changes, a branch, or a
commit) into a task plan, precise enough for a re-implementation.

The **prompt cache** of Claude Code is now under control: its state is shown in the footer, big
idle caches are kept warm automatically, and you are asked before a prompt is sent into a big cold
cache. Markdown **tables**, which Claude Code draws vertically in too narrow terminals, are now
redrawn as readable records.

Finally, agent fleets can be isolated through their own per-user directories, configuration scope,
and working copies.

### FEATURES

-   **Prompt Cache Controller**: the cache state is shown in the footer, big idle caches are
    auto-warmed, and cold sends are confirmed (`agent.cache.*`, `/ase-mods-auto-warm`).

-   **Readable Vertical Tables**: tables drawn vertically by Claude Code in too narrow
    terminals are redrawn as records with aligned keys and hanging-indented values.

-   **Grounded Plan Editing**: `ase-task-edit --ground` grounds the plan in the project
    artifacts and the Internet/Web, for its generation, its refinements, and its approach round.

-   **Change Set to Task**: `ase-repo-task` reverse-engineers the staged or unstaged changes,
    a branch (`--branch`), or a commit (`--commit`) into a new task plan.

-   **Configuration Editor**: `ase config edit` opens a terminal UI with a parameter view
    and a scope view, storing edited values immediately on any writable scope.

-   **Recommended Answers**: grilling tables mark the answer judged best with `★`, besides
    the current decision `⚑`, and unaddressed `ase-task-grill` questions accept it.

-   **Answer Details**: hovering over a question resp. answer of a grilling table reveals
    its `WHAT:` details and `WHY ★:`/`WHY NOT ★:` rationales in a card.

-   **Automatic Grilling**: `ase-task-grill --auto` and `ase-{code,spec}-edit --grill-auto`
    pick every `★` answer instead of asking.

-   **Grilling Diff**: `ase-task-grill --diff` shows the cumulative change of the plan by
    all grilling rounds as a unified diff, e.g. to review the `--auto` answers.

-   **Approach Round**: `--approach` of `ase-{task,code,spec}-edit` now runs as a grilling
    round of 1-4 approach questions, standalone or in front of the regular rounds.

-   **Focused Grounding**: `--ground` of `ase-{code,spec}-edit` and `ase-task-implement` grounds
    the entire operation per `WHAT`/`HOW`/`WHEN` dimension, focused on rare and outdated terms.

-   **Plan Grilling Agent**: `ase agent griller` grills the plans of the `DRAFTED` tasks
    assigned to it via `ase-task-grill --ground --auto`, and puts them back unassigned.

-   **Per-User Directories**: `ASE_CONFIG_DIR` and `ASE_STATE_DIR` relocate the per-user
    configuration resp. state directory, e.g. for an agent fleet.

-   **Override Scope**: with `ASE_CONFIG_DIR` set, `$ASE_CONFIG_DIR/override.yaml` provides the
    read-only configuration scope `override` between the `task` and `session` scopes.

-   **Agent Working Copy**: `-C|--cwd <dir>` of all agents runs the agent tool in another
    working copy, e.g. a persistent clone per agent of a fleet.

-   **Board Display State**: the task boards keep their display state per user (terminal)
    resp. per browser (web), applied live to all other open boards.

-   **Resizable Board Lanes**: `+`/`-` resize and `0` resets the task board lanes, while the
    web board additionally offers grip bars for resizing by dragging.

-   **SpecBook Omit, Fetch, Search**: `ase spec export|preview --omit` leaves out aspects,
    `--fetch` controls the fetching of remote schemas, and `ase spec search` finds schemas.

-   **Statusline Context Tokens**: the placeholder `%c` now appends the current context
    tokens, and the statusline refreshes periodically (`ase setup statusline activate`).

### INCOMPATIBILITIES

-   **Configuration Editor**: `ase config edit` now opens the terminal UI, while the former
    `$EDITOR`-based editing of a scope file moved to the key `e` of its scope view.

-   **Ground Option**: `--grill-ground` of `ase-{code,spec}-edit` is now `--ground` (still
    `-G`), and the short option of `--ground` of `ase-meta-{eli5,proximity,quotes}` is now `-G`
    (instead of `-g`).

-   **Approach Option**: the short option of `--approach` of `ase-{task,code,spec}-edit` is
    now `-A` (instead of `-a`), as `-a` now selects `--grill-auto` in `ase-{code,spec}-edit`.

-   **Board Display State**: a `.ase/board.yaml` of the project is no longer used and can be
    removed, as the display state is now kept per user resp. per browser.

ASE 1.0 to ASE 2.0
------------------

*ASE 2.0 is a major step forward!*

The essential ad-hoc prompt and task plan **grilling** became an all-in-one compact view, with
numbered questions and lettered answers, replied to with short responses like `1A 2c`, and
optionally even clickable.

The **task format** was revamped with lifecycle models, extended frontmatter, attachments,
dependencies, and the **task store** was revamped into service which can persist tasks as Markdown
files locally or remote, or as GitHub, GitLab, or Gitea issues. New **task boards** in the terminal
(TUI) and the browser (WUI) allow you to show and manipulate all tasks live.

The new **autonomous agent** facility can drive the tasks headless from planning over implementation
and qualification to integration. You can even define your own agents with just a few lines of YAML
or TypeScript.

Finally, new skills **merge branches**, **resolve conflicts**, **estimate efforts**, and **research
topics**, and many more.

### FEATURES

-   **Task Lifecycle Models**: `project.task.lifecycle` selects the `solo` (default),
    `team`, or `enterprise` model, and `ase-task-status` gets or sets the status of a task.

-   **Task Plan Format**: task plans now carry `Type:`, `Assignee:`, `Group:`, `Phase:`,
    `After:`, and `Tags:` keys, checkbox-state bullet points, and attachments.

-   **Task Ids**: `project.task.idscheme` selects the scheme of new task ids
    (`slug`, `seq:FOO-%03d`, or `any`), allocated via `ase task newid`.

-   **Task Store**: `ase task store` serves the task plans of all projects through a REST
    API, persisted as files or as GitHub, GitLab, or Gitea issues (`project.task.store.url`).

-   **Task Board**: `ase task board` shows all tasks live as cards in lanes, a dependency
    graph, and an agents view, in the terminal, the browser (`--web`), or as text (`--text`).

-   **Task Board Actions**: the task boards create (`N`), delete (`D`), transfer (`T`),
    edit by prompt (`E`), and request processing (`R`) of tasks, filtered via `/`.

-   **Change Set Flow**: the `Source:`, `Changeset:`, and `Target:` keys route a change
    set, created by `ase-task-implement` and delivered by the new `ase-task-integrate`.

-   **Implementation Drafts**: `ase-task-implement --draft` persists the change set as a
    draft attachment of the task, and both skills keep a change set snapshot attachment.

-   **Approach Selection**: `ase-task-edit`, `ase-code-edit`, and `ase-spec-edit
    --approach` propose alternative approaches, and accept a bare analyzer issue id like `P1`.

-   **Effort Estimation**: `ase-task-estimate` estimates the effort of tasks as T-shirt
    sizes `XS` to `XL` in the `Effort:` key, and `--calibrate` checks it against finished tasks.

-   **Task Research**: `ase-task-research` researches a topic via Web search plus project
    grounding into a `research` attachment, with `--refine` also refining the plan.

-   **Usage Accounting**: `ase-task-assign` assigns a task, and on self-assignment accounts
    the AI time, tokens, and costs of the session (via `ase setup telemetry activate`).

-   **Autonomous Agents**: `ase agent {planner,implementer,qualifier,integrator}` drive the
    `enterprise` lifecycle headless, and `ase agent {editor,estimator,researcher}` process requests.

-   **Agent Management**: each agent runs via `ase agent <kind> start|status|log|stop`,
    and `ase agent fleet init|start|status|log|stop` supervises a fleet of `.ase/fleet.yaml`.

-   **Agent Definitions**: `.ase/agents/<kind>.{yaml,ts,js}` define custom agent kinds
    with hooks, and `ase agent adhoc` runs an agent configured entirely by options.

-   **Agent Relay**: `ase agent relay` passes the live state, logs, and usage of all agents
    to the task boards, and `ase task request` attaches processing requests to tasks.

-   **Branch Merging**: `ase-repo-merge` merges a branch (`--mode merge|rebase|squash`),
    resolving conflicts semantically.

-   **Conflict Resolution**: `ase-repo-resolve` resolves the conflicts of an in-progress
    merge, rebase, cherry-pick, revert, or stash apply without losing any change.

-   **Review Scopes**: `ase-repo-review` additionally reviews a branch (`--branch`), a
    commit (`--commit`), or unstaged changes (`--unstaged`), and exhaustively (`--thorough`).

-   **Change-Restricted Analysis**: `ase-code-analyze` and `ase-code-lint` restrict
    themselves to changed files via `--staged` and/or `--unstaged`.

-   **Grilling Lenses**: `ase-task-grill` supports `--perspective`, `--ground`, `--focus`, and
    `--until` (resp. `--grill-*` in `ase-{code,spec}-edit`) and batch grilling.

-   **Clickable Grilling**: questions and answers of the grilling table are clickable
    (requires `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, set by `ase setup install`).

-   **D2 Diagrams**: `ase util diagram --lang d2` renders also *D2* diagrams.

-   **Server Operation**: `ase service`, `ase task store`, and `ase agent relay` support
    `start --foreground` and a `log [-n <lines>] [-f]` sub-command.

### INCOMPATIBILITIES

-   **Node.js**: the `ase` tool now requires Node.js 22.18.0 or newer.

-   **Update**: run `ase setup update` once, as it now auto-detects the scope
    (`local`, `project`, or `user`) of your existing plugin installation.

-   **Renamed Skills**: `ase-meta-{review,diff,changelog,commit}` are now
    `ase-repo-{review,diff,changelog,commit}`, and `ase-code-dissect` is now
    `ase-repo-dissect`.

-   **Removed Skills**: `ase-code-{craft,refactor,resolve}` are gone: use
    `ase-task-edit [--mode craft|refactor|resolve] [--approach]` (planned) or
    `ase-code-edit [--approach]` (one-shot) instead.

-   **Removed Skill**: `ase-task-preflight` is gone: use `ase-task-implement
    --draft` instead, and deliver the draft via `ase-task-integrate --draft`.

-   **Renamed Option**: `ase-task-edit --dry`/`-d` is now `--unverified`/`-u`.

-   **New Task Ids**: `ase-task-edit` now allocates a new task id for a new
    plan instead of planning under the `default` task.

-   **Worktree Option**: `--worktree`/`-w` of `ase-task-implement`, `ase-code-edit`,
    and `ase-spec-edit` now requires a worktree *name* (`ase-{code,spec}-edit`
    additionally accept `name:branch`).

-   **Next-Step Token**: the `PREFLIGHT` token of `--next` is now `DRAFT`.

-   **Grilling Replies**: questions are now numbered `1`, `2`, ... and answers
    lettered `A`, `B`, ..., so reply with short responses like `1A 2c`
    (instead of `Q1:A1`).

-   **Grilling Rounds**: `--grill-rounds` resp. `--rounds` is now a *maximum*,
    as grilling stops early once all `MUST` points are clear (see `--grill-until`
    resp. `--until`).

-   **Review Severity**: an explicit `ase-repo-review --severity` now wins over
    the boxing, while the new default `AUTO` keeps `MEDIUM` under `grey` boxing.

-   **CLI Utility Commands**: `ase {meta,compat,diagram,worktree,mint,metric}`
    moved to `ase util {meta,compat,diagram,worktree,mint,metric}`: adjust your own
    skills, scripts, and `Bash(ase meta *)` permissions accordingly.

-   **Task Listing**: `ase task list` now excludes the finished tasks by default
    (use `--exclude none` to see them).

-   **Task Plans**: 1.0 task plans are migrated on load: `Properties:` becomes
    `Tags:`, and `Status:` values are mapped onto the lifecycle model
    (`project.task.lifecycle`, default `solo`), e.g. `COMPLETED` onto `CLOSED`.

-   **Task Configuration**: `project.artifact.task.{basedir,files}` were replaced
    by `project.task.store.url` (e.g. `ase:./.ase/task`), and are migrated in place.

-   **Legacy Task Files**: the automatic migration of pre-1.0 task files
    (`<basedir>/<id>/plan.md`) was dropped: migrate them with ASE 1.0 first.

-   **User State**: the per-user state moved from `~/.ase` to the per-OS state
    directory (e.g. `~/Library/Application Support/ase` on macOS), so a stale
    `~/.ase` can be removed, and no longer makes your home directory a project root.

-   **Tool Documentation**: `docs/usage-tool.md` was replaced by Unix manual pages,
    viewable via `man ase` or `ase man [<command> ...]`.



ChangeLog
=========

1.1.0 (2026-09-XX)
------------------

-   FEATURE [plugin]: Clickable grilling table
    In the latest grilling table redrawn by the function hooks module `ase-mods.ts`, every
    question and every answer alternative reveals a clickable button while hovered (rendered in
    red; at rest the styled text is shown, so bold and code styling survives). A click on a
    question inserts its number `n` into the prompt (replacing the standalone number of another
    question, as at most one question is selected), a click on an answer inserts its short
    response `nX` (replacing an existing `nY` or standalone `n` of the same question in place,
    else appending), and the pick/selection rendering (now inversed instead of red) is refreshed
    immediately. The question numbers are right-aligned to the widest one.
    Needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`

-   FEATURE [tool]: Service log viewing
    The new `ase service log` sub-command shows the `.ase/service.log` of the background service,
    optionally limited to its last lines (`-n`/`--lines`) and optionally followed in the style of
    `tail -f` (`-f`/`--follow`, based on the NPM package `tail`).

-   FEATURE [tool]: Task store server with REST API and storage plugins
    The new `ase task store` server serves the task plans of all registered projects through the
    REST API of `docs/task-api.md` (bearer token, CORS, WebSocket change events, optional HTTPS via
    `--tls-cert`/`--tls-key`) and persists them through a storage plugin: the built-in `ase` plugin
    or an NPM package `ase-task-store-<name>`. Requests are serialized per project, and the `ase`
    plugin locks cross-process (`proper-lockfile`), writes atomically (`write-file-atomic`), and
    creates its directory on first save only, so service, CLI, and server can share one directory.

-   FEATURE [tool]: Configurable task store
    The new `project.task.store` URL selects the task plan location: `ase:<path>` (default
    `ase:./.ase/task`, confined to the project root on `project`/`task` scope) runs the built-in
    plugin in-process, `ase[s]://<addr>:<port>[/<token>][?insecure]` forwards to a remote server via
    HTTP(S). The token alternatively comes from `$ASE_TASK_STORE_TOKEN`, the new user-scoped
    `project.task.token`, or `store.yaml`. A remote store requires an explicit `project.id` and keeps
    its registered lifecycle model, changed only via the new `ase task lifecycle [<name>]` (mapping
    existing `Status` values). `project.artifact.task.{basedir,files}` were removed and are migrated
    in place, and the legacy pre-1.0 task file migration was dropped.

-   FEATURE [tool]: Task view command and task listing titles
    The new `ase task view <id>` shows a task plan in `$PAGER` (default `more`) when on a terminal,
    `$PAGER` and `$EDITOR` are run through the shell (supporting `less -R`), `ase task edit` works
    on a temporary file, and `ase task list -v`/`ase_task_list` also report the task title.

-   FEATURE [plugin]: Section-focused task plan grilling
    The new `--focus`/`-f` option of `ase-task-grill` grills only the given plan sections
    (`SPEC`, `DES`, `VER`) in the given order, the `Tags:` key records each as a `grilled:<section>` tag,
    and grilling gained the focus areas `REGRESSION` (`REG`) and `CONFIRMATION` (`CON`).

-   FEATURE [tool]: Configurable task lifecycle model
    The new `project.task.lifecycle` configuration selects the `solo` (default), `team`, or
    `enterprise` lifecycle model (superseding `simple`/`complex` of 1.0), exported as
    `<ase-project-task-lifecycle/>`, `ASE_PROJECT_TASK_LIFECYCLE`, and statusline placeholder `%L`.

-   FEATURE [plugin]: Reworked task plan format
    Task plans now carry the frontmatter keys `Type`, `Assignee`, `Group`, `Phase`, `After`, `Tags`,
    and `Branch`, sections with `DOM`/`IFC`, `ARC`/`IMP`, `REG`/`CON` bullet-points in checkbox
    states, and backmatter attachments (e.g. the preflight draft).

-   FEATURE [plugin]: Timestamped task plan attachments and stale implementation drafts
    Attachments carry `Created`/`Modified` keys, the frontmatter `Modified` key tracks body changes
    only, and a draft whose `Modified` falls behind the frontmatter is *stale*: `ase-task-edit`
    and `ase-task-view` warn about it, while `ase-task-implement` stops with an error.

-   FEATURE [plugin]: Branch-driven task implementation
    `ase-task-implement` and `ase-task-preflight` honor the `Branch:` frontmatter key by switching
    the working copy in place (guarded against uncommitted changes) or, with `--worktree`, inside
    `.ase/worktree/<id>`. `ase-code-edit` and `ase-spec-edit` gained the counterpart `--branch`.

-   FEATURE [plugin,tool]: Task plan status get/set
    The new `ase-task-status` skill, `ase task status` CLI sub-command, and `ase_task_status` MCP
    tool report or set the `Status:` key of a task plan, validated against the lifecycle model.
    `ase task save` and `ase_task_save` now also reject unknown or unreachable states.

-   FEATURE [tool]: Lifecycle-aware `ase task list` with `finished` sentinel
    The `--include`/`--exclude` states are validated against the lifecycle model, the new
    `finished` sentinel expands to its finished states, the default is now `--exclude finished`,
    and a plan with an unknown `Status:` is kept in the listing (with a warning).

-   FEATURE [plugin]: Checkbox-state aware grilling, preflight, and implementation
    `ase-task-grill` marks unanswered bullet-points as `[?]`, resets them to `[ ]` once answered,
    and re-asks only those of an already grilled section. `ase-task-grill`, `ase-task-preflight`,
    and `ase-task-implement` skip `[-]` (cancelled) and `[>]` (deferred) bullet-points entirely.

-   FEATURE [plugin]: Severity-bounded grilling with maximum round count
    The round count of `ase-code-edit`/`ase-spec-edit` (`--grill-rounds`) and `ase-task-grill`
    (`--rounds`) is now a *maximum*: the new `--grill-until`/`--until` option (`MUST`, `SHOULD`, `MAY`,
    default `MUST`) stops the grilling early -- even in the first round, announced by a `grilling
    finished early` status line -- once all open points of that severity or higher are clear. Every
    open point is additionally rated by an individual impact (`HIGH`, `MEDIUM`, `LOW`), which
    decides which points are raised and their order within a focus area.

-   IMPROVEMENT [plugin]: Regression and confirmation grilling in `ase-spec-edit`
    The grilling of `ase-spec-edit` now also raises `REGRESSION` (`REG`) and `CONFIRMATION`
    (`CON`) focus area questions, aligned with `ase-code-edit`.

-   IMPROVEMENT [plugin]: Shorter grilling ids and short responses in `ase-code-edit`/`ase-spec-edit`
    The grilling questions are now numbered `1`, `2`, etc. (instead of `Q1`, `Q2`, etc.) and their
    answer alternatives lettered `A`, `B`, etc. (instead of `A1`, `A2`, etc.), and the combined reply
    recognizes short responses matching `\d+[a-zA-Z]` (like `1A 2c`, instead of `Qn:An`) for
    cherry-picking answers, freely mixed with keyword text.

-   IMPROVEMENT [tool]: Per-OS user state directory instead of `~/.ase`
    The per-user state (session configurations and `task-lifecycle.json`) moved from `~/.ase` to
    the per-OS state directory: `~/Library/Application Support/ase` on macOS (next to the user
    configuration), `%LOCALAPPDATA%\ase` on Windows, and `$XDG_STATE_HOME/ase` (or
    `~/.local/state/ase`) on Linux. Additionally, a `.ase` directory in the home directory no longer
    makes the home directory a project root. A stale `~/.ase` can be removed.

-   BUGFIX [plugin]: Task plan kind `SPECIFYING` honored
    `ase-task-preflight` and `ase-task-implement` now recognize the `Kind: SPECIFYING`
    frontmatter key of a task plan and internalize the SPECIFYING TENETS, and also infer
    `SPECIFYING` for a plan which predominantly revises the specification (`ase-common-code.md`).

-   BUGFIX [tool]: Object-shaped hook tool arguments
    The pre-tool-use hook now derives the tool arguments from the *received* value shape
    instead of a per-tool declaration, so the object-shaped `toolArgs` of the GitHub Copilot
    CLI is parsed again and its `bash`, `Skill`, `Read`, and `Edit` auto-approvals work.

1.0.6 (2026-09-14)
------------------

-   FEATURE [plugin]: Output style for Claude Code
    Added the Claude Code output style `ase-terse` in `plugin/output-styles/ase-terse.md`,
    which makes the agent respond tersely, lead with the result, execute tools
    silently, and end without a closing recap, while keeping the built-in coding
    instructions and the ASE persona communication style in effect.

-   FEATURE [tool]: Output style integration for all agent tools
    Under Anthropic Claude Code CLI, `ase setup install` and `ase setup update` now
    select the plugin output style `ase:ase-terse` via `outputStyle` in the scope's `settings.json`
    (preserving a foreign selection), `ase setup uninstall` deselects it again, and
    `ase setup status` reports it as `OUTPUTSTYLE` rows. Under GitHub Copilot CLI and
    OpenAI Codex CLI, which have no output style concept, the session-start hook injects
    the identical style instructions (frontmatter stripped) into the session context.

-   UPDATE [infr]: NPM dependencies
    Updated NPM dependencies: SpecBook 1.2.13, etc.

1.0.5 (2026-09-13)
------------------

-   FEATURE [tool]: Multiple SpecBook schema configurations
    The `project.artifact.spec.schema` configuration is now a whitespace-separated
    list of SpecBook YAML schema configuration files, merged in the given order,
    where the entry `std` names the standard schema bundled with the ASE plugin
    and every other entry is a file path relative to the project root.

-   IMPROVEMENT [docs]: Simple and complex task lifecycle models
    Reworked `docs/task-states.md` into the two task lifecycle models `simple`
    (Planning and Implementation phases) and `complex`, each with its state
    machine, states, and transitions, and redrew the task state diagram.

-   BUGFIX [tool]: Terminal-width aware CLI tables
    The tables of `ase config list`, `ase setup status`, and `ase setup mcp list`
    no longer exceed the terminal width, as their columns are now shrunk to the
    available width and their over-wide cells are wrapped over multiple lines.

-   BUGFIX [tool]: Consistent Git exclude handling of the two artifact resolvers
    The artifact resolver now also honors the global excludes file and `info/exclude`, and
    `ase spec` now honors the Git exclude rules at all, so both resolvers see the same files.

-   UPDATE [infr]: NPM dependencies
    Updated NPM dependencies: SpecBook 1.2.10, STX 1.1.7, Lucide Astro 1.44.0, etc

-   CLEANUP [infr]: Linting and Git ignore configuration
    Disabled the `blanks-around-headings` rule in `plugin/etc/markdownlint.yaml`
    and narrowed the `docs/.gitignore` entry to the generated `spec/index.*` files.

1.0.4 (2026-09-10)
------------------

-   BUGFIX [infr]: Dropped unnecessary files in NPM distribution
    The `plugin/node_modules` was accidentally included in the NPM distribution
    archive of ASE and this way blew it up dramatically.

1.0.3 (2026-09-10)
------------------

-   FEATURE [plugin]: Reconciliation operations and dry run
    Added the `--operation` option to the `ase-sync-reconcile` skill, which
    restricts the target-side changes to a subset of the operations `add`,
    `update`, and `remove` (default: `all`), and the `--dry` option, which
    performs the reconciliation without modifying any target artifact and
    shows the intended changes as a unified diff instead.

-   UPDATE [infr]: NPM dependencies
    Updated NPM dependencies: SpecBook 1.2.9

1.0.2 (2026-09-10)
------------------

-   FEATURE [docs]: Two more skills in the typing demo
    Added the `ase-docs-shorten` and `ase-meta-proximity` showcases to the
    command list of `Widget-Typing-Demo.astro`.

-   IMPROVEMENT [docs]: Typing demo command titles
    Shortened and unified the command titles of `Widget-Typing-Demo.astro`
    into terse, verb-first phrasings.

-   BUGFIX [infr]: Generated plugin files missing from the NPM package
    Removed the copied `plugin/.gitignore` in the `build-plugin` target of
    `tool/etc/stx.conf`, as NPM otherwise silently drops the generated plugin
    files it names from the published tarball.

-   UPDATE [docs]: Workflow diagram
    Updated the `workflow` diagram in `docs/` and the website assets.

-   UPDATE [infr]: NPM dependencies
    Updated NPM dependencies in `tools/`.

1.0.1 (2026-09-08)
------------------

-   FEATURE [plugin]: Specification know-how activation
    Added the `ase-spec-activate` skill, which activates the *SpecBook*
    know-how in the current session.

-   FEATURE [docs]: Specification workflows on the website
    Added the new "Specification Workflows" part to the "Workflows" page. The
    former "Development Workflows" part was renamed to "Coding Workflows", and
    the "Workflows" pull-down of `nav.ts` now lists all three parts.

-   IMPROVEMENT [docs]: Use cases cover all 52 skills
    Extended the use cases of `pages/src/data/usecases.ts` so that every one
    of the 52 *ASE* skills occurs at least once in the running examples on
    the website.

-   IMPROVEMENT [docs]: Philosophy wording on the website
    Reworded the lead of the "Philosophy" section from the "sweet-spot" levels
    to the distinct *modi operandi* of the Agentic AI Level model, stressing
    that the engineer stays in the driver's seat and picks the *modus
    operandi* per task, and adjusted its annotation accordingly.

-   IMPROVEMENT [docs]: Testimonial rendering on the website
    Typeset the testimonials of `Section-Testimonials.astro` as classic pull
    quotes with a single oversized opening quotation mark.

-   IMPROVEMENT [docs]: Productivity comparison arrow
    Drew a white progression arrow across the three tool columns of the
    "Productivity" comparison table in `Section-Productivity.astro`, pointing
    to the most boosted column.

-   IMPROVEMENT [docs]: Vertical spacing of the workflow parts
    Widened the top margin of the "Coding Workflows" header in
    `Section-Workflows.astro` to separate the workflow parts more clearly.

-   BUGFIX [docs]: Pull-down menu double-activation
    Fixed the header navigation of `Section-Header.astro` so that above the
    `lg` breakpoint, where hover or focus already opens the pull-down panel, a
    click no longer toggles `data-open` and hence no longer keeps a panel open.

-   UPDATE [docs]: Agentic AI Levels diagram
    Updated the `agentic-levels` diagram in `docs/` and the website assets.

-   UPDATE [infr]: Dependencies
    Upgraded the dependencies of `pages/`, `plugin/`, and `tool/`, especially
    *Astro*, *marked*, *typescript-eslint*, and *eslint-markdown*.

-   CLEANUP [docs]: Website component comments
    Trimmed the overlong header comments of `Feature-External-Links.astro`,
    `Feature-Progress.astro`, and `Section-Philosophy.astro`.

-   CLEANUP [code]: Specification activation skill
    Tightened the wording of the `ase-spec-activate` skill and its manual
    page.

1.0.0 (2026-09-07)
------------------

-   BUGFIX [infr]: Release procedure of "npm start publish"
    Fixed the `-i` option matching of the `publish` target in `etc/stx.conf`,
    which previously matched `-b*` and hence never picked up the requested
    version bump, and fixed the *StdVer* usage in `etc/version.mts`

-   UPDATE [infr]: NPM dependencies
    Upgraded `stdver` to 0.9.17.

0.9.69 (2026-09-07)
-------------------

-   FEATURE [docs]: Use-case pages on the website
    Added the new "Use Cases" part of the website: the new single source of
    truth `pages/src/data/usecases.ts` carries eleven use cases (Exploration,
    Research, Discovery, Skeleton, Specification, Coding, Bugfixing, Linting,
    Versioning, Writing, and Automation), each walking one running example
    step by step through the *ASE* skills carrying it, the new
    `Section-Usecase.astro` renders them as a numbered process, the new
    dynamic route `pages/src/pages/usecases/[usecase].astro` emits one page per
    use case, and the "Use Cases" pull-down of `nav.ts` is derived from the
    very same data, so the previously parked "Technology Stack" and "Crafting
    Feature" prototype pages and the "Engineering Session" part of the
    "Workflows" page were dropped in favor of them. Along the way,
    `Widget-Terminal.astro` keeps command options together on one line and
    accepts digits in skill names.

-   FEATURE [docs]: Pull-down menus in the website navigation
    Turned the flat header navigation into groups with pull-down menus: the new
    `NavGroup` and `NavSection` types of `pages/src/data/nav.ts` let a header
    label open a panel listing the sections of its page (or external targets),
    rendered by the new `Widget-Nav-Entry.astro` for both header groups. The
    "Philosophy", "Architecture", and "Compatibility" pages were folded into
    the "Design" and "Setup" pages as addressable sections, the new "Project"
    group leads to the repository and the new "Sibling Projects" page (with
    `Section-Siblings.astro` extracted from `Section-Thanks.astro`), the
    "Author" page became a group of its own, the "Home" entry is shown as the
    leading *ASE* logo, and `Section-Highlights.astro`/`highlights.ts` were
    renamed to `Section-Previews.astro`/`previews.ts`.

-   IMPROVEMENT [docs]: Install call-to-action in the website footer
    Added a stacked "block" variant to `Widget-Sticky-CTA.astro` and placed it
    into `Section-Footer.astro`, so the install call survives the dismissal
    of the sticky bar, and reworded the "Design" page headers to "Our Design
    Assumptions" and "Our Design Decisions".

-   BUGFIX [code]: SpecBook log information no longer lost
    Mapped the SpecBook verbosity level `none` in `ase-spec.ts` onto the info
    log instead of dropping it, so the environment notices and the lifecycle
    and failure reports of the long-running `watch` and `preview` loops no
    longer leave a broken observation unreported.

-   UPDATE [infr]: NPM dependencies
    Upgraded `@rse/specbook` to 1.2.8, `@types/node` to 26.5.0, and
    `@lucide/astro` to 1.42.0, and excluded `typescript` from the automatic
    `upd` dependency updating in `tool/package.json` and `plugin/package.json`.

0.9.68 (2026-09-06)
-------------------

-   REFACTOR [docs]: Website navigation turned into distinct pages
    Turned every navigation bar entry of the website into its own *Astro* page
    route under `pages/src/pages/` (`highlights`, `setup`, `usage`, `workflows`,
    `architecture`, `design`, `philosophy`, `compat`, `author`), driven by the
    new single-source-of-truth `pages/src/data/nav.ts` which carries route path,
    nav label, browser title, and meta description per entry, extracted the
    comparison table into the new `Section-Productivity.astro` component,
    replaced the single-page scroll-spy (`Feature-Scroll-Spy.astro`) with
    per-page navigation plus the new `Feature-Scroll-Reveal.astro`, and adjusted
    `BaseLayout.astro`, `Section-Header.astro`, and the affected sections and
    widgets accordingly, so the site no longer is one long scrolling page.

0.9.67 (2026-09-06)
-------------------

-   FEATURE [code]: Registration status reporting
    Added the `ase setup status` command (`ase-setup.ts`), which reports across
    *all* scopes at once the registration scope and enabled/disabled state of the
    *ASE* plugin, the registration scope of every currently registered MCP server
    of the `mcpServers` registry, and the settings files carrying an `activated`
    or `foreign` `statusLine` entry, so an unintentionally leaked registration
    becomes visible without probing `claude mcp get` per server by hand.

-   FEATURE [docs]: Sibling projects on the website
    Added a new "See Also the Sibling Projects" section to
    `pages/src/components/Section-Thanks.astro`, listing *SpecBook*,
    *MCP-to-OpenAI*, *MCP-to-Harness*, *claudeX*, and *Bash-Authorize* together
    with their relation to *ASE*, and rendering the lightweight inline markup of
    their notes, so the ecosystem around *ASE* becomes visible on the website.

-   IMPROVEMENT [docs]: Split article work-steps in the comparison table
    Split the single "Writing Articles" row of `pages/src/data/comparison.ts`
    into a "Writing Articles" row (brainstorming plus challenging and
    strengthening arguments) and a "Correcting Articles" row (shortening,
    refining, and proofreading), and switched the "Crafting Code" row over to
    `/ase-code-edit` and `/ase-code-craft`, so each row again covers exactly one
    work-step.

-   UPDATE [docs]: SpecBook project domain
    Switched the *SpecBook* references in `README.md` and on the website from the
    GitHub repository URL over to the `specbook.tools` domain and re-sorted the
    "See Also" list accordingly.

-   BUGFIX [docs]: Missing space in the comparison table
    Added the missing space between two concatenated string fragments of the
    "Specification First" row in `pages/src/data/comparison.ts`.

0.9.66 (2026-09-06)
-------------------

-   FEATURE [code]: Boxing transparency in the statusline
    Added the `%B` placeholder to `ase statusline`, rendering the project boxing
    transparency (`white`, `grey`, `black`) resolved from the *ASE* configuration
    cascade with an `ASE_PROJECT_BOXING` environment variable fallback, and added
    it to the default statusline format line, so the boxing is permanently
    observable instead of only in the session-start banner.

-   FEATURE [code]: Text length metrics
    Added the `ase_text_metric` MCP tool and the `ase metric` CLI command in
    `tool/src/ase-metric.ts`, measuring the `words`, `lines`, `chars` (Unicode
    characters), and `bytes` (octets) of either a `file` or a literal `text`, and
    switched the `ase-docs-shorten` skill and sub-agent, the `ase-meta-workflow`
    skill, and the `ase-task-condense` skill over to it, so text lengths are
    measured instead of estimated.

-   FEATURE [docs]: Document shortening skill
    Added the `ase-docs-shorten` skill and its sub-agent for reducing a single
    document to a target length, given by the mutually exclusive and mandatory
    `--chars <N>` or `--words <N>` option, through a three-stage cascade --
    tighten the sentences, drop low-value content, compress the remaining content
    into shorter expressions -- entering each stage only while the target is still
    not met, and cutting every proposed change as a whole block which is
    reviewed as a unified diff.

-   FEATURE [docs]: Document refinement skill
    Added the `ase-docs-refine` skill and its sub-agent for a light rewriting of
    awkward or unclear sentences -- restructuring sentences for rhythm and clarity,
    replacing nominal constructions with verbs, making enumerations parallel,
    cutting filler and redundancy, fixing awkward transitions, and adjusting
    voice -- while content, numbers, and technical terms stay exactly as they are.

-   FEATURE [code]: Identifier and name minting
    Added the `ase-meta-mint` skill for minting identifiers and names out of a
    free-text hint, backed by the new `ase mint` CLI command and `ase_mint` MCP tool
    in `tool/src/ase-mint.ts`, which derive UUIDs via `pure-uuid` (V5/V4) and SHA-1
    digests via `node:crypto`.

-   FEATURE [docs]: Getting Started section on the website
    Added a "Getting Started" part to `Section-Usage.astro`, guiding new users from
    installation to their first skill invocation.

-   FEATURE [docs]: Icons across the website sections
    Introduced `@lucide/astro` icons in the architecture, day, design, fit, usage,
    workflows, and video-row components plus the `fit.ts`, `highlights.ts`, and
    `methods.ts` data.

-   REFACTOR [docs]: Consistent component file naming
    Renamed all `pages/src/components/*.astro` files into the `Section-`, `Widget-`,
    `Feature-`, and `Modal-` prefix scheme (including `Section-Hero` to `Section-Title`).

-   REFACTOR [docs]: Split website sections into own components
    Factored the philosophy part out of `Section-Usage.astro` into `Section-Philosophy.astro`
    and the contributors/sponsors part out of `Section-Author.astro` into `Section-Thanks.astro`.

-   FEATURE [docs]: Add Capitalization and Word-Break corrections
    Improved `ase-docs-proofread` skill by adding Capitalization and Word-Break correction types.

0.9.65 (2026-08-28)
-------------------

-   FEATURE [code]: Additional tenets and commandments
    Added the "Factual Locality" crafting/refactoring tenet, the "Cause before Symptom"
    resolving tenet, and the "Check first, then worry" and "Comprehension before acting"
    commandments to `ase-tenets.md` and `ase-constitution.md`.

-   IMPROVEMENT [docs]: Quick Mode as a distinct operation mode
    Documented the *Quick Mode* as the fourth *ASE* operation mode on the website, with
    its plain and its `--grill --verify` variant, plus an `ase-code-edit` post-adjustment
    moment in the day sample (`Section-Usage.astro`, `Section-Workflows.astro`, `Section-Day.astro`).

-   IMPROVEMENT [docs]: Refreshed operation modes diagram
    Regenerated `operation-modes.svg`/`.pdf`/`.xlsx` and the website asset copy to cover
    the *Quick Mode*.

-   IMPROVEMENT [docs]: Refreshed website and README references
    Directed readers to the built-in methodology table (`Section-Design.astro`), reduced the
    reconciliation example to `--source SPEC`, and listed *SpecBook* in the README "See Also" section.

0.9.64 (2026-08-27)
-------------------

-   FEATURE [code]: SpecBook environment notices
    Route the SpecBook `notice` messages to the `warning` log and collect them into the new
    `notices` output field of `ase_specbook_export`, which `ase-sync-export` reports verbatim.

-   IMPROVEMENT [code, docs]: Scenario-based intent matching
    Added a `SCENARIOS` section ("You want ...") to the manual page of every skill and let
    `ase-help-intent` propose all adequately fitting commands, ranked best-fitting first.

-   IMPROVEMENT [docs]: PDF export prerequisite
    Document the Chromium-class browser the `pdf` export needs, and the one-time
    `npx playwright install chromium` remedy, in `README.md`, `usage-tool.md`, and the skill help.

-   IMPROVEMENT [docs]: Refreshed website content
    Switched the "Quick & Dirty" workflow to `ase-code-edit`, reworded the typing demo, and added a
    "Specification First" comparison row (`Section-Workflows.astro`, `Typing-Demo.astro`, `comparison.ts`).

0.9.63 (2026-08-26)
-------------------

-   FEATURE [code, docs]: Specification editing skill
    Added the `ase-spec-edit` skill, the specification-level counterpart of `ase-code-edit`,
    editing `SPEC` artifacts plan-lessly from a query and validating them under `--verify`.

-   FEATURE [code]: Specifying tenets
    Added the SPECIFYING TENETS: intent over realization, statement with rationale, verifiability,
    single source of truth, atomic statements, schema conformance, and referential integrity.

-   FEATURE [code, docs]: SpecBook as the SPEC format
    Integrated *SpecBook* as the specification format, so the `SPEC` artifact kind now covers both
    requirements and architecture, governed by a build-time generated schema configuration.

-   FEATURE [code, docs]: Spec lint and export commands
    Added the `ase spec lint` and `ase spec export` CLI commands plus their `ase_specbook_*` MCP
    tools, mapping onto the SpecBook API and locating the specification via configuration keys.

-   FEATURE [code, docs]: SpecBook-based export
    Re-based `ase-sync-export` onto the SpecBook export, rendering the whole specification into
    `[<format>:]<file>` outputs after a successful lint, defaulting to `index.html`.

-   IMPROVEMENT [code]: SPEC artifact validation
    Validate generated or updated `SPEC` artifacts via `ase_specbook_lint` and fix the diagnostics
    in at most three rounds, surfacing any leftovers (`ase-sync-import`, `ase-sync-reconcile`).

-   IMPROVEMENT [code]: Artifact base directory accessor
    Exposed the absolute artifact base directory via `Artifact.basedir()` and let `writeStdout()`
    accept buffers (`ase-artifact.ts`, `ase-stdio.ts`).

-   IMPROVEMENT [docs]: More readable ChangeLog format
    Reformatted all `CHANGELOG.md` entries into a short title line plus an indented, line-wrapped
    description, instead of a single long paragraph per entry.

-   BUGFIX [code]: Round-local grilling question numbering
    Restart the grilling question ids `Qn` at `1` in every round and the answer ids `An` at `1` for
    every question, so question and answer counts stay correct (`ase-code-edit`, `ase-task-grill`).

-   UPDATE [docs]: Refreshed workflow diagram
    Updated the workflow diagram sources and renderings
    (`docs/workflow.graffle`, `docs/workflow.pdf`, `docs/workflow.svg`, `pages/public/assets/workflow.svg`).

-   UPDATE [docs, infr]: Upgraded dependencies
    Upgraded the dependency versions of the `plugin`, `tool`, and `pages` deliverables
    (`plugin/package.json`, `tool/package.json`, `pages/package.json`).

-   CHANGE [code, docs]: New SPEC artifact defaults
    Changed the `project.artifact.spec` defaults to `docs/specbook` and `*.{md,txt,svg,png,jpg}`
    (`ase-config.ts`, `configuration.md`).

-   CHANGE [code, docs, infr]: Removed the ARCH artifact kind
    Removed the `ARCH` artifact kind, its configuration, the hand-written `ase-format-arch.md`, and
    all `ARCH` references, and reduced `ase-format-meta.md` to the artifact-set overview.

0.9.62 (2026-08-25)
-------------------

-   FEATURE [code, docs]: Grilling moved to task-grill
    Took over the grilling aspects of `ase-code-edit --grill` into the `ase-task-grill` skill.

-   FEATURE [code]: Documentation lint aspect
    Added the lint aspect `A21 - DOCUMENTATION`, checking for missing, excessive, restating, and
    drifted code documentation (`ase-code-lint`).

-   IMPROVEMENT [code]: Condensed grilling table
    Condensed the grilling question table into a two-column `QUESTION`/`ANSWERS` layout with
    `Qn`-prefixed questions, short focus ids, a `⚑` state marker, and a trailing legend.

-   IMPROVEMENT [code]: Structured grilling round
    Structured the grilling round into the explicit sub-steps INITIALIZE TODO, DETERMINE QUESTIONS,
    DETERMINE CONTEXT, SORT QUESTIONS, and DETERMINE ANSWERS (`ase-code-edit`, `ase-task-grill`).

-   IMPROVEMENT [code]: Answer references in grilling
    Accept `Qn:An` references in addition to keywords as the combined grilling answer
    (`ase-code-edit`, `ase-task-grill`).

-   IMPROVEMENT [code]: Issue id in argument hint
    Mention the accepted `<issue-id>` alternative in the argument hint (`ase-code-edit`).

-   BUGFIX [code]: Doubled question label
    No longer render the question label twice by splitting the first custom dialog line into the box
    subtitle label and a description without it (`ase-dialog.md`).

-   CLEANUP [code]: Documentation aspect wording
    Streamlined the wording and severity guidance of the `A21 - DOCUMENTATION` lint aspect
    (`ase-code-lint`).

-   REFACTOR [code]: Shared grilling meta file
    Factored the shared grilling understanding (goal, focus areas, indicators) into the new
    `ase-common-grill.md`.

0.9.61 (2026-08-23)
-------------------

-   FEATURE [code, docs]: Bare issue id as argument
    Accept a bare analyzer issue id like `P1`, `T1`, or `<prefix>-P1` as the lone argument of
    `ase-code-edit`.

-   IMPROVEMENT [code]: Compacted grilling table
    Compacted the grilling question table into a centered `#`/`FOCUS ▶ TOPIC`/`QUESTION`/`ANSWERS`
    layout with `Q<n>`-labeled rows and `A<n>`-labeled answer alternatives (`ase-code-edit`).

-   IMPROVEMENT [code]: Bounded grilling cell content
    Bounded the grilling questions and answers in length and demanded escaped pipes and balanced
    backticks, as an overflowing cell silently degrades the table into plain text (`ase-code-edit`).

-   IMPROVEMENT [code]: Leaner EDIT TODO output
    Render the EDIT TODO output with just a header and footer instead of a full box, with WHAT and
    HOW separated by a blank line (`ase-code-edit`).

0.9.60 (2026-08-23)
-------------------

-   FEATURE [code, docs]: Code editing skill
    Added the `ase-code-edit` skill, a plan-less fusion of `ase-code-{craft,refactor,resolve}`,
    `ase-task-grill`, and `ase-task-implement`, with batch grilling as the sole grilling mode.

-   FEATURE [code, docs]: Interactive crafting
    Added an `--interactive`/`-i` option to `ase-code-craft` which implies `--direct`/`-D` and asks
    for the next change via a `DONE`-or-free-text dialog, applying each one in place.

-   IMPROVEMENT [code]: Single task plan update path
    Make `ase_task_save` the only way to update task plans, across all task-touching skills
    (`ase-common-task.md`, `ase-code-*`, `ase-sync-*`, `ase-task-*`).

-   IMPROVEMENT [code]: Authoritative preflight draft
    Treat the preflight draft of a task plan as authoritative -- take it over 1:1 when still fresh
    and remove it once stale (`ase-task-edit`, `ase-task-implement`, `ase-task-preflight`).

-   IMPROVEMENT [code]: Orphaned session directories
    Garbage collect orphaned session directories left behind by died agents (`ase-hook.ts`).

-   IMPROVEMENT [code]: Faster skill status lines
    No longer count and report the number of words of task plans in the skill status lines, to speed
    up processing.

-   IMPROVEMENT [docs, infr]: Regenerated project overview
    Regenerated the project overview from the current implementation artifacts (`AGENTS.md`,
    `README.md`).

-   UPDATE [code, infr]: Dependency upgrade
    Upgraded NPM dependencies and adapted the ESLint configuration and sources to them
    (`package.json`, `eslint.mjs`, `tool/src`).

0.9.59 (2026-08-08)
-------------------

-   FEATURE [code]: Worktree path discovery
    Introduce `ase_worktree_path` for a safe way to discover a worktree path (`ase-worktree.ts`,
    `ase-service.ts`, `ase.ts`, `ase-code-dissect`, `ase-task-implement`).

-   IMPROVEMENT [code]: Arbitrary wait durations
    Support arbitrary `<sleep>` and `<await>` durations by chunking them into consecutive 60 second
    `ase_sleep` calls (`ase-control.md`).

-   IMPROVEMENT [infr]: Ignore package lock files
    Ignore `package-lock.json` files (`.gitignore`).

-   BUGFIX [code]: Sleep duration cap
    Cap the `ase_sleep` duration at 120 seconds (default 60), as Claude Code rejects longer MCP
    calls (`ase-sleep.ts`).

-   BUGFIX [code]: Diff context lines
    Resurrect the unified diff context lines by re-deriving them from the actual file content
    instead of trusting the sub-agent supplied ones (`ase-code-lint`, `ase-docs-proofread`).

0.9.58 (2026-08-06)
-------------------

-   FEATURE [code]: Worktree path discovery
    Introduce `ase_worktree_path` for a safe way to discover a worktree path.

-   FEATURE [code]: Sleep and await constructs
    Added the `<sleep>` and `<await>` control flow constructs for waiting a given number of seconds
    and for waiting until a condition is met, backed by the new `ase_sleep` MCP tool.

-   FEATURE [code, docs]: Direct crafting and refactoring
    Added a `--direct`/`-D` option for directly crafting a feature or applying a refactoring in
    place, without the approach comparison and task plan ceremony (`ase-code-craft`, `-refactor`).

-   IMPROVEMENT [code]: Concise comments
    Keep comments concise by bounding their length and demanding a compaction of the existing
    wording before an expansion (`ase-constitution.md`).

-   BUGFIX [code]: Direct mode output suppression
    No longer surface a change summary, rationale, or diff after a `--direct`/`-D` run, as the
    `white` project boxing rules overrode the suppression; emit a single status line instead.

0.9.57 (2026-08-06)
-------------------

-   FEATURE [code]: Direct problem resolving
    Added a `--direct`/`-D` option for directly applying a problem fix in place, without the
    approach comparison and task plan ceremony (`ase-code-resolve`).

-   IMPROVEMENT [code]: Immediate skill stop on hand-over
    Stop the current skill immediately once the task hand-over invoked the `Skill` tool
    (`ase-common-code.md`).

-   IMPROVEMENT [code]: Empty query guard
    Guard against an empty query argument instead of silently proceeding (`ase-meta-chat`).

-   IMPROVEMENT [code]: Widened tool sets
    Widen the allowed tool sets to the actually required operations (`ase-meta-changelog`,
    `ase-arch-discover`).

-   IMPROVEMENT [code]: Compact YAML error logging
    Log only the first line of an unparsable YAML error in the pruning report (`ase-config.ts`).

-   BUGFIX [code]: Task id validation on set
    Validate the task id also when setting the active task id of a session, instead of persisting
    arbitrary strings into `agent.task` (`ase-task.ts`).

-   BUGFIX [code, docs]: Explicit user scope honored
    No longer silently retarget an explicit `--scope user` to the project scope inside a project
    context (`ase-config.ts`, `usage-tool.md`, `ase-meta-config`, `ase-help-intent`).

-   BUGFIX [code]: Scope files outside Git
    Resolve the project and task scope files against the project root also outside a Git working
    tree.

-   BUGFIX [code]: Configuration validation loop
    No longer loop forever in the lenient configuration validation if a reported issue path cannot
    be deleted (`ase-config.ts`).

-   BUGFIX [code]: Preserved invalid configuration
    No longer silently erase invalid configuration entries from the target file when writing back a
    leniently read configuration (`ase-config.ts`).

-   BUGFIX [code]: Escaped whitespace in options
    Honor backslash-escaped whitespace outside quotes when tokenizing the raw option input.

-   BUGFIX [code]: Missing prefix option
    Add the missing `--prefix`/`-P` option to the synopsis (`ase-arch-analyze`).

-   BUGFIX [code]: Long backtick run misparse
    No longer misclassify an inline code span delimited by a run of 3+ backticks as a fenced code
    block opener, which inverted the fence state and mangled subsequent code blocks.

-   BUGFIX [code]: Environment variable overrides
    Honor the `ASE_PERSONA_STYLE`, `ASE_GUIDANCE_LEVEL`, and `ASE_PROJECT_BOXING` variables again,
    as the preset values of the built-in `default` scope layer shadowed them (`ase-hook.ts`).

-   BUGFIX [code]: Service probe error escape
    No longer let a non-`ECONNREFUSED` probe error escape the service start flow (`ase-service.ts`).

-   REFACTOR [code]: Shared task hand-over
    Factored the shared task plan hand-over into the `task-next-handoff` definition
    (`ase-common-task.md`, `ase-task-preflight`, `ase-task-reboot`).

-   REFACTOR [code]: Shared artifact instructions
    Moved the artifact blank line and timestamp instructions into the shared meta file
    (`ase-format-meta.md`, `ase-format-arch.md`, `ase-format-spec.md`).

0.9.56 (2026-08-06)
-------------------

-   IMPROVEMENT [code]: Legacy task plan normalization
    Normalize legacy task plans into the Markdown frontmatter shape also in `ase-task-edit`,
    `ase-task-grill`, `ase-task-implement`, `ase-task-preflight`, and `ase-task-reboot`.

-   IMPROVEMENT [code]: Argument and backend guards
    Guard against empty or missing arguments and unavailable backends instead of silently proceeding
    (`ase-meta-brainstorm`, `-diaboli`, `-search`, `-steelman`, `-why`, `-commit`).

-   IMPROVEMENT [code]: Robust interaction loop
    Made the interaction loop and the dialog handling more robust (`ase-help-intent`).

-   IMPROVEMENT [code]: Corrective hints on errors
    Carry a corrective hint on dead-end errors and give final follow-up hints (`ase-task-list`,
    `ase-sync-reconcile`).

-   IMPROVEMENT [code]: Empty repository support
    Support also empty repositories with no `HEAD` and repeat the box title in its footer
    (`ase-meta-diff`).

-   IMPROVEMENT [code]: Precise output expectations
    State the output expectations more precisely (`ase-meta-review`).

-   IMPROVEMENT [code]: Kotlin language detection
    Be more precise on the Kotlin language detection (`ase-arch-discover`).

-   IMPROVEMENT [code]: Dialog cancel outcome
    Be more clear on the `CANCEL` outcome of a dialog (`ase-dialog.md`).

-   IMPROVEMENT [code]: Statusline fallback rendering
    Render `-` as fallback for still unavailable usage statistics in the statusline
    (`ase-statusline.ts`).

-   IMPROVEMENT [docs]: Robust typing demo generator
    Made the process handling of the typing demo generator more robust and ensure the Playwright
    browser is installed (`pages/etc/typing-demo.mjs`, `pages/etc/stx.conf`).

-   BUGFIX [code]: Lazy ASE_TOOL validation
    Validate the `ASE_TOOL` environment variable lazily, so an invalid value no longer breaks
    unrelated `ase` commands (`ase-setup.ts`).

-   BUGFIX [code]: Doubled dialog bar layer
    Strip the second bar layer from the dialog content rendering (`ase-dialog.md`, `ase-skill.md`).

-   BUGFIX [code]: Post-release commit folding
    Fold commits made after a release into a new section instead of the already released one, and
    reference the correct command (`ase-meta-changelog`).

-   BUGFIX [code]: Unused code hint argument
    Really consume and use the code hint argument in all steps (`ase-code-insight`).

-   BUGFIX [code]: EXECUTE result handling
    Honor the `EXECUTE` result correctly (`ase-help-intent`).

-   BUGFIX [code]: Diff handling and tool sets
    Fixed the diff handling and allow all used tools (`ase-code-lint`, `ase-docs-proofread`,
    `ase-meta-commit`).

-   BUGFIX [code]: Mode option validation order
    Validate the `--mode`/`-m` option before the sneak preview (`ase-meta-quorum`).

-   BUGFIX [code]: Frontmatter and fence handling
    Always create a `Modified:` frontmatter key and do not terminate the fenced code block with
    payload (`ase-task-preflight`).

-   BUGFIX [code]: Output order and option
    Use the correct order of outputs and declare the internal option (`ase-task-reboot`).

-   BUGFIX [code]: Task plan state transitions
    Do not contradict the documented task plan state transitions (`ase-task-implement`).

-   BUGFIX [code]: Conditional updated template
    Emit the "updated" template only conditionally (`ase-task-id`).

-   BUGFIX [code]: Missing frontmatter keys
    Add the three omitted frontmatter keys to the sub-task composition mapping (`ase-task-dissect`).

-   BUGFIX [code]: Wrong word count reported
    Report the word count of the kept instead of the discarded variant (`ase-task-condense`).

-   BUGFIX [code]: Task plan read-back
    Read back the task plan also after saving it (`ase-sync-export`).

-   BUGFIX [code]: Doubled diagram code block
    Do not wrap the already fenced diagram into a second code block (`ase-meta-diff`).

-   BUGFIX [code]: OTHER refinement branch
    Normalize also the `OTHER` refinement branch into the minimal form (`ase-docs-proofread`).

-   BUGFIX [code]: Artifact name read-back
    Read back the artifact name, too (`ase-arch-discover`).

-   BUGFIX [code]: Wrong references and counts
    Fixed a wrong step reference, a wrong count, a wrong type, and wrong cross-references
    (`ase-arch-analyze`, `ase-persona.md`, `ase-constitution.md`, `ase-format-spec.md`).

-   BUGFIX [code]: Missing synopsis option
    Add the missing option to the synopsis (`ase-code-analyze`).

-   BUGFIX [code]: Frontmatter indentation
    State the three-space indentation of the frontmatter correctly (`ase-format-task.md`).

-   BUGFIX [docs]: Search and sticky bar handling
    Fixed the unhighlighting of search hits and the sticky install bar handling after dismissal
    (`Modal-Help.astro`, `Progress.astro`, `Sticky-CTA.astro`).

-   UPDATE [code, docs, infr]: Proofreading results incorporated
    Massive incorporation of proofreading results across all documentation, skills, and website
    artifacts.

-   UPDATE [docs]: Regenerated typing demo
    Regenerated the typing demo assets (`pages/public/assets/typing-demo.{gif,mp4}`).

-   UPDATE [docs, infr]: Dependency upgrade
    Upgraded NPM dependencies (`pages/package.json`, `plugin/package.json`, `tool/package.json`).

-   CLEANUP [code]: Dead guards and references
    Removed an unreachable guard, a dead reference, and redundant conditions (`ase-code-lint`,
    `ase-format-arch.md`, `ase-common-task.md`).

-   CLEANUP [code]: Contradicting statements
    Do not contradict other statements (`ase-docs-distill`).

-   CLEANUP [code, docs]: Statusline namings
    Cleaned up the statusline namings (`ase-statusline.ts`, `Section-Setup.astro`).

-   REFACTOR [code]: Shared tenet internalization
    Factored the shared tenet internalization of `ase-code-craft`, `ase-code-refactor`, and
    `ase-code-resolve` into `ase-common-code.md`.

-   REFACTOR [code]: Reused task macros
    Re-use the existing task-related macros and shared descriptions to reduce redundancies
    (`ase-task-condense`, `ase-task-grill`, `ase-task-reboot`).

0.9.55 (2026-08-03)
-------------------

-   FEATURE [code]: Task plan frontmatter
    Converted the `Created:`, `Modified:`, and `Kind:` meta-information of task plans into a
    Markdown frontmatter block.

-   FEATURE [code]: Task id in frontmatter
    Moved the task id from the `#   TASK <id>:` heading into an `Id:` frontmatter key.

-   FEATURE [code]: Legacy plan normalization
    Normalize legacy task plans into the Markdown frontmatter shape on load and rename them via
    their `Id:` frontmatter key.

-   FEATURE [code]: Status and properties keys
    Added the task plan frontmatter keys `Status:` and `Properties:`.

-   FEATURE [code]: Task list filtering
    Added `--include`/`-i` and `--exclude`/`-e` options to `ase-task-list` and `ase task list` for
    filtering the listed task plans.

-   FEATURE [docs]: Task lifecycle documentation
    Documented the task plan lifecycle states and their transitions (`docs/task-states.md`).

-   IMPROVEMENT [code]: Authoring form by default
    Let `ase_task_load` return the authoring form of a task plan by default and the
    rendering-prepared form only on demand.

-   IMPROVEMENT [code]: Bounded service log growth
    Bounded the unlimited growth of `.ase/service.log` by trimming it to its last 2000 lines
    whenever the background service is started on a file larger than 1 MB.

-   IMPROVEMENT [code]: Reduced service log noise
    Reduced the noise in `.ase/service.log` by capping the logged MCP tool call arguments and by
    demoting session handshakes, notifications, and stream opens to log level `debug`.

-   IMPROVEMENT [code]: Inherited service log level
    Let the detached background service adopt the log level of its spawning process, making `ase
    --log-level debug service start` log the full MCP traffic again.

0.9.54 (2026-08-03)
-------------------

-   IMPROVEMENT [code]: Shared code tenets
    Factored the tenet internalization of `ase-code-craft`, `ase-code-refactor`, and
    `ase-code-resolve` into the new shared `ase-common-code.md`.

-   FEATURE [code]: Kind header in task plans
    Added an optional `☯   Kind:` header line to the task plan format, stating the kind of change
    and hence the tenet set to honor (`ase-format-task.md`).

-   FEATURE [code]: Tenet set honored on implement
    Let `ase-task-preflight` and `ase-task-implement` honor the tenet set stated by the task plan,
    with inference fallback for plans without a `Kind` line.

-   FEATURE [code]: Worktree option for implement
    Added a `--worktree`/`-w` option to `ase-task-implement` for applying the change set inside a
    dedicated Git WorkTree.

-   FEATURE [docs]: Manpage full-text search
    Added a full-text search box with AND-combined keywords, fuzzy-matching fallback, and
    highlighted hits to the man-page browser.

-   FEATURE [docs]: Fit check panel
    Added a blunt "ASE is for you / ASE is not for you" Fit Check panel for fast self-qualification.

-   FEATURE [docs]: Methodology provenance strip
    Add a methodology provenance strip naming the classic methods baked into the skills and linking
    each to its manpage.

-   FEATURE [docs]: Testimonials carousel
    Added a testimonials pull-quote carousel for named practitioner endorsements.

-   FEATURE [docs]: Day in the Life timeline
    Added a "Day in the Life" timeline section annotating an engineer's workday with the firing ASE
    skills (`Section-Day.astro`, `index.astro`).

-   FEATURE [docs]: Deep-linkable manpages
    Made the skill man-pages deep-linkable via the `#help/<skill-id>` URL fragment, including
    History API integration, document title sync, and a copy-link button (`Modal-Help.astro`).

-   FEATURE [docs]: Sticky install bar
    Add a sticky install call-to-action bar to the website.

-   FEATURE [docs]: Terminal help mode
    Added an optional `help` mode to the Terminal component, turning each command row into a
    `data-help-id` trigger for its skill man-page (`Terminal.astro`).

-   IMPROVEMENT [code]: Stricter constitution rules
    Forbid guessing missing tool call parameters, demand verification of dependency APIs against
    local sources or the web, and require cleanup of scratch files (`ase-constitution.md`).

-   IMPROVEMENT [docs]: Tabbed terminal commands
    Place commands into tabs in Terminal components for cleaner display (`Terminal.astro`,
    `Section-Setup.astro`).

-   IMPROVEMENT [docs]: Dimmed placeholder rendering
    Render `[...]` placeholders dimmed and with a real ellipsis in Terminal commands
    (`Terminal.astro`).

-   IMPROVEMENT [docs]: Author experience mentioned
    Mention the author's software development and engineering experience (`Section-Author.astro`).

-   IMPROVEMENT [docs]: Footer author link
    Link the footer copyright author to the internal author section (`Page-Footer.astro`).

-   IMPROVEMENT [docs]: Header and strip polish
    Polished the header navigation spacing and made the methodology strip buttons stand out
    (`Page-Header.astro`, `Methodology-Strip.astro`).

-   UPDATE [docs]: Workflow diagram refresh
    Updated the workflow diagram (`docs/workflow.svg`, `pages/public/assets/workflow.svg`).

-   UPDATE [docs, infr]: Dependency upgrade
    Upgraded NPM dependencies (`pages/package.json`, `tool/package.json`).

-   REFACTOR [docs]: Highlights folded into fit check
    Bundled the productivity table into the Fit Check panel and dropped the now obsolete highlights
    section (`Section-Fit.astro`, `Section-Highlights.astro`).

0.9.53 (2026-08-02)
-------------------

-   IMPROVEMENT [code]: Subtitle in head and foot
    Support the `subtitle` attribute also for the `<ase-tpl-head/>` and `<ase-tpl-foot/>` template
    patterns (`ase-skill.md`).

-   IMPROVEMENT [code]: Precise sub-agent returns
    State the return values of the sub-agents more precisely (`plugin/agents/*.md`).

-   IMPROVEMENT [code]: Robust file and path handling
    Made untracked-file listing, branch deletion, and `~` expansion more robust
    (`ase-code-dissect`, `ase-meta-workflow`).

-   BUGFIX [code]: Unclosed template tags
    Correctly close the `<ase-tpl-head/>` and `<ase-tpl-foot/>` tags (`ase-common-dissect.md`).

-   CLEANUP [code]: Typo and wording polish
    Fixed a typo and polished wording (`ase-meta-workflow`, `ase-common-dissect.md`).

0.9.52 (2026-08-02)
-------------------

-   FEATURE [code]: Task dissection skill
    Added the `ase-task-dissect` skill for dissecting a task plan into sub-task plans.

-   FEATURE [code]: Change set dissection skill
    Added the `ase-code-dissect` skill for dissecting a change set into Git WorkTrees.

-   FEATURE [code]: Workflow generation skill
    Added the `ase-meta-workflow` skill for generating workflow orchestration skills.

-   FEATURE [code]: New control constructs
    Added the `<agent/>`, `<agent-consolidation/>`, `<skill/>`, and `<parallel/>` control constructs
    (`ase-control.md`).

-   FEATURE [code]: Finding id prefix option
    Added a `--prefix`/`-P` option to `ase-code-analyze` and `ase-arch-analyze` for prefixing the
    reported `P<n>`/`T<n>` finding ids.

-   IMPROVEMENT [code, infr]: Skill tag renamed
    Renamed the skill identification construct `<skill>` to `<purpose>` to free the `<skill>` tag
    for the new invocation construct (`ase-skill.md`, `stx.conf`, all `SKILL.md`).

-   IMPROVEMENT [code]: No breaks in code spans
    Forbid line breaks inside inline code spans when authoring task plans (`ase-format-task.md`).

-   IMPROVEMENT [code]: Anchored Git commands
    Anchor all Git commands at the repository root, name the patch files by part id, and remove them
    after use (`ase-code-dissect`).

-   IMPROVEMENT [code]: Tolerant dissection
    Tolerate a failing worktree creation and omit an empty `VERIFICATION` section in a part
    (`ase-code-dissect`, `ase-task-dissect`).

-   BUGFIX [code]: Broken lines in reused plans
    Fixed badly broken lines in reused task plans by returning the rendering-prepared content from
    `ase_task_save` (`ase-task.ts`, `ase-common-task.md`, `ase-task-edit`, `ase-task-grill`).

-   BUGFIX [code]: Bullet-independent matching
    Match the `**WHAT**`/`**WHY**` bullet points independent of their rendering-prepared bullet
    marker (`ase-task-reboot`).

-   BUGFIX [code]: Condensing normalization
    Normalize the rendering-prepared `◯` bullet markers, split inline code spans back into their
    authoring form, and align the re-wrap width with the ~100-character convention.

-   UPDATE [docs, infr]: Dependency upgrade
    Upgraded NPM dependencies (`pages/package.json`, `plugin/package.json`, `tool/package.json`).

-   CLEANUP [infr]: Statistics exclusion
    Excluded the generated `docs` SVG files from the project statistics (`etc/stx.conf`).

0.9.51 (2026-07-26)
-------------------

-   FEATURE [code]: Quotes finding skill
    Added the `ase-meta-quotes` skill for finding quotes for topic keywords.

-   FEATURE [code]: Proximity skill split
    Split the `ase-meta-proximity` skill into a skill and a reusable agent.

-   FEATURE [code]: Lint aspect narrowing
    Added `--include`/`-i` and `--exclude`/`-e` options to `ase-code-lint` for narrowing the checked
    code quality aspects.

-   IMPROVEMENT [code]: Descending finding order
    Report findings in descending order `HIGH`, `MEDIUM`, `LOW`, `ACCEPTED` in skills with a
    `--severity`/`-S` option.

-   IMPROVEMENT [code]: Redundancy payoff gate
    Gate redundancy findings on a 2:1 payoff ratio to avoid mere code relocation
    (`ase-code-lint.md`).

-   IMPROVEMENT [code]: Stronger approval typing
    Strengthen typing in the tool approval decision (`ase-hook.ts`).

-   BUGFIX [code]: Copilot reasoning effort
    Show the reasoning effort in the statusline also under GitHub Copilot CLI.

-   CLEANUP [code]: Hook code simplification
    Simplify the plugin root lookup, banner assembly, and blank lines (`ase-hook.ts`).

0.9.50 (2026-07-26)
-------------------

-   FEATURE [docs]: Marked external links
    Render all external links with an attached "↗" arrow symbol and open them in a new tab
    (`External-Links.astro`, `theme.css`, `BaseLayout.astro`).

-   IMPROVEMENT [docs]: Operation modes matrix
    Mark the matrix cells with "X" in the operation modes diagram (`docs/operation-modes.svg`,
    `docs/operation-modes.xlsx`, `pages/public/assets/operation-modes.svg`).

-   IMPROVEMENT [code]: Journalist persona details
    Request concise prose sentences for the `journalist` persona details (`ase-persona.md`).

-   UPDATE [docs]: Workflow diagram fixes
    Fix typos and add a legend in the workflow diagram (`docs/workflow.svg`,
    `docs/workflow.graffle`, `pages/public/assets/workflow.svg`).

-   UPDATE [infr]: Dependency upgrade
    Upgrade NPM dependencies (`plugin/package.json`, `tool/package.json`).

-   CLEANUP [code]: Smaller constitution
    Size-optimize the constitution by dropping the Copilot session banner and hint templates
    (`ase-constitution.md`, `ase-persona.md`).

-   CLEANUP [docs]: Website wording polish
    Polish wording and markup across the website sections (`Section-Author.astro`,
    `Section-Compat.astro`, `Section-Workflows.astro`).

0.9.49 (2026-07-26)
-------------------

-   FEATURE [code]: Guidance level configuration
    Added the `agent.guidance` config parameter with the levels `none`, `minimal`, `normal`
    (default), and `verbose`.

-   FEATURE [code]: Configuration skill
    Added the `ase-meta-config` skill mirroring the non-interactive `ase config` subcommands.

-   FEATURE [code]: Config listing MCP tool
    Added the `ase_config_list` MCP tool listing all effective config entries with their scope
    (`ase-config.ts`).

-   FEATURE [code]: Statusline padding option
    Added a `--padding`/`-p` option (default `0`) padding the statusline lines with N spaces on each
    side (`ase-statusline.ts`, `ase-setup.ts`).

-   FEATURE [code]: Guidance-aware skills
    Honor `agent.guidance` in the skills through a new `Guidance Hint Level` section and a new
    `<ase-tpl-hint level="..."/>` template pattern (`ase-skill.md`).

-   FEATURE [code]: Guidance-gated closing hints
    Added guidance-gated closing hints to eleven skills and to the option-parsing and task-argument
    error paths (`ase-getopt.md`, `ase-common-task.md`).

-   IMPROVEMENT [code]: Gated skill chrome
    Gate the skill identification chrome and the parsed-options line on the higher guidance levels
    (`ase-skill.md`, `ase-getopt.md`).

-   IMPROVEMENT [code]: Tool option in statusline setup
    Append the `--tool` option to the generated statusline command in setup (`ase-setup.ts`).

-   BUGFIX [code]: Wrong session banner target
    Emitted the model-side session banner for GitHub Copilot CLI instead of OpenAI Codex CLI, as
    only the latter supports the hook `systemMessage` field (`ase-constitution.md`).

-   UPDATE [docs]: Workflow diagram refresh
    Refreshed the workflow diagram (`docs/workflow.svg`, `pages/public/assets/workflow.svg`).

-   CLEANUP [code]: Persona skill removed
    Removed the `ase-meta-persona` skill and the `ase_persona` tool, as both are subsumed by
    `ase-meta-config` and the `agent.persona` config key.

0.9.48 (2026-07-25)
-------------------

-   IMPROVEMENT [code]: Portable context window
    Probe live-context fields for a portable and correct context window in statusline `%C`
    (`ase-statusline.ts`).

-   IMPROVEMENT [code]: Cached task storage spec
    Cache the task storage specification to avoid re-parsing the layered config chain
    (`ase-task.ts`).

-   IMPROVEMENT [code]: Cached project root lookup
    Cache the `git rev-parse --show-toplevel` project root lookup (`ase-config.ts`).

-   IMPROVEMENT [code]: Robust service probing
    Make service probing robust against connection errors (`ase-mcp.ts`, `ase-service.ts`).

-   IMPROVEMENT [code]: Basedir traversal rejection
    Reject configured basedirs with parent traversal segments (`ase-artifact.ts`, `ase-config.ts`).

-   IMPROVEMENT [code]: Hoisted option computations
    Hoist invariant computations out of the option iterations (`ase-getopt.ts`).

-   IMPROVEMENT [code]: Compact command proposal
    Render the skill command proposal more compactly (`ase-help-intent/SKILL.md`).

-   BUGFIX [code]: Exit code on termination
    Honor `process.exitCode` on graceful termination (`ase.ts`).

-   BUGFIX [code]: Argument reassembly quoting
    Shell-quote Commander-parsed arguments when reassembling them (`ase-getopt.ts`).

-   BUGFIX [code]: GitHub URL variants
    Support SSH and scp-style GitHub repository URLs when fetching stars (`ase-skills.ts`).

-   BUGFIX [code]: KV get value cloning
    Clone also the return value of the KV get operation (`ase-kv.ts`).

-   BUGFIX [code]: Log append error handling
    Catch errors on the log file append operation (`ase-hook.ts`).

-   BUGFIX [code]: Statusline exception handling
    Use a regular exception handler in `main` for process termination (`ase-statusline.ts`).

-   REFACTOR [code]: Common stdio module
    Move stdin/stdout handling into a common `ase-stdio.ts` module (`tool/src/*.ts`).

-   CLEANUP [code]: CLI source simplification
    Remove redundancies and simplify code across the `ase` CLI sources (`tool/src/*.ts`).

0.9.47 (2026-07-25)
-------------------

-   FEATURE [code]: Skill manpage skill
    Add the `ase-help-skill` skill showing the manual page of an ASE skill by (abbreviated) name or
    fuzzy purpose.

-   IMPROVEMENT [code]: Intent skill renamed
    Rename the skill `ase-meta-intent` to `ase-help-intent` to align it with the `ase-help-xxx`
    skill family.

-   IMPROVEMENT [code]: Hand-sorted skill catalog
    Ship a hand-sorted skill catalog instead of generating it (`ase-help-skill/catalog.md`).

-   IMPROVEMENT [code]: Open task cleanup
    Delete still-open tasks when a skill exits early (`ase-skill.md`).

-   IMPROVEMENT [code]: Non-empty legacy directory
    Keep a non-empty legacy per-task directory and warn instead of removing it (`ase-task.ts`).

-   IMPROVEMENT [code]: Task basedir containment
    Ensure the task base directory cannot escape the project root (`ase-task.ts`).

-   IMPROVEMENT [code]: Hook payload validation
    Harden hook payload validation against raw objects (`ase-hook.ts`).

-   IMPROVEMENT [code]: Faster Markdown preparation
    Speed up paragraph checking in Markdown preparation (`ase-markdown.ts`).

-   IMPROVEMENT [code]: Stronger persona typing
    Strengthen typing in the persona command (`ase-persona.ts`).

-   IMPROVEMENT [docs]: Help family on website
    List the `ase-help-*` family in the website Design section (`Section-Design.astro`).

-   IMPROVEMENT [docs]: Help skills sorted first
    Sort the help skills to the top of the skill group (`skills.ts`).

-   BUGFIX [code]: MCP reconnect buffering
    Buffer MCP messages arriving during an HTTP reconnect instead of discarding them (`ase-mcp.ts`).

-   BUGFIX [code]: Log stream flushing
    Close the log stream and flush pending writes on termination (`ase-log.ts`, `ase.ts`).

-   BUGFIX [code]: Hard-coded harness name
    Render the harness name instead of a hard-coded `claude` in statusline `%V`
    (`ase-statusline.ts`).

-   BUGFIX [code]: Missing user scope
    Add the missing user scope to the config default scope chain (`ase-config.ts`).

-   BUGFIX [code]: Truncated stdout writes
    Avoid truncated stdout writes (`ase-compat.ts`, `ase-config.ts`).

-   BUGFIX [code]: Breaks in backtick spans
    Avoid line breaks within backtick spans in skill help pages (`help.md`).

-   UPDATE [docs]: Opus 5 compatibility
    Mark Anthropic Claude Opus 5 as fully supported (`Section-Compat.astro`).

-   UPDATE [docs]: Workflow diagram refresh
    Update the workflow diagram (`workflow.svg`, `workflow.graffle`, `workflow.pdf`).

-   UPDATE [docs]: Dependency upgrade
    Upgrade NPM dependencies (`pages/package.json`).

-   CLEANUP [code]: CLI source simplification
    Remove redundancies and simplify code across the `ase` CLI sources (`tool/src/*.ts`).

-   CLEANUP [code]: Memoized statusline lookups
    Memoize repeated lookups in the statusline command (`ase-statusline.ts`).

0.9.46 (2026-07-25)
-------------------

-   FEATURE [code]: Intent routing skill
    Add the `ase-meta-intent` skill routing a free-text intent to a generated `/ase-xxx-xxx`
    command.

-   FEATURE [code]: Topic proximity skill
    Add the `ase-meta-proximity` skill determining a topic's parent/sibling/child proximity,
    optionally grounded and navigable.

-   FEATURE [code]: ELI5 explanation skill
    Add the `ase-meta-eli5` skill explaining topics "like I'm 5", optionally Web-grounded.

-   IMPROVEMENT [code]: GRILL as next step
    Allow `ase-code-{craft,refactor,resolve}` to accept `--next GRILL` (`SKILL.md`).

-   IMPROVEMENT [code]: Empty grounding warning
    Warn when Web grounding yields no facts in `ase-meta-proximity` (`SKILL.md`).

-   IMPROVEMENT [code]: Dialog answer range
    Allow 2 to 9 answer lines in custom dialogs (`ase-dialog.md`).

-   IMPROVEMENT [docs]: Workflow diagram update
    Update the workflow diagram for the latest skill additions (`workflow.svg`).

-   IMPROVEMENT [infr]: Execa in install step
    Use `execa` for another install step (`etc/stx.conf`).

-   UPDATE [infr]: Dependency upgrade
    Upgrade NPM dependencies (`pages/package.json`, `tool/package.json`).

0.9.45 (2026-07-21)
-------------------

-   FEATURE [code]: Foreign AI harness bridge
    Support querying foreign AIs via an MCP-to-agent-harness bridge (`ase-setup.ts`,
    `ase-meta-chat.md`).

-   FEATURE [code]: Grounding commandment
    Add a grounding commandment favoring evidence and references over model knowledge
    (`ase-constitution.md`).

-   IMPROVEMENT [code]: Smaller unified diffs
    Force smaller unified diffs in `ase-code-lint` and `ase-docs-proofread` (`SKILL.md`, agents).

-   IMPROVEMENT [code]: Numbered findings
    Number the findings in `ase-code-lint` and `ase-docs-proofread` (`SKILL.md`).

-   IMPROVEMENT [code]: Refined import handling
    Treat `TASK` differently and refine the `ase-sync-import` handling (`SKILL.md`).

-   IMPROVEMENT [code]: Quorum description and tool
    Improve the `ase-meta-quorum` description and add the missing `TaskUpdate` tool (`SKILL.md`).

-   IMPROVEMENT [code]: More changelog cases
    Support more cases and be more precise in `ase-meta-changelog` (`SKILL.md`).

-   IMPROVEMENT [docs]: Compat matrix update
    Update the website compat matrix to GPT 5.6 and tighten the table spacing
    (`Section-Compat.astro`).

-   IMPROVEMENT [docs]: Fable compatibility
    Mark Fable as fully supported and in primary focus (`Section-Compat.astro`).

-   BUGFIX [code]: Text corrections
    Fix grammar, wording, references, and placeholders across skills and meta files.

-   REFACTOR [code]: Shared task meta file
    Reduce redundancies in the task skills via a shared `ase-common-task.md` (`SKILL.md`).

-   REFACTOR [code]: Task skill macros
    Reduce redundancy via a macro definition in task skills (`ase-task-*/SKILL.md`).

-   CLEANUP [code]: Skill convention alignment
    Align the skill structure, style, and references to the repo-wide convention.

-   CLEANUP [code]: Stray frontmatter lines
    Remove stray non-portable `model` frontmatter lines (`ase-meta-search.md`,
    `ase-arch-analyze/SKILL.md`).

0.9.44 (2026-07-20)
-------------------

-   IMPROVEMENT [code]: Hardened Bash approval
    Harden the Bash command approval with stricter validation in hook processing (`ase-hook.ts`).

-   IMPROVEMENT [code]: Anchored ignore patterns
    Support `/xxx`-anchored `.gitignore` patterns and reject `..` filenames (`ase-artifact.ts`).

-   IMPROVEMENT [code]: Task tool session validation
    Validate sessions in task MCP tools and cache `projectRoot` results (`ase-task.ts`).

-   IMPROVEMENT [code]: Normalized error outputs
    Normalize error outputs by dropping tool prefixes (`ase-config.ts`, `ase-kv.ts`,
    `ase-persona.ts`).

-   IMPROVEMENT [code]: Hardened error handling
    Harden error handling in the setup, service, log, diagram, and meta commands (`ase-*.ts`).

-   IMPROVEMENT [code]: Key masking in setup
    Mask more key information and encode the Exa API key in the URL (`ase-setup.ts`).

-   IMPROVEMENT [code]: Boxing and help options
    Honor grey boxing in `ase-code-lint` and add `-h`/`--help` to `ase-meta-compat` (`SKILL.md`).

-   IMPROVEMENT [code]: Wording precision
    Refine the wording and precision across the plugin skills, agents, and meta files.

-   IMPROVEMENT [docs]: Website zoom and links
    Improve the website diagram zoom handling and external links (`Modal-Image.astro`,
    `Section-Author.astro`).

-   IMPROVEMENT [docs]: Source map support
    Support `.js.map` files in the website build (`astro.config.mjs`).

-   IMPROVEMENT [infr]: Local install scripts
    Allow more install scripts and run `allowScripts` locally via `execa` (`etc/stx.conf`,
    `package.json`).

-   BUGFIX [code]: Markdown span rendering
    Fix the Markdown span rendering for unclosed backticks, paragraph crossing, and span close
    (`ase-markdown.ts`).

-   BUGFIX [code]: UTF-8 chunk boundaries
    Handle multi-byte UTF-8 sequences spanning chunk boundaries (`ase-service.ts`).

-   BUGFIX [code]: Restart under changed project
    Fix service restarts under a changed project id (`ase-mcp.ts`).

-   BUGFIX [code]: Metric and scoring edge cases
    Clamp the statusline metric and fix the skill scoring edge cases (`ase-statusline.ts`,
    `ase-skills.ts`).

-   BUGFIX [code]: Log stream and TTY detection
    Fix the log stream error handling and the stderr TTY detection (`ase-log.ts`).

-   BUGFIX [code]: Config get locking
    Align the `ase config get` locking behavior with its MCP tool counterpart (`ase-config.ts`).

-   BUGFIX [code]: Text corrections
    Fix the references, placeholders, grammar, and wording across skills and meta files.

-   BUGFIX [docs]: Website DOM fixes
    Fix the clipboard copying, DOM id uniqueness, invalid classes, and typos on the website.

-   BUGFIX [infr]: Pages dependency pinning
    Fix the `pages` dependency pinning via a `typopro-web` override (`pages/package.json`).

-   UPDATE [infr]: Dependency upgrade
    Upgrade NPM dependencies across all workspaces (`package.json`).

-   CLEANUP [code]: CLI source simplification
    Remove redundancies and simplify code across the `ase` CLI sources (`tool/src/*.ts`).

-   CLEANUP [code]: Formatting cleanup
    Cleanup the formatting, alignment, comments, and stray blank lines across the sources.

-   CLEANUP [docs]: Website component cleanup
    Cleanup and simplify the website components (`pages/src/**`).

-   CLEANUP [infr]: Repository URL alignment
    Align the repository URLs in all `package.json` files and drop unused ESLint code.

-   REFACTOR [code]: Markdown pass split
    Split the Markdown preparation into one function per pass (`ase-markdown.ts`).

-   REFACTOR [code]: Merged functions
    Merge nearly identical functions and use lookup tables (`ase-task.ts`, `ase-setup.ts`).

-   REFACTOR [docs]: Header lookup structure
    Replace the conditional website header logic with a lookup data structure (`Page-Header.astro`).

0.9.43 (2026-07-09)
-------------------

-   CLEANUP [infr]: Transitive dependency removal
    Upgrade dependencies to eliminate `es5-ext` transitively.

0.9.42 (2026-07-09)
-------------------

-   CLEANUP [infr]: Top-level install scripts
    Disable the `es5-ext` install scripts also at top-level.

0.9.41 (2026-07-09)
-------------------

-   UPDATE [infr]: Dependency upgrade
    Upgrade NPM dependencies and add the missing `json-asty` dependency (`package.json`).

-   CLEANUP [infr]: Install script disabling
    Disable the `es5-ext` install scripts (`package.json`).

0.9.40 (2026-07-06)
-------------------

-   IMPROVEMENT [docs]: Setup section rendering
    Improve the website Setup section rendering and right-side placement (`Section-Setup.astro`).

-   IMPROVEMENT [docs]: Scroll-reveal animations
    Add more scroll-reveal content animations across the website sections (`Section-*.astro`,
    `Video-Row.astro`).

-   IMPROVEMENT [docs]: Mobile comparison table
    Refine the Highlights comparison table for mobile readability, positioning, and richer markup
    (`Section-Highlights.astro`, `comparison.ts`).

-   IMPROVEMENT [docs]: Feedback contributor credits
    Credit further feedback contributors in the website Author section (`Section-Author.astro`).

-   BUGFIX [docs]: Indentation and glow fixes
    Fix the HTML element indentation, section glows, and a typo across the website sections
    (`Section-*.astro`).

-   CLEANUP [docs]: Comparison table markup
    Clean up the Highlights comparison table markup (`Section-Highlights.astro`, `comparison.ts`).

-   CLEANUP [infr]: Unneeded dependency
    Drop the unneeded top-level `json-asty` dependency (`package.json`).

0.9.39 (2026-07-05)
-------------------

-   FEATURE [docs]: Approach comparison table
    Add an old-school/AI-native/AI-advanced comparison table to the website Highlights section
    (`Section-Highlights.astro`, `comparison.ts`).

-   FEATURE [docs]: License reference
    Add a license reference to the README (`README.md`).

-   IMPROVEMENT [docs]: Hero attention drawing
    Refine the Hero attention drawing and dim coloring (`Hero.astro`).

-   IMPROVEMENT [docs]: Setup section rendering
    Improve the website Setup section rendering (`Section-Setup.astro`).

-   IMPROVEMENT [docs]: README layout polish
    Refine the README line breaks and image ordering (`README.md`).

-   UPDATE [docs]: Banner image update
    Update the banner image (`docs/ase-banner.png`).

0.9.38 (2026-07-05)
-------------------

-   FEATURE [code, docs, infr]: Statusline setup commands
    Add the `ase setup statusline activate|deactivate` commands (`ase-setup.ts`,
    `Section-Setup.astro`, `package.json`).

-   BUGFIX [code]: Custom dialog rendering
    Harden the custom-dialog rendering against wrong glyph/padding output (`ase-dialog.md`,
    `ase-skill.md`).

0.9.37 (2026-07-04)
-------------------

-   FEATURE [code]: Project boxing wiring
    Wire the `project.boxing` transparency classification (`white`/`grey`/`black`) into the
    artifact-touching skills.

-   FEATURE [code]: Artifact kind tags
    Add `[<artifact-kind>]` tag support to the `ase-meta-changelog` skill (`SKILL.md`, `help.md`).

-   IMPROVEMENT [code, docs]: Boxing surfaced
    Surface `project.boxing` in the configuration docs and export it into the session environment
    and status line (`docs/configuration.md`, `ase-hook.ts`, `ase-constitution.md`).

-   IMPROVEMENT [docs]: Author credited in Hero
    Credit the author as renowned in the website Hero section (`Hero.astro`).

-   CLEANUP [docs]: Hero top spacing
    Reduce the Hero top spacing by dropping the `mt-1` margin (`Hero.astro`).

0.9.36 (2026-07-04)
-------------------

-   IMPROVEMENT [code]: Dependency weight penalties
    Add tiered staleness (`--staleness`) and small-scope (`--small-scope`) dependency-weight
    penalties to `ase-arch-discover`.

-   UPDATE [infr]: GitHub Action upgrade
    Upgrade the GitHub Action `actions/setup-node` from v4 to v5 (`static.yml`).

-   UPDATE [docs]: Reference documentation sync
    Sync the tool and plugin reference documentation with the current implementation
    (`docs/usage-plugin.md`, `docs/usage-tool.md`).

0.9.35 (2026-07-04)
-------------------

-   FEATURE [docs]: Scope option documented
    Document the `--scope` option in the website Setup section (`Section-Setup.astro`,
    `Terminal.astro`).

-   IMPROVEMENT [code]: Parallel agent spawning
    Fan out the Agent spawning with parallelism across skills to gain performance
    (`ase-code-analyze.md`, `ase-code-lint`, `ase-docs-proofread`, `ase-meta-quorum`, `-search`).

-   IMPROVEMENT [code]: Implicit default scope
    Drop the explicit `--scope user` since it is the default (`ase-setup.ts`).

-   IMPROVEMENT [docs]: Compatibility statements
    Refine the compatibility statements for Sonnet and Fable (`Section-Compat.astro`).

-   IMPROVEMENT [docs]: Feedback contributor credits
    Credit the feedback contributors in the website Author section (`Section-Author.astro`).

-   BUGFIX [code]: Agent response and names
    Fix the Agent response handling and give tasks unique names across skills (`ase-*/SKILL.md`).

-   BUGFIX [code]: In-flight calculation
    Fix the "in flight" calculations on service socket close (`ase-service.ts`).

-   BUGFIX [code, docs]: Proofread results applied
    Fix the proofread results across the website copy, docs, and skills (website, `README.md`,
    skills).

-   UPDATE [infr]: Dependency upgrade
    Upgrade NPM dependencies across all workspaces (`package.json`, `pages/package.json`,
    `plugin/package.json`, `tool/package.json`).

-   CLEANUP [infr]: Repository layout verbosity
    Reduce the `AGENTS.md` repository-layout section verbosity (`AGENTS.md`).

-   CLEANUP [code]: Unused user-dialog meta
    Remove the unused user-dialog meta to stop the LLM from triggering it (`ase-dialog.md`).

0.9.34 (2026-07-02)
-------------------

-   FEATURE: Setup scope option
    Add a `-s, --scope <user|project|local>` option to `ase setup install/update/uninstall/enable/
    disable` and `ase setup mcp activate/deactivate`.

-   FEATURE: Video embed and QR modal
    Add a YouTube video embed and a QR-code modal to the website (`Hero-Video.astro`,
    `Modal-YouTube.astro`, `Modal-QR.astro`, `QR-Code.astro`, `Page-Footer.astro`).

-   FEATURE: Sonnet 5 in compat matrix
    Add Anthropic Claude Sonnet 5 to the website compatibility matrix (`Section-Compat.astro`).

-   IMPROVEMENT: Justified body text
    Justify the body text blocks across the website sections with hyphenation support (`theme.css`,
    `Hero.astro`, `Section-*.astro`).

-   IMPROVEMENT: Hero rendering refinement
    Refine the Hero rendering and layout once more (`Hero.astro`).

-   IMPROVEMENT: Agentic levels diagram
    Update the agentic-levels diagram with new additional dimensions (`agentic-levels.svg`,
    `Section-Usage.astro`).

-   IMPROVEMENT: Hamburger menu width
    Fixate the width of the hamburger menu icon (`Page-Header.astro`).

0.9.33 (2026-06-29)
-------------------

-   FEATURE: Typing demo page
    Add an internal typing-demo page for rendering a banner (`typing-demo.astro`,
    `typing-demo.mjs`).

-   IMPROVEMENT: Consistent tool naming
    Use the consistent "Anthropic Claude Code CLI" naming across the docs, website, and tool
    (`README.md`, `AGENTS.md`, website, tool).

-   IMPROVEMENT: Hero rendering refinement
    Refine the Hero rendering, text, height, and spacing (`Hero.astro`, `Typing-Demo.astro`,
    `Section-Design.astro`, `Section-Setup.astro`).

-   IMPROVEMENT: Top-N typing demo commands
    Add a count option to render just the top-N commands in the typing demo (`Typing-Demo.astro`).

-   IMPROVEMENT: Star-this-project animation
    Add a star-this-project animation and script to the Hero (`Hero.astro`, `gh-star.gif`,
    `gh-star.sh`).

-   IMPROVEMENT: Precise compatibility claims
    Be more precise about compatibility in the website Compat section (`Section-Compat.astro`).

-   IMPROVEMENT: Diagram zoom button
    Add a zoom button to the website diagrams (`Diagram.astro`, `Video-Embed.astro`).

-   IMPROVEMENT: Local Playr icon
    Provide a local Playr SVG icon and re-add the video speed control (`Modal-Video.astro`,
    `astro.config.mjs`).

-   IMPROVEMENT: Project links and credits
    Add project links and feedback credits to the Author and Footer sections
    (`Section-Author.astro`, `Page-Footer.astro`).

-   IMPROVEMENT: Signet before author name
    Use the signet in front of the author name (`Section-Author.astro`).

-   IMPROVEMENT: Single-column small viewports
    Step down to single-column grids on small viewports (`Section-Author.astro`).

-   IMPROVEMENT: Robots file emission
    Emit a `robots.txt` file (`astro.config.mjs`).

-   IMPROVEMENT: Reduced font scope
    Reduce the font scope to shrink the generated site size (`theme.css`).

-   IMPROVEMENT: Banner image update
    Update the banner image (`docs/ase-banner.png`).

-   UPDATE: Dependency upgrade
    Upgrade dependencies (`package.json`).

-   CLEANUP: Tool-neutral constitution
    Make the ASE constitution not Claude-Code-CLI-specific (`ase-constitution.md`).

-   CLEANUP: Website component cleanup
    Clean up the Usage and Author website components (`Section-Usage.astro`,
    `Section-Author.astro`).

-   CLEANUP: Obsolete import
    Remove an obsolete import (`Page-Footer.astro`).

0.9.32 (2026-06-28)
-------------------

-   FEATURE: Meta file command
    Add an `ase meta <file>` command to load ASE meta files from user skills (`ase-meta.ts`,
    `ase.ts`).

-   FEATURE: Demo skill under version control
    Place the demo `hello` skill under version control (`.claude/skills/hello/`).

-   IMPROVEMENT: Stdout writing helper
    Add a stdout writing helper to avoid output truncations (`ase-stdout.ts`, `ase-artifact.ts`,
    `ase-hook.ts`, `ase-task.ts`).

-   IMPROVEMENT: Plugin root read approval
    Auto-approve Read operations targeting files under the plugin root (`ase-hook.ts`).

0.9.31 (2026-06-28)
-------------------

-   IMPROVEMENT: Section annotations
    Add annotations across the website sections with a flat variant (`Annotation.astro`,
    `Section-*.astro`).

-   IMPROVEMENT: Responsive rendering
    Further improve the mobile/responsive rendering and header spacing of the website (`Hero.astro`,
    `Page-Header.astro`, `Section-Compat.astro`, `Typing-Demo.astro`).

-   IMPROVEMENT: Hamburger menu closing
    Close the hamburger menu and clear the URL on outside click/top (`Page-Header.astro`,
    `Progress.astro`).

-   IMPROVEMENT: Author section links
    Add project links to the website Author section (`Section-Author.astro`).

-   IMPROVEMENT: Diagram coloring
    Improve the coloring of the agentic-levels diagram (`docs/`, `pages/public/assets/`).

-   IMPROVEMENT: Typing demo prompt
    Align the Typing-Demo prompt with the other terminals (`Typing-Demo.astro`).

-   CLEANUP: Website proofread fixes
    Fix the wording and proofread findings across the website sections (`Section-*.astro`).

-   CLEANUP: Ignore temporary files
    Ignore more macOS and temporary files (`.gitignore`).

0.9.30 (2026-06-27)
-------------------

-   IMPROVEMENT: Website highlights rework
    Extend, reorder, and add brainstorming to the website highlights (`highlights.ts`).

-   IMPROVEMENT: README content imported
    Import more README content into the website Usage section (`Section-Usage.astro`).

-   IMPROVEMENT: Role experience assumption
    Mention the role-experience assumption in the website Design section (`Section-Design.astro`).

-   IMPROVEMENT: Friendlier Hero quote
    Make the Hero quote even more friendly (`Hero.astro`).

-   BUGFIX: Grammar problems
    Fix grammar problems (`README.md`).

-   BUGFIX: Trailing dot in examples
    Remove the trailing dot in the persona pyramid-format examples (`ase-persona.md`).

-   UPDATE: License switch
    Switch the distribution license from GPL-3.0 to Apache-2.0 (`LICENSE.txt`, file headers).

-   CLEANUP: Redundant README content
    Remove the README content already present on the website (`README.md`).

0.9.29 (2026-06-27)
-------------------

-   FEATURE: Journalist persona
    Add a fifth `journalist` persona and reimplement all persona styles (`ase-persona.md`,
    `ase-meta-persona`, `ase-persona.ts`, `ase-config.ts`).

-   IMPROVEMENT: Pages workspace integration
    Integrate the `pages/` workspace into the top-level build orchestration (`etc/stx.conf`).

-   UPDATE: Diagram re-rendering
    Re-render the workflow and agentic-levels diagrams (`docs/`, `pages/public/assets/`).

-   CLEANUP: Skill manpage cleanup
    Clean up the skill manpages (`help.md` files).

-   CLEANUP: Author component cleanup
    Clean up the website author component (`Section-Author.astro`).

0.9.28 (2026-06-26)
-------------------

-   FEATURE: Journalist persona
    Add a fifth `journalist` persona with pyramid-structured title/core/detail bullets
    (`ase-persona.md`, `ase-meta-persona`, `ase-persona.ts`, `ase-config.ts`).

-   IMPROVEMENT: Persona rule refinement
    Refine the persona rules and default an invalid persona to engineer (`ase-persona.md`).

-   IMPROVEMENT: Hero annotations and quotes
    Add a fade-in/out stargazer scripting-hint annotation and swipe through multiple quotes on the
    Hero (`Annotation.astro`, `Hero.astro`, `package.json`).

-   IMPROVEMENT: Darker modal background
    Darken the modal background (`Modal.astro`).

-   IMPROVEMENT: Pages area documented
    Document the `pages/` area in the repository layout (`AGENTS.md`).

-   BUGFIX: Astro newline trimming
    Fix the rendering under the latest Astro compiler trimming newlines (website components).

-   UPDATE: TypoPRO fonts only
    Switch the website to TypoPRO fonts only (`package.json`, `theme.css`).

-   UPDATE: Tool dependency upgrade
    Upgrade the tool dependencies (`tool/package.json`).

-   CLEANUP: Playwright directory ignored
    Ignore the Playwright temporary directory (`pages/.gitignore`).

0.9.27 (2026-06-26)
-------------------

-   IMPROVEMENT: Design assumptions section
    Add a Design Assumptions section and reorder the highlights on the website
    (`Section-Design.astro`, `highlights.ts`).

-   IMPROVEMENT: HTML help modal
    Render the skill manpages as an HTML help modal instead of GitHub links (`Modal-Help.astro`,
    `Section-Usage.astro`, `skills.ts`).

-   IMPROVEMENT: Copilot dialog handling
    Improve the Copilot dialog result mapping, no-key case, and start-over precision
    (`ase-dialog.md`).

-   IMPROVEMENT: Box drawing alignment
    Align the box drawing and be more precise (`ase-skill.md`).

-   IMPROVEMENT: Invalid persona default
    Provide a default for an invalid persona (`ase-persona.md`).

-   IMPROVEMENT: Complete artifact kinds
    Complete the kinds of artifacts (`ase-format-meta.md`).

-   BUGFIX: Dialog ERROR fall-through
    Fix the ERROR result falling through to the label-mapping in all dialog branches
    (`ase-dialog.md`).

-   BUGFIX: Break construct definition
    Explicitly define the `<break/>` control construct (`ase-control.md`).

-   BUGFIX: Empty relations in export
    Omit empty relations in the export and fix the cross-references (`ase-format-spec.md`).

-   BUGFIX: Wrong name reference
    Fix a name reference (`ase-tenets.md`).

-   CLEANUP: Persona wording
    Clean up the persona wording (`ase-persona.md`).

-   CLEANUP: Placeholder definition order
    Define the placeholders before use (`ase-format-meta.md`).

0.9.26 (2026-06-24)
-------------------

-   FEATURE: Deterministic session banner
    Add a deterministic session-start banner via `systemMessage` (`ase-hook.ts`,
    `ase-constitution.md`).

-   IMPROVEMENT: Workflows section build-out
    Build out the website Workflows section and apply terminal-styled boxes (`pages/` Astro
    components).

-   IMPROVEMENT: Persona ruleset rewrite
    Rewrite the persona ruleset without control structures and force a re-evaluation of the persona
    rules (`ase-persona.md`, `ase-meta-persona` skill).

-   IMPROVEMENT: Unchanged persona reported
    Report when the persona did not change (`ase-meta-persona` skill).

-   IMPROVEMENT: On-demand tenet loading
    Load the tenets on-demand from skills again to shrink the constitution (`ase-constitution.md`,
    `ase-tenets.md`, 5 `SKILL.md` files).

-   BUGFIX: Safari waves rendering
    Fix the waves rendering on Safari and improve the Terminal/Hero/Author rendering (`pages/` Astro
    components).

-   BUGFIX: Author name typo
    Fix a typo in the author name (`Section-Author.astro`).

-   CLEANUP: Constitution size reduction
    Reduce the constitution size and avoid persona-conflicting style hints
    (`ase-constitution.md`).

-   CLEANUP: Website text polish
    Polish the website texts, wording, and English (`pages/` Astro components).

0.9.25 (2026-06-23)
-------------------

-   IMPROVEMENT: Website polish
    Polish the website styling and extend the website content (again).

0.9.24 (2026-06-22)
-------------------

-   IMPROVEMENT: Website polish
    Polish the website styling and extend the website content.

0.9.23 (2026-06-22)
-------------------

-   FEATURE: Astro-based website
    First cut for a real ase.tools website based on the Astro framework.

0.9.22 (2026-06-20)
-------------------

-   FEATURE: Artifact export skill
    Add the `ase-sync-export` skill to export the artifact content into side-by-side files
    (`ase-sync-export` skill).

-   FEATURE: Per-artifact export rules
    Add per-artifact `Export:` rules and a side-by-side export convention (`ase-format-meta.md`,
    `ase-format-spec.md`, `ase-format-arch.md`).

-   FEATURE: SVG diagram output
    Add an SVG output format to the diagram facility via `beautiful-mermaid` (`ase-diagram.ts`).

-   IMPROVEMENT: Custom dialog enforced
    Enforce the custom-dialog definition over the built-in dialog tool across skills (13 `SKILL.md`
    files).

-   UPDATE: Skill registration and count
    Register the new `ase-sync-export` skill and refresh the skill count from 38 to 39
    (`AGENTS.md`, `README.md`).

-   CLEANUP: Workflow diagram cleanup
    Clean up the workflow diagram (`docs/workflow.*`).

-   REFACTOR: Alphabetical field order
    Reorder the Technology Stack component fields alphabetically (`ase-format-arch.md`).

0.9.21 (2026-06-19)
-------------------

-   FEATURE: Technology Stack artifact
    Add the Technology Stack (TS) artifact to the Architecture format (`ase-format-arch.md`).

-   FEATURE: Sync Mode overview entry
    Add the Sync Mode to the operation-modes overview (`README.md`).

-   IMPROVEMENT: More USP entries
    Add more USP entries for the sync/implement/resolve/refactor/analyze skills (`README.md`).

-   IMPROVEMENT: Operation mode wording
    Refine the Funnel Mode and Sync Mode operation-mode wording (`README.md`).

-   BUGFIX: Hard-coded artifact basedir
    Do not hard-code the artifact base directory (`ase-format-arch.md`, `ase-format-spec.md`).

-   BUGFIX: Wrong skill count
    Fix the skill count from 37 to 38 (`README.md`).

-   UPDATE: Diagram refresh
    Refresh the building-blocks and workflow diagrams (Graffle/SVG/PDF).

0.9.20 (2026-06-18)
-------------------

-   FEATURE: Foreign source import skill
    Add the `ase-sync-import` skill to import foreign sources into target artifact kinds
    (`ase-sync-import` skill).

-   IMPROVEMENT: Bidirectional sync options
    Use options for source/target with bidirectional sync, and improve the examples and
    cross-references (`ase-sync-reconcile` skill).

-   UPDATE: Operation modes update
    Update the operation-modes matrix and diagram (`docs/operation-modes.*`).

-   UPDATE: Documentation sync
    Update the documentation from the latest code status quo (`AGENTS.md`).

0.9.19 (2026-06-18)
-------------------

-   UPDATE: User documentation reconciled
    Reconcile the user documentation with the current code status quo (`README.md`,
    `docs/configuration.md`, `docs/usage-plugin.md`, `docs/usage-tool.md`).

-   REFACTOR: Update skill renamed
    Rename the `ase-meta-update` skill to `ase-sync-reconcile` (`ase-sync-reconcile` skill).

0.9.18 (2026-06-17)
-------------------

-   IMPROVEMENT: More powerful update skill
    Give the `ase-meta-update` skill more power (`ase-meta-update` skill).

-   REFACTOR: Reusable tenets file
    Factor out the reusable tenets into an own `meta/ase-tenets.md` file (`ase-tenets.md`,
    `ase-constitution.md`).

-   UPDATE: Dependency upgrade
    Upgrade NPM dependencies.

0.9.17 (2026-06-15)
-------------------

-   FEATURE: Artifact update skill
    Add the `ase-meta-update` skill to update target artifact kinds from source artifact kinds
    (`ase-meta-update` skill).

0.9.16 (2026-06-15)
-------------------

-   BUGFIX: MCP startup revert
    Revert the MCP bridge startup change that broke the service (`ase-mcp.ts`).

0.9.15 (2026-06-15)
-------------------

-   IMPROVEMENT: Timestamp precision
    Be more precise when checking Created and updating Modified time (`ase-task-condense`,
    `ase-task-edit`, `ase-task-grill`, `ase-task-preflight`, `ase-task-reboot` skills).

-   IMPROVEMENT: Prefixed KV clearing
    Use the new prefix parameter to clear only relevant KV keys, and extend the analysis lists for
    additional indicators (`ase-code-analyze` skill).

-   BUGFIX: MCP bridge crash
    Avoid an MCP bridge crash before the reconnect machinery exists (`ase-mcp.ts`).

-   UPDATE: Agentic levels diagram
    Extend the agentic-levels diagram with knowledge and skill dimensions
    (`docs/agentic-levels.*`).

-   UPDATE: Documentation sync
    Update the documentation from the latest code status quo (`AGENTS.md`, `README.md`,
    `docs/usage-tool.md`).

0.9.14 (2026-06-15)
-------------------

-   IMPROVEMENT: Defensive plan rebooting
    Be even more defensive when rebooting the task plan in the `ase-task-reboot` skill.

-   IMPROVEMENT: Defensive task id handling
    Be even more defensive in the `ase-task-id` skill.

-   IMPROVEMENT: Stale approve markers
    Try harder to avoid stale Edit-auto-approve markers (`ase-code-lint`, `ase-docs-proofread`
    skills).

-   IMPROVEMENT: Chat argument parsing
    Be more precise on the argument parsing inside the `ase-meta-chat` agent.

-   IMPROVEMENT: Getopt precision
    Be more precise in `ase-getopt.md`.

-   BUGFIX: KV namespace prefix
    Introduce a KV namespace prefix so the analyze skills no longer wipe the shared per-project KV
    store, and clear stale issues when all problems are dropped (`ase-*-analyze`, `ase-kv.ts`).

-   BUGFIX: Multi-line diff hunks
    Correctly produce diff hunks for multi-line changes (`ase-code-lint`, `ase-docs-proofread`
    skills).

-   BUGFIX: Robust evaluation calculation
    Make the evaluation calculation more robust in the `ase-meta-evaluate` skill.

-   BUGFIX: Focal aspect rule conflict
    Avoid the self-contradictory size-2-cluster focal-aspect rule in the `ase-arch-analyze` skill.

-   BUGFIX: Limit implementation
    Make the `--limit` implementation more correct in the `ase-arch-discover` skill.

-   BUGFIX: Ambiguous CANCEL handling
    Unambiguously handle the CANCEL situation in the `ase-meta-brainstorm` skill.

-   BUGFIX: Negative bar lengths
    Clamp the bar/pad lengths to zero (`ase-skill.md`).

-   CLEANUP: Dead OTHER branches
    Remove the dead OTHER-response branches in the custom-dialog/`--no-other` skills
    (`ase-task-condense`, `-grill`, `-implement`, `-preflight`, `-reboot`).

0.9.13 (2026-06-15)
-------------------

-   IMPROVEMENT: Batch KV operation
    Speed up the processing via a batch KV operation in the `ase-arch-analyze` skill.

-   IMPROVEMENT: Fail-safe conditions
    Make the conditions more robust and fail-safe for edge cases (`ase-code-resolve`,
    `ase-code-insight`, `ase-task-grill`, `-implement`, `-preflight`, `-edit`).

-   IMPROVEMENT: Guarded plan reset
    Reset the task plan less easily via a regexp match in the `ase-task-edit` skill.

-   IMPROVEMENT: Created timestamp extraction
    Extract the created timestamp so it can be inserted later correctly in the `ase-task-condense`
    skill.

-   IMPROVEMENT: Alternative materialization
    Be more precise in the materialization of the alternatives in the `ase-meta-evaluate` skill.

-   IMPROVEMENT: Uniform bar length
    Make the bar-length calculation identical for head/foot and boxed, and clarify the
    step-id-to-task-id mapping (`ase-skill.md`).

-   IMPROVEMENT: Consensus count defined
    Define the number of consensus in the `ase-meta-quorum` skill.

-   IMPROVEMENT: Optional mitigation column
    Make the mitigation optional in the table of the `ase-meta-diff` skill.

-   IMPROVEMENT: Direct DONE handling
    Directly handle DONE as the next step instead of forwarding to `ase-task-edit`
    (`ase-code-{craft,refactor,resolve}` skills).

-   IMPROVEMENT: Idempotent reconnect trigger
    Make `triggerReconnect` idempotent (`ase-mcp.ts`).

-   IMPROVEMENT: Explicit color mode
    Honor an explicit `ASE_TERM_COLORS=none` even when running on a TTY (`ase-diagram.ts`).

-   BUGFIX: Publish procedure under Codex
    Fix the "npm start publish" procedure for Codex.

-   BUGFIX: All-negative warning defeated
    Fix the branch ordering that defeated the all-negative warning in the `ase-meta-evaluate` skill.

-   BUGFIX: Task id change guard
    Change the task id only if the MCP call succeeded in the `ase-task-id` skill.

-   BUGFIX: Equal task ids on rename
    Detect the special case where the old and new task ids are equal in the `ase-task-rename` skill.

-   BUGFIX: Empty argument expansion
    Quote `args` to avoid an empty-expansion breakage in the `ase-task-implement` skill.

-   BUGFIX: Placeholder definition order
    Define the placeholders before using them (`ase-code-lint`, `ase-docs-proofread` skills).

-   BUGFIX: XML tag syntax
    Fix the XML tags and tag syntax (`ase-skill.md`, `ase-getopt.md`).

-   BUGFIX: Token thousands tier
    Roll the `formatTokens` thousands tier over into the next unit (`ase-statusline.ts`).

-   BUGFIX: Token limit divisor
    Use the floored percentage as the divisor for the `%C` token limit (`ase-statusline.ts`).

-   BUGFIX: Persona value whitelisting
    Whitelist the `Persona.get` value against the known styles (`ase-persona.ts`).

-   BUGFIX: Hyphenated option choices
    Fix the getopt list-of-choices validation for hyphenated long options (`ase-getopt.ts`).

-   UPDATE: Workflow diagram wording
    Update the wording in the workflow diagram (`docs/workflow.*`).

-   CLEANUP: Artifact format references
    Clarify the superseding, mismatch, uniqueness, and use-case references in the artifact-set
    formats (`ase-format-arch.md`, `ase-format-spec.md`, `ase-format-meta.md`).

-   CLEANUP: Unused tool declaration
    Remove an unused tool declaration (`ase-code-explain`, `ase-code-insight` skills).

-   CLEANUP: Grill control structure
    Clean up the control structure in the `ase-task-grill` skill.

-   CLEANUP: Decision matrix calculations
    Clean up the decision matrix calculations (`ase-skills.ts`).

-   CLEANUP: Duplicated default value
    Use the same default as in the option (`ase.ts`).

-   CLEANUP: Stray step-end tags
    Remove the stray step-end tags and final cleanups in the `ase-meta-compat` skill, adjust the
    symbol (`ase-compat.ts`).

-   CLEANUP: Dialog wording precision
    Be more precise in the wording (`ase-dialog.md`).

-   CLEANUP: Codex plugin manifest commit
    Also commit the Codex `plugin.json` and resolve the related conflicts (`etc/stx.conf`).

0.9.12 (2026-06-14)
-------------------

-   FEATURE: OpenAI Codex CLI support
    Add support for the OpenAI Codex CLI.

-   FEATURE: Compatibility self-test skill
    Provide the `ase-meta-compat` skill to self-test the agent/LLM compatibility to ASE
    (`ase-compat.ts`).

-   IMPROVEMENT: Robust stdio handling
    Improve the reading/writing to stdin to be more robust and Codex-ready (`ase-hook.ts`).

-   IMPROVEMENT: Codex compatibility table
    Add an OpenAI Codex compatibility table and more models to the README (`README.md`).

-   IMPROVEMENT: Workflow diagram update
    Update the workflow diagram for the compat skill (`docs/workflow.*`).

-   CLEANUP: Colon-free dialog wording
    Avoid colons to not confuse the parsing and align the dialog wording
    (`ase-code-{craft,refactor,resolve}`, `ase-task-grill`).

0.9.11 (2026-06-14)
-------------------

-   IMPROVEMENT: Help option across skills
    Support the `-h`/`--help` option via getopt across many skills (`ase-arch-analyze`,
    `ase-code-*`, `ase-meta-*`, `ase-task-*`).

-   IMPROVEMENT: Custom dialog in grilling
    Use `custom-dialog` and improve the timestamp handling in the `ase-task-grill` skill.

-   IMPROVEMENT: Flexible answer count
    Do not hard-code to 4 answers in the `ase-meta-brainstorm` skill.

-   IMPROVEMENT: Next step precision
    Be more precise on `-n`/EDIT in the `ase-code-{craft,refactor,resolve}` skills.

-   IMPROVEMENT: OTHER handler improvement
    Improve the OTHER handler in the `ase-code-lint` and `ase-docs-proofread` skills.

-   IMPROVEMENT: No-quorum case
    Handle the no-foreign-LLMs (no-quorum) case in the `ase-meta-quorum` skill.

-   IMPROVEMENT: Task id validation
    Validate the task ids in the `ase-task-rename` skill.

-   IMPROVEMENT: Missing version header
    Allow a missing top-level header of the next version in the `ase-meta-changelog` skill.

-   IMPROVEMENT: Bullet-proof task handling
    Be more precise and bullet-proof in the `ase-task-id` and `ase-code-analyze` skills.

-   BUGFIX: KV lookup validation
    Validate the kv lookup before switching the session task in the `ase-code-resolve` skill.

-   BUGFIX: Minimum item count surfaced
    Surface the minimum count of highest-ranked items in the `ase-meta-diaboli` and
    `ase-meta-steelman` skills.

-   BUGFIX: Check evaluation order
    Evaluate the all-negative check before the small-distance check in the `ase-meta-evaluate`
    skill.

-   BUGFIX: Intent group line count
    Fix the intent-group line-count reference in the `ase-meta-diff` skill.

-   BUGFIX: Step numbering
    Fix the step numbering in the `ase-arch-discover` skill.

-   CLEANUP: Reboot control structure
    Clean up the control structure in the `ase-task-reboot` skill.

0.9.10 (2026-06-14)
-------------------

-   FEATURE: Free-text dialog distinction
    Distinguish dialogs that allow free-text instructions from those that do not (`ase-dialog.md`,
    many skills).

-   IMPROVEMENT: Own dialog suppressed
    Force the agent harness harder to no longer use its own user dialog and suppress the
    end-of-skill summaries (many skills, `ase-skill.md`).

-   IMPROVEMENT: Custom dialog improvement
    Improve `custom-dialog`, disambiguate the internal step cross-references, and restrict to 2-9
    options (`ase-dialog.md`).

-   IMPROVEMENT: Box and banner rendering
    Improve the box rendering and render the ASE banner in black (`ase-skill.md`).

-   IMPROVEMENT: Approach rendering
    Improve the rendering of the approaches in the `ase-code-{craft,refactor,resolve}` skills.

-   IMPROVEMENT: Copilot web search tool
    Support Copilot's `web_search` tool in the `ase-meta-search` skill.

-   IMPROVEMENT: More Bash commands allowed
    Allow more Bash commands for the `ase-code-insight` skill itself.

-   IMPROVEMENT: Placeholder namespace conflicts
    Avoid placeholder namespace conflicts in the `ase-meta-brainstorm` skill.

-   IMPROVEMENT: Unreached minimum rank
    Detect when the minimum rank is not reached at all in the `ase-meta-brainstorm` skill.

-   BUGFIX: Chosen candidate binding
    Bind the `chosen-k` placeholder to the chosen candidate index in the `ase-meta-why` skill.

-   BUGFIX: Agent name conflicts
    Avoid Agent name conflicts in the `ase-code-lint` and `ase-docs-proofread` skills.

-   BUGFIX: Cross-reference targets
    Fix the cross-reference targets in `ase-format-arch.md`.

-   BUGFIX: Step marker
    Fix the step marker in the `ase-arch-discover` skill.

-   BUGFIX: Missing end tag
    Fix the end tag in the `ase-code-{craft,refactor,resolve}` skills.

-   BUGFIX: Proofread results
    Fix the proofread results in the `ase-meta-diaboli` and `ase-meta-diff` skills.

-   CLEANUP: Specification format cleanup
    Clean up the Specification format (`ase-format-spec.md`).

-   CLEANUP: Local getopt parsing
    Clean up the local getopt parsing in `ase-getopt.md`.

-   CLEANUP: Dialog processing
    Clean up the dialog processing in `ase-dialog.md`.

-   CLEANUP: Syntax alignment
    Align the syntax with the other skills in the `ase-meta-brainstorm` skill.

0.9.9 (2026-06-13)
------------------

-   FEATURE: Custom dialog construct
    Add a focus-mode-capable `custom-dialog` construct (non-`AskUserQuestion`) for intermediate
    questions (`ase-dialog.md`).

-   IMPROVEMENT: Skill dialog migration
    Migrate the skills to `custom-dialog` for Claude Code focus-mode support (task-*, code-*,
    docs-proofread, meta-brainstorm).

-   IMPROVEMENT: Flow and step mechanism
    Migrate the `ase-code-{craft,refactor,resolve}` skills to the `<flow>`/`<step>` mechanism.

-   IMPROVEMENT: Ordered discovery steps
    Make the steps ordered and use `custom-dialog` in the `ase-arch-discover` skill.

-   IMPROVEMENT: Edit tool auto-approval
    Support the auto-approval of the `Edit` tool for some skills (`ase-hook.ts`).

-   IMPROVEMENT: Render helpers
    Add numbered-key and box-drawing/padding render helpers (`ase-skill.md`).

-   IMPROVEMENT: Option parsing pressure
    Strengthen the local option-parsing optimization pressure (`ase-getopt.md`).

-   IMPROVEMENT: Double-backtick code spans
    Support double-backtick code spans with escaped backticks (`ase-markdown.ts`).

-   IMPROVEMENT: Statusline line breaking
    Allow the statusline chunks to line-break within color spans (`ase-statusline.ts`).

-   IMPROVEMENT: Manpage hyperlinks
    Add hyperlinks to all skill `help.md` files.

-   IMPROVEMENT: Changed service port
    Handle restarts where the service port could have changed (`ase-service.ts`).

-   IMPROVEMENT: Symmetric glob enforcement
    Enforce the `project.artifact.task.files` glob symmetrically across all task operations
    (`ase-task.ts`).

-   IMPROVEMENT: Quiet path failure handling
    Follow the non-quiet failure handling in the quiet path on the final attempt in `ase setup`
    (`ase-setup.ts`).

-   BUGFIX: Uncleanable skill marker
    Do not set `agent.skill` from hooks as it cannot be reliably cleared again (`ase-hook.ts`).

-   BUGFIX: Diagram conflicts focus mode
    Remove the optional diagram from the `ase-code-*` skills as it conflicts with focus mode.

-   BUGFIX: Verbatim argument slicing
    Fix the mis-slicing of the verbatim trailing-arg string for value-consuming options
    (`ase-getopt.ts`).

-   BUGFIX: Robust MCP shutdown
    Make the MCP HTTP close/shutdown/reconnect handling more robust (`ase-mcp.ts`).

-   BUGFIX: Rank collapse to zero
    Prevent `computeRank` from collapsing to zero on genuine `0` or unavailable metrics
    (`ase-skills.ts`).

-   BUGFIX: Regexp and comment format
    Fix the regexp and comment format in `ase-task.ts`.

-   BUGFIX: Grammar problems
    Fix the grammar in the `ase-meta-brainstorm` and `ase-meta-diff` skills.

-   UPDATE: Dependency upgrade
    Upgrade NPM dependencies.

-   REFACTOR: Setup code shrinking
    Factor out similar code to shrink `ase-setup.ts`.

-   REFACTOR: Host variable usage
    Use the `HOST` variable for alignment and improve the portability (`ase-service.ts`,
    `ase-hook.ts`).

-   CLEANUP: Skill style alignment
    Align the skill style and wording across `ase-code-*`, dialog, and meta files.

0.9.8 (2026-06-12)
------------------

-   FEATURE: Else control constructs
    Add the `<elseif>`/`<else>` control constructs and improve the control flow (`ase-control.md`).

-   IMPROVEMENT: Fewer task load round-trips
    Avoid redundant `ase_task_load` round-trips in the skill hand-offs via the internal
    `--int-reuse-task` option.

-   IMPROVEMENT: Hidden internal options
    Hide the internal `--int-*` options from the `ase_getopt` usage help and `info` rendering.

-   IMPROVEMENT: Parallel task creation
    Speed up the task-list processing via a parallel `TaskCreate` plus an explicit `TaskUpdate`
    ordering.

-   IMPROVEMENT: More implicit triggering
    Let the `ase-code-{craft,refactor,resolve}` skills trigger more often implicitly.

-   IMPROVEMENT: Icon-prefixed field matching
    Match the task plan `Modified:` field via its icon prefix for a more precise detection.

-   IMPROVEMENT: Underscores in task ids
    Allow underscores in the task identifiers (`ase-task.ts`).

-   IMPROVEMENT: Meta skill precision
    Improve the control flow and precision in the `ase-meta-{why,steelman,review,quorum}` skills.

-   IMPROVEMENT: Aligned code skill outputs
    Align the outputs across the `ase-code-{craft,resolve}` skills.

-   BUGFIX: Format rewriting on save
    Do not rewrite the Markdown task format on save, only on load (`ase-task.ts`).

-   BUGFIX: Underscore task listing
    List tasks with underscores in the name correctly (`ase-task.ts`).

-   BUGFIX: Tool name prefix in results
    Do not prefix the result with the tool name to avoid skill error-handling confusion
    (`ase-task.ts`).

-   BUGFIX: OTHER dialog case
    Handle the OTHER user-dialog case in the `ase-task-{grill,implement,preflight,reboot,condense}`
    skills.

-   BUGFIX: Timestamp handling
    Fix the timestamp handling in the `ase-task-{reboot,grill}` skills.

-   BUGFIX: Unchanged plan reuse
    Reuse the plan only if it was really changed in the `ase-task-edit` skill.

-   BUGFIX: Task id on rename
    Set `ase-task-id` only if a rename actually happened in the `ase-task-rename` skill.

-   BUGFIX: Full option documentation
    Fix the `--full` option docs and header name in the `ase-task-view` help.

-   BUGFIX: Next step and id handling
    Handle `-n EDIT` and fix the id handling in the `ase-code-{craft,refactor,resolve}` skills.

-   BUGFIX: Colons in Agent names
    Avoid colons in the Agent names in the `ase-code-explain` skill.

-   BUGFIX: Blank line counting
    Do not count blank lines in the `ase-code-insight` skill.

-   BUGFIX: Wrong skill name in call
    Fix the skill name in the MCP tool call in the `ase-code-lint` skill.

-   BUGFIX: Unified diff context
    Fix the unified-diff context information in the `ase-code-lint` and `ase-docs-proofread` skills.

-   BUGFIX: Off-by-one error
    Fix an off-by-one error in the `ase-docs-proofread` agent.

-   BUGFIX: Duplicate Agent names
    Use unique Agent names in the `ase-meta-search` skill.

-   BUGFIX: Option value validation
    Fix the option value validation in the `ase-meta-quorum` skill.

-   BUGFIX: Division by zero
    Guard a zero best-rating before dividing in the `ase-meta-evaluate` percentage calculation.

-   BUGFIX: Small-distance branch
    Fix the small-distance branch case in the `ase-meta-evaluate` skill.

-   BUGFIX: Answer starvation
    Handle the `OTHER:`/`ERROR:` results in `ase-meta-brainstorm` and avoid an answer starvation.

-   BUGFIX: Help and table alignment
    Align the `ase-meta-diff` help with its table rendering and add the missing close-tag.

-   BUGFIX: Unknown technology stacks
    Error on unknown technology stacks in the `ase-arch-discover` skill.

-   BUGFIX: Maven URL usage
    Fix the Maven URL usage and name references in the `ase-arch-discover` skill.

-   BUGFIX: Limit clamping
    Clamp `--limit` correctly in the `ase-docs-distill` skill.

-   UPDATE: Workflow diagram refresh
    Refresh the agentic-levels workflow diagram (Graffle/SVG/PDF).

-   REFACTOR: Newer control constructs
    Adopt the newer `<elseif>`/`<else>` control constructs across all skills.

-   CLEANUP: Newer task plan format
    Adjust the skills for the newer task plan format and fix minor wording/types.

-   CLEANUP: Consistent glob patterns
    Consistently use the space-glob pattern variant in the `ase-arch-analyze` and `ase-meta-diff`
    skills.

-   CLEANUP: Not-implemented RIPPLE info
    Remove the not-implemented RIPPLE information from the `ase-meta-diff` help.

-   CLEANUP: Extra output removed
    Remove the extra output in the `ase-arch-analyze` skill.

-   CLEANUP: Skill and docs cleanup
    Clean up the `ase-code-analyze`, `ase-task-delete`, and `ase-task-edit` skills and docs.

-   UPDATE: Dependency upgrade
    Upgrade NPM dependencies.

0.9.7 (2026-06-10)
------------------

-   FEATURE: Markdown preparation tool
    Add the `ase_markdown_prepare` MCP tool and the `Markdown.prepare()` helper to improve the
    Markdown rendering.

-   FEATURE: Full task view option
    Add the option `--full`/`-f` to `ase-task-view` to not truncate the IMPLEMENTATION DRAFT
    sections by default.

-   IMPROVEMENT: Fenced blocks kept as-is
    Keep the fenced code blocks as-is in `Markdown.prepare()`.

-   IMPROVEMENT: Approach rendering
    Improve the rendering of the approaches in the `ase-code-{craft,refactor,resolve}` skills.

-   IMPROVEMENT: Stronger grilling skill
    Strengthen and clarify the `ase-task-grill` skill.

-   REFACTOR: Implicit Markdown preparation
    Apply `Markdown.prepare()` implicitly in `ase_task_{load,save}`.

-   REFACTOR: Skills adjusted for rendering
    Adjust all skills for the improved task rendering.

-   UPDATE: Dependency upgrade
    Upgrade NPM dependencies.

0.9.6 (2026-06-08)
------------------

-   FEATURE: Artifact name tool
    Add the `ase_artifact_name(kind, name)` MCP tool and the
    `ase artifact name --kind <kind> <name>` CLI to create artifact filenames.

-   FEATURE: Artifact list tool
    Add the `ase_artifact_list(kind)` MCP tool and the `ase artifact list --kind` CLI to resolve
    artifact kinds to project files.

-   FEATURE: Config delete sub-command
    Add the missing `ase config delete` CLI sub-command to delete a configuration key.

-   FEATURE: Artifact configuration variables
    Add the `project.artifact.{spec,arch,code,docs,infr}.{basedir,files}` config variables.

-   REFACTOR: Task storage layout
    Add the `project.artifact.task.{basedir,files}` config variables and store tasks as
    `<basedir>/TASK-<id>.md` files.

-   CLEANUP: Legacy task migration
    Add an automatic migration of legacy `<basedir>/<id>/plan.md` task files to
    `<basedir>/TASK-<id>.md`.

-   CLEANUP: Plan format file renamed
    Rename `plugin/meta/ase-format-plan.md` to `plugin/meta/ase-format-task.md`.

0.9.5 (2026-06-07)
------------------

-   FEATURE: Brainstorm internals options
    Add the `--max-clarify`, `--min-rank`, and `--max-shortlist` options to `ase-meta-brainstorm` to
    control its internals.

-   FEATURE: Five-Whys width option
    Add a `--width`/`-w` option to `ase-meta-why` to weigh several candidate sub-causes per level
    and backtrack.

-   FEATURE: Quorum model selection
    Add a `--models`/`-m` model-selection option to `ase-meta-quorum` to choose which foreign LLMs
    are queried.

-   FEATURE: Search backend selection
    Add a `--services`/`-s` backend-selection option to `ase-meta-search` to choose which search
    services are queried.

-   FEATURE: Discovery result cap
    Add a `--limit`/`-l=12` option to `ase-arch-discover` to make the component discovery search and
    result cap user-controlled.

-   BUGFIX: Agent name validity
    Ensure that the "name" field of "Agent" calls is a valid string.

0.9.4 (2026-06-07)
------------------

-   FEATURE: Review severity floor
    Add a `--severity`/`-S` severity-floor option to `ase-meta-review` to suppress sub-threshold
    findings.

-   FEATURE: Lint and analyze severity floor
    Add a `--severity`/`-S` severity-floor option to `ase-code-lint` and `ase-code-analyze` to
    suppress sub-threshold findings.

-   FEATURE: Additional analyze lenses
    Add the `--performance`/`-p` and `--security`/`-s` lens options to `ase-code-analyze` for
    additional analyze lenses.

-   FEATURE: Tunable Five-Whys depth
    Add a `--depth`/`-d` option to `ase-meta-why` to make the Five-Whys chain length tunable.

-   FEATURE: Brainstorm idea count
    Add a `--count`/`-c=12` option to `ase-meta-brainstorm` controlling the minimum number of
    candidate ideas in the diverge phase.

-   FEATURE: Steelman fortification rounds
    Add a `--rounds`/`-r` option to `ase-meta-steelman` for iterative fortification rounds.

-   FEATURE: Thesis count option
    Add a `--count`/`-c=10` option to `ase-meta-diaboli` and `ase-meta-steelman` for the number of
    anti-theses/pro-theses surfaced.

-   FEATURE: Project statistics target
    Add a `tokei` build target for project statistics in `etc/stx.conf`.

-   IMPROVEMENT: Flow and step control structures
    Refactor `ase-meta-diaboli` and `ase-meta-steelman` to use flow/step control structures.

-   IMPROVEMENT: Non-exhaustive analysis hints
    Clarify that the analysis hints are non-exhaustive indicators in `ase-code-analyze`.

-   UPDATE: Sibling project link
    Link to the sibling project `bash-authorize` and bump the Artifact Formats progress in the
    README.

-   CLEANUP: Proofread fixes
    Apply the proofread fixes in the `ase-docs-distill`, `ase-meta-brainstorm`, and `ase-task-grill`
    skills.

0.9.3 (2026-06-06)
------------------

-   FEATURE: Document distilling skill
    Add the `ase-docs-distill` skill for distilling an importance-ranked list of key points of
    documents.

-   FEATURE: Steelman skill
    Add the `ase-meta-steelman` skill for constructing the strongest possible case for a thesis.

-   FEATURE: Change review skill
    Add the `ase-meta-review` skill for a holistic, human-reviewer-style critique of staged Git
    changes.

-   FEATURE: Diff coherence option
    Add a `--coherence` option to `ase-meta-diff` to reconstruct the single intended change and flag
    hunks that do not serve it.

-   FEATURE: Markdown linting
    Add ESLint-based Markdown linting and fix all Markdown files accordingly.

-   IMPROVEMENT: Conditional steps
    Add support for conditional steps in the skill control flow (`ase-control.md`).

-   IMPROVEMENT: Bolder brainstorming
    Constrain `ase-meta-brainstorm` to fewer clarifications and a bolder statement.

-   BUGFIX: Numeric rate-limit timestamp
    Accept a numeric Unix timestamp for the rate-limit `resets_at` in `ase-statusline.ts`.

-   UPDATE: Workflow diagram refresh
    Refresh and improve the workflow diagram (Graffle/SVG/PDF).

-   UPDATE: Documentation sync
    Update the documentation to reflect the current code state (`AGENTS.md`, README, usage docs).

-   UPDATE: Dependency upgrade
    Upgrade NPM dependencies.

-   CLEANUP: Linter warnings
    Silence the linter and markdownlint warnings.

0.9.2 (2026-06-05)
------------------

-   FEATURE: New specification artifacts
    Add the State Model, Glossary, and Business Rules artifacts to the Specification format
    (`ase-format-spec.md`).

-   FEATURE: Package update target
    Add an `upd` build target for updating the package.json files in `etc/stx.conf`.

-   IMPROVEMENT: Cross-reference information
    Improve the Specification format rendering and add cross-reference information across the
    SPEC/ARCH format definitions.

-   IMPROVEMENT: Filename and slug conventions
    Add a sequence-number filename prefix, Pascal-cased slugs, and numbered Artifact lists to the
    SPEC/ARCH formats.

-   IMPROVEMENT: Architecture format alignment
    Align the `ase-format-arch.md` formatting and conventions with the newer SPEC format.

-   CLEANUP: ADR format merged
    Merge `ase-format-adr.md` into the newer `ase-format-arch.md`.

-   CLEANUP: Consistent format spacing
    Enforce consistent line-breaking, blank lines, and spacing in the format definitions.

0.9.1 (2026-06-05)
------------------

-   FEATURE: Task plan condensing skill
    Add the new `ase-task-condense` skill for condensing task plan texts (telegrapher-like,
    semantics-preserving).

-   FEATURE: Addon MCP auto-approval
    Auto-approve the addon MCP (chat-*/search-*) tool invocations in the pre-tool-use hook
    (`ase-hook.ts`).

-   FEATURE: Specification format definitions
    Provide the first cut for the Specification and Architecture format definitions.

-   IMPROVEMENT: README wording
    Refine the README wording on result quality and feature-status notices.

-   IMPROVEMENT: GRILL replaces REFINE
    Replace the explicit REFINE option with the more useful GRILL option in `ase-task-edit`.

-   IMPROVEMENT: Concise approach output
    Make the approach output more concise in the `ase-code-{craft,refactor,resolve}` skills.

-   UPDATE: Workflow diagram refresh
    Refresh the workflow diagram for the `ase-task-condense` skill (Graffle/SVG/PDF).

-   CLEANUP: README admonition
    Change the README status notice admonition from CAUTION to NOTE.

-   CLEANUP: Proofreading typos
    Fix the proofreading typos in the `ase-meta-brainstorm` and `ase-task-grill` skills.

0.9.0 (2026-06-03)
------------------

-   REFACTOR: Idempotent reconnect handling
    Consolidate the MCP bridge reconnect handling into an idempotent `triggerReconnect` helper in
    `ase-mcp.ts`.

-   CLEANUP: Bridge code simplification
    Simplify the `runBridge` return handling and the `loadContext` identity loading in `ase-mcp.ts`.

-   UPDATE: Dependency upgrade
    Upgrade NPM dependencies.

0.0.62 (2026-06-03)
-------------------

-   IMPROVEMENT: New skill documented
    Document the new `ase-meta-brainstorm` skill and the `ase-format-adr.md` ADR conventions
    (`AGENTS.md`, README, `usage-plugin.md`).

-   IMPROVEMENT: Lint reference rendering
    Improve the `ase-code-lint` skill with `file:line` references and an optical WHAT/WHY
    separation.

-   REFACTOR: ANSI scanning factored out
    Factor out the ANSI-sequence scanning and reduce the redundancy in `ase-diagram.ts`.

-   CLEANUP: Changes skill renamed
    Rename `ase-meta-changes` to `ase-meta-changelog` to reduce the confusion with `ase-meta-diff`.

-   CLEANUP: Tool code simplification
    Simplify the `ase-diagram.ts` and `ase-statusline.ts` code.

-   CLEANUP: Persona tool alignment
    Align the `ase-persona` MCP tool description and session-id validation with the skill.

-   CLEANUP: README table layout
    Adjust the README skill-table layout to balance the columns.

-   CLEANUP: Vendor name spelling
    Fix the vendor name "GitHub" in the README.

0.0.61 (2026-06-03)
-------------------

-   FEATURE: Staged change summary skill
    Add the new `ase-meta-diff` skill summarizing staged Git changes as intents with optional risks
    and blast radius.

-   FEATURE: Brainstorming skill
    Add the new `ase-meta-brainstorm` skill for finding ideas with a single-diamond
    (diverge/converge) method.

-   IMPROVEMENT: Central output templates
    Centrally provide the output templates in `ase-skill.md` and adopt them across the skills.

-   IMPROVEMENT: Aligned intent tables
    Rework the `ase-meta-diff` intent report into two aligned Markdown tables.

-   IMPROVEMENT: New skill documented
    Document the new `ase-meta-diff` skill (`AGENTS.md`, README, `usage-plugin.md`).

-   UPDATE: Workflow diagram refresh
    Refresh the workflow diagram for the new `ase-meta-diff` skill (Graffle/SVG/PDF).

-   CLEANUP: Bullet entity replacement
    Replace the sometimes not expanded HTML entities for the colored bullets with XML placeholders
    of direct Unicode characters.

-   CLEANUP: Linter warnings
    Silence the linter and markdownlint warnings.

0.0.60 (2026-05-31)
-------------------

-   IMPROVEMENT: Quick option alias
    Add a `-Q`/`--quick` option as an alias for `-a -d -n IMPLEMENT,DELETE` in the
    `ase-code-{craft,refactor,resolve}` skills.

-   BUGFIX: Task deletion from skills
    Allow once again the `ase-task-delete` skill to be called from other skills.

0.0.59 (2026-05-31)
-------------------

-   FEATURE: ADR format definition
    Add a (still unused) ADR format definition in `plugin/meta/ase-format-adr.md`.

-   IMPROVEMENT: Next step token lists
    Let `-n`/`--next` in the code and task skills accept a comma-separated chronological list of
    tokens.

-   IMPROVEMENT: Task grilling skill
    Add the new `ase-task-grill` skill for challenging the task aspects.

-   IMPROVEMENT: Devil's Advocate skill
    Add the new `ase-meta-diaboli` skill for playing Devil's Advocate (Advocatus Diaboli).

-   IMPROVEMENT: Higher effort levels
    Increase the "effort" level in various skills to improve the precise operation.

-   IMPROVEMENT: README rework
    Substantially rework the README (skill mix, sample-session GIF/video, section sorting,
    rendering).

-   IMPROVEMENT: New skills documented
    Document the `ase-task-grill` and `ase-meta-diaboli` skills (`AGENTS.md`, README,
    `usage-plugin.md`, help).

-   BUGFIX: Automatic getopt invocation
    Prevent the `ase-getopt` skill from being automatically called by the model.

-   UPDATE: Workflow diagram refresh
    Refresh the workflow diagram for the diaboli/grill skills (Graffle/SVG/PDF).

-   CLEANUP: Why skill style alignment
    Align the `ase-meta-why` skill style to the other skills.

-   CLEANUP: Plan format file renamed
    Rename `plugin/meta/ase-plan.md` to `plugin/meta/ase-format-plan.md`.

0.0.58 (2026-05-29)
-------------------

-   IMPROVEMENT: ChangeLog files considered
    Let `ase-code-{craft,resolve,refactor}` and `ase-task-edit` also take `CHANGELOG.md` files into
    account.

-   IMPROVEMENT: Dry option introduced
    Introduce a `-d`/`--dry` option to the `ase-code-{craft,resolve,refactor}` and `ase-task-edit`
    skills for skipping the verifications.

-   IMPROVEMENT: Faster option parsing
    Speed up the option parsing by skipping the MCP tool use when the arguments do not start with
    any option.

-   IMPROVEMENT: Edit skill shrinking
    Reduce the `ase-task-edit` skill by 2K by factoring out equal text blocks into `<define>`.

-   IMPROVEMENT: README readability rework
    Substantially rework the README for readability (rewording, three-column layout, full-width
    usage, motivation section, skill links and updated skill list).

-   UPDATE: Diagram refresh
    Refresh the building-blocks, agentic-levels, and workflow diagrams (Graffle/SVG/PDF).

-   CLEANUP: Markdownlint spacing
    Ignore extra spaces in `plugin/etc/markdownlint.yaml`.

0.0.57 (2026-05-28)
-------------------

-   FEATURE: Help option infrastructure
    Add the `--help`/`-h` option infrastructure with per-skill `help.md` files for all skills.

-   IMPROVEMENT: Direct step transitions
    Speed up the `ase-code-{craft,refactor,resolve}` skills by going directly to
    implementation/preflight if requested.

-   IMPROVEMENT: Help option announced
    Announce the `--help`/`-h` option in the argument-hint and frontmatter across all skills.

-   IMPROVEMENT: Option separator
    Use a space as the option separator in the argument-hint across the skills.

-   IMPROVEMENT: Objective tags
    Wrap all skill objectives in an `<objective>` XML tag and add the missing objective blocks.

-   CLEANUP: Role information removed
    Remove the `<role/>` information from all skills as it makes no real effect for the skills.

-   CLEANUP: H1 headers removed
    Remove all H1 headers from all skills as they make no real effect for the skills.

-   CLEANUP: Options in argument hint
    Show the skill options also in the frontmatter "argument-hint".

-   CLEANUP: Meta file cleanups
    Small cleanups to `ase-constitution.md`, `ase-skill.md`, and `ase-getopt.md`.

0.0.56 (2026-05-28)
-------------------

-   IMPROVEMENT: Task id validation
    Validate the task `id` parameter in the `ase-task-{delete,implement,preflight,reboot,view}`
    skills.

-   IMPROVEMENT: Quoted string parameters
    Properly quote the string parameters in the MCP tool calls across multiple skills and
    `ase-getopt.md`.

-   IMPROVEMENT: Error response handling
    Handle the error responses in the `ase-task-{implement,preflight,reboot}` skills.

-   IMPROVEMENT: Edit skill refinement
    Refine the `ase-task-edit` skill (clearer questions, looping, OTHER option on the plan dialog,
    inherited session id, precision).

-   IMPROVEMENT: Robust expand construct
    Make the `<expand>` control construct more robust in `ase-control.md`.

-   BUGFIX: WHY-only case
    Handle the WHY-only case in the `ase-task-reboot` skill.

-   BUGFIX: Transposed decision matrix
    Fix the transposed decision matrix evaluation in the `ase-meta-evaluate` skill.

-   BUGFIX: Search server references
    Fix the references to the search MCP servers in the `ase-meta-search` agent.

-   BUGFIX: Destructuring information
    Fix the destructuring information in the `ase-arch-discover` skill.

-   BUGFIX: Wrong placeholder reference
    Fix a wrong placeholder reference in `ase-dialog.md`.

-   BUGFIX: Typo
    Fix a typo in the `ase-task-edit` skill.

0.0.55 (2026-05-27)
-------------------

-   IMPROVEMENT: Single-character task ids
    Support also single-character task ids in the `ase-code-craft` and `ase-code-resolve` skills.

-   IMPROVEMENT: Missing quorum entries
    Add the missing entries to the `ase-meta-quorum` skill.

-   IMPROVEMENT: Doubled config reading
    Avoid reading the config twice in `ase-hook`.

-   BUGFIX: Warning results honored
    Honor also `WARNING:` results in the `ase-task-delete` and `ase-task-view` skills.

-   CLEANUP: Setup redundancies
    Simplify the code by eliminating the redundancies in `ase-setup`.

-   CLEANUP: Config and diagram cleanup
    Clean up the code in `ase-config` and `ase-diagram`.

-   CLEANUP: Typos
    Fix the typos in the `ase-meta-changes` skill.

0.0.54 (2026-05-26)
-------------------

-   IMPROVEMENT: Staged changes consulted
    Rework the `ase-meta-changes` skill to also consult the staged Git changes.

-   IMPROVEMENT: Faster tail reading
    Optimize the tail-reading performance in `ase-service`.

-   IMPROVEMENT: Consistent result prefixes
    Use consistent `ase_task_*` result message prefixes in `ase-task`.

-   BUGFIX: Tool value validation
    Validate the `--tool` value from `ASE_TOOL` in `ase-setup` and `ase-statusline`.

-   UPDATE: Reasoning effort adjusted
    Adjust the reasoning effort in several `ase-arch/code/meta/task` skills.

-   CLEANUP: Obsolete lint commands
    Remove the obsolete `ase-code-lint:xxx` commands.

-   CLEANUP: Spelling
    Fix the spelling in the `ase-meta-quorum` and `ase-meta-search` skills.

0.0.53 (2026-05-26)
-------------------

-   REFACTORING: MCP tool prefixing
    Prefix all MCP tools with `ase_` -- technically not necessary, but a more precise matching
    becomes possible.

-   BUGFIX: Wrong parameter name
    Fix a parameter name in the `ase-meta-chat` agent.

-   BUGFIX: Malformed tools field
    Fix the malformed "tools" field in the frontmatter of `ase-meta-search`.

0.0.52 (2026-05-25)
-------------------

-   IMPROVEMENT: Level marking in output
    Mark the level in the verbose outputs of the STX build tasks.

-   UPDATE: Dependency upgrade
    Upgrade NPM dependencies.

-   CLEANUP: Build task cleanup
    Clean up the STX build tasks in `etc/stx.conf`.

-   CLEANUP: README cleanup
    Clean up `README.md`.

0.0.51 (2026-05-25)
-------------------

-   IMPROVEMENT: Foreign MCP management
    Add an `ase setup mcp list|activate|deactivate` tool for managing the foreign MCP servers.

-   IMPROVEMENT: More foreign LLMs
    Add the Z.AI GLM and Alibaba Qwen LLMs to `ase-meta-quorum` and `ase-meta-chat`.

-   IMPROVEMENT: Higher diagram effort
    Raise the effort to high in the `ase-meta-diagram` agent for a more precise instruction
    following.

-   BUGFIX: Key sanitization
    Sanitize the keys in the `ase setup mcp` output.

-   UPDATE: README references
    Add references to the README.

-   REFACTOR: Unified query tool
    Rework the `ase-meta-chat` agent for the unified `query` MCP tool.

-   CLEANUP: Search skill restructuring
    Clean up and restructure the `ase-meta-search` skill and agent.

-   CLEANUP: Environment files ignored
    Ignore `.env` files in `.gitignore` and `.npmignore`.

0.0.50 (2026-05-25)
-------------------

-   IMPROVEMENT: Agent usage guidance
    Improve the agent-usage guidance in the `ase-meta-quorum` skill.

-   IMPROVEMENT: Search skill restructuring
    Clean up and restructure the `ase-meta-search` skill.

-   IMPROVEMENT: USP overview regrouped
    Regroup the USP overview in the README.

-   BUGFIX: Obsolete parameter references
    Fix the obsolete-parameter references in `ase-statusline`.

-   BUGFIX: Stale task id clobbering
    Re-read the config before write to avoid clobbering a stale task id in `ase-hook`.

-   CLEANUP: Namespaced agent references
    Use namespaced agent references in the `ase-code-lint` and `ase-docs-proofread` skills.

-   CLEANUP: Quorum and chat cleanup
    Clean up the `ase-meta-quorum` skill and remove a blank line in the `ase-meta-chat` agent.

-   CLEANUP: Obsolete skill file
    Remove the obsolete `ase-meta-diagram` skill file.

-   CLEANUP: Punctuation and spelling
    Fix the punctuation and spellings in the README and docs.

-   CLEANUP: Workflow diagram update
    Update the workflow diagram.

-   REFACTOR: Chat logic moved to agent
    Move the logic from the `ase-meta-chat` skill to the corresponding agent.

-   REFACTOR: Diagram skill to sub-agent
    Convert the `ase-meta-diagram` skill into a sub-agent and route all callers through the `Agent`
    tool.

0.0.49 (2026-05-24)
-------------------

-   IMPROVEMENT: Lint skill reimplementation
    Reimplement the `ase-code-lint` skill based on the `ase-docs-proofread` agent-based skill
    mechanics.

-   IMPROVEMENT: Task rename support
    Add the `ase-task-rename` skill, MCP tool, and CLI command.

-   IMPROVEMENT: Usage label suffix
    Append a `-usage` suffix to the weekly/session usage labels in `ase-statusline`.

-   BUGFIX: Getopt argument parsing
    Fix the argument parsing in the `getopt` MCP tool.

-   BUGFIX: Lint before version bump
    Always lint before the version bump on the "npm start publish" procedure.

-   BUGFIX: Service stop protection
    Protect the service stop and remove the event listeners later in `ase-service`.

-   CLEANUP: Hardened JSON parsing
    Harden the JSON parsing and refactor the redundant code in `ase-hook`.

-   CLEANUP: Tool code cleanup
    Clean up the code across `ase-mcp`, `ase-statusline`, `ase-task`, and `ase-config`.

-   CLEANUP: Workflow diagram update
    Update the workflow diagram to reflect the recent changes.

-   CLEANUP: Remaining proofread problems
    Fix the various remaining proofread problems in the texts.

0.0.48 (2026-05-24)
-------------------

(skipped because of publish problem)

0.0.47 (2026-05-24)
-------------------

(skipped because of publish problem)

0.0.46 (2026-05-24)
-------------------

-   FEATURE: Config management via MCP
    Allow `ase config` to be managed via MCP, too.

-   IMPROVEMENT: Proofread skill rework
    Greatly improve the `ase-docs-proofread` skill (better interactive dialog, sub-agent for
    investigation, more precise output).

-   IMPROVEMENT: Java and Maven support
    Add Java/Kotlin/Maven package support to the `ase-arch-discover` skill.

-   BUGFIX: Glob pattern parsing
    Fix the argument parsing with glob patterns in the skill option parsing.

-   CLEANUP: Proofreading problems
    Fix many proofreading problems across the documents.

0.0.45 (2026-05-24)
-------------------

-   IMPROVEMENT: Proofreading skill
    Add the new `ase-docs-proofread` skill.

-   IMPROVEMENT: Terminology document
    Add `docs/agentic-software-engineering.md` for some definitions.

-   IMPROVEMENT: README rendering
    Improve the rendering of `README.md`.

-   CLEANUP: Proofreading problems
    Fix many proofreading problems.

0.0.44 (2026-05-23)
-------------------

-   IMPROVEMENT: Persona style refinement
    Further improve the persona style in `ase-persona.md`.

0.0.43 (2026-05-23)
-------------------

-   IMPROVEMENT: Persona style refinement
    Further improve the persona style in `ase-persona.md`.

-   BUGFIX: Typo
    Fix a typo in the `ase-meta-changes` skill.

-   UPDATE: Dependency upgrade
    Upgrade NPM dependencies.

-   UPDATE: Documentation sync
    Update the documentation (`AGENTS.md`, configuration, setup, usage-tool) to reflect reality.

-   UPDATE: README wording
    Refine the README wording for more precision.

-   CLEANUP: Trailing blank lines
    Add back the missing trailing blank lines in the meta and skill files.

-   CLEANUP: Node modules ignored
    Explicitly ignore `node_modules` also in the plugin subdirectory.

0.0.42 (2026-05-23)
-------------------

-   FEATURE: KV batch interface
    Add a KV batch interface MCP tool to speed up the `ase-code-analyze` skill.

-   IMPROVEMENT: Code skill tenets
    Improve the tenets in the craft/resolve/refactor skills.

-   IMPROVEMENT: Lighter output styling
    Improve and lighten the output styling across the skills.

-   BUGFIX: KV store fixes
    Various bugfixes to the KV store.

-   CLEANUP: Analyze skill reformatting
    Reformat the `ase-code-analyze` skill.

-   CLEANUP: KV store cleanups
    Various cleanups to the KV store and skills.

0.0.41 (2026-05-23)
-------------------

-   IMPROVEMENT: HTTP request rate limiting
    Rate-limit the HTTP requests in `ase-skills.ts` to 4 concurrent ones.

-   IMPROVEMENT: Decision matrix as MCP tool
    Migrate the weighted decision matrix calculation of the "evaluate" skill into an MCP tool.

-   IMPROVEMENT: Discovery fetching as MCP tool
    Migrate the parallel WebFetch and sorting functionality of the "discover" skill into an MCP
    tool.

-   IMPROVEMENT: Discovery overview table
    Add the USP/Crux/Gotcha overview table also to the "discover" skill.

-   REFACTOR: HTTP client migration
    Migrate from the Axios to the OFetch NPM package.

-   CLEANUP: Redundant persona inclusion
    Remove the inclusion of `ase-persona.md` from all skill files, as it is part of the
    constitution.

0.0.40 (2026-05-22)
-------------------

-   CLEANUP: Precise skill tool calls
    Be more precise in calling the `Skill` tool.

-   REFACTORING: Control constructs factored out
    Factor out the control constructs from `ase-skill.md` into `ase-control.md` to have them
    available for `ase-persona.md`.

0.0.39 (2026-05-22)
-------------------

-   IMPROVEMENT: Code skill refinement
    Refine the `ase-code-craft`, `ase-code-refactor`, and `ase-code-resolve` skills.

-   IMPROVEMENT: Direct edit transition
    Directly transition at the end of craft/refactor/resolve to the edit skill.

0.0.38 (2026-05-22)
-------------------

-   IMPROVEMENT: Less verbose evaluation
    Reduce the verbose LLM output in the `ase-meta-evaluate` skill.

-   IMPROVEMENT: Derived task id
    Derive a task id if the current one is still `default` in the craft/resolve/refactor skills.

-   BUGFIX: Automatic sudo selection
    Automatically choose `sudo` for `npm install -g` commands when necessary in `ase setup`.

-   BUGFIX: Missing task id set
    Also set `ase-task-id` in the `ase-code-resolve` skill.

0.0.37 (2026-05-21)
-------------------

-   IMPROVEMENT: Verbose task listing
    Add a `-v`/`--verbose` option to the `ase-task-list` skill for explicitly requesting a verbose
    output.

-   IMPROVEMENT: Agent status to tmux
    Add support (via hooks) for the agent ready/busy status which is sent to tmux.

-   IMPROVEMENT: Copilot under PowerShell
    Add GitHub Copilot support under PowerShell (including newer hooks).

-   BUGFIX: Obsolete hook matcher
    Remove the obsolete matcher in the plugin hooks.

-   CLEANUP: Consistent dialog naming
    Use a consistent naming of the dialog across the skills.

0.0.36 (2026-05-18)
-------------------

-   IMPROVEMENT: Missing skill tags
    Add the missing `<skill>` tags to multiple skills (arch-discover, code-*, meta-*).

-   IMPROVEMENT: Persona overrules skills
    Give the persona style more ability to overrule the skill rules in `ase-skill.md`.

-   IMPROVEMENT: README restructuring
    Restructure the README (move the setup section to the top).

-   BUGFIX: Wrong counting
    Fix the counting in the `ase-meta-quorum` and `ase-meta-evaluate` skills.

-   BUGFIX: Wrong block count
    Fix the block count in the `ase-arch-analyze` skill.

-   BUGFIX: Getopt syntax issues
    Fix the XML, regexp, JSON, and other syntax issues in `ase-getopt.md`.

-   BUGFIX: Dialog option minimum
    Fix multiple issues in `ase-dialog.md` (require a minimum of 2 options for the user dialog
    tools).

-   BUGFIX: Missing closing quote
    Add the missing closing quote in the `ase-code-*` and `ase-task-*` skills.

-   BUGFIX: Auto option logic
    Fix the logic of the `-a`/`--auto` option in the `ase-code-{craft,refactor,resolve}` skills.

-   UPDATE: Design decisions documented
    Document the design decisions and OS context in the README.

-   CLEANUP: Reduced ambiguity
    Reduce the ambiguity and clean up the semantics in `ase-skill.md`, `ase-plan.md`, and multiple
    skills.

-   CLEANUP: Small skill cleanups
    Small cleanups across the skills.

0.0.35 (2026-05-18)
-------------------

-   BUGFIX: Plugin manifest commit
    Commit also the `plugin/package.json` updates on "npm start publish".

0.0.34 (2026-05-18)
-------------------

-   IMPROVEMENT: Operation modes diagram
    Draw an operation modes matrix diagram.

-   BUGFIX: Plugin version replacement
    Replace the version on "npm start publish" also in `plugin/package.json`.

-   CLEANUP: Diagram cropping
    Crop the diagram SVGs.

0.0.33 (2026-05-18)
-------------------

-   IMPROVEMENT: Enable and disable commands
    Add `ase setup enable` and `ase setup disable` for enabling/disabling ASE in the agent tool.

-   IMPROVEMENT: Truncated draft section
    Truncate the IMPLEMENTATION DRAFT section in the `ase-task-edit` skill.

-   IMPROVEMENT: Option parsing infrastructure
    Add an `ase-getopt.md` (plugin) and `ase-getopt.ts` (tool) for the option parsing.

-   IMPROVEMENT: Auto and next options
    Support the options `-a`/`--auto` (prefer A1) and `-n`/`--next` (choose step) in the
    `ase-code-{craft,refactor,resolve}` skills.

-   IMPROVEMENT: Next option in task skills
    Support the option `-n`/`--next` (choose step) in the
    `ase-task-{edit,implement,preflight,reboot}` skills.

-   IMPROVEMENT: Plan handling option
    Support the option `-p`/`--plan` (choose previous-plan handling) in the `ase-task-edit` skill.

-   BUGFIX: Plugin bundling
    Fix the bundling of the plugin into the tool.

-   BUGFIX: Premature implementation
    Try to force the `ase-code-{craft,refactor,resolve}` skills even harder to not immediately
    implement.

0.0.32 (2026-05-18)
-------------------

-   IMPROVEMENT: Markdown linting infrastructure
    Add the markdown linting infrastructure to the plugin directory.

-   IMPROVEMENT: PDF diagram versions
    Provide PDF versions of the docs diagrams.

-   UPDATE: Copilot information
    Add GitHub Copilot CLI information to the README.

-   BUGFIX: Workflow diagram source
    Fix the `docs/workflow` diagram source and SVG.

-   CLEANUP: Markdown linting issues
    Fix the markdown linting issues in the plugin skills and meta files.

0.0.31 (2026-05-18)
-------------------

-   IMPROVEMENT: Bundled plugin installation
    As `claude plugin install` does not support pinned versions, install the plugin from the bundled
    version of the NPM package.

-   IMPROVEMENT: Agent tool identification
    Provide `<ase-agent-tool/>` in the context and `ASE_AGENT_TOOL` in the environment to identify
    the agent tool.

-   IMPROVEMENT: Portable dialog tools
    Make the skills more portable by using `AskUserQuestion` in Claude Code and `ask_user` in GitHub
    Copilot CLI.

-   IMPROVEMENT: Task skill objectives
    Add `<skill>` tags and objectives to all `ase-task-*` skills and use them in the skill-started
    status output.

-   IMPROVEMENT: Persisted analysis findings
    Add the kv-store persistence of findings to the `ase-arch-analyze` skill and unify the kv key
    naming.

-   IMPROVEMENT: Setup status output
    Improve the status output and display the ASE version during the setup operations.

-   BUGFIX: Wrong frontmatter description
    Fix a wrong description in the `ase-task-delete` skill frontmatter.

0.0.30 (2026-05-17)
-------------------

-   REVAMPING: Plan mode abandoned
    Reimplement the `ase-task-*` skills to no longer use the agent harness "plan mode", as the
    `ExitPlanMode` tool is Claude Code specific and cannot be customized in any reasonable way.

0.0.29 (2026-05-16)
-------------------

-   IMPROVEMENT: Interactive next step
    At the end of the craft/resolve/refactor skills, interactively ask for the next step.

-   IMPROVEMENT: Key/value storage tools
    Provide a key/value storage MCP tool set for temporary information sharing in skills.

-   IMPROVEMENT: Problem persistence
    Use the new key/value MCP for persisting problems between `ase-code-analyze` and
    `ase-code-resolve`.

-   IMPROVEMENT: Package cohesion aspects
    Add the package-cohesion audit aspects (SA19-SA21) to the `ase-arch-analyze` skill.

-   IMPROVEMENT: Atomic config management
    Use an atomic cross-process config file management to avoid conflicts.

-   IMPROVEMENT: Service shutdown handling
    Improve the port handling and timeout handling in the MCP service shutdown.

-   IMPROVEMENT: In-flight request tracking
    Improve the SIGKILL handling and track the in-flight requests in the MCP service.

-   BUGFIX: Hook argument quoting
    Correctly quote the arguments on the env variable exports in the session-start hook.

-   BUGFIX: Service reconnect logic
    Fix the MCP service reconnect logic.

-   BUGFIX: Root-level config validation
    Fix the root-level config validation.

-   BUGFIX: Config path up-walking
    Fix the config path up-walking.

-   BUGFIX: Task id in session start
    Always set the task id in the session-start hook.

-   BUGFIX: Scope information display
    Fix the scope information display in `ase config`.

-   REFACTOR: Timestamp module
    Move the "timestamp" MCP tool into its own `ase-timestamp.ts` module.

0.0.28 (2026-05-16)
-------------------

-   IMPROVEMENT: Session end hook
    Add a "session-end" hook for removing the session storage again.

-   IMPROVEMENT: Per-project task storage
    Store the tasks per project and not per user.

-   IMPROVEMENT: Elaborate age specification
    Support a more elaborate age specification in the `ase task purge` command.

-   REFACTORING: Bundled command registration
    Bundle the logic, CLI parsing, and MCP service registration together.

-   REFACTORING: Shared service probing
    Move the shared service probing into the service functionality.

0.0.27 (2026-05-16)
-------------------

-   IMPROVEMENT: Task list as table
    Render the `ase-task-list` output as a Markdown table with mtime information.

-   IMPROVEMENT: Break construct support
    Support the `<break/>` construct for an early stop of the `<for/>` repetition in skills.

-   IMPROVEMENT: XML syntax clarification
    Clarify the XML syntax usage in the meta skill for a more precise LLM behavior.

-   IMPROVEMENT: Aligned skill outputs
    Align the outputs across the skills (`ase-task-list`, craft/refactor/resolve family, etc.).

-   IMPROVEMENT: Disagreement fallback
    Provide a fallback definition for disagreement in the `ase-meta-quorum` skill.

-   IMPROVEMENT: Agentic levels diagram
    Add an agentic levels diagram with descriptions to the documentation.

-   IMPROVEMENT: Java and Kotlin support
    Provide a rough Java/Kotlin package support in the `ase-code-insight` skill.

-   IMPROVEMENT: Stronger error typing
    Improve the TypeScript typing (use `unknown` for caught errors) in the tool.

-   IMPROVEMENT: Session id verification
    Verify the given session id in `ase hook session-start`.

-   BUGFIX: Persona style application
    Ensure the skills apply the `agent.persona` style correctly.

-   BUGFIX: Language-aware prohibitions
    Make the constitution semicolon/brace prohibitions language-aware.

-   BUGFIX: Allowed-tools lists
    Fix the allowed-tools lists and add the missing tool entries in multiple skills.

-   BUGFIX: Typos and references
    Fix the typos, wrong references, and syntax issues across the skills.

-   BUGFIX: Control-flow logic
    Fix a logic bug in the skill control-flow handling.

-   BUGFIX: Newer timestamp tool
    Use the newer `timestamp` MCP tool (drop the positional parameter).

-   BUGFIX: Service probe leak
    Do not leak a resource in the MCP service probe.

-   BUGFIX: Plan mode clearing
    Omit clearing the plan mode outside the plan mode in `ase-task-edit`.

-   BUGFIX: Swapped startup output
    Fix the swapped tool and plugin in the startup output.

-   REFACTOR: Task list skill
    Split the `task list` functionality into an own `ase-task-list` skill.

-   REFACTOR: Shared probe module
    Factor out the identical probe code into an own module in the MCP service.

-   UPDATE: Dependency upgrade
    Upgrade NPM dependencies.

-   CLEANUP: Skill cleanups
    Multiple cleanups to various skills.

-   CLEANUP: Task list skill cleanup
    Clean up the `ase-task-list` skill.

-   CLEANUP: Debugging leftovers
    Remove the debugging leftovers.

0.0.26 (2026-05-13)
-------------------

-   IMPROVEMENT: Faster startup times
    Speed up the startup times by migrating from `npm view` to the cache-using `update-notifier`.

-   IMPROVEMENT: Version in statusline
    Provide the Claude Code and ASE version in the statusline under `%V`.

-   CLEANUP: Output style placeholder
    Rename the `ase statusline` placeholder `%o` to `%O` for the output style.

0.0.25 (2026-05-13)
-------------------

-   IMPROVEMENT: Skill renaming for grouping
    Rename the skills for a clearer grouping: `ase-meta-task` to `ase-task-id`, `ase-spec-*` to
    `ase-task-*`, and `ase-code-{changes,commit}` to `ase-meta-{changes,commit}`.

0.0.24 (2026-05-11)
-------------------

-   IMPROVEMENT: Task id honored
    Improve the edit skill to honor a task-id.

-   CLEANUP: Code cleanups
    Various code cleanups.

0.0.23 (2026-05-11)
-------------------

-   IMPROVEMENT: Timestamp MCP tool
    Add a "timestamp" MCP tool to the service for use by the skills.

-   IMPROVEMENT: Task id as prefix
    Support a task id as prefix for the craft/refactor/resolve skills.

-   IMPROVEMENT: Timestamp tool adoption
    Use the new "timestamp" MCP tool instead of `Bash(date)` to figure out the time.

-   CLEANUP: Code skill alignment
    Align the craft/refactor/resolve skills.

0.0.22 (2026-05-10)
-------------------

-   IMPROVEMENT: Task deletion after implement
    At the end of the `ase-spec-implement` skill, delete the task.

-   IMPROVEMENT: Headless mode support
    Support the `ASE_HEADLESS` mode for skipping the constitution banner under `claude -p` use by
    claudeX.

-   IMPROVEMENT: Initial Copilot support
    Add the initial GitHub Copilot CLI support to the `ase setup` commands and provide the
    marketplace/plugin JSON config files.

-   IMPROVEMENT: Extended changes context
    Improve the `ase-code-changes` skill by extending its context when necessary.

-   IMPROVEMENT: Copilot pre-tool-use hook
    Add support for the Copilot preToolUse hook.

-   IMPROVEMENT: Copilot status line
    Add a `-t`/`--tool` option to `ase statusline` and support the GitHub Copilot CLI status line.

-   BUGFIX: Allowed-tools Bash pattern
    Fix the allowed-tools Bash pattern syntax in the `ase-meta-chat` skill.

-   BUGFIX: Session name in statusline
    Omit the session name in the `ase statusline` output for now.

-   BUGFIX: Development mode base directory
    `ase setup install` in development mode has to use the ASE base directory, not the cwd.

-   BUGFIX: Log output stream
    Send the logs to stderr instead of stdout to not interfere with e.g. MCP on stdin/stdout.

-   UPDATE: Copilot support mentioned
    Mention the rudimentary GitHub Copilot CLI support in the README.

-   CLEANUP: Debugging leftovers
    Remove the debugging leftovers in `plugin/hooks/hooks.json` and `ase-hook.ts`.

-   CLEANUP: Indentation
    Fix the indentation in the `ase-spec-implement` skill.

0.0.21 (2026-05-07)
-------------------

-   IMPROVEMENT: Lint aspect refinement
    Expand and refine the `ase-code-lint` aspects A06/A20 with sub-aspects, severity guidance, and
    technology-neutral rules.

-   IMPROVEMENT: Diagram clip warning
    Emit a clip warning in the rendered diagram and honor the env-driven terminal size defaults in
    the MCP service.

-   IMPROVEMENT: Finding report filters
    Add evidence-grounded and contract-aware finding-report filters to the skill meta rules.

-   BUGFIX: Service health check
    Add a health check and auto-reconnect/restart when the MCP service is unavailable.

-   UPDATE: Dependency upgrade
    Upgrade dependencies.

0.0.20 (2026-05-04)
-------------------

-   CLEANUP: Chalk-based coloring
    Switch `ase statusline` from hard-coded ANSI sequences to the use of the NPM package `chalk`.

-   IMPROVEMENT: Additional placeholders
    Provide a bunch of additional `%x` placeholders for various token, cost, and Git information in
    `ase statusline`.

-   IMPROVEMENT: Icon and label options
    Provide `--no-icons` and `--no-labels` options to `ase statusline`.

-   IMPROVEMENT: Statusline refactoring
    Refactor the `ase statusline` CLI command to support a flexible expansion of information and
    coloring.

-   IMPROVEMENT: Plugin install retries
    Retry `claude plugin install` up to 3 times in `ase setup`.

-   BUGFIX: Missing plugin tolerated
    Tolerate a missing plugin on `ase setup uninstall` and `ase setup update`.

-   BUGFIX: Unsupported dialog markup
    Remove the unsupported Markdown formatting from the `ase-spec-edit` user dialog.

0.0.19 (2026-05-03)
-------------------

-   IMPROVEMENT: Statusline command
    Provide an `ase statusline` CLI command (factored out of the claudeX sister project).

0.0.18 (2026-05-03)
-------------------

-   FEATURE: Architecture analysis skill
    Add the `ase-arch-analyze` skill (formerly `ase-code-audit`/`ase-code-architect`) for a software
    architecture review.

-   FEATURE: Two-phase task workflow
    Switch to a new task-based (plan-mode supported) two-phase workflow.

-   FEATURE: Task edit command
    Add an `ase task edit <id>` CLI command for task plan editing.

-   FEATURE: Accepted severity reporting
    Support the ACCEPTED severity and clustered tradeoff reporting in the arch-analyze skill.

-   IMPROVEMENT: Extended Bash allow-list
    Extend the plugin Bash allow-list (git read-only commands, analysis pipes, audit metrics).

-   IMPROVEMENT: Service stop on update
    Always stop the service on update and uninstall.

-   IMPROVEMENT: Routed overview diagram
    Route the architecture overview diagram through the `ase-meta-diagram` skill.

-   IMPROVEMENT: Arch-analyze polish
    Polish the arch-analyze skill (compactness, control-flow hint, unicode diagrams, code-based
    architecture detection).

-   IMPROVEMENT: Status messages
    Provide a status message during the operations.

-   IMPROVEMENT: Standalone skill hint
    Add a standalone skill hint.

-   REFACTOR: Settings file dropped
    Drop `plugin/settings.json` and move the Bash allow-list into the skill `allowed-tools`.

-   REFACTOR: Arch-analyze aspect restructuring
    Restructure the arch-analyze aspects (merge redundancies, split governance, render via `ase
    diagram`).

-   BUGFIX: Wrong block count
    Fix the block count in the arch-analyze skill (5 to 6).

-   BUGFIX: Skill name typo
    Fix a typo in the skill name (`ase-arch-analyse` to `ase-arch-analyze`).

-   UPDATE: Version bump
    Bump the version to 0.0.18.

-   UPDATE: Documentation sync
    Update the documentation for the latest changes.

-   CLEANUP: Trailing whitespaces
    Remove all trailing whitespaces from the source files.

-   CLEANUP: Frontmatter and setup cleanup
    Cleanup the frontmatters, setup code, and reduce the text.

-   CLEANUP: Neutralized examples
    Neutralize the project-specific examples in the anomaly annotation rules.

-   CLEANUP: Diagram skill reference
    Rename the `ase-diagram` skill reference to `ase-meta-diagram`.

0.0.17 (2026-05-03)
-------------------

-   CLEANUP: Unused variables
    Remove the unused variables except for the "boxing" (coming soon).

-   CLEANUP: Chat skill renamed
    Rename `ase-meta-llm` to `ase-meta-chat` to better fit to `ase-meta-search`.

-   IMPROVEMENT: Task editing commands
    Support `ase task list|load|save|delete|purge` for task editing.

-   IMPROVEMENT: Persona and task configuration
    Let the persona and task be configured with `ase-meta-{persona,task}` and the corresponding MCP
    tool.

-   IMPROVEMENT: Persona activation on startup
    Activate the persona on startup and provide the user and project information initially, too.

-   IMPROVEMENT: Tool lookup in PATH
    Ensure tools like `npm` and `claude` are found in `$PATH`.

-   IMPROVEMENT: Version hint on startup
    Show the current and latest version on startup, with a hint on available updates.

-   IMPROVEMENT: External command running
    Improve the running of external commands (suppress the output on success, emit it on failure).

-   UPDATE: Prerequisites documented
    Document the prerequisites.

-   CLEANUP: Usage documentation
    Update the documentation and improve the wording for the usage of the plugin and tool.

0.0.16 (2026-05-02)
-------------------

-   IMPROVEMENT: Developer bootstrapping files
    Add the `bin/ase{,.sh,js}` bootstrapping files for developers.

-   IMPROVEMENT: Setup convenience commands
    Add the `ase setup install|update|uninstall` commands for convenience.

-   IMPROVEMENT: Tightened diagram output
    Tighten the `ase-meta-diagram` skill output to suppress extraneous text.

-   BUGFIX: Pre-tool-use hook
    Fix the pre-tool-use hook in `plugin/hooks/hooks.json`.

-   UPDATE: Dependency upgrade
    Upgrade dependencies.

-   CLEANUP: Documentation cleanup
    Cleanup the docs.

0.0.15 (2026-05-02)
-------------------

-   FEATURE: Diagram MCP tool
    Add a `diagram` tool to the `ase` MCP service and use it in the `ase-meta-diagram` skill.

-   FEATURE: MCP bridge command
    Add an `ase mcp` command which uses the `ase service` under the hood.

-   FEATURE: Automatic service installation
    Auto-install the MCP service.

-   IMPROVEMENT: Diagram command improvement
    Improve the `ase diagram` command (TTY querying, output truncation, color mode detection).

-   IMPROVEMENT: Diagram skill simplification
    Improve the `ase-meta-diagram` skill (drop the diagram-width option since the LLM no longer
    renders).

-   IMPROVEMENT: MCP service always allowed
    Always allow the MCP service.

-   BUGFIX: Service start and stop warnings
    Fix the warnings on `ase service start/stop`.

-   UPDATE: Service availability documented
    Document the MCP service availability.

-   CLEANUP: Diagram skill cleanup
    Final cleanup to the diagram skill.

0.0.14 (2026-05-01)
-------------------

-   FEATURE: Diagram CLI subcommand
    Add an `ase diagram` CLI subcommand that renders Mermaid source to ASCII/Unicode.

-   FEATURE: Diagram skill
    Add an `ase-meta-diagram` skill with diagram rendering rules.

-   BUGFIX: Hook-based settings
    Convert the not allowed `plugin/settings.json` into a hook-based approach.

-   IMPROVEMENT: Routed diagram rendering
    Route all meta and consumer skills through the `ase-diagram` skill.

-   UPDATE: Dependency upgrade
    Upgrade dependencies.

0.0.13 (2026-04-30)
-------------------

-   FEATURE: Component discovery skill
    Add the comprehensive `ase-arch-discover` skill.

0.0.12 (2026-04-30)
-------------------

-   FEATURE: Alternative evaluation skill
    Add the comprehensive `ase-meta-evaluate` skill.

-   IMPROVEMENT: Persona skill improvement
    Improve the persona skill.

-   IMPROVEMENT: Explain skill improvement
    Improve the explain skill.

-   IMPROVEMENT: Colored bullets
    Use colored bullets.

-   BUGFIX: Markdown fixes
    Fix the markdown.

-   UPDATE: More project information
    Provide more information about ASE.

-   CLEANUP: Documentation consolidation
    Consolidate the documentation in the `docs/` folder.

-   CLEANUP: Skill and icon cleanups
    Minor skill and icon cleanups.

0.0.11 (2026-04-27)
-------------------

-   BUGFIX: Markdown in persona skill
    Fix the markdown in the `/ase-meta-persona` skill.

-   UPDATE: Task skill documented
    Document the `/ase-meta-task` skill and the `ase hook session-start` command.

0.0.10 (2026-04-27)
-------------------

-   FEATURE: Task id skill
    Add a task skill (`ase-meta-task`) for get/set of a unique task id.

-   FEATURE: Skill context variables
    Add variables for locating files in the skill context.

-   IMPROVEMENT: Git commands allowed
    Allow git commands in the code-changes and code-commit skills.

-   IMPROVEMENT: Session start hook in CLI
    Move the session-start hook code into the CLI as `ase hook session-start`.

-   IMPROVEMENT: Hook on compaction
    Also run the session-start hook on compaction.

-   IMPROVEMENT: Task id environment variable
    Honor the `ASE_TASK_ID` environment variable for the task id.

-   IMPROVEMENT: More startup context
    Provide more startup context information.

-   IMPROVEMENT: Optional objective output
    Skip the objective output if not given in the skill.

-   BUGFIX: Allowed-tools Bash pattern
    Fix the allowed-tools Bash pattern for the ase commands in the skills.

-   CLEANUP: Descriptor fields
    Add more fields to the plugin and marketplace descriptors.

-   CLEANUP: Session start hook script
    Cleanup the session-start hook script.

-   CLEANUP: Config scope description
    Improve the description of the config scopes.

-   CLEANUP: Task config placement
    Place the task config under the project for now.

-   CLEANUP: Overlapping config variable
    Remove the `project.process.control` variable (it overlaps with `agent.process.autonomy`).

-   CLEANUP: Persona skill renamed
    Rename and clean up the persona skill.

0.0.9 (2026-04-22)
------------------

-   FEATURE: Persona skill
    Add a persona skill (`ase-meta-persona`).

-   FEATURE: Scoped configuration
    Provide a scoped configuration with a `--scope` option.

-   FEATURE: Configuration defaults
    Support default values in the configuration.

-   FEATURE: Agent configuration variables
    Add the agent configuration variables.

-   FEATURE: Unique session id
    Provide a unique session id in the session-start hook context.

-   IMPROVEMENT: Multi-line skill descriptions
    Use multi-line descriptions in the skill metadata.

-   BUGFIX: Makefile path and markup
    Fix the Makefile path and README markup.

-   UPDATE: README documentation
    Update the README documentation.

0.0.8 (2026-04-20)
------------------

-   FEATURE: Config init command
    Add an `ase config init <type>` command.

-   FEATURE: Service status subcommands
    Add the `status` and `ping` subcommands to the service.

-   FEATURE: Logging infrastructure
    Provide a logging infrastructure with string-based log levels.

-   FEATURE: Config edit loop
    Support an edit loop in `ase config edit`.

-   FEATURE: Partial key paths
    Support partial key paths in the configuration access.

-   IMPROVEMENT: Robust daemon handling
    Make the daemon timer, shutdown, port handling, and service probing more robust.

-   IMPROVEMENT: Service uptime reporting
    Report the service uptime on `ase service status`.

-   IMPROVEMENT: Atomic configuration set
    Make the configuration set operation atomic.

-   IMPROVEMENT: Send command and portability
    Improve the send command, output style, and spawning portability.

-   IMPROVEMENT: Commander-native style
    Adopt a more Commander-native style and restore the global `-V`/`--version` option.

-   IMPROVEMENT: Boxing renaming
    Improve the table output header and rename `box` to `boxing` with the classification factored
    out.

-   IMPROVEMENT: Command reordering
    Reorder the commands and code blocks for a better intuitiveness.

-   BUGFIX: Full logfile reading
    Avoid reading the entire logfile and fix the logging format.

-   BUGFIX: Incorrect log levels
    Handle incorrect log levels gracefully.

-   BUGFIX: Path comparison
    Resolve the real paths before comparison and stop at the git repository boundary.

-   BUGFIX: Delete operation pattern
    Mirror the `set` pattern in the `delete` operation.

-   BUGFIX: File descriptor leak
    Close a file descriptor leak.

-   BUGFIX: Non-scalar value validation
    Validate the non-scalar values and intermediate node types.

-   BUGFIX: Consistent exit codes
    Make the exit codes consistent across the commands.

-   BUGFIX: Undefined value handling
    Explicitly handle undefined values.

-   BUGFIX: Unnecessary confirmations
    Avoid unnecessary confirmation prompts.

-   UPDATE: Documentation and manpages
    Update the documentation and manual pages.

-   CLEANUP: Code and config cleanup
    Cleanup the code, eslint config, port handling, and terminal responses.

-   CLEANUP: Obsolete README and options
    Remove the obsolete README and unused options.

-   CLEANUP: Settings and project name
    Define the settings and add the project name.

0.0.7 (2026-04-19)
------------------

-   FEATURE: Config edit command
    Provide an `ase config edit` command and update the manual page.

-   FEATURE: Configuration schema validation
    Add schema validation for the configuration.

-   IMPROVEMENT: Config list as table
    Render `ase config list` as a nice table.

-   IMPROVEMENT: Non-leaf key complaint
    Complain on non-leaf keys in the configuration.

-   IMPROVEMENT: Type safety
    Improve the type safety and strictness.

-   REFACTOR: Commander migration
    Upgrade to Commander from Yargs and remove the agent stuff for now.

-   REFACTOR: Separate arguments
    Switch to separate arguments.

-   CLEANUP: Config command cleanup
    Cleanup the `ase config` command and config handling.

0.0.6 (2026-04-18)
------------------

-   FEATURE: Service command
    Add a `service` command to the CLI tool.

-   FEATURE: Top-level configuration
    Add a top-level configuration.

-   FEATURE: Spec skills
    Add the new spec skills (preflight, edit, implement).

-   IMPROVEMENT: Diagramming skill improvement
    Improve the diagramming skill with unicode character hints and if-construct support.

-   IMPROVEMENT: Diagram rendering rules
    Add diagram rendering rules and optional diagrams in the elaborate skill.

-   IMPROVEMENT: Diagram versus table
    Clarify the diagram vs. table distinction in the skill output.

-   IMPROVEMENT: Analyze skill improvement
    Improve the analyze/elaborate skills.

-   IMPROVEMENT: Spec skill improvement
    Improve the spec skills.

-   IMPROVEMENT: Language-agnostic linting
    Make the code-lint skill language-agnostic.

-   IMPROVEMENT: Model enforcement dropped
    Do not enforce the Opus model for now.

-   UPDATE: Dependency upgrade
    Update the dependencies.

-   CLEANUP: ASE directory ignored
    Ignore the `.ase` directory.

-   CLEANUP: Tool code cleanup
    Various tool and main code cleanups.

-   CLEANUP: Skill information reformatting
    Simplify and reformat the skill information.

0.0.5 (2026-04-13)
------------------

-   IMPROVEMENT: Full license text
    Add the license in full text.

-   IMPROVEMENT: README improvement
    Improve the README with a support hint and a "see also" section.

-   IMPROVEMENT: Quorum skill improvement
    Improve the quorum skill.

-   IMPROVEMENT: Collapsed skill items
    Experiment with collapsed items in the skills.

-   IMPROVEMENT: Commit skill finalized
    Finalize the commit skill.

-   BUGFIX: Plugin file references
    Fix the references in the plugin skill and agent files.

-   BUGFIX: Missing plugin entries
    Add the missing entries to the plugin configuration.

-   CLEANUP: Publish step fixes
    Cleanup and fix the "npm start publish" step.

-   CLEANUP: Argument syntax alignment
    Align the README and the syntax of the arguments in the skill files.

-   CLEANUP: Search skill renamed
    Rename the skill and agent from `ase-meta-websearch` to `ase-meta-search`.

0.0.4 (2026-04-13)
------------------

-   IMPROVEMENT: README improvement
    Improved the README with a diagram, caution hint, and homepage URL.

-   IMPROVEMENT: Commit skill
    Added the `ase-code-commit` skill.

-   IMPROVEMENT: ASE logo
    Added the ASE logo.

-   IMPROVEMENT: GitHub release information
    Provide the GitHub release information on "npm start publish".

-   BUGFIX: Missing SVG file
    Added the missing building-blocks SVG file.

-   UPDATE: Diagram update
    Updated the building-blocks and coding-assistance diagrams.

-   CLEANUP: README and skill cleanups
    Various README and plugin skill cleanups.

0.0.3 (2026-04-12)
------------------

-   IMPROVEMENT: Refactoring skill
    Add the `ase-code-refactor` skill.

0.0.2 (2026-04-12)
------------------

-   IMPROVEMENT: Version printing
    Print the version on loading.

0.0.1 (2026-04-12)
------------------

-   IMPROVEMENT: Plugin infrastructure
    Added the Claude Code plugin infrastructure with marketplace support.

-   IMPROVEMENT: CLI tool skeleton
    Added the CLI tool skeleton with a yargs-based command structure.

-   IMPROVEMENT: Imported skills
    Imported the lint, craft, insight, and other Claude Code skills.

-   IMPROVEMENT: GitHub Pages site
    Added the GitHub Pages site and the static deployment workflow.

-   IMPROVEMENT: Build infrastructure
    Added the top-level build infrastructure with stx integration.

-   IMPROVEMENT: Agent constitution
    Added the constitution (`AGENTS.md`) for the agent instructions.

-   IMPROVEMENT: Analysis skill improvement
    Improved the analysis and insight skills.

-   IMPROVEMENT: Error handling
    Improved the error handling and duplicate hook avoidance.

-   BUGFIX: Descriptions and typos
    Fixed the descriptions, references, typos, and comments.

-   UPDATE: Karpathy guidelines inlined
    Inlined the Andrej Karpathy coding guidelines.

-   UPDATE: AGENTS.md switch
    Switched from `CLAUDE.md` to `AGENTS.md` with a hook-based delivery.

-   UPDATE: Consistent plugin prefix
    Used the `ase-` prefix for the plugin parts consistently.

-   CLEANUP: Code and config cleanups
    Various code and configuration cleanups.

0.0.0 (2026-04-01)
------------------

(first rough cut of library)


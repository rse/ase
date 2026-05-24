
ChangeLog
=========

0.0.49 (2026-05-24)
-------------------

- IMPROVEMENT: reimplement "ase-code-lint" skill based on "ase-docs-proofread" agent-based skill mechanics
- IMPROVEMENT: add "ase-task-rename" skill, MCP tool and CLI command
- BUGFIX: fix argument parsing in `getopt` MCP tool
- BUGFIX: always lint before version bump on "npm start publish" procedure
- CLEANUP: update workflow diagram to reflect recent changes
- CLEANUP: fix various remaining proofread problems in texts

0.0.48 (2026-05-24)
-------------------

(skipped because of publish problem)

0.0.47 (2026-05-24)
-------------------

(skipped because of publish problem)

0.0.46 (2026-05-24)
-------------------

- FEATURE: allow `ase config` to be managed via MCP, too
- IMPROVEMENT: greatly improve `ase-docs-proofread` skill (better interactive dialog, sub-agent for investigation, more precise output)
- IMPROVEMENT: add Java/Kotlin/Maven package support to `ase-arch-discover` skill
- BUGFIX: fix argument parsing with glob patterns in skill option parsing
- CLEANUP: fix many proofreading problems across documents

0.0.45 (2026-05-24)
-------------------

- IMPROVEMENT: add new "ase-docs-proofread" skill
- IMPROVEMENT: add docs/agentic-software-engineering.md for some definitions
- IMPROVEMENT: improve rendering of README.md
- CLEANUP: fix many proofreading problems

0.0.44 (2026-05-23)
-------------------

- IMPROVEMENT: further improve persona style in `ase-persona.md`

0.0.43 (2026-05-23)
-------------------

- IMPROVEMENT: further improve persona style in `ase-persona.md`
- BUGFIX: fix typo in `ase-meta-changes` skill
- UPDATE: upgrade NPM dependencies
- UPDATE: update documentation (AGENTS.md, configuration, setup, usage-tool) to reflect reality
- UPDATE: refine README wording for more precision
- CLEANUP: add back missing trailing blank lines in meta and skill files
- CLEANUP: explicitly ignore `node_modules` also in plugin subdirectory

0.0.42 (2026-05-23)
-------------------

- FEATURE: add KV batch interface MCP tool to speed up `ase-code-analyze` skill
- IMPROVEMENT: improve the tenets in the craft/resolve/refactor skills
- IMPROVEMENT: improve and lighten the output styling across skills
- BUGFIX: various bugfixes to KV store
- CLEANUP: reformat "ase-code-analyze" skill
- CLEANUP: various cleanups to KV store and skills

0.0.41 (2026-05-23)
-------------------

- IMPROVEMENT: rate-limit the HTTP requests in ase-skills.ts to 4 concurrent ones
- IMPROVEMENT: migrate the weighted decision matrix calculation of the "evaluate" skill into a MCP tool
- IMPROVEMENT: migrate the parallel WebFetch and sorting functionality of the "discover" skill into a MCP tool
- IMPROVEMENT: add USP/Crux/Gotcha overview table also to "discover" skill
- REFACTOR: migrate from Axios to OFetch NPM package
- CLEANUP: remove inclusion of "ase-persona.md" from all skill files (is part of constitution)

0.0.40 (2026-05-22)
-------------------

- CLEANUP: be more precise in calling the "Skill" tool
- REFACTORING: factor our control constructs from ase-skill.md into ase-control.md to have them available for ase-persona.md

0.0.39 (2026-05-22)
-------------------

- IMPROVEMENT: refine `ase-code-craft`, `ase-code-refactor`, and `ase-code-resolve` skills
- IMPROVEMENT: directly transition at end of craft/refactor/resolve to edit skill

0.0.38 (2026-05-22)
-------------------

- IMPROVEMENT: reduce verbose LLM output in `ase-meta-evaluate` skill
- IMPROVEMENT: derive a task id if the current is still "default" in craft/resolve/refactor skills
- BUGFIX: automatically choose "sudo" for "npm install -g" commands when necessary in "ase setup"
- BUGFIX: also set ase-task-id in `ase-code-resolve` skill

0.0.37 (2026-05-21)
-------------------

- IMPROVEMENT: add -v|--verbose option to "ase-task-list" skill for explicitly requesting verbose output
- IMPROVEMENT: add support (via hooks) for agent ready/busy status which is send to tmux
- IMPROVEMENT: add Github Copilot support under PowerShell (including newer hooks)
- BUGFIX: remove obsolete matcher in plugin hooks
- CLEANUP: use consistent naming of dialog across skills

0.0.36 (2026-05-18)
-------------------

- IMPROVEMENT: add missing `<skill>` tags to multiple skills (arch-discover, code-*, meta-*)
- IMPROVEMENT: give persona style more ability to overrule skill rules in ase-skill.md
- IMPROVEMENT: restructure README (move setup section to top)
- BUGFIX: fix counting in `ase-meta-quorum` and `ase-meta-evaluate` skills
- BUGFIX: fix block count in `ase-arch-analyze` skill
- BUGFIX: fix XML, regexp, JSON, and other syntax issues in ase-getopt.md
- BUGFIX: fix multiple issues in ase-dialog.md (require minimum 2 options for user dialog tools)
- BUGFIX: add missing closing quote in ase-code-{craft,refactor,resolve} and ase-task-{edit,implement,preflight,reboot} skills
- BUGFIX: fix logic of -a/--auto option in ase-code-{craft,refactor,resolve} skills
- UPDATE: document design decisions and OS context in README
- CLEANUP: reduce ambiguity and clean up semantics in ase-skill.md, ase-plan.md, and multiple skills
- CLEANUP: small cleanups across skills

0.0.35 (2026-05-18)
-------------------

- BUGFIX: commit also plugin/package.json updates on "npm start publish"

0.0.34 (2026-05-18)
-------------------

- IMPROVEMENT: draw a operation modes matrix diagram
- BUGFIX: replace version on "npm start publish" also in plugin/package.json
- CLEANUP: crop diagram SVGs

0.0.33 (2026-05-18)
-------------------

- IMPROVEMENT: add "ase setup enable" and "ase setup disable" for enabling/disabling ASE in the agent tool
- IMPROVEMENT: truncate IMPLEMENTATION DRAFT section in "ase-task-edit" skill
- IMPROVEMENT: add a ase-getopt.md (plugin) and ase-getopt.ts (tool) for option parsing
- IMPROVEMENT: support option -a|--auto (prefer A1) and -n|--next (choose step) in "ase-code-{craft,refactor,resolve}" skills
- IMPROVEMENT: support option -n|--next (choose step) in "ase-task-{edit,implement,preflight,reboot}" skills
- IMPROVEMENT: support option -p|--plan (choose previous-plan handling) in "ase-task-edit" skill
- BUGFIX: fix bundling of plugin into tool
- BUGFIX: try to force "ase-code-{craft,refactor,resolve}" skills even hard to not immediately implement.

0.0.32 (2026-05-18)
-------------------

- IMPROVEMENT: add markdown linting infrastructure to plugin directory
- IMPROVEMENT: provide PDF versions of docs diagrams
- UPDATE: add Github Copilot CLI information to README
- BUGFIX: fix docs/workflow diagram source and SVG
- CLEANUP: fix markdown linting issues in plugin skills and meta files

0.0.31 (2026-05-18)
-------------------

- IMPROVEMENT: as "claude plugin install" does not support pinned versions, install plugin from bundled version of NPM package
- IMPROVEMENT: provide `<ase-agent-tool/>` in context and `ASE_AGENT_TOOL` in environment to identify the agent tool
- IMPROVEMENT: make skills more portable by using `AskUserQuestion` in Claude Code and `ask_user` in Github Copilot CLI
- IMPROVEMENT: add `<skill>` tags and objectives to all `ase-task-*` skills and use them in skill-started status output
- IMPROVEMENT: add kv-store persistence of findings to `ase-arch-analyze` skill and unify kv key naming
- IMPROVEMENT: improve status output and display ASE version during setup operations
- BUGFIX: fix wrong description in `ase-task-delete` skill frontmatter

0.0.30 (2026-05-17)
-------------------

- REVAMPING: reimplement ase-task-* skills to no longer use agent
  harness "plan mode" as especially the `ExitPlanMode` tool is Claude
  Code specific and cannot be customized and not controlled in any
  reasonable way.

0.0.29 (2026-05-16)
-------------------

- IMPROVEMENT: at end of craft/resolve/refactor skills, interactively ask for next step
- IMPROVEMENT: provide a key/value storage MCP tool set for temporary information sharing in skills
- IMPROVEMENT: use new key/value MCP for persisting problems between "ase-code-analyze" and "ase-code-resolve"
- IMPROVEMENT: add package-cohesion audit aspects (SA19-SA21) to ase-arch-analyze skill
- IMPROVEMENT: use atomic cross-process config file management to avoid conflicts
- IMPROVEMENT: improve port handling and timeout handling in MCP service shutdown
- IMPROVEMENT: improve SIGKILL handling and track in-flight requests in MCP service
- BUGFIX: correctly quote arguments on env variable exports in session-start hook
- BUGFIX: fix MCP service reconnect logic
- BUGFIX: fix root-level config validation
- BUGFIX: fix config path up-walking
- BUGFIX: always set task id in session-start hook
- BUGFIX: fix scope information display in ase config
- REFACTOR: move "timestamp" MCP tool into its own ase-timestamp.ts module

0.0.28 (2026-05-16)
-------------------

- IMPROVEMENT: add a "session-end" hook for removing the session storage again
- IMPROVEMENT: store tasks per project and not per user
- IMPROVEMENT: support more elaborate age specification in "ase task purge" command
- REFACTORING: bundle logic, CLI parsing and MCP service registration together
- REFACTORING: move shared service probing into service functionality

0.0.27 (2026-05-16)
-------------------

- IMPROVEMENT: render the `ase-task-list` output as a Markdown table with mtime information
- IMPROVEMENT: support `<break/>` construct for early stop of `<for/>` repetition in skills
- IMPROVEMENT: clarify XML syntax usage in meta skill for more precise LLM behavior
- IMPROVEMENT: align outputs across skills (`ase-task-list`, craft/refactor/resolve family, etc.)
- IMPROVEMENT: provide fallback definition for disagreement in `ase-meta-quorum` skill
- IMPROVEMENT: add agentic levels diagram with descriptions to documentation
- IMPROVEMENT: provide rough Java/Kotlin package support in `ase-code-insight` skill
- IMPROVEMENT: improve TypeScript typing (use `unknown` for caught errors) in tool
- IMPROVEMENT: verify given session id in `ase hook session-start`
- BUGFIX: ensure skills apply `agent.persona` style correctly
- BUGFIX: make constitution semicolon/brace prohibitions language-aware
- BUGFIX: fix allowed-tools lists and add missing tool entries in multiple skills
- BUGFIX: fix typos, wrong references, and syntax issues across skills
- BUGFIX: fix logic bug in skill control-flow handling
- BUGFIX: use newer `timestamp` MCP tool (drop positional parameter)
- BUGFIX: do not leak resource in MCP service probe
- BUGFIX: omit clearing plan mode outside plan mode in `ase-task-edit`
- BUGFIX: fix swapped tool and plugin in startup output
- REFACTOR: split `task list` functionality into own `ase-task-list` skill
- REFACTOR: factor out identical probe code into own module in MCP service
- UPDATE: upgrade NPM dependencies
- CLEANUP: multiple cleanups to various skills
- CLEANUP: cleanup `ase-task-list` skill
- CLEANUP: remove debugging leftovers

0.0.26 (2026-05-13)
-------------------

- IMPROVEMENT: speed up startup times by migrating from "npm view" to cache-using "update-notifier"
- IMPROVEMENT: provide Claude Code and ASE version in statusline under %V
- CLEANUP: rename "ase statusline" placeholder %o to %O for output style

0.0.25 (2026-05-13)
-------------------

- IMPROVEMENT: rename skills for clearer grouping: `ase-meta-task` →
  `ase-task-id`, `ase-spec-edit` → `ase-task-edit`, `ase-spec-implement`
  → `ase-task-implement`, `ase-spec-preflight` → `ase-task-preflight`,
  `ase-code-changes` → `ase-meta-changes`, `ase-code-commit` →
  `ase-meta-commit`

0.0.24 (2026-05-11)
-------------------

- IMPROVEMENT: improve edit skill to honor a task-id
- CLEANUP: code cleanups

0.0.23 (2026-05-11)
-------------------

- IMPROVEMENT: add "timestamp" MCP tool to service for use by skills
- IMPROVEMENT: support task id as prefix for craft/refactor/resolve skills
- IMPROVEMENT: use new "timestamp" MCP tool instead of Bash(date) to figure out time
- CLEANUP: align craft/refactor/resolve skills

0.0.22 (2026-05-10)
-------------------

- IMPROVEMENT: at end of `ase-spec-implement` skill, delete the task
- IMPROVEMENT: support `ASE_HEADLESS` mode for skipping the constitution banner under "claude -p" use by claudeX
- IMPROVEMENT: add initial Github Copilot CLI support to "ase setup" commands and provide marketplace/plugin JSON config files
- IMPROVEMENT: improve `ase-code-changes` skill by extending its context when necessary
- IMPROVEMENT: add support for Copilot preToolUse hook
- IMPROVEMENT: add `-t`/`--tool` option to `ase statusline` and support Github Copilot CLI status line
- BUGFIX: fix allowed-tools Bash pattern syntax in `ase-meta-chat` skill
- BUGFIX: omit session name in `ase statusline` output for now
- BUGFIX: "ase setup install" in development mode has to use the ASE base directory, not cwd
- BUGFIX: send logs to stderr instead of stdout to not interfere with e.g. MCP on stdin/stdout
- UPDATE: mention rudimentary Github Copilot CLI support in README
- CLEANUP: remove debugging leftovers in `plugin/hooks/hooks.json` and `ase-hook.ts`
- CLEANUP: fix indentation in `ase-spec-implement` skill

0.0.21 (2026-05-07)
-------------------

- IMPROVEMENT: expand and refine ase-code-lint A06/A20 with sub-aspects, severity guidance, and technology-neutral rules
- IMPROVEMENT: emit clip warning in rendered diagram and honor env-driven terminal size defaults in MCP service
- IMPROVEMENT: add evidence-grounded and contract-aware finding-report filters to skill meta rules
- BUGFIX: add health check and auto-reconnect/restart when MCP service is unavailable
- UPDATE: upgrade dependencies

0.0.20 (2026-05-04)
-------------------

- CLEANUP: switch "ase statusline" from hard-coded ANSI sequences to use of NPM package "chalk"
- IMPROVEMENT: provide a bunch of additional %x placeholders various token, cost and Git information in "ase statusline"
- IMPROVEMENT: provide --no-icons and --no-labels options to "ase statusline"
- IMPROVEMENT: refactor "ase statusline" CLI command to support flexible expansion of information and coloring
- IMPROVEMENT: retry `claude plugin install` up to 3 times in `ase setup`
- BUGFIX: tolerate missing plugin on `ase setup uninstall` and `ase setup update`
- BUGFIX: remove unsupported Markdown formatting from `ase-spec-edit` user dialog

0.0.19 (2026-05-03)
-------------------

- IMPROVEMENT: provide "ase statusline" CLI command (factored out of claudeX sister project)

0.0.18 (2026-05-03)
-------------------

- FEATURE: add `ase-arch-analyze` skill (formerly `ase-code-audit`/`ase-code-architect`) for software architecture review
- FEATURE: switch to a new task-based (plan-mode supported) two-phase workflow
- FEATURE: add `ase task edit <id>` CLI command for task plan editing
- FEATURE: support ACCEPTED severity and clustered tradeoff reporting in arch-analyze skill
- IMPROVEMENT: extend plugin Bash allow-list (git read-only commands, analysis pipes, audit metrics)
- IMPROVEMENT: always stop the service on update and uninstall
- IMPROVEMENT: route architecture overview diagram through `ase-meta-diagram` skill
- IMPROVEMENT: polish arch-analyze skill (compactness, control-flow hint, unicode diagrams, code-based architecture detection)
- IMPROVEMENT: provide status message during operations
- IMPROVEMENT: add standalone skill hint
- REFACTOR: drop `plugin/settings.json`, move Bash allow-list into skill `allowed-tools`
- REFACTOR: restructure arch-analyze aspects (merge redundancies, split governance, render via `ase diagram`)
- BUGFIX: fix block count in arch-analyze skill (5→6)
- BUGFIX: fix typo in skill name (`ase-arch-analyse` → `ase-arch-analyze`)
- UPDATE: bump version to 0.0.18
- UPDATE: update documentation for latest changes
- CLEANUP: remove all trailing whitespaces from source files
- CLEANUP: cleanup frontmatters, setup code, and reduce text
- CLEANUP: neutralize project-specific examples in anomaly annotation rules
- CLEANUP: rename `ase-diagram` skill reference to `ase-meta-diagram`

0.0.17 (2026-05-03)
-------------------

- CLEANUP: remove unused variables except for the "boxing" (coming soon)
- CLEANUP: rename ase-meta-llm to ase-meta-chat to better fit to ase-meta-search
- IMPROVEMENT: support "ase task list|load|save|delete|purge" for task editing
- IMPROVEMENT: let persona and task be configured with ase-meta-{persona,task} and corresponding MCP tool
- IMPROVEMENT: activate persona on startup and provide user and project information initially, too
- IMPROVEMENT: ensure tools like "npm" and "claude" are found in $PATH
- IMPROVEMENT: show current and latest version on startup, with hint on available updates
- IMPROVEMENT: improve running of external commands (suppress output on success, emit on failure)
- UPDATE: document prerequisites
- CLEANUP: update documentation and improve wording for usage of plugin and tool

0.0.16 (2026-05-02)
-------------------

- IMPROVEMENT: add bin/ase{,.sh,js} bootstrapping files for developers
- IMPROVEMENT: add `ase setup install|update|uninstall` commands for convenience
- IMPROVEMENT: tighten `ase-meta-diagram` skill output to suppress extraneous text
- BUGFIX: fix the pre-tool-use hook in `plugin/hooks/hooks.json`
- UPDATE: upgrade dependencies
- CLEANUP: cleanup docs

0.0.15 (2026-05-02)
-------------------

- FEATURE: add `diagram` tool to `ase` MCP service and use it in `ase-meta-diagram` skill
- FEATURE: add `ase mcp` command which uses the `ase service` under the hood
- FEATURE: auto-install MCP service
- IMPROVEMENT: improve `ase diagram` command (TTY querying, output truncation, color mode detection)
- IMPROVEMENT: improve `ase-meta-diagram` skill (drop diagram-width option since LLM no longer renders)
- IMPROVEMENT: always allow MCP service
- BUGFIX: fix warnings on `ase service start/stop`
- UPDATE: document MCP service availability
- CLEANUP: final cleanup to diagram skill

0.0.14 (2026-05-01)
-------------------

- FEATURE: add `ase diagram` CLI subcommand that renders Mermaid source to ASCII/Unicode
- FEATURE: add `ase-meta-diagram` skill with diagram rendering rules
- BUGFIX: convert not allowed plugin/settings.json into a hook-based approach
- IMPROVEMENT: route all meta and consumer skills through `ase-diagram` skill
- UPDATE: upgrade dependencies

0.0.13 (2026-04-30)
-------------------

- FEATURE: add comprehensive `ase-arch-discover` skill

0.0.12 (2026-04-30)
-------------------

- FEATURE: add comprehensive `ase-meta-evaluate` skill
- IMPROVEMENT: improve persona skill
- IMPROVEMENT: improve explain skill
- IMPROVEMENT: use colored bullets
- BUGFIX: fix markdown
- UPDATE: provide more information about ASE
- CLEANUP: consolidate documentation in `docs/` folder
- CLEANUP: minor skill and icon cleanups

0.0.11 (2026-04-27)
-------------------

- BUGFIX: fix markdown in `/ase-meta-persona` skill
- UPDATE: document `/ase-meta-task` skill and `ase hook session-start` command

0.0.10 (2026-04-27)
-------------------

- FEATURE: add task skill (ase-meta-task) for get/set unique task id
- FEATURE: add variables for locating files in skill context
- IMPROVEMENT: allow git commands in code-changes and code-commit skills
- IMPROVEMENT: move session-start hook code into CLI as `ase hook session-start`
- IMPROVEMENT: also run session-start hook on compaction
- IMPROVEMENT: honor `ASE_TASK_ID` environment variable for task id
- IMPROVEMENT: provide more startup context information
- IMPROVEMENT: skip objective output if not given in skill
- BUGFIX: fix allowed-tools Bash pattern for ase commands in skills
- CLEANUP: add more fields to plugin and marketplace descriptors
- CLEANUP: cleanup session-start hook script
- CLEANUP: improve description of config scopes
- CLEANUP: place task config under the project for now
- CLEANUP: remove project.process.control variable (overlaps with agent.process.autonomy)
- CLEANUP: rename and clean up persona skill

0.0.9 (2026-04-22)
------------------

- FEATURE: add persona skill (ase-meta-persona)
- FEATURE: provide scoped configuration with --scope option
- FEATURE: support default values in configuration
- FEATURE: add agent configuration variables
- FEATURE: provide unique session id in session-start hook context
- IMPROVEMENT: use multi-line descriptions in skill metadata
- BUGFIX: fix Makefile path and README markup
- UPDATE: update README documentation

0.0.8 (2026-04-20)
------------------

- FEATURE: add `ase config init <type>` command
- FEATURE: add `status` and `ping` subcommands to service
- FEATURE: provide logging infrastructure with string-based log levels
- FEATURE: support edit loop in `ase config edit`
- FEATURE: support partial key paths in configuration access
- IMPROVEMENT: make daemon timer, shutdown, port handling, and service probing more robust
- IMPROVEMENT: report service uptime on `ase service status`
- IMPROVEMENT: make configuration set operation atomic
- IMPROVEMENT: improve send command, output style, and spawning portability
- IMPROVEMENT: adopt more Commander-native style and restore global `-V`/`--version` option
- IMPROVEMENT: improve table output header and rename `box` to `boxing` with classification factored out
- IMPROVEMENT: reorder commands and code blocks for better intuitiveness
- BUGFIX: avoid reading the entire logfile and fix logging format
- BUGFIX: handle incorrect log levels gracefully
- BUGFIX: resolve real paths before comparison and stop at git repository boundary
- BUGFIX: mirror `set` pattern in `delete` operation
- BUGFIX: close file descriptor leak
- BUGFIX: validate non-scalar values and intermediate node types
- BUGFIX: make exit codes consistent across commands
- BUGFIX: explicitly handle undefined values
- BUGFIX: avoid unnecessary confirmation prompts
- UPDATE: update documentation and manual pages
- CLEANUP: cleanup code, eslint config, port handling, and terminal responses
- CLEANUP: remove obsolete README and unused options
- CLEANUP: define settings and add project name

0.0.7 (2026-04-19)
------------------

- FEATURE: provide `ase config edit` command and update manual page
- FEATURE: add schema validation for configuration
- IMPROVEMENT: render `ase config list` as a nice table
- IMPROVEMENT: complain on non-leaf keys in configuration
- IMPROVEMENT: improve type safety and strictness
- REFACTOR: upgrade to Commander from Yargs and remove agent stuff for now
- REFACTOR: switch to separate arguments
- CLEANUP: cleanup `ase config` command and config handling

0.0.6 (2026-04-18)
------------------

- FEATURE: add `service` command to CLI tool
- FEATURE: add top-level configuration
- FEATURE: add new spec skills (preflight, edit, implement)
- IMPROVEMENT: improve diagramming skill with unicode character hints and if-construct support
- IMPROVEMENT: add diagram rendering rules and optional diagrams in elaborate skill
- IMPROVEMENT: clarify diagram vs. table distinction in skill output
- IMPROVEMENT: improve analyze/elaborate skills
- IMPROVEMENT: improve spec skills
- IMPROVEMENT: make code-lint skill language-agnostic
- IMPROVEMENT: do not enforce Opus model for now
- UPDATE: update dependencies
- CLEANUP: ignore `.ase` directory
- CLEANUP: various tool and main code cleanups
- CLEANUP: simplify and reformat skill information

0.0.5 (2026-04-13)
------------------

- IMPROVEMENT: add license in full text
- IMPROVEMENT: improve README with support hint and "see also" section
- IMPROVEMENT: improve quorum skill
- IMPROVEMENT: experiment with collapsed items in skills
- IMPROVEMENT: finalize commit skill
- BUGFIX: fix references in plugin skill and agent files
- BUGFIX: add missing entries to plugin configuration
- CLEANUP: cleanup and fix "npm start publish" step
- CLEANUP: align README and syntax of arguments in skill files
- CLEANUP: rename skill and agent from ase-meta-websearch to ase-meta-search

0.0.4 (2026-04-13)
------------------

- IMPROVEMENT: improved README with diagram, caution hint, and homepage URL
- IMPROVEMENT: added ase-code-commit skill
- IMPROVEMENT: added ASE logo
- IMPROVEMENT: provide Github release information on "npm start publish"
- BUGFIX: added missing building-blocks SVG file
- UPDATE: updated building-blocks and coding-assistance diagrams
- CLEANUP: various README and plugin skill cleanups

0.0.3 (2026-04-12)
------------------

- IMPROVEMENT: add ase-code-refactor skill

0.0.2 (2026-04-12)
------------------

- IMPROVEMENT: print version on loading

0.0.1 (2026-04-12)
------------------

- IMPROVEMENT: added Claude Code plugin infrastructure with marketplace support
- IMPROVEMENT: added CLI tool skeleton with yargs-based command structure
- IMPROVEMENT: imported lint, craft, insight, and other Claude Code skills
- IMPROVEMENT: added GitHub Pages site and static deployment workflow
- IMPROVEMENT: added top-level build infrastructure with stx integration
- IMPROVEMENT: added constitution (AGENTS.md) for agent instructions
- IMPROVEMENT: improved analysis and insight skills
- IMPROVEMENT: improved error handling and duplicate hook avoidance
- BUGFIX: fixed descriptions, references, typos, and comments
- UPDATE: inlined Andrew Karpathy coding guidelines
- UPDATE: switched from CLAUDE.md to AGENTS.md with hook-based delivery
- UPDATE: used "ase-" prefix for plugin parts consistently
- CLEANUP: various code and configuration cleanups

0.0.0 (2026-04-01)
------------------

(first rough cut of library)


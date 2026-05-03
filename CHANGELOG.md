
ChangeLog
=========

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


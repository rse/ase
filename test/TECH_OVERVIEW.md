
ASE Skill Test Harness: Technical Overview
==========================================

This document explains how the skill test harness executes its tests,
which parts are third-party framework and which are harness code, and
where the harness touches the code of **ASE**. For the usage and the
case format, see `TESTS.md`.

In short: `npm start test` boils down to one TypeScript program,
`test/src/ase-test.ts`, which starts a real Claude Code session per
case run. The harness never imports ASE code -- it drives ASE as a
black box through the plugin directory, the `ase` CLI, and the files
the skills leave behind.

## Launch Chain

1.  In the repository root, `npm start test` runs *stx* with
    `etc/stx.conf`, whose `test` target runs `npm start test` inside
    `test/`.
2.  In `test/`, *stx* uses `test/etc/stx.conf`, whose `test` target
    runs `node --import tsx src/ase-test.ts` (*tsx* executes the
    TypeScript directly, without a build step).
3.  The scripts `run_all_tests.sh` and `run_all_tests_local.sh` skip
    *stx* and run `node --import tsx src/ase-test.ts` directly.

*stx* (`@rse/stx`) is the task runner of the repository, used instead of
npm scripts: every `package.json` carries only the single script
`"start": "stx -v4 -l warning -c etc/stx.conf"`, so `npm start <target>`
means "run the target `<target>` of the local `etc/stx.conf`", where a
target is a named shell snippet, optionally depending on other targets
(like `distclean: clean`). The `test` targets are mere forwarders:

```
# etc/stx.conf (root)                       # test/etc/stx.conf
test                                        test
    execa -c test npm start test -- $*          node --import tsx src/ase-test.ts $*
```

The scripts invoke the final command directly for three reasons:

-   *stx* consumes arguments: it treats every bare word after `--` as an
    additional target name, so `npm start test -- task/grill-semantic`
    tries to run a target of that name, and `--jobs 6` loses its value,
    while the direct call passes every argument verbatim. *stx* offers
    escape hatches (a `+` prefix marks a word as an argument, `-s` makes
    all words after the first task its arguments), but through the
    two-layer chain from the repository root only the `=` form
    (`--cases=<glob>`, `--jobs=6`) and a doubled `++` survive -- a single
    `+` or `-s` silently drops the case filter (see `TESTS.md`).
-   It removes the npm → stx → npm → stx → node layering, so the startup
    is faster and errors are not wrapped into *stx* output.
-   `--import tsx` registers *tsx* as a Node.js module loader hook, which
    transpiles each `.ts` file on import: the harness has no build step
    and no `dst/` (`tsc` only type-checks it in `npm start lint`), and
    without the hook Node.js could not load `ase-test.ts` and its imports.

## Execution Flow

1.  **Discovery**: walk `test/cases/**/case.yaml`, validate each case
    against the schema, resolve its file references, compile all
    regular expressions, and parse the simulator scripts. Invalid cases
    fail here, before any money is spent.
2.  **Preflight**: check that `tool/dst/` is fully built and that agent
    tool credentials exist. With `--llm`, load the gateway profile
    first.
3.  **Run pool**: execute every case × run in parallel (`--jobs`), each
    run going through:
    -   **Sandbox**: a temporary directory with a private HOME and a
        private project directory holding the fixture (Git repository,
        seeded task store, file tree), a filtered environment, `tool/bin`
        on the `PATH`, and copied credentials.
    -   **Session**: the Agent SDK `query()` call with the prompt
        `/ase:<skill> <args>` and the working-copy `plugin/` loaded as
        a local plugin. For interactive cases, the scripted or
        LLM-driven user simulator plays the user side.
    -   **Recording**: every SDK message goes to
        `results/<timestamp>/<case>/run-<n>/` (raw `transcript.jsonl`
        and decoded `transcript.md`).
    -   **Evaluation**: the Git changeset diff of the sandbox project,
        then all oracles (regex, task store, exec, LLM judges, ...).
    -   **Teardown**: `ase service stop`, then removal of the sandbox
        (unless `-k`/`-K` keeps it).
4.  **Report**: the pass@k aggregation per case, the console summary,
    the `summary.json` with the run provenance, and the exit code
    (`0`, `1`, or `2`).

## Framework vs. Harness

| Layer                                                | Role                                                                                                                                | Owner                    |
|------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|--------------------------|
| Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)  | Ships its own Claude Code runtime; executes the session, loads plugins, hooks, and MCP servers, handles permissions and cost accounting | Anthropic (dependency)   |
| Anthropic SDK (`@anthropic-ai/sdk`)                  | Direct API calls of the judges and the simulator, used only with an API key                                                           | Anthropic (dependency)   |
| `test/src/*.ts`                                      | Discovery, sandboxes, session driver, simulators, oracles, judges, reporting                                                          | Harness (test-only)      |
| `test/cases/*`                                       | Inputs, fixtures, and expected outputs                                                                                                | Test data                |

## Touchpoints with ASE

| Touchpoint                                                  | How                                                                                                                  | Consequence                                                                                                         |
|-------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| `plugin/`                                                   | Loaded from the working copy as a local plugin                                                                       | Changes to skills, sub-agents, meta files, and hooks are tested immediately, without `ase setup`                    |
| `tool/bin/ase` and `tool/dst/`                              | Put on the sandbox `PATH`; the MCP configuration of the plugin starts `ase mcp`, which spawns the per-project `ase service` | The tests run the *built* tool: after changing `tool/src/`, rebuild (`npm start build`), else stale code is tested |
| `ase service stop`                                          | Called on teardown                                                                                                   | Stops the background service of the sandbox                                                                        |
| `.ase/task/TASK-*.md` and `PROJECT.yaml`                    | Fixtures written in the task file format; the `taskStore` oracle and the `taskBody` target parse it back              | Coupled to the file *format* of `tool/src/ase-task-format.ts`, not to its code                                      |
| Skill output conventions (`⧉ **ASE**`, `▶ ERROR:`, verdict words, `GRILLING`, ...) | Matched by the oracles and by the infrastructure error classification                                               | Coupled to `plugin/meta/ase-skill.md` and the templates of the `SKILL.md` files                                     |
| `skillErrored`, `verdictOf`, `changesetDiff`                | Copied into `test/src/ase-test-oracle.ts`, with comments referencing the originals in `tool/src/ase-agent-runtime-*.ts` | Copies, not imports: they drift silently when the originals change                                                  |

> **Notice:** two couplings are invisible to the build: changes to the
> task file format or to the wording of the skill output conventions
> break tests without any compile error, and the copied helpers do not
> follow changes of their originals. These are the places to check when
> tests start failing after an ASE change which "should not" affect them.

ASE Agent End-to-End Test
=========================

## About

This directory holds a standalone end-to-end system test of `ase agent`.
Unlike the skill harness in `test/src/`, it doesn't drive skills through
the Agent SDK. Instead, it runs the real built-in agents as separate
processes, the same way a user would:

1.  **Sandbox**: a fresh temporary directory with a private `HOME`
    (where the ASE plugin of the working copy is installed via
    `ase setup install --dev`) and a private Git project on `master`.
2.  **Task**: the case fixture `task.md` is saved into the task store
    as the task of `case.json` (e.g., `wordcount`) in status `PLANNED`,
    with the `enterprise` lifecycle model.
3.  **Agents**: `implementer`, `qualifier` (mode `qualify`), and
    `integrator` (mode `squash`) run, depending on the `runner` of
    `case.json`:
    -   `pipeline`: one after the other with `--foreground --one-shot`.
        After each agent, the test checks that the task reached the
        expected status (`IMPLEMENTED`, `QUALIFIED`, `INTEGRATED`), and
        stops early if it didn't.
    -   `fleet`: all together as a background `ase agent fleet`
        (configured by a versioned `.ase/fleet.yaml`, with the
        fleet-owned agent relay), which the test checks (all members
        running, agents present on the relay), follows until the task
        is `INTEGRATED` or left the happy path, and finally stops.

    All agent output goes to the console and to `agents.log`.
4.  **Verification**: the task is `INTEGRATED`, the program of
    `case.json` (e.g., `wordcount.py`) is on `master`, and the working
    copy is clean. The case fixture test
    suite `suite/` (Python `unittest`, standard library only) is then
    run against the produced program, where **every** discovered test
    has to pass (no failures, errors, or skips).
5.  **Report**: a console summary, plus `report.md`, `result.json`, and
    all artifacts in `test/results/agent-<timestamp>-<case>/`.

The driver `ase-agent-test.mts` has no dependencies. Node >= 22.22 runs
it directly through type stripping. It uses only Node built-ins,
spawns processes without a shell, runs `ase` as
`node tool/bin/ase`, and finds Python as `python3`, `python`, or
`py -3`. This way it works on Linux, macOS, and Windows alike.

> **Notice:** A real run spends real AI tokens (about $1.60 per case).
> It is never part of `build` or `publish`.

## Prerequisites

-   a fully built `tool/` (`cd tool && npm start build`)
-   `git`, Python >= 3.8, and the agent tool (`claude` by default) in
    `$PATH`
-   agent tool credentials: `ANTHROPIC_API_KEY` or
    `CLAUDE_CODE_OAUTH_TOKEN`, or a `~/.claude/.credentials.json` from a
    regular login, which is copied into the sandbox `HOME`. For `codex`
    and `copilot`, the test passes through `OPENAI_API_KEY`,
    `CODEX_API_KEY`, `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, and
    `GITHUB_TOKEN`.

## Usage

```sh
node agent/ase-agent-test.mts --dry-run          # set up the sandbox and task only, no tokens spent
node agent/ase-agent-test.mts                    # full run of case "wordcount-python"
node agent/ase-agent-test.mts --keep-failed      # keep the sandbox of a failed run for inspection
node agent/ase-agent-test.mts --tool codex --timeout 20m --max-cost-usd 3
npm start test-agent                             # the same via stx (inside test/)
./run_agent_test.sh                              # all cases in parallel, after a cost confirmation (inside test/)
./run_agent_test.sh --case fibonacci-fleet       # a single case, after a cost confirmation
./run_agent_test_local.sh [<profile>]            # all cases against a local model gateway (no confirmation)
```

`run_agent_test.sh` runs the cases `wordcount-python` and
`fibonacci-fleet` in parallel (each in its own sandbox, with its output
prefixed by `[<case>]`), passes all further options to both, prints one
verdict line per case, and exits with the worst exit code. With
`--case` or `--suite-only`, it runs only a single test. With
`ASE_TEST_JOBS=1`, the cases run one after the other, and
`ASE_AGENT_TEST_CONFIRM=0` skips the cost confirmation.
`run_agent_test_local.sh` exports an LLM gateway profile (see
`etc/llm-local.env.sample`, which sets `ASE_TEST_JOBS=1`, as a single local
model handles concurrent generation poorly) and then runs
`run_agent_test.sh` without the confirmation.

Options:

-   `--case <name>`: the case directory below `cases/` (default:
    `wordcount-python`)
-   `--tool claude|copilot|codex`: the agent tool of the agents
    (default: `$ASE_TOOL`, else `claude`)
-   `--timeout <n>s|m|h`: the maximum processing time per task of each
    agent (default: `30m`)
-   `--max-cost-usd <usd>`: stop the pipeline resp. the fleet once the
    summed agent costs exceed this value (default: `5`)
-   `--keep`, `--keep-failed`: keep the sandbox (always, resp. unless
    the run passed)
-   `--suite-only <dir>`: only run the test suite against the program
    in an existing directory (e.g., `project/` of a kept sandbox), with
    no sandbox and no agents
-   `--dry-run`: only check the setup (sandbox, plugin installation,
    and task feed), without running the agents

Exit codes: `0` passed, `1` failed (pipeline or test suite), `2`
infrastructure error (missing prerequisites, failed setup).

## Cases

A case is a directory `cases/<name>/` with:

-   `case.json`: the case configuration, e.g.
    `{ "task": "wordcount", "program": "wordcount.py", "runner": "pipeline" }`,
    with the task id of the fixture, the program file the agents have
    to commit to `master`, and the runner, `pipeline` (the agents one
    after the other in the foreground) or `fleet` (all agents together
    via `ase agent fleet`, with the fleet run for at most 3 × `--timeout`).
-   `task.md`: the task fixture in the ASE task format, with the `Id:`
    of `case.json` and `Status: PLANNED`. The specification has to be
    precise enough for the test suite to be deterministic.
-   `suite/`: the test suite, discovered via
    `python -m unittest discover -s suite`. It finds the produced
    project through `$AGENT_TEST_PROJECT` and runs the program through
    `sys.executable`.

| Case               | Runner     | Program        | Cost (approx.) |
|--------------------|------------|----------------|----------------|
| `wordcount-python` | `pipeline` | `wordcount.py` | $1.60          |
| `fibonacci-fleet`  | `fleet`    | `fibonacci.py` | $1.60          |

Each case documents its details in its `TEST-DESCRIPTION.md`.

To check the test suite itself without any agent, run it against a
reference implementation in a scratch directory:

```sh
AGENT_TEST_PROJECT=/path/to/reference python3 -m unittest discover -s agent/cases/wordcount-python/suite -v
```

## Artifacts

| File           | Content                                                        |
|----------------|----------------------------------------------------------------|
| `report.md`    | verdict, pipeline table (exit, duration, status, cost), checks |
| `result.json`  | the same, machine-readable                                     |
| `agents.log`   | the full output of all agents, prefixed by agent name          |
| `suite.log`    | the verbose `unittest` output                                  |
| `task.md`      | the final task plan, including the `agent` log attachment      |
| `git.log`      | the commit graph of all branches with file stats               |
| `fleet.log`    | the shared log of the fleet and its members (`fleet` only)     |
| *program*      | the program the agents produced (e.g., `wordcount.py`)         |

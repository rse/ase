Test Description: `wordcount-python`
====================================

## Purpose

This case is an end-to-end test of the autonomous agents of ASE
(`ase agent`). It starts with an empty Git project and a single,
precisely specified task: a Python clone of the Unix `wc` command.
The three built-in phase agents of the `enterprise` task lifecycle
model, `implementer`, `qualifier`, and `integrator`, then drive the
task headless from `PLANNED` to `INTEGRATED`. Finally, a black-box
test suite checks the program the agents left on `master`.

No human interaction takes place: once started, the test either
produces a working `wordcount.py` on `master` or reports where the
pipeline stopped.

| File                      | Role                                                          |
|---------------------------|---------------------------------------------------------------|
| `task.md`                 | the task fixture (ASE task format, id `wordcount`, `PLANNED`) |
| `suite/test_wordcount.py` | the test suite (Python `unittest`, standard library only)     |
| `TEST-DESCRIPTION.md`     | this description                                              |

The driver is `test/agent/ase-agent-test.mts` (see `test/agent/README.md`).

## Shell Commands, in Execution Order

The driver spawns every command directly, without a shell. Below, they
are written in equivalent shell syntax, where:

-   `ase` stands for `node <repo>/tool/bin/ase`, i.e., the tool built from
    the working copy, not an installed one
-   `$SB` is the fresh sandbox directory (`<tmpdir>/ase-agent-test-XXXXXX/`)
-   `$CASE` is this directory
-   `claude` is the agent tool of `--tool` (default `claude`), and
    `python3` is the first Python >= 3.8 found (`python3`, `python`, or
    `py -3`)
-   all commands from step 3 on run in `$SB/project` with a sandboxed
    environment: `HOME=$SB/home`, `XDG_CONFIG_HOME` and `XDG_STATE_HOME`
    below it, `<repo>/tool/bin` first in `PATH`, all `ASE_*`, `CLAUDE*`,
    `ANTHROPIC_*`, and other credential variables removed, and exactly
    one agent tool credential added back

### 1. Preflight (no sandbox yet)

```sh
node --version                     # checked internally: >= 22.22
test -f <repo>/tool/dst/ase.js     # ASE tool must be built
git --version
claude --version
python3 -c "import sys; print(sys.version_info >= (3, 8))"
python3 -c "import sys, unittest; print(unittest.defaultTestLoader.discover(sys.argv[1]).countTestCases())" $CASE/suite
```

A failure here ends the test with exit code `2` (infrastructure).

### 2. Sandbox

```sh
SB=$(mktemp -d "${TMPDIR:-/tmp}/ase-agent-test-XXXXXX")
mkdir -p $SB/home/.claude $SB/project/.ase
cp ~/.claude/.credentials.json $SB/home/.claude/   # only if no ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN
echo '{"disableClaudeAiConnectors":true}' > $SB/home/.claude/settings.json
```

### 3. Plugin Installation into the Sandbox HOME

```sh
ASE_SETUP_DEV_BASEDIR=<repo> ase setup install --dev --tool claude
```

This step is required because the agents later spawn plain `claude -p`
sessions, which only see installed plugins. Internally it runs
`claude plugin marketplace add <repo>` and `claude plugin install ase@ase`.

### 4. Project Bootstrap and Task Feed

```sh
git init --initial-branch master
git config user.name  "ASE Agent Test"
git config user.email "ase-agent-test@localhost"
echo ".ase/task/" > .gitignore
git add .gitignore
git commit --no-verify -m "initial commit"

ase task lifecycle enterprise
ase config set project.id ase-agent-test
ase config set project.task.default.source    "branch:master"
ase config set project.task.default.changeset "branch:cs-{id}"
ase config set project.task.default.target    "branch:master"
ase task save --create wordcount < $CASE/task.md

git add --all                                  # .ase/config.yaml, .ase/.gitignore
git commit --no-verify -m "ASE project setup"
git status --porcelain                         # must be empty, else infrastructure error
```

Three details of this setup matter (all found by the first real runs):

-   Only the task store `.ase/task/` is git-ignored, so the agents'
    constant updates of the task files never make the `master` working
    copy dirty. Ignoring all of `.ase/` breaks the agents: they run
    `git add --all -- . ':(exclude).ase'`, which Git refuses with exit
    code `1` if `.ase` itself is ignored. The runtime files below
    `.ase/` are already covered by ASE's self-ignoring `.ase/.gitignore`.
-   The built-in defaults of `Source:`, `Changeset:`, and `Target:` are
    `worktree`, `worktree`, and `source`, i.e., the implementation would
    stay uncommitted in the working copy. The test sets them explicitly
    to branches, so it covers the `branch:` changesets and ASE worktrees.
-   The ASE project files (`.ase/config.yaml`) are committed: any
    untracked file in the `master` working copy lets the integrator's
    merge fail and the task end up `DEFERRED`.

### 5. State Probe (after Step 4 and after Every Agent)

```sh
ase task status wordcount:     # prints the lifecycle status
ase task load wordcount        # full plan; the "Tags:" line is inspected
```

### 6. Agent Pipeline (Sequential, Each Runs Until No Work Is Left)

```sh
ase agent implementer start --foreground --one-shot --tool claude --timeout 30m --params effort-wait=false
ase agent qualifier   start --foreground --one-shot --tool claude --timeout 30m --mode qualify
ase agent integrator  start --foreground --one-shot --tool claude --timeout 30m --mode squash
```

The output of each agent goes to the console and to `agents.log`. After
each agent, the state probe of step 5 runs. The pipeline stops early if
an agent exits non-zero, times out, leaves the task in a status other
than the expected one, or leaves a `:failed` tag, or if the summed costs
exceed `--max-cost-usd`.

### 7. Verification

```sh
git ls-tree --name-only master          # must list wordcount.py
git rev-parse --abbrev-ref HEAD         # must be master
git status --porcelain                  # must be empty

# must pass all tests counted in the preflight
WORDCOUNT_PROJECT=$SB/project PYTHONDONTWRITEBYTECODE=1 \
    python3 -m unittest discover -s $CASE/suite -v      # output saved as suite.log
```

### 8. Artifact Collection

```sh
ase task load wordcount                            > results/.../task.md
git log --all --graph --stat --format="%h %d %s"   > results/.../git.log
cp wordcount.py results/.../wordcount.py
```

### 9. Teardown

```sh
ase service stop          # the ASE service spawned on demand by the CLI and the agents
rm -rf $SB                # unless --keep, or --keep-failed after a failed run
```

## What Happens Inside the Agents

The agents themselves run further commands, which the test doesn't
issue directly but exercises indirectly (see `ase man ase-agent` and the
manual pages of each agent):

| Agent         | Claims from   | Activity state | Skill prompt sent to the agent tool                           | Expected result |
|---------------|---------------|----------------|---------------------------------------------------------------|-----------------|
| `implementer` | `PLANNED`     | `IMPLEMENTING` | `/ase:ase-task-implement --next DONE wordcount`               | `IMPLEMENTED`   |
| `qualifier`   | `IMPLEMENTED` | `QUALIFYING`   | `/ase:ase-repo-review --branch cs-wordcount`                  | `QUALIFIED`     |
| `integrator`  | `QUALIFIED`   | `INTEGRATING`  | `/ase:ase-task-integrate --next DONE --mode squash wordcount` | `INTEGRATED`    |

Each skill prompt runs as one headless agent tool session:

```sh
ASE_HEADLESS=true claude [--add-dir <dir> ...] -p --output-format stream-json --verbose \
    --disallowedTools AskUserQuestion --permission-mode auto --permission-prompts none "<prompt>"
```

Along the way, the agents:

-   claim the task in a conditional save (status change, tag
    `ase-agent-<kind>:active`, `Assignee:`), and settle it afterwards
    (plain tag or verdict tag, unassign, final status)
-   implement on the changeset branch `cs-wordcount` (configured
    `Changeset: branch:cs-{id}`), checked out as the ASE worktree
    `.ase/worktree/cs-wordcount`, starting from `Source: branch:master`
-   review the branch against its base. The verdict `APPROVE` or
    `REJECT` is parsed from the `REVIEW VERDICT` output and stored as
    the tag `ase-agent-qualifier:approve` resp. `:reject`
-   squash-merge `cs-wordcount` into `Target: branch:master` and replace
    the change set snapshot attachment by the diff that actually landed
-   append their processing log to the `agent` attachment of the task
-   use the ASE MCP service (`ase service`), started on demand

## Coverage

| Area                                                                 | Covered | Notes                                            |
|----------------------------------------------------------------------|---------|--------------------------------------------------|
| `ase setup install --dev`                                            | yes     | into an isolated HOME, from the working copy     |
| `ase config set`, `ase task lifecycle`                               | yes     | `project` scope, local task store                |
| `ase task save --create/status/load`                                 | yes     | default local store `ase:./.ase/task`            |
| `enterprise` lifecycle transitions                                   | yes     | `PLANNED` → ... → `INTEGRATED` (happy path only) |
| `ase agent implementer` (mode `implement`)                           | yes     | `--foreground --one-shot`, `effort-wait=false`   |
| `ase agent qualifier` (mode `qualify`)                               | yes     | verdict parsing and automatic decision           |
| `ase agent integrator` (mode `squash`)                               | yes     | merge into `master`, snapshot attachment         |
| task claiming, tags, assignee handling                               | yes     | single agent per kind, no contention             |
| `branch:` changesets and ASE worktrees                               | yes     | `cs-wordcount` below `.ase/worktree/`            |
| skills `ase-task-implement`, `ase-repo-review`, `ase-task-integrate` | yes     | headless, via the agents                         |
| ASE MCP service (on-demand start, stop)                              | yes     |                                                  |
| agent tools `copilot` / `codex`                                      | opt-in  | only with `--tool copilot` resp. `--tool codex`  |
| `ase agent fleet`, `ase agent relay`                                 | no      |                                                  |
| background agents (`start`/`status`/`log`/`stop`)                    | no      |                                                  |
| `estimator`, `editor`, `researcher`, `rebooter`, `condenser`         | no      | `estimator` replaced by `effort-wait=false`      |
| `adhoc` agents and definition kinds                                  | no      |                                                  |
| qualifier mode `judge`, implementer mode `draft`, other merge modes  | no      |                                                  |
| `worktree` / `attachment:` changesets                                | no      |                                                  |
| `--repo` clones, remote task stores                                  | no      |                                                  |
| parallelism (`--parallel`), agent pools                              | no      | single task, no `After:` dependencies            |
| interrupts and crash recovery                                        | no      |                                                  |
| failure paths (`STALLED`, `DECLINED`, `DEFERRED`)                    | no      | only detected and reported, never provoked       |
| task board (TUI/web)                                                 | no      |                                                  |

## Pass Criteria

The test passes only if all of the following hold:

1.  each agent exits with `0`, within its timeout, and leaves the task in
    its expected status without a `:failed` tag
2.  the final task status is `INTEGRATED`
3.  `wordcount.py` is committed on `master`
4.  the working copy is on `master` and clean
5.  **all** tests of the suite pass: the number of tests run equals the
    number of tests discovered in `suite/` (currently 12), and every
    single test reports `ok`, with no failures, errors, or skips

## Test Suite

`suite/test_wordcount.py` runs `wordcount.py` as a subprocess (with the
interpreter running the suite), in a temporary directory with
byte-exact fixture files. It normalizes `\r\n` in the output.

| Test                                | Checks                                               |
|-------------------------------------|------------------------------------------------------|
| `test_empty_file`                   | `0 0 0 empty.txt`                                    |
| `test_single_line_without_newline`  | zero lines for text without `\n`                     |
| `test_multi_line`                   | lines, words, characters incl. an empty line         |
| `test_mixed_whitespace`             | tabs and runs of spaces as word separators           |
| `test_unicode_characters`           | characters are code points, not bytes (UTF-8, emoji) |
| `test_crlf_counts_carriage_returns` | `\r` counts as a character, lines count only `\n`    |
| `test_stdin`                        | stdin mode prints no name                            |
| `test_stdin_empty`                  | `0 0 0` for empty stdin                              |
| `test_multiple_files_with_total`    | per-file lines plus a `total` line                   |
| `test_single_file_has_no_total`     | no `total` line for a single file                    |
| `test_missing_file`                 | exit code `1`, message on stderr, no stdout          |
| `test_missing_file_among_others`    | missing file skipped, others and total still printed |

## Running

```sh
cd test
node agent/ase-agent-test.mts --dry-run       # steps 1-5 and 9 only: no agents, no tokens
node agent/ase-agent-test.mts --keep-failed   # full run
```

> **Notice:** A full run spends real AI tokens. The first passing run
> (2026-11-03, `claude`, model `claude-sonnet-5-5`) took 3.9 minutes and
> cost $1.64: implementer $0.66 (1.9 min), qualifier $0.32 (0.8 min),
> integrator $0.66 (0.8 min).

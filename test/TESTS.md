
ASE Skill Test Harness
======================

## About

This directory holds the skill test harness of **ASE** (not shipped
with the deliverables): it runs the skills of `plugin/` headless through
the *Claude Agent SDK* with the working-copy `plugin/` loaded and the
built `tool/` on the `PATH`, each run in a throwaway sandbox, and judges
the outcome with mechanical oracles and an optional LLM rubric judge.

The harness is an *eval* suite, not a unit test suite: a skill is a
natural-language program executed by an LLM, so non-deterministic cases
declare multiple runs with a pass@k threshold, while the deterministic
parts (argument parsing, error templates, tool effects) are asserted
exactly. Every case run executes real agent sessions against the
Anthropic API and hence *burns AI tokens* -- this is why no `build` or
`publish` target ever triggers it.

## Layout

-   `src/ase-test.ts`: the harness CLI (case discovery, run pool, pass@k
    aggregation, global cost ceiling, exit codes), with
    `ase-test-{case,sandbox,session,llm,simulator,transcript,oracle,judge,report}.ts`
    for the case schema, the per-run sandbox, the Agent SDK session
    runner (single-shot and multi-turn), the tool-less LLM completion
    helper, the scripted resp. LLM-driven user simulator, the per-run
    artifact recorder, the oracle library (skill errors, verdicts,
    regex, files, Git changeset diff, task store, text metrics), the
    LLM rubric judge, and the reporting
-   `cases/<group>/<name>/`: one directory per test case, with a
    `case.yaml` (skill, arguments, runs, budget, fixture, turns, and
    oracles) plus optional fixture files, simulator scripts
    (`answers.yaml`), personas, and rubrics
-   `results/<timestamp>/`: the per-run artifacts (raw
    `transcript.jsonl`, decoded `transcript.md`, `diff.patch`, task
    store copy, `result.json`) and the `summary.json`, never committed

## Prerequisites

-   a fully built `tool/` (`cd tool && npm start build`), as the
    sandboxed sessions run the `ase` MCP service from `tool/bin`
-   agent tool credentials: `ANTHROPIC_API_KEY` or
    `CLAUDE_CODE_OAUTH_TOKEN`, or a `~/.claude/.credentials.json` from a
    regular login (it is copied into the sandbox HOME)

## Usage

```
npm start lint                            # eslint + tsc over src/
npm start test                            # run all cases
npm start test -- -c 'task/*'             # run the cases matching a glob
npm start test -- -l                      # list the discovered cases
npm start test -- -d -c 'task/grill-*'    # describe the matched cases
npm start test -- --jobs=8 --max-cost-usd=10  # 8 parallel runs, $10 ceiling
npm start test -- -K -c 'meta/*'          # keep the sandboxes of failed runs
```

Exit codes: `0` all cases passed, `1` a case failed its pass@k
threshold, `2` infrastructure error or cost ceiling hit.

> **Notice:** with `npm start` the option *values* must be attached with
> `=` (`--jobs=8`, not `--jobs 8`), as stx consumes detached words as
> task names. Invoking `node --import tsx src/ase-test.ts` directly has
> no such restriction.

## Third-Party Gateways

By default the sessions run against the Anthropic API with the
credentials above. Alternatively the whole harness (sessions, rubric
judge, user simulator) can be routed to any Anthropic-compatible
gateway -- e.g. a [LiteLLM](https://docs.litellm.ai) proxy in front of a
locally served model -- via an env-file profile:

```
npm start test -- --llm=etc/llm-local.env --cases=meta/mint-uuid
```

See `etc/llm-local.env.sample` for the profile format: it sets
`ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` (and optionally
`CLAUDE_CODE_*` tuning for small context windows), which the harness
loads into its process environment and passes through into the
sandboxed sessions. Variables already exported take precedence over the
profile, and `ASE_TEST_LLM=<file>` is honored as a default for `--llm`.

The harness intentionally does *not* remap model names: hard-coded
defaults (`claude-haiku-5-5` for judge and simulator) and per-case
`turns.model` declarations reach the gateway as-is, so the gateway
should alias the `claude-*` model names onto its local model (in
LiteLLM: several `model_name` entries pointing to the same deployment).
Alternatively `ASE_TEST_MODEL`, `ASE_TEST_JUDGE_MODEL` and
`ASE_TEST_SIM_MODEL` can be set in the profile.

Caveats in gateway mode:

-   cost accounting (`total_cost_usd`) is meaningless for models
    unknown to the agent tool, so the per-case `budget.maxUsd`, the
    global `--max-cost-usd` ceiling, and the reported costs are
    unreliable
-   rubric/`similar` judging by a small local model is markedly weaker
    than by the default judge -- consider pointing
    `ASE_TEST_JUDGE_MODEL` at a stronger model
-   the startup line prints the active `endpoint:` so a run visibly
    states which backend it used

## Cases

A case is a directory `cases/<group>/<name>/` with a `case.yaml`
declaring the skill and arguments (or a free-text prompt), the number
of runs and the pass@k threshold (`runs`/`minPass`), the per-run budget,
the fixture (Git repository, ASE configuration, seeded task store, file
tree), the optional interactive turns (a scripted `answers.yaml` or an
LLM-driven persona), and the oracles (`notErrored`, `verdict`, `regex`,
`fileExists`, `gitDiff`, `taskStore`, `textMetric`, `rubric`, and
`similar`). The `similar` oracle checks against a golden expected
output: a separate file in the case directory states the decisions,
facts, and constraints the result must carry, and an LLM judge scores
the semantic similarity of the actual result (the skill output, the
transcript, or the final task plan body via `in: taskBody`) against it,
ignoring wording, structure, and ordering. See the existing cases for
the shapes, and `src/ase-test-case.ts` for the authoritative schema.

To see the exact input (the first user turn, the fixture, and the
simulator) and the expected output (the oracles in prose, with the
golden/rubric files inlined) of a case, run `npm start test -- --describe`
(optionally with `-c <glob>`) -- it is free, as no session is started.

## Sandboxing

Every run gets a private HOME (XDG directories, Claude settings, and
credentials) and a private project directory with its own `.ase/`
state, task store, and service port, so runs are parallel-safe. The
sandbox is torn down after the run (`ase service stop` plus removal),
unless `-k`/`-K` keeps it for inspection.

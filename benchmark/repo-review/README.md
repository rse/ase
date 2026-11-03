# Effectiveness test for `ase-repo-review`

Measures reproducibly how many seeded defects the skill `ase-repo-review` finds
with a given model, and how often it flags correct code. The evaluation is purely
rule-based, without a judging model.

## Layout

| Path | Content |
|---|---|
| `fixture/base/`, `fixture/change/` | example project "shop-core": defect-free base and the reviewed change |
| `solution/expected.json` | hidden expected-results list: findings in three tiers and decoys with locations (never part of a working copy) |
| `thresholds.json` | pre-registered thresholds (committed before the first measurement) |
| `check.mjs` | checks the expected-results list against the fixture |
| `run.mjs` | runner: throw-away copy, leak check, `claude -p`, result folder |
| `compare.mjs` | compares result folders with the expected-results list, report in Markdown and JSON |
| `selftest.mjs` | self-test of parser, matching, metrics, and runner helpers |
| `check-language.mjs` | language check of the deliverable (English only) |
| `testdata/` | canned `stream-json` transcripts for dry runs |
| `reference/` | reference measurement with Claude Opus 5.5 and Sonnet 5.5 |
| `results/` | local result folders (not versioned) |

## Prerequisites

- Node.js 22 or newer and Git; on Windows PowerShell is sufficient, Bash is not required
- for paid runs additionally: the Claude Code CLI (`claude`) with a login and the
  built `tool/` of this repository (`cd tool && npm start build`)

## Dry run (no model call, no cost)

```
node benchmark/repo-review/check.mjs
node benchmark/repo-review/selftest.mjs
node benchmark/repo-review/check-language.mjs
node benchmark/repo-review/run.mjs --dry-run
node benchmark/repo-review/run.mjs --dry-run --simulate unparseable
node benchmark/repo-review/run.mjs --dry-run --simulate abort-cost
node benchmark/repo-review/run.mjs --dry-run --simulate abort-time
node benchmark/repo-review/run.mjs --dry-run --simulate leak
node benchmark/repo-review/compare.mjs
```

`--replay <file>` plays back a custom `stream-json` transcript, for example
`testdata/isolation.jsonl` or `testdata/contamination.jsonl`. Dry runs appear in
the report as a separate model group "(dry run)".

## Measurement (paid)

A measurement starts only if `thresholds.json` is committed and unmodified,
`tool/` is built, and `--confirm-paid` is given:

```
node benchmark/repo-review/run.mjs --model sonnet --runs 3 --confirm-paid
node benchmark/repo-review/run.mjs --model opus   --runs 3 --confirm-paid
node benchmark/repo-review/compare.mjs
```

Each run invokes exactly `/ase:ase-repo-review -c HEAD -S LOW`, with a cost limit
of 5 USD and a time limit of 20 minutes. The series budget of one call (default
30 USD) is checked before every further run, with a 10 % reserve for overshooting
the per-run limit; a run without a cost report counts with its full limit.
`--prior-spent` carries over costs already spent in a series. Inherited
`CLAUDE*` and `ANTHROPIC_*` variables are removed for the child process; only the
plugin of this working copy is loaded. MCP servers come exclusively through
`--strict-mcp-config` and a generated `--mcp-config` with exactly the server
`ase`, so the claude.ai connectors of the account stay out. Built-in CLI plugins
(`@builtin`) are only logged. If `claude` loads another plugin or MCP server, the
runner aborts immediately (status `error`, reason `isolation`). After every run
the runner kills leftover ASE processes (such as the project service) and records
them in the protocol.

Run status: `ok`, `unparseable` (output not recognizable as a review, counts with
0 hits), `aborted` (cost or time), `error` (leak, isolation, contamination, start,
CLI error result).

## Report

`compare.mjs` reports per model the recall per tier (obvious, medium, hidden) and
overall (mean, minimum, maximum), the decoy false-alarm rate, the unassignable
findings, the skill verdict per run, duration and cost, and the threshold verdict
"threshold met" or "threshold not met". For Opus a calibration statement is added:
"too easy" if all runs find all findings, otherwise "adequate". Applied twice to
the same folders, `report.json` is byte-identical.

Matching: file name and line overlap with a tolerance of 3 lines; with several
candidates the largest overlap wins, then the smallest distance, then the
smallest id. `ACCEPTED` findings count neither as hits nor as false alarms.

## Other endpoints (open models)

```
$env:BENCH_TOKEN = "<provider token>"
node benchmark/repo-review/run.mjs --model <model-id> --base-url https://provider.example/v1 --auth-token-env BENCH_TOKEN --confirm-paid
```

`--base-url` sets `ANTHROPIC_BASE_URL`, `--auth-token-env` reads the token from the
named variable and sets `ANTHROPIC_AUTH_TOKEN`. The run protocol records the
endpoint (scheme, host, and path only), never the token. The cost figures of the
CLI (`total_cost_usd`) are based on Anthropic prices and are unreliable for other
endpoints; the report points this out. To try it without cost:
`node benchmark/repo-review/run.mjs --dry-run --base-url https://example.invalid --auth-token-env BENCH_TOKEN`.

## Origin

Approach and matching rule follow the effectiveness test of MERIT
(`tests/effectiveness/`); the code is written from scratch.

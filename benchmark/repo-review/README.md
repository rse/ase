# Does the review find the bugs? An effectiveness test for `ase-repo-review`

[ASE](https://ase.tools) ships a skill called `ase-repo-review`. You point it at a
commit, and an AI model reads the change and writes a code review: a verdict plus
a table of findings, each with a severity and a file location. The output always
*looks* competent. The question this benchmark answers is a plainer one: if we
know exactly what is wrong with a change, how much of it does the review catch,
and how often does it complain about code that is fine?

That question gets sharper once you want to swap the model. A review that runs on
Claude Opus may behave quite differently on a cheaper model or on an open-weight
model behind another endpoint. Reading a handful of reviews and forming an
impression does not survive that comparison; you need the same test, run the same
way, scored by the same rules, with figures you can put side by side.

## The idea: plant the bugs, lay decoys, hide the answers

The approach is old and simple. We wrote a small project, introduced a change to
it, and deliberately seeded defects into that change. Since we put the defects
there, we know where they are, so we can check whether the review reports them.

Finding bugs is only half of a good review, though. A reviewer that flags every
second line would score perfectly on seeded defects and still be useless. So the
change also contains **decoys**: code that looks suspicious at first glance but is
correct, such as a deliberate fall-through in a `switch` that carries a comment
saying so, or a loose `== null` that deliberately covers both `null` and
`undefined`. A review that reports a decoy has raised a false alarm.

The list of defects and decoys, the **expected-results list**, lives in
`solution/expected.json` and never travels with the code under review. The model
sees a plain Git repository with two commits and nothing else; no file name,
commit message, or comment hints at what we expect to be found.

## The example project

The project under review is "shop-core", a little TypeScript shop with a cart,
discount codes, orders, refunds, notifications, and an API layer. The base commit
(`fixture/base/`) is free of defects. The change (`fixture/change/`) looks like a
plausible piece of everyday work: it switches money amounts to integer cents, adds
discount kinds, order options with a currency, and some validation.

Into that change we seeded seven defects in three tiers of difficulty:

- **obvious** defects are visible in a single line, for example a loop that runs
  one position past the end of an array;
- **medium** defects need a little context, for example an `await` that went
  missing inside a `try` block, so a failed save never reaches the `catch`;
- **hidden** defects only show up when you follow the change across files, for
  example a function that now returns cents while its caller in another module
  still formats the value as euros, so the API shows a hundred times the amount.

Four decoys sit next to them. The exact entries, with locations and rationale, are
in `solution/expected.json`.

## What happens in a run

A run starts by building a throw-away copy of the example project in the system's
temporary directory: a fresh Git repository with the base commit, then the change
commit, both with neutral messages and fixed dates. Before any model sees it, the
runner performs a **leak check**: it scans every file of the copy for words that
could give the answers away (such as "bug", "decoy", "TODO", or an entry id like
`B-01`). If it finds one, the run stops.

Then the runner calls the Claude Code CLI non-interactively (`claude -p`, the
"print" mode that takes one prompt, works on it, and exits) with exactly one
prompt: `/ase:ase-repo-review -c HEAD -S LOW`, that is, review the last commit and
report everything down to severity LOW. The CLI is fenced in on purpose:

- only the ASE plugin of this working copy is loaded, and only the `ase` MCP
  server is reachable, so personal plugins and account connectors stay out;
- the model may read and search files and run `git`, but it may not edit or write
  anything and may not go to the web;
- inherited `CLAUDE*` and `ANTHROPIC_*` environment variables are removed;
- each run has a cost limit (5 USD) and a time limit (20 minutes); a series of
  runs has an overall budget (30 USD) with a 10 % reserve, and a run that reports
  no cost counts with its full limit.

While the model works, the runner watches its event stream. If the CLI loads
anything beyond what was allowed, the run ends with an **isolation** error. If a
tool call of the model reaches into this benchmark (where the expected-results
list lives) or into the ASE repository outside the `plugin/` and `tool/` folders
the run legitimately uses, the run ends with a **contamination** error. Afterwards the runner
kills any processes the skill left behind, removes the copy, and writes a result
folder with the protocol (`run.json`), the raw transcript, and the extracted
review (`review.md`).

The review that comes back looks like this (an excerpt from a reference run):

```
| **HIGH** | CORRECTNESS | ▢ `src/cart.ts:30-31`: Loop bound `i <= items.length` reads
  `items[items.length]`, which is `undefined`, so `.quantity` throws a `TypeError`. ... |
| **HIGH** | PROPAGATION | ▢ `src/api.ts:34`: `order.total` is now in cents but still goes
  through `formatEuro`, which expects euros. Totals show 100× too large ... |
```

## Scoring without a judge

The obvious way to score such a review would be to ask another model whether each
finding matches an expected entry. We deliberately did not do that. A judging
model brings its own variance and its own blind spots, and when you compare models
you would no longer know which model you are measuring.

Instead, scoring is purely rule-based and works on locations. A parser reads the
findings table of the review (the format is fixed by the skill), and each finding
is assigned to an expected entry if it names the same file and its line range
overlaps the expected lines, with a tolerance of three lines. If several entries
qualify, the largest overlap wins, then the smallest distance, then the smallest
id. A finding that matches nothing is counted as **unassignable**; it is neither a
hit nor a false alarm. Findings the skill marks as `ACCEPTED` are ignored.

From that assignment come the two figures that matter:

- **recall**: the share of the seven defects the review reported, overall and per
  tier;
- **decoy false-alarm rate**: the share of the four decoys the review reported.

Because models are not deterministic, each model runs three times, and the report
gives mean, minimum, and maximum. A model passes ("threshold met") if, on average,
overall recall is at least 0.6, recall on the obvious tier is at least 0.8, and
the decoy false-alarm rate is at most 0.25. These thresholds were written down in
`thresholds.json` and committed *before* the first paid run, so nobody can tune
them to the results afterwards; the runner refuses paid runs if that file is
uncommitted or modified.

There is one more check, aimed at the test rather than the model. If the strongest
model finds every defect in every run, the test is **too easy** to tell models
apart, and the report says so. Otherwise the calibration is called "adequate".

## What the reference measurement showed

On 2026-11-03 we ran the test three times each with Claude Opus 5.5 and Claude
Sonnet 5.5. The whole measurement cost 3.59 USD, including two earlier plumbing runs; a run
took between one and a half and two minutes.

| Model | Recall overall | Recall obvious | Decoy false-alarm rate | Verdict |
|---|---|---|---|---|
| Opus 5.5 | 0.90 | 0.83 | 0.17 | threshold met |
| Sonnet 5.5 | 0.90 | 0.67 | 0.50 | threshold not met |

Both models found the hidden cross-file defects in every run, which is the
encouraging part. Sonnet fails the thresholds on two counts: it reported more
decoys, and it missed an obvious defect more often.

Reading the raw reviews tells a more nuanced story than the table, and it is worth
being honest about it. Several "misses" are not misses at all: the model described
the right defect but placed it at the call site or the declaration rather than at
the line we had recorded, and matching by location could not see that. Read by a
human, Opus found **all seven defects in all three runs**, which means that by the
intent of the calibration check the test is too easy, even though the rule-based
calibration says "adequate". Some of Sonnet's decoy reports are genuine (it
criticized the non-null assertion twice), others are artefacts of a wide line range
that happened to overlap a decoy. `reference/NOTES.md` lists every such case.

## What the numbers do not tell you

- **The case is small and now known to be too easy.** Seven defects in one change
  cannot rank strong models against each other. Before results are used as a
  statement about open-weight models, harder cases are needed.
- **Location matching is blunt.** It is reproducible and needs no judge, but it
  misses correct findings placed one hop away and credits unrelated findings with
  wide ranges. The notes recommend recording alternative locations for each defect
  and keeping decoys away from genuine weaknesses of the code.
- **Three runs are a small sample.** Means over three runs show tendencies, not
  significant differences.
- **Cost figures assume Anthropic prices.** For other endpoints the CLI still
  reports `total_cost_usd`, but the number means little.

## Going deeper

What the test promises, what it deliberately leaves out, and every design
decision with its reason and its price are written down in
[DESIGN.md](DESIGN.md). Read it before you change the fixture, the matching
rule, or the isolation of the runner.

## Reference

### Layout

| Path | Content |
|---|---|
| `fixture/base/`, `fixture/change/` | example project "shop-core": defect-free base and the reviewed change |
| `solution/expected.json` | expected-results list: defects in three tiers and decoys with locations (never part of a working copy) |
| `DESIGN.md` | guarantees, non-goals, design decisions, and known risks |
| `thresholds.json` | pre-registered thresholds (committed before the first measurement) |
| `check.mjs` | checks the expected-results list against the fixture |
| `run.mjs` | runner: throw-away copy, leak check, `claude -p`, result folder |
| `compare.mjs` | compares result folders with the expected-results list, report in Markdown and JSON |
| `selftest.mjs` | self-test of parser, matching, metrics, and runner helpers |
| `check-language.mjs` | language check of the deliverable (English only) |
| `testdata/` | canned `stream-json` transcripts for dry runs |
| `reference/` | reference measurement with Claude Opus 5.5 and Sonnet 5.5, plus `NOTES.md` |
| `results/` | local result folders (not versioned) |

### Prerequisites

- Node.js 22 or newer and Git; on Windows PowerShell is sufficient, Bash is not required
- for paid runs additionally: the Claude Code CLI (`claude`) with a login and the
  built `tool/` of this repository (`cd tool && npm start build`)

### Dry run (no model call, no cost)

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

### Measurement (paid)

A measurement starts only if `thresholds.json` is committed and unmodified,
`tool/` is built, and `--confirm-paid` is given:

```
node benchmark/repo-review/run.mjs --model sonnet --runs 3 --confirm-paid
node benchmark/repo-review/run.mjs --model opus   --runs 3 --confirm-paid
node benchmark/repo-review/compare.mjs
```

`--budget`, `--timeout-min`, and `--total-budget` change the limits;
`--prior-spent` carries over costs already spent in a series; `--keep` keeps the
throw-away copy for inspection. `node benchmark/repo-review/run.mjs --help` lists
all options. Built-in CLI plugins (`@builtin`) are only logged, not treated as an
isolation breach.

Run status: `ok`, `unparseable` (output not recognizable as a review, counts with
0 hits), `aborted` (cost or time), `error` (leak, isolation, contamination, start,
CLI error result).

### Report

`compare.mjs` writes `report.md` and `report.json`. Per model it reports recall
per tier and overall (mean, minimum, maximum), the decoy false-alarm rate, the
unassignable findings, the skill verdict per run, duration and cost, the
threshold verdict, and for Opus the calibration statement. Applied twice to the
same folders, `report.json` is byte-identical.

### Other endpoints (open-weight models)

```
$env:BENCH_TOKEN = "<provider token>"
node benchmark/repo-review/run.mjs --model <model-id> --base-url https://provider.example/v1 --auth-token-env BENCH_TOKEN --confirm-paid
```

`--base-url` sets `ANTHROPIC_BASE_URL`, `--auth-token-env` reads the token from the
named variable and sets `ANTHROPIC_AUTH_TOKEN`. The run protocol records the
endpoint (scheme, host, and path only), never the token. To try it without cost:
`node benchmark/repo-review/run.mjs --dry-run --base-url https://example.invalid --auth-token-env BENCH_TOKEN`.

## Origin

Approach and matching rule follow the effectiveness test of MERIT
(`tests/effectiveness/`); the code is written from scratch.

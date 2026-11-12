![Does your AI review catch the bugs? Find defects. Avoid false alarms.](assets/intro.png)

# Does the review find the bugs? An effectiveness test for `ase-repo-review`

[ASE](https://ase.tools) ships a skill called `ase-repo-review`: a packaged
prompt and workflow that the Claude Code CLI runs as a command. You point it at
a commit, and an AI model reads the change and writes a code review: a verdict
plus a table of findings, each with a severity and a file location. Such a
review can look convincing even when it misses defects. This benchmark asks a
plainer question: if we know exactly what is wrong with a change, how much of it
does the review catch, and how often does it complain about code that is fine?

This is a pilot: two small test cases, measured on 2026-11-03 three times each
with Claude Opus 5.5 and Claude Sonnet 5.5. Both cases turned out too easy for
Opus, and both measurements showed limitations in the test cases and the scorer
that need addressing before broader conclusions about model performance. The
numbers show tendencies and the limits of the test itself, not a ranking.
After the pilot both cases were revised (see
[What changed after the pilot](#what-changed-after-the-pilot)); the revised
cases are not yet measured. A third, harder case, `context-returns`, was added on
2026-11-12 (see [Case `context-returns`](#case-context-returns-the-hard-tier)); every
entry of its list is proven by a test, and it is not yet measured either.

## Purpose and scope

What is tested here is not a model on its own but a whole review setup: the
model, the ASE skill and the helper agent it delegates the reading to, the
Claude Code CLI that runs them, the tools they may use, the fixed prompt, and
the limits of a run. The benchmark therefore answers one question:

> How does this ASE review setup behave with different models under the same
> test conditions?

It does not answer what the ASE skill itself contributes to review quality.
That would need a second condition: the same model with an ordinary review
prompt, comparable context, tools, and budget. Such a baseline is not part of
this benchmark.

## How the test works

The approach is old and simple. We wrote a small project, introduced a change to
it, and deliberately seeded defects into that change. Since we put the defects
there, we know where they are, so we can check whether the review reports them.

### Defects and decoys

Finding defects is only half of a good review. A reviewer that flags every
second line would score perfectly on seeded defects and still be useless. So
the change also contains **decoys**: code that looks suspicious at first glance
but is correct, such as a deliberate fall-through in a `switch` that carries a
comment saying so, or a loose `== null` that deliberately covers both `null`
and `undefined`. A review that reports a decoy may be raising a false alarm.

The list of defects and decoys, the **expected-results list**, lives in
`cases/<name>/solution/expected.json` and never travels with the code under review. The
model sees a plain Git repository with two commits and nothing else; no file
name, commit message, or comment hints at what we expect to be found.

### Case `correctness-cents`

The project under review is a little TypeScript shop with a cart, discount
codes, orders, refunds, notifications, and an API layer. The base commit
(`cases/correctness-cents/fixture/base/`) contains no seeded defects. The change
(`cases/correctness-cents/fixture/change/`) looks like a plausible piece of everyday work: it switches
money amounts to integer cents, adds discount kinds, order options with a
currency, and some validation. It carries seven seeded defects in three
**tiers** and four decoys:

- **obvious** defects are visible in a single line, for example a loop that runs
  one position past the end of an array;
- **medium** defects need a little context, for example an `await` that went
  missing inside a `try` block, so a failed save never reaches the `catch`;
- **hidden** defects only show up when you follow the change across files, for
  example a function that now returns cents while its caller in another module
  still formats the value as euros, so the API shows a hundred times the amount.

### Case `security-refunds`

The second case starts from the same shop with those defects fixed and adds an
admin refund endpoint, a customer order lookup, a payment webhook, and HTML
confirmation mails. Its seven defects are the kind an attacker would look for:

- a refund amount taken from the request;
- a role check that lets callers without a role through;
- an order lookup that never asks who is asking;
- a webhook that only verifies the signature when one is sent;
- a discount code pasted into HTML unescaped;
- a refund of the amount before the discount;
- a failed payment that keeps the stock reserved.

Its four decoys look like security smells but are fine: a constant-time
signature comparison, a `Number()` conversion after a strict format check, a
`catch` that logs a mail with an invalid recipient instead of failing a stored
order, and an early return that acknowledges a repeated payment event. Each defect of this case also records a **minimum
severity** the review should assign: `HIGH` for money, other people's data, and
payment events, `MEDIUM` for injection into mails and blocked stock. A security
hole reported as `LOW` is half missed. The list lives in `cases/security-refunds/solution/expected.json`.

### Case `context-returns`, the hard tier

The first two cases form the **base tier**: every defect sits in a changed line
and follows a familiar pattern, and the strongest model of the pilot found all
of them. They stay as they are, as the cases a reference setup should pass. The
third case is the **hard tier**. It is meant to leave headroom at the top, and
its defects only show to a review that reads beyond the changed lines, checks
what comments and names promise, and thinks a sequence of steps through.

The case has its own, larger copy of the shop: twelve modules, among them a
store that keeps its own record of every order and a revenue report. The change
adds store credit, refunds that stay pending until the payment provider reports
them, and returns with a 14-day window. It touches eleven files with 498 changed
lines for eight defects, about 62 changed lines per defect where the base tier
has 24 and 34.

Two defects are **obvious** anchors, visible in one changed line: a loop that
skips the first line of a return, and a mail addressed to the order id. They
give weaker models a floor and show a broken run. The other six each belong to a
**class** that the base tier does not have:

- **sequence**: store credit is checked, then the code waits, then it books;
  two payments that overlap both pass the check;
- **domain**: line refunds are rounded one by one and do not add up to what was
  paid, so the last return of an order is rejected;
- **omission**, twice: the change adds a status and a field, and an unchanged
  module does not know them; the revenue report drops partially refunded orders,
  and the store forgets that store credit paid for an order;
- **false assurance**: an existing check for repeated provider events, with a
  comment that says so, does not recognize a repeated event of a partial refund;
- **interplay**: refunds are now pending at first, and a helper now counts
  settled refunds only; together they let the unchanged limit of goodwill
  refunds pay back more than was paid.

Four of these six name a location **outside the change**, in a line the commit
does not touch; a finding placed there counts as a hit. The five decoys resemble
the five classes and are correct in the code itself: a limit check before an
asynchronous call that books before it waits, a date window compared as text, a
division by an order total that is never zero, an article number written into a
mail without escaping after it was checked against the order, and an order
marked paid without the payment provider because store credit covered it.

The list (`cases/context-returns/solution/expected.json`, version 5) records the
class and a minimum severity per defect and the structure of the case: at least
four defects with a location outside the change, at least 60 changed lines per
defect, at least ten changed files. `check.mjs` verifies these figures against
the fixture, so they remain true when the fixture changes.

The case was written with Claude Fable (5.1 and 5.2). A model should not be
measured on a case it wrote, so these models are not candidates for this case.

### Proofs instead of claims

A subtle defect is easier to dispute than an obvious one. The pilot showed how a
list that rests on reading alone goes wrong: a decoy that was a real weakness,
and real weaknesses that were on no list. Every entry of the hard case therefore
comes with a test, and every defect with a small fix of its own, under
`cases/context-returns/solution/`:

```
node benchmark/repo-review/prove.mjs --case context-returns
```

The command builds the project as it is after the change and runs every test in
a process of its own. A defect counts as **proven** if its test fails on the
change and passes as soon as the fix of this defect alone is applied; a decoy if
its test passes on the change. With all fixes together every test must pass. A
test that breaks for another reason than a failed assertion proves nothing and
is reported as such; that includes a test that ends before an assertion it did
not wait for has run. The expected values of the tests come from the rules in the
README of the example project, not from its code. Tests and fixes never enter
the copy a review sees. The command needs Node.js 22.18 or newer, because it
translates the TypeScript of the example project with a built-in function of
Node.js, and so do the checks of the proofs in `selftest.mjs`; it calls no model
and costs nothing.

A proof shows that the code behaves wrongly. It does not show that a review can
find the defect, or that the case is hard enough: only a measurement does.

### What changed after the pilot

The manual reading of the pilot showed that the decoy match rate of both cases
measured flaws of the fixtures more than false alarms of the review. In
`security-refunds` (then called `security`) the amount check of the `Number()`
decoy let `""`, `"1e3"`, `"0x10"`, and `"+5"` through although its comment said
otherwise; the swallowed mail error could never occur and pointed to a retry
job that does not exist; the `Math.random` shuffle had no caller and was reported as scope creep by every run;
and two real weaknesses outside the list (an empty fallback for the webhook
secret, no status check in `markPaid` and `markFailed`) drew findings. In
`correctness-cents` (then called `shop-core`) the documented fall-through
contained the call of `percentOff`, so a finding about that defect could land on
the decoy.

The revision fixes exactly this and leaves the defects as they are: same ids,
tiers, titles, and minimum severities, same thresholds, only locations moved.
`correctness-cents` moves the fall-through into `describeCode`, away from
`percentOff`. `security-refunds` validates the amount format before `Number()`,
lets the mail `catch` handle an invalid recipient, replaces the shuffle with an
acknowledgement of repeated payment deliveries, fails when the webhook secret is
missing, and lets `markPaid`/`markFailed` accept only pending orders, while a
failed payment still keeps the stock reserved. The pilot fixtures, lists, and
reference runs remain in the Git history at commit `13014184`.

## Results

The current cases are not yet measured. Every measurement series goes into the
log [MEASUREMENTS.md](MEASUREMENTS.md) with the values computed at the time, a
defect-by-run matrix in plain words, the findings the scorer could not assign,
and the manual reading. The log also summarizes the pilot of 2026-11-03: both
cases were too easy for Opus, location matching undercounted correct findings
placed one hop away, and the decoy match rate mostly measured flaws of the
pilot fixtures, which led to the revision described above.

### Reading the figures

The automated figures come from a deterministic scorer that assigns each
finding to an expected entry **only by file name and line overlap** (the rule
is in [Scoring and limitations](#scoring-and-limitations)); a correct finding
placed at a different line, say at the caller, does not count. All values are
means over the runs of a configuration.

- **Location-matched recall**: the share of the defects of a case with a finding
  at a matching location, overall and per tier.
- **Decoy match rate**: the share of the decoys of a case with a finding at a
  matching location, whatever that finding says. The generated reports call the
  same number "decoy false-alarm rate".
- **Unassignable findings**: findings per run that match neither a defect nor a
  decoy; they may be real extra defects, fair remarks, or unfounded complaints.
- **Recall with adequate severity** (cases `security-refunds` and
  `context-returns`): the share of defects matched *and* reported with at least
  their minimum severity.
- **Automated thresholds**: provisional pass marks, fixed before the first paid
  run of a case. Base tier: overall recall ≥ 0.6, obvious tier ≥ 0.8, decoy match
  rate ≤ 0.25; the case `security-refunds` adds recall with adequate severity
  ≥ 0.5. Hard tier (`context-returns`): overall recall ≥ 0.5, obvious tier ≥ 0.8,
  decoy match rate ≤ 0.25, recall with adequate severity ≥ 0.4; the overall mark
  is lower because the case is meant to leave headroom.
  "Met" or "not met" judges the automated figures only, never the reading.

## Quick start

You need Node.js 22 or newer and Git; on Windows, PowerShell is enough. These
commands cost nothing and show the whole pipeline with a canned review:

```
node benchmark/repo-review/check.mjs
node benchmark/repo-review/run.mjs --dry-run
node benchmark/repo-review/compare.mjs
```

Every command takes `--case <name>` and works on `correctness-cents` without it;
the other cases are `security-refunds` and `context-returns`:

```
node benchmark/repo-review/check.mjs --case security-refunds
node benchmark/repo-review/run.mjs --dry-run --case security-refunds
node benchmark/repo-review/compare.mjs --case security-refunds
```

The hard case also has proofs for every entry of its list
(see [Proofs instead of claims](#proofs-instead-of-claims)). `prove.mjs` is the
one command that needs `--case`: the default case has no proofs.

```
node benchmark/repo-review/check.mjs --case context-returns
node benchmark/repo-review/prove.mjs --case context-returns
```

### A real measurement

A real measurement costs money. It needs the Claude Code CLI (`claude`) with a
login, the built `tool/` of this repository (`cd tool && npm start build`), and a
commit of the case and the scoring code, so the log can name what produced the
figures. One command runs the models, compares, and appends the log entry:

```
node benchmark/repo-review/measure.mjs --case security-refunds --confirm-paid
```

By default it runs Opus and Sonnet three times each (`--models`, `--runs`). All
runs of the call go into one series folder under `results/` of the case, and
only these runs are compared and logged. The entry in
[MEASUREMENTS.md](MEASUREMENTS.md) ends with a table per run for the manual
reading: fill in its two columns by hand, then commit the log. `--keep-reference`
also copies the runs into `reference/runs/` of the case, so they can be re-scored
later without new cost. To try the whole pipeline for free first:

```
node benchmark/repo-review/measure.mjs --case security-refunds --dry-run
```

The dry run writes a preview of the log entry into its series folder and leaves
the log alone. The log refuses a series it already holds, does not accept dry
runs, and requires the scoring code to be committed; `measure.mjs` checks this
before the first paid run. For single steps, `run.mjs` and
`compare.mjs --journal` remain available.

## Scoring and limitations

### Deterministic scoring by file and line

A parser reads the findings table of the review (the format is fixed by the
skill). Each finding is assigned to an expected entry if it names the same file
and one of its line ranges overlaps the expected lines, with a tolerance of three
lines; a location may list several ranges, such as `order.ts:29,51-52`.
An entry of the hard case may also name a location in a line the change does not
touch (`outside_change` in the list), for a defect whose real place is an
unchanged module; a finding there counts like one at the changed line.
If several entries qualify, the largest overlap wins, then the smallest distance,
then the smallest id. Findings the skill marks as `ACCEPTED` are ignored. No
language model judges anything; the same reviews always give the same scores.

From that assignment come the figures of [Reading the figures](#reading-the-figures).
For recall with adequate severity, the highest severity among the findings
matched to a defect counts.

On manual reading, a finding on a decoy counts as a false alarm only if it claims
the code behaves wrongly. A hint on readability or maintainability is not a false
alarm.

### What the decoy match rate does not cover

The decoy match rate measures false alarms on a few predefined spots only, four
in the base tier. Take
a review that finds all seven defects, leaves the four decoys alone, and adds
twenty unfounded complaints elsewhere: it scores a recall of 1.0 and a decoy
match rate of 0, although only seven of its 27 findings are right. That is why
the number of unassignable findings belongs next to the other figures. Counting
them all as false alarms would be wrong as well: only a manual review can tell
real additional defects and fair suggestions from unfounded complaints.

### Pilot thresholds

The thresholds listed under [Reading the figures](#reading-the-figures) are
provisional criteria chosen for the pilot cases, not requirements derived from
a concrete use. Their strength is that they are committed in the
`thresholds.json` of the case *before* its first paid run, so nobody can tune
them to the results; the runner refuses paid runs if that file is uncommitted
or modified.

### Ceiling-effect check

If the strongest model finds every defect in every run, the report says "too
easy". Otherwise it says "adequate", but that only means *no ceiling effect was
detected*. A score below 1.0 does not prove that the case is hard enough or
separates models well: in the pilot, the automated score stayed
below 1.0 while the manual reading found every defect.

### Known limitations

- **Three small cases.** Seven or eight defects per change cannot rank strong
  models, and the two cases of the base tier are too easy for Opus. More runs of
  the same case show its variance but fix neither the matching errors nor the
  lack of variety.
- **The hard case is unmeasured.** Its structure is checked and every entry is
  proven, but whether it is hard enough for the strongest model, and where a
  review reports a defect whose place lies outside the change, only a
  measurement and its manual reading can show. Its tiers and classes are the
  author's judgement.
- **Location matching is blunt.** It misses correct findings placed one hop away
  and credits unrelated findings with wide ranges. Recording alternative
  locations per defect and keeping decoys away from genuine weaknesses of the
  code would help (see the pilot summary in [MEASUREMENTS.md](MEASUREMENTS.md)).
- **The decoy match rate measures locations, not claims.** In the pilot of
  `security-refunds` it reached 0.50 for both models without a single false
  alarm on reading. Decoys that invite intent or style remarks inflate it; the
  revised cases remove the flawed decoys, and a severity-aware decoy match rate
  remains open.
- **Three runs per model** show tendencies, not significant differences.
- **Cost figures assume Anthropic prices.** For other endpoints the number means
  little.

The suggested order for developing the benchmark further: improve the matching
and the manual check, then add independent test cases, then compare more models.

## Technical reference

### What happens in a run

A run builds a throw-away copy of the example project in the system's temporary
directory: a fresh Git repository with the base commit and the change commit,
both with neutral messages and fixed dates. A **leak check** then scans every
file of the copy for words that could give the answers away (such as "bug",
"decoy", "TODO", or an entry id like `B-01`); a hit stops the run.

The runner then calls the Claude Code CLI non-interactively (`claude -p`, the
"print" mode that takes one prompt, works on it, and exits) with exactly the
prompt `/ase:ase-repo-review -c HEAD -S LOW`, that is, review the last commit and
report everything down to severity LOW. The CLI is fenced in:

- only the ASE plugin of this working copy is loaded, and only the `ase` MCP
  server (the tool server that ASE provides to the model) is reachable, so
  personal plugins and account connectors stay out;
- the model may read and search files and run `git`, but it may not edit or write
  anything and may not go to the web;
- inherited `CLAUDE*` and `ANTHROPIC_*` environment variables are removed;
- each run has a cost limit (5 USD) and a time limit (20 minutes); a series of
  runs has an overall budget (30 USD) with a 10 % reserve, and a run that reports
  no cost counts with its full limit.

If the CLI loads anything beyond what was allowed, the run ends with an
**isolation** error. If a tool call of the model reaches into this benchmark
(where the expected-results list lives) or into the ASE repository outside the
`plugin/` and `tool/` folders the run legitimately uses, the run ends with a
**contamination** error. Afterwards the runner kills processes the skill left
behind, removes the copy, and writes a result folder with the protocol
(`run.json`), the raw transcript, and the extracted review (`review.md`).

Run status: `ok`, `unparseable` (output not recognizable as a review, counts with
0 hits), `aborted` (cost or time), `error` (leak, isolation, contamination, start,
CLI error result).

### Options

`--case` selects the test case (`correctness-cents`, `security-refunds`, or
`context-returns`); `--budget`,
`--timeout-min`, and `--total-budget` change the limits;
`--prior-spent` carries over costs already spent in a series; `--keep` keeps the
throw-away copy for inspection; `--out` sets the location of the result folders.
`node benchmark/repo-review/run.mjs --help` lists all options. Built-in CLI
plugins (`@builtin`) are only logged, not treated as an isolation breach.

`compare.mjs` reports per model recall per tier and overall (mean, minimum,
maximum), the decoy match rate, the unassignable findings, the skill verdict per
run, duration and cost, the threshold verdict, and the ceiling-effect statement.
Applied twice to the same folders, `report.json` is byte-identical.

### Other endpoints (open-weight models)

```
$env:BENCH_TOKEN = "<provider token>"
node benchmark/repo-review/run.mjs --model <model-id> --base-url https://provider.example/v1 --auth-token-env BENCH_TOKEN --confirm-paid
```

`--base-url` sets `ANTHROPIC_BASE_URL`, `--auth-token-env` reads the token from the
named variable and sets `ANTHROPIC_AUTH_TOKEN`. The run protocol records the
endpoint (scheme, host, and path only), never the token. To try it without cost:
`node benchmark/repo-review/run.mjs --dry-run --base-url https://example.invalid --auth-token-env BENCH_TOKEN`.

### Testing the harness

These commands check the benchmark itself, not a model, and cost nothing:

```
node benchmark/repo-review/selftest.mjs
node benchmark/repo-review/check-language.mjs
node benchmark/repo-review/prove.mjs --case context-returns
node benchmark/repo-review/run.mjs --dry-run --simulate unparseable
node benchmark/repo-review/run.mjs --dry-run --simulate abort-cost
node benchmark/repo-review/run.mjs --dry-run --simulate abort-time
node benchmark/repo-review/run.mjs --dry-run --simulate leak
node benchmark/repo-review/run.mjs --dry-run --case security-refunds --simulate leak
```

`--replay <file>` plays back a custom `stream-json` transcript, for example
`testdata/isolation.jsonl` or `testdata/contamination.jsonl`; the special cases
are shared by all test cases, the normal transcript belongs to the case. Dry runs
appear in the report as a separate model group "(dry run)" and are never logged.

### Layout

| Path | Content |
|---|---|
| `cases/correctness-cents/` | case `correctness-cents`: `fixture/base/` without seeded defects and `fixture/change/` with the reviewed change, `solution/expected.json` with defects in three tiers and decoys (never part of a working copy), `thresholds.json` (pre-registered pilot thresholds), `testdata/normal.jsonl`, and `results/`; a `reference/` folder follows with its first measurement |
| `cases/security-refunds/` | case `security-refunds`: the same layout, with minimum severities in its list |
| `cases/context-returns/` | case `context-returns`, the hard tier: the same layout with a list of version 5 (classes, locations outside the change, structure of the case); `solution/proofs/` holds one test per entry and `solution/fixes.json` one fix per defect, both never part of a working copy |
| [DESIGN.md](DESIGN.md) | guarantees, non-goals, design decisions, and known risks |
| `check.mjs` | checks the expected-results list against the fixture and prints the size of the change |
| `prove.mjs` | proves the expected-results list of a case: every defect fails its test on the change and passes with its own fix, every decoy passes |
| `measure.mjs` | one measurement in one command: runs of several models, comparison, log entry with a template for the manual reading |
| `run.mjs` | runner: throw-away copy, leak check, `claude -p`, result folder |
| `compare.mjs` | compares result folders with the expected-results list, report in Markdown and JSON, optionally appended to the log |
| [MEASUREMENTS.md](MEASUREMENTS.md) | log of all measurement series, never rewritten |
| `selftest.mjs` | self-test of parser, matching, metrics, runner helpers, list rules, and proofs |
| `check-language.mjs` | language check of the deliverable (English only) |
| `testdata/` | canned `stream-json` transcripts of the special cases, shared by all cases; `testdata/runs/` holds six real run protocols and reviews of the pilot as test data for the log |
| `assets/` | images of this README |

### Going deeper

What the test promises, what it deliberately leaves out, and every design
decision with its reason and its price are written down in
[DESIGN.md](DESIGN.md). Read it before you change the fixture, the matching
rule, or the isolation of the runner.

## Origin

Approach and matching rule follow the effectiveness test of MERIT, a separate
project with its own test of an AI reviewer (`tests/effectiveness/`); the code
here is written from scratch.

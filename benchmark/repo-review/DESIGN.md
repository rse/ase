# Design of the `ase-repo-review` effectiveness test

The [README](README.md) tells the story of the test: why it exists, how a run
unfolds, and what the pilot showed. This document is for the
person who wants to change the test, extend it, or argue with it. It states what
the test promises, what it deliberately leaves out, and the design decisions
behind it, each with the reason it was taken and the price it costs.

## What the test guarantees

These are the properties the test was built and checked against. If a change
breaks one of them, the change is wrong or the property needs an explicit,
documented revision.

1. **Defined cases.** Each test case consists of a base without intentionally
   seeded defects and exactly one change. Its expected-results list holds at
   least two defects per tier (obvious, medium, hidden), at least one hidden
   defect spanning two files, and at least three decoys, each with its locations.
   A list that records minimum severities (version 4 and later) names one for
   every defect and has at least one defect with two locations in the same file.
2. **A valid expected-results list.** Every entry points to existing lines that
   the change touches; `check.mjs` reports "valid" for every entry.
3. **No hint at the answers.** The working copy of a run contains neither the
   expected-results list nor any file name, comment, or commit message that hints
   at defects or decoys. The runner checks this before every model call and stops
   otherwise.
4. **A fixed, bounded invocation.** A run calls `claude -p` without dialogue, with
   the plugin of this working copy and exactly `/ase:ase-repo-review -c HEAD -S LOW`,
   and keeps to its cost and time limit; when it exceeds one, it ends as `aborted`.
5. **A complete protocol.** Every result folder holds the requested and the
   reported model, the endpoint, the CLI version, the ASE version and commit,
   start time, duration, cost, status, and reason, plus the full transcript and
   the raw review.
6. **Scoring without a model.** Findings are assigned to the expected-results list
   purely by file name and line overlap with a fixed tolerance. Applied twice to
   the same result folders, the comparison produces byte-identical JSON reports.
7. **A complete report.** Per model: recall per tier and overall (mean, minimum,
   maximum over the runs), decoy false-alarm rate, unassignable findings, the
   skill's verdict per run, the number of unparseable runs, duration, and cost;
   for a case with minimum severities also the recall with adequate severity.
8. **No silent zeros.** A review output that cannot be recognized is counted as
   `unparseable` and scored with zero hits, never quietly as "no findings".
9. **Pre-registered pilot thresholds.** The thresholds are committed before the
   first paid run. The report names them, the version of their file, and the
   verdict "threshold met" or "threshold not met" per model. They are provisional
   criteria for this pilot case, not requirements derived from a concrete use.
10. **A ceiling-effect check.** If the strongest model finds every defect in
    every run, the report says "too easy" and names the next step (add harder
    cases); otherwise it says "adequate", which only means that no ceiling effect
    was detected, not that the case is hard enough or separates models well.
11. **Windows without Bash.** Runner, checks, and comparison run on Windows 11 with
    Node.js alone, also from paths containing spaces.
12. **Other endpoints.** The model and an alternative endpoint
    (`ANTHROPIC_BASE_URL`, a token from a named variable) are parameters; the
    protocol records the endpoint but never the token.
13. **Contained.** The test changes nothing in the repository outside
    `benchmark/repo-review/`, in particular nothing under `plugin/`, `tool/`,
    `pages/`, or `test/`.
14. **English throughout.** File names, identifiers, data formats, console
    output, reports, and documentation are English. The only exception is the
    list of search terms of the leak check, which must also catch German hints in
    the fixture; `check-language.mjs` verifies this.

## What the test deliberately does not do

- It does not let a language model judge the findings.
- It tests a whole review setup (model, ASE skill, Claude Code CLI, tools, prompt,
  and limits) and compares models within that setup. It does not measure what the
  ASE skill itself contributes; that would need a baseline with the same model
  and an ordinary review prompt.
- It does not change `ase-repo-review`, its sub-agent, or any other part of ASE.
- It measures one skill only; it is not a general harness for other skills, and
  it is not wired into the repository's `test/` directory.
- It ships the parameters for open-weight models, but no measurement with them.
- It runs neither in CI nor on a schedule. Every run is started by hand, and every
  group of paid runs needs a deliberate decision about its cost.
- The measurements do not use `--thorough`.

## Design decisions

### Plain Node.js, no dependencies

The scripts are ES modules (`.mjs`) that use only Node.js built-ins and need
Node.js 22, which `tool/` already requires. There is no `package.json` and no
build step.

*Why:* the test must run on Windows without Bash and without an install step, and
it must not touch any build target of the repository. *Price:* no TypeScript type
check for the scripts. `selftest.mjs` compensates with hand-computed expectations.

### A throw-away copy built from two directories

The example project of a case lives as two plain directories, `fixture/base/`
and `fixture/change/`. Each run copies `base` into a fresh directory under the
system's temporary folder, commits it, overlays `change`, and commits again, with
neutral messages ("Initial version", "Update order handling"), fixed dates, and
`core.autocrlf=false`. The copy also receives a minimal ASE project
configuration, so behavior does not depend on a project default.

*Why:* nested Git repositories inside the ASE repository would be fragile, and the
line numbers of the expected-results list must refer unambiguously to the state
after the second commit. *Price:* every change to the fixture requires re-running
`check.mjs`, because line numbers shift easily.

### A leak check with a deny list

Before any model call, the runner verifies that the copy contains exactly the
expected files and that no file content, file name, or commit message contains a
term from a fixed deny list (such as "bug", "decoy", "TODO", "fixme", "hack", and
their German counterparts, and terms of intent such as "intentionally",
"deliberately", "on purpose", "by design", "seeded", and "planted") or an entry
id like `B-01`. Multi-word terms match with spaces, tabs, or hyphens between
their words; file contents are checked line by line. A hit ends the run as
`error` with reason `leak`.

*Why:* "the fixture gives nothing away" has to be a check, not a matter of care.
*Price:* the fixture may not use these words even in harmless code.

### Isolation by construction, verified at runtime

The CLI runs with `--setting-sources ""` (no personal settings), `--plugin-dir`
pointing to this working copy's plugin, and `--strict-mcp-config` together with a
generated `--mcp-config` that names exactly the `ase` server. Personal plugins and
the connectors of the Claude account therefore stay out. The model may read,
search, and run `git`; editing, writing, and web access are disallowed, and
`--permission-mode dontAsk` prevents questions. `--bare` was rejected because it
also switches off the ASE plugin's hooks.

Construction alone is not proof. The runner therefore inspects the CLI's `init`
event as soon as it arrives: another plugin (other than the CLI's own built-in
plugins, which are only logged), another MCP server, or a missing `ase` server
stops the run at once as `error` with reason `isolation`, before it costs much.
After the run, every tool call in the transcript is checked for access to this
benchmark or to the ASE repository outside `plugin/` and `tool/`; such a run ends
as `error` with reason `contamination` and is not evaluated.

*Why:* the expected-results list sits in the same repository as the plugin under
test; only a check makes a breach visible and deterministic. *Price:* read
access outside the copy can only be limited, not prevented, by tool permissions;
it is detected afterwards. Paths obscured on purpose, for instance through Git
aliases, remain a residual risk.

### Hard cost and time limits

Each run passes `--max-budget-usd` (default 5) to the CLI and is guarded by a
timer (default 20 minutes) that kills the whole process tree (`taskkill /T /F` on
Windows, a process-group signal elsewhere). Before every further run the runner
checks the series budget (default 30 USD): the cost so far plus the per-run limit
plus a 10 % reserve must fit. A run without a cost report counts with its full
limit. After every run, leftover ASE processes from the copy are stopped.

*Why:* paid runs were approved with fixed limits, and the limits should be
enforced by code, not by attention. *Price:* the CLI stops only between steps, so
a single run can end slightly above its limit; the protocol records the actual
amount.

### Paid runs need two deliberate steps

Every run without `--dry-run` requires `--confirm-paid`, a built `tool/`, and a
`thresholds.json` that exists, is valid, and has no uncommitted changes.

*Why:* this secures both the cost decision and the pre-registration of the
thresholds technically. *Price:* a paid run needs a decision and a flag; that is
the point.

### Dry runs cover everything but the model

`--dry-run` executes every step except the model call and replays a canned
`stream-json` transcript from the `testdata/` folder of the case. `--simulate` produces the special
cases (cost abort, time abort, unparseable output, leak), and the endpoint
parameters are recorded in the dry-run protocol as well.

*Why:* most guarantees can be demonstrated without spending money. *Price:* a dry
run cannot prove that `claude -p` really loads the plugin; only a real run shows
that, which is why the first paid run was a single, cheap one.

### One result folder per run, never overwritten

Each run writes `results/{UTC time}-{model}-{n}/` in the folder of its case with `run.json`,
`transcript.jsonl`, `review.md`, and `stderr.txt`. An existing folder is never
overwritten, and `run.json` is written last, so its presence marks a finished
run. `results/` is not versioned; the reference measurement is committed under
`reference/` of the case.

*Why:* traceability, and a failed run must affect nothing but its own folder.
*Price:* transcripts can be large.

### A strict parser instead of interpretation

The parser reads the verdict line and the findings table in the fixed output
format of the skill. It tolerates small variations (with or without the checkbox
character and backticks, single lines or ranges, several ranges of one file such
as `order.ts:29,51-52`, escaped `|`) but does not
interpret free text. Without a verdict, or without a table or the line
`**NO FINDINGS**`, the run is `unparseable`. A finding without a recognizable
location is unassignable.

*Why:* scoring must be reproducible, and a format it cannot read must show up as
such instead of turning into zero findings. *Price:* a format change in a later
ASE version can make runs unparseable; the report counts them visibly.

### Matching by location, with a tolerance

A finding matches an entry if it names the same file and one of its line ranges,
widened by three lines on each side, overlaps one of the entry's locations. Among several
candidates the largest overlap wins, then the smallest distance, then the
smallest id. Each entry counts at most once per run; further matches are counted
as duplicates. `ACCEPTED` findings are neither hits nor false alarms but are
listed. A match on a decoy is a false alarm; everything else is unassignable.

*Why:* it is deterministic, needs no judging model, and follows the matching rule
of the MERIT effectiveness test. *Price:* coarse line ranges can hit a
neighboring entry by accident, so entries in the same file keep at least eight
lines apart. And a correct finding placed one hop away, at a call or a
declaration, is missed; the pilot summary in [MEASUREMENTS.md](MEASUREMENTS.md)
names the cases seen so far. Until 2026-11-03 the parser read only the first
range of a location that lists several; the pilot entries at commit `13014184`
hold the measurement scored both before and after that fix.

### Metrics that cannot be gamed by failure

Recall is the share of defects hit, per tier and overall; the decoy false-alarm
rate is the share of decoys reported. Per model the report gives mean, minimum,
and maximum over the evaluated runs. An `unparseable` run enters recall with zero
hits but stays out of the false-alarm rate, since it would otherwise make that
rate look better. `aborted` and `error` runs enter no rate and are counted
separately. "Threshold met" requires all three thresholds at once.

*Why:* a model must not be able to improve its score by producing unreadable
output. *Price:* the false-alarm rate may rest on fewer runs than recall; the
report shows both numbers. More importantly, the rate covers only the four
predefined decoys and counts any finding located there, whatever it says, while
unassignable findings count nowhere. A review with twenty unfounded complaints
elsewhere still scores a rate of 0. The report therefore shows the unassignable
findings next to the rates; whether they are real defects, fair suggestions, or
false alarms can only be decided by reading them. On reading, a remark on a decoy
counts as a false alarm only if it claims that the code behaves wrongly.

### A deterministic report

`report.json` has sorted keys, runs sorted by folder name, numbers rounded to
four decimals, and no generation timestamp. `report.md` is rendered from
`report.json` only. The threshold version is the last Git commit of
`thresholds.json` plus a flag for uncommitted changes.

*Why:* identical inputs must give byte-identical reports, and the report must say
which thresholds it applied. *Price:* the report carries no timestamp; the run
protocols provide the time reference.

### English deliverable

Everything under `benchmark/repo-review/` is English, checked by
`check-language.mjs`, whose only exemption is the deny list of the leak check.
The protocols of the pilot runs, which were paid for before this decision,
were translated once by a fixed mapping of keys and values and marked with the
field `migrated`; transcripts and raw reviews are untouched, and every figure of
the report is identical before and after.

*Why:* the target repository is English, and repeating paid runs only to change
their language would waste money. *Price:* the pilot protocols (six of them
remain as test data under `testdata/runs/`) are no longer byte-identical to
their original form; the first pilot entry at commit `13014184` records this.

### Several cases, one scorer

A test case is a directory with `fixture/`, `solution/expected.json`,
`thresholds.json`, `testdata/`, `reference/`, and `results/`, and every case
lives under `cases/<name>/`. One table in `lib/common.mjs` maps case names to
directories, and `resolveCase(name)` is the only place that knows the paths;
`run.mjs`, `check.mjs`, and `compare.mjs` take `--case` and default to
`correctness-cents`. Every run protocol records its case, and the comparison
evaluates only result folders of the selected case; protocols without the field
count as the default case.

*Why:* the first case turned out too easy and carries only correctness defects,
and comparisons across cases need the same runner, scorer, and log. One layout
for all cases keeps the benchmark root free of case data. *Price:* a result
folder cannot be moved from one case to another.

### A minimum severity per defect

Lists from version 4 on record for every defect the lowest severity a review
should assign (`HIGH` or `MEDIUM`). A matched defect counts as adequately
reported when the highest severity among the findings matched to it reaches that
minimum. The report shows the recall with adequate severity next to the plain
recall, and a case may add a fourth threshold, `recall_adequate_min`, which the
verdict applies only when the threshold file names it. All of this exists only
for lists with minimum severities, so the reports of cases without them do not
change.

*Why:* for security defects, finding the spot is not enough; a refund hole
reported as a `LOW` style remark would be waved through. *Price:* the minimum
severity is a judgement recorded in the list, made before the measurement and
open to argument like the thresholds.

### Cases are revised in place, with a placement rule for decoys

A case that needs better decoys or a cleaner fixture is changed in place. Its
earlier state, together with the measurements taken on it, stays in the Git
history; the log names the commit. Every decoy follows one placement rule: it is visibly correct in the
code itself, not only in its comment; it belongs to the told change and has a
caller; it contains no call of a seeded defect; it lies outside the matching
tolerance of every defect location and of every known weakness outside the list;
and no comment near it uses a term of intent.

*Why:* the manual reading of the pilot showed decoys that measured the fixture,
not the review: a validation weaker than its comment, a `catch` that could never
run, dead code, and a decoy wrapped around the call of a defect. Keeping old and
new fixtures side by side would only have multiplied the cases. *Price:* the
pilot measurements cannot be re-scored without checking out their commit, and
figures before and after a revision are comparable per defect only.

### An append-only measurement log

`measure.mjs` (or `compare.mjs --journal MEASUREMENTS.md` for existing result
folders) renders one section per measurement series and appends it, together
with one overview row per configuration. The
section holds the configuration (models, endpoint, ASE and CLI versions, digests
of the test case and of the expected-results list at run time and at scoring
time, threshold version, and the commit of the scoring code), the automated
figures, a defect-by-run and a decoy-by-run matrix with the short titles of the
expected-results list, and the text of every unassignable finding. A series is
identified by the names of its result folders together with the commit of the
scoring code; the log refuses a series it already holds, does not accept dry
runs, and refuses to log while the scoring code has uncommitted changes. The section ends
with a template for the manual reading, one table per run with every finding,
its automated match, and two columns filled in by hand. Entries are never rewritten: a correction is a
dated note, a re-scoring with a changed scorer is a new entry.

*Why:* `report.md` and `report.json` are regenerated on every comparison and
follow the current scorer and expected-results list. Comparisons across cases,
scorer versions, and models over months need the figures as they were computed,
next to what a person found when reading the reviews. *Price:* the log grows with
every series, and the overview of an old series may describe a scorer that has
since been fixed; the scorer commit in each entry says which.

## Known risks

- **Case too easy.** On reading the reviews, the strongest model found every
  defect in every run. Harder cases are needed before results say anything about
  open-weight models.
- **Scorer and reading disagree.** Location matching both misses correctly
  described defects and credits unrelated findings to decoys. Automated figures
  must be read together with a manual check until the matching improves.
- **Unknown precision.** Unassignable findings are not classified, so the share
  of unfounded complaints outside the decoys is not measured.
- **Security decoys provoke.** The decoys of the case `security-refunds` look
  like security smells, so reviews flag them more readily than the style decoys
  of `correctness-cents`; the decoy rates of the two cases are not comparable
  with each other. In the pilot the rate reached 0.50 for both models without a
  false alarm on reading, and one decoy (`Number()` followed by
  `isSafeInteger`) turned out flawed; the revised case checks the format first.
- **Training data.** Once published, the fixture may end up in future training
  data; a new, unpublished case would then be needed.
- **Skill format drift.** The output of the skill can change with new ASE
  versions; the protocol records the ASE version for that reason.
- **Sample size.** Three runs per model show tendencies, not significant
  differences.
- **Personal ASE configuration.** User-level ASE settings of the person running
  the test (persona, guidance level) still apply. According to the skill, the
  verdict and the findings table do not depend on them.

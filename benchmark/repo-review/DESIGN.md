# Design of the `ase-repo-review` effectiveness test

The [README](README.md) tells the story of the test: why it exists, how a run
unfolds, and what the reference measurement showed. This document is for the
person who wants to change the test, extend it, or argue with it. It states what
the test promises, what it deliberately leaves out, and the design decisions
behind it, each with the reason it was taken and the price it costs.

## What the test guarantees

These are the properties the test was built and checked against. If a change
breaks one of them, the change is wrong or the property needs an explicit,
documented revision.

1. **A defined case.** The example project consists of a defect-free base and
   exactly one change. The expected-results list holds at least two defects per
   tier (obvious, medium, hidden), at least one hidden defect spanning two files,
   and at least three decoys, each with its locations.
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
   skill's verdict per run, the number of unparseable runs, duration, and cost.
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
- The reference measurement does not use `--thorough`.

## Design decisions

### Plain Node.js, no dependencies

The scripts are ES modules (`.mjs`) that use only Node.js built-ins and need
Node.js 22, which `tool/` already requires. There is no `package.json` and no
build step.

*Why:* the test must run on Windows without Bash and without an install step, and
it must not touch any build target of the repository. *Price:* no TypeScript type
check for the scripts. `selftest.mjs` compensates with hand-computed expectations.

### A throw-away copy built from two directories

The example project lives as two plain directories, `fixture/base/` and
`fixture/change/`. Each run copies `base` into a fresh directory under the
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
their German counterparts) or an entry id like `B-01`. A hit ends the run as
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
`stream-json` transcript from `testdata/`. `--simulate` produces the special
cases (cost abort, time abort, unparseable output, leak), and the endpoint
parameters are recorded in the dry-run protocol as well.

*Why:* most guarantees can be demonstrated without spending money. *Price:* a dry
run cannot prove that `claude -p` really loads the plugin; only a real run shows
that, which is why the first paid run was a single, cheap one.

### One result folder per run, never overwritten

Each run writes `results/{UTC time}-{model}-{n}/` with `run.json`,
`transcript.jsonl`, `review.md`, and `stderr.txt`. An existing folder is never
overwritten, and `run.json` is written last, so its presence marks a finished
run. `results/` is not versioned; the reference measurement is committed under
`reference/`.

*Why:* traceability, and a failed run must affect nothing but its own folder.
*Price:* transcripts can be large.

### A strict parser instead of interpretation

The parser reads the verdict line and the findings table in the fixed output
format of the skill. It tolerates small variations (with or without the checkbox
character and backticks, single lines or ranges, escaped `|`) but does not
interpret free text. Without a verdict, or without a table or the line
`**NO FINDINGS**`, the run is `unparseable`. A finding without a recognizable
location is unassignable.

*Why:* scoring must be reproducible, and a format it cannot read must show up as
such instead of turning into zero findings. *Price:* a format change in a later
ASE version can make runs unparseable; the report counts them visibly.

### Matching by location, with a tolerance

A finding matches an entry if it names the same file and its line range, widened
by three lines on each side, overlaps one of the entry's locations. Among several
candidates the largest overlap wins, then the smallest distance, then the
smallest id. Each entry counts at most once per run; further matches are counted
as duplicates. `ACCEPTED` findings are neither hits nor false alarms but are
listed. A match on a decoy is a false alarm; everything else is unassignable.

*Why:* it is deterministic, needs no judging model, and follows the matching rule
of the MERIT effectiveness test. *Price:* coarse line ranges can hit a
neighboring entry by accident, so entries in the same file keep at least eight
lines apart. And a correct finding placed one hop away, at a call or a
declaration, is missed; the log in `MEASUREMENTS.md` documents the cases seen so
far. The parser also reads only the first range of a location that lists several
(`order.ts:29,51-52`); this is a known defect of the scorer, not a design choice.

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
The protocols of the reference runs, which were paid for before this decision,
were translated once by a fixed mapping of keys and values and marked with the
field `migrated`; transcripts and raw reviews are untouched, and every figure of
the report is identical before and after.

*Why:* the target repository is English, and repeating paid runs only to change
their language would waste money. *Price:* the reference protocols are no longer
byte-identical to their original form; the first entry of `MEASUREMENTS.md`
records this.

### An append-only measurement log

`compare.mjs --journal MEASUREMENTS.md` renders one section per measurement
series and appends it, together with one overview row per configuration. The
section holds the configuration (models, endpoint, ASE and CLI versions, digests
of the test case and of the expected-results list at run time and at scoring
time, threshold version, and the commit of the scoring code), the automated
figures, a defect-by-run and a decoy-by-run matrix with the short titles of the
expected-results list, and the text of every unassignable finding. A series is
identified by the names of its result folders; the log refuses a series it
already holds and does not accept dry runs. The manual reading is written by
hand below the generated part. Entries are never rewritten: a correction is a
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
- **Training data.** Once published, the fixture may end up in future training
  data; a new, unpublished case would then be needed.
- **Skill format drift.** The output of the skill can change with new ASE
  versions; the protocol records the ASE version for that reason.
- **Sample size.** Three runs per model show tendencies, not significant
  differences.
- **Personal ASE configuration.** User-level ASE settings of the person running
  the test (persona, guidance level) still apply. According to the skill, the
  verdict and the findings table do not depend on them.

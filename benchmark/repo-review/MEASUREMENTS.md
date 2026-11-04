# Measurements of the `ase-repo-review` effectiveness test

This log records every paid measurement of the benchmark: how well the ASE review
setup finds the defects seeded into a test case, and how often it complains
about code that is correct. The [README](README.md) explains the test cases, the
figures, and how to run a measurement.

Each series is appended by
`node benchmark/repo-review/measure.mjs --case <name> --confirm-paid` with the
values computed at that time; the manual reading is filled in by hand in the
table at the end of each entry. Existing entries are never rewritten:
corrections and re-scorings are added as dated notes or as new entries.

## Overview

One row per model and series. All automated figures count a finding only if it
names the file and lines recorded in the expected-results list; values are means
over the evaluated runs.

- **Recall overall / obvious**: share of all seeded defects, and of the obvious
  ones, that the review found at the right place.
- **Decoy match rate**: share of the decoys (correct code that looks suspicious)
  with a finding at their place.
- **Unassignable per run**: findings that match neither a defect nor a decoy.
- **Pilot thresholds**: whether the provisional pass marks of the case were met.
- **Manual reading**: what a person found when reading the reviews.

<!-- overview:start -->
| Series | Configuration | Endpoint | Runs evaluated | Recall overall | Recall obvious | Decoy match rate | Unassignable per run | Pilot thresholds | Cost (USD) | Manual reading |
|---|---|---|---|---|---|---|---|---|---|---|
<!-- overview:end -->

## Pilot (2026-11-03)

The first measurement used earlier versions of the two test cases, then named
`shop-core` and `security`. Each was reviewed three times by Claude Opus 5.5 and
three times by Claude Sonnet 5.5: 12 runs for 6.97 USD, including a few test runs
of the setup. The cases have since been revised and renamed (see
[What changed after the pilot](README.md#what-changed-after-the-pilot) in the README),
so the pilot figures cannot be compared with later series. The full pilot
entries, fixtures, and runs are in the Git history at commit `13014184`.

What the pilot showed:

- **Both cases were too easy for Opus.** Reading the reviews, Opus described all
  7 defects in every run of both cases. Sonnet missed one defect once in the
  first case and another one twice in the second, and twice rated the
  refund-amount defect lower than required.
- **Matching by file and line is too coarse.** Some correct findings were placed
  at the caller or a nearby line and did not count; some unrelated findings
  covered so many lines that they landed on a decoy. A parser error that read
  only the first line range of a finding has been fixed.
- **The decoy match rate measured the test cases, not the reviews.** On reading,
  there were 2 real false alarms on decoys (Sonnet, first case) and none in the
  second case, although its automated rate was 0.50. The rest came from flawed
  decoys, dead code, and two real weaknesses the expected-results list did not
  record. The revised cases fix these.

Still open:

- **Alternative places per defect**, such as the call next to the faulty
  function, so that a correct finding one step away still counts.
- **Separate counting of findings with very wide line ranges**, so that they no
  longer land on decoys by chance.
- **A decoy rate that weighs severity**, because a minor style remark on a decoy
  is not a false alarm.
- **Harder, independent test cases**, before the results say anything about
  other models, such as open-weight ones.

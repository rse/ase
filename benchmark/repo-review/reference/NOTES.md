# Notes on the reference measurement of 2026-11-03

The rule-based figures in `report.md` / `report.json` are authoritative (thresholds
and matching rule were fixed before the measurement). These notes are
**non-normative**: they record where matching by file and lines visibly misses
when reading the raw outputs. They change no figure in the report.

## Scope

- Evaluated: 3 runs each of Claude Opus 5.5 and Claude Sonnet 5.5, invocation
  `/ase:ase-repo-review -c HEAD -S LOW`, ASE 2.0.6 (`plugin/` and `tool/` unchanged since `4aae719e`),
  Claude Code CLI 2.1.302.
- Not included: two earlier Sonnet plumbing runs with the original invocation
  (`20261103T071925Z`: stopped by the isolation check, `20261103T072901Z`: `unparseable`
  because the sub-agent was not allowed to run `git`). Both led to the isolation
  setup and the tool permissions described in `DESIGN.md`.
- Cost of the entire measurement including plumbing runs: 3.59 USD.
- The run protocols (`run.json`) were translated to English keys and values on
  2026-11-03 by a fixed mapping (see "English deliverable" in `DESIGN.md`; marked
  by the field `migrated`);
  `transcript.jsonl` and `review.md` are unchanged. All metrics of the report are
  identical before and after the translation.
- The threshold values were committed in `c3f00a57` before the first paid run. The
  report names `f03489e6`, which only translated the `source` text of
  `thresholds.json`; the threshold values are unchanged (`git diff c3f00a57 f03489e6 -- thresholds.json`).

## Visible matching errors

| Run | Finding in the review | Rule-based scoring | On reading |
|---|---|---|---|
| sonnet `073102Z` | HIGH `discount.ts:30-36`: percentage codes compute the remaining amount wrongly | decoy K-01 reported, B-02 missed | B-02 found, but located at the `switch` instead of `percentOff` |
| opus `074051Z` | HIGH `discount.ts:33-34`: `percentOff` returns the discount instead of the remaining amount | decoy K-01 reported, B-02 missed | B-02 found, located at the call instead of the function |
| opus `073856Z` | HIGH `order.ts:29`: `DEFAULT_OPTIONS.tags` is mutated | unassignable, B-04 missed | B-04 found, located at the declaration instead of the `push` |
| opus `073856Z` | MEDIUM `discount.ts:22-36`: missing tests | decoy K-01 reported | unrelated to the decoy, wide range |
| sonnet `073102Z` | MEDIUM `api.ts:15-18`: hard-coded currency | decoy K-04 reported | unrelated to `== null`, hit only through the tolerance |
| sonnet `073357Z` | LOW `cart.ts:18-45`: unused functions | decoy K-03 reported | unrelated to the loop bound, wide range |

Genuine decoy reports (the decoy itself is criticized): K-02 (`customer!`) in two
Sonnet runs, K-01 as a LOW style hint in one Sonnet run; K-04 as a LOW hint on the
`== null` branching in one Sonnet run is a borderline case (the duplicated
branching is criticized, not the comparison).

## Consequence for the calibration

Rule-based, the calibration is "adequate" (Opus did not find all findings in two
runs). On reading, Opus found **all 7 findings in all three runs**; by the intent
of the calibration statement the test would therefore be **too easy**. Sonnet actually missed B-02 in
one run.

## Recommended improvements for a next case (not implemented)

- Expected-results list: add the locations of the declaration or the call where
  models typically place the same defect (for example B-04 also `order.ts:29`,
  B-02 also the call `discount.ts:34`); plan the minimum distance to decoys for it.
- Place decoys further away from spots with genuine, non-seeded weaknesses
  (K-04 next to the hard-coded currency, K-01 next to the percentage defect).
- Count wide ranges (more than 10 lines) separately instead of assigning them by overlap.
- Add harder cases before using results as a statement about open models.

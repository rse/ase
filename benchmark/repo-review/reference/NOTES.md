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

## Remarks on decoys, by content

On reading, a remark on a decoy counts as a false alarm only if it claims that
the code behaves wrongly; a design, readability, or maintainability hint does not.

| Run | Remark | Located at | Classification |
|---|---|---|---|
| sonnet `073102Z` | MEDIUM: optional `customer` with `customer!` "can crash at runtime" | `order.ts:21` (not matched to K-02) | false alarm on K-02 |
| sonnet `073523Z` | MEDIUM: `customer!` "hides a possible crash" | `notify.ts:7` | false alarm on K-02 |
| sonnet `073357Z` | MEDIUM: optional `customer` forces `customer!`; keep it required | `notify.ts:7` | design hint |
| sonnet `073102Z` | LOW: make the documented fall-through more explicit | `discount.ts:30-36` | readability hint |
| sonnet `073357Z` | LOW: the `== null` branching duplicates the `createOrder` call | `api.ts:19-21` | readability hint, not about the comparison |
| all three opus runs | MEDIUM: optional `customer` weakens the type and forces `customer!` | `order.ts:21` | design hint |

Result: Opus 0 and Sonnet 2 false alarms on decoys out of 12 decoy chances each
(4 decoys, 3 runs). The unassignable findings were not classified.

## Consequence for the ceiling-effect check

Rule-based, the statement is "adequate" (Opus did not reach full recall in two
runs), which only means that no ceiling effect was detected. On reading, Opus
found **all 7 findings in all three runs**; the case is therefore **too easy** for
Opus. Sonnet actually missed B-02 in one run (`073357Z`).

## Recommended improvements for a next case (not implemented)

- Expected-results list: add the locations of the declaration or the call where
  models typically place the same defect (for example B-04 also `order.ts:29`,
  B-02 also the call `discount.ts:34`); plan the minimum distance to decoys for it.
- Place decoys further away from spots with genuine, non-seeded weaknesses
  (K-04 next to the hard-coded currency, K-01 next to the percentage defect).
- Count wide ranges (more than 10 lines) separately instead of assigning them by overlap.
- Add harder cases before using results as a statement about open models.

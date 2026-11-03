# Effectiveness test ase-repo-review

Expected-results list: `sha256:498d34df09823361acd06f0fbbce51330cfa31f7f814f2ca70b4dc71b896da0f`

Thresholds: overall recall ≥ 0.6, obvious ≥ 0.8, decoy false-alarm rate ≤ 0.25; file version `c3f00a577d903e21c8f991b1c583917680f11f7b` (**warning: uncommitted changes**)

## Model opus

Verdict: **threshold met**

Calibration: **adequate**

Runs: 3 total, 3 evaluated, 0 unparseable, 0 aborted, 0 error

| Metric | Mean (min–max) |
|---|---|
| Recall overall | 0.90 (0.86–1.00) |
| Recall obvious | 0.83 (0.50–1.00) |
| Recall medium | 0.89 (0.67–1.00) |
| Recall hidden | 1.00 (1.00–1.00) |
| Decoy false-alarm rate (n=3) | 0.17 (0.00–0.25) |
| Unassignable findings per run | 1.00 (0.00–2.00) |
| Duration per run (s) | 116 |
| Total cost (USD) | 2.29 |

| Run | Status | Skill verdict | Hits | Decoys reported | Unassignable | Duration (s) | Cost (USD) |
|---|---|---|---|---|---|---|---|
| 20261103T073704Z-opus-1 | ok | REJECT - DEMANDS CHANGES | B-01, B-02, B-03, B-04, B-05, B-06, B-07 | – | 0 | 113 | 0.89 |
| 20261103T073856Z-opus-2 | ok | REJECT - DEMANDS CHANGES | B-01, B-02, B-03, B-05, B-06, B-07 | K-01 | 1 | 115 | 0.70 |
| 20261103T074051Z-opus-3 | ok | REJECT - DEMANDS CHANGES | B-01, B-03, B-04, B-05, B-06, B-07 | K-01 | 2 | 121 | 0.70 |

## Model sonnet

Verdict: **threshold not met**

Runs: 3 total, 3 evaluated, 0 unparseable, 0 aborted, 0 error

| Metric | Mean (min–max) |
|---|---|
| Recall overall | 0.90 (0.86–1.00) |
| Recall obvious | 0.67 (0.50–1.00) |
| Recall medium | 1.00 (1.00–1.00) |
| Recall hidden | 1.00 (1.00–1.00) |
| Decoy false-alarm rate (n=3) | 0.50 (0.25–0.75) |
| Unassignable findings per run | 2.00 (1.00–3.00) |
| Duration per run (s) | 93 |
| Total cost (USD) | 1.00 |

| Run | Status | Skill verdict | Hits | Decoys reported | Unassignable | Duration (s) | Cost (USD) |
|---|---|---|---|---|---|---|---|
| 20261103T073102Z-sonnet-1 | ok | REJECT - DEMANDS CHANGES | B-01, B-03, B-04, B-05, B-06, B-07 | K-01, K-04 | 3 | 93 | 0.33 |
| 20261103T073357Z-sonnet-1 | ok | REJECT - DEMANDS CHANGES | B-01, B-03, B-04, B-05, B-06, B-07 | K-02, K-03, K-04 | 1 | 86 | 0.32 |
| 20261103T073523Z-sonnet-2 | ok | REJECT - DEMANDS CHANGES | B-01, B-02, B-03, B-04, B-05, B-06, B-07 | K-02 | 2 | 100 | 0.35 |

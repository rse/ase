# Effectiveness test ase-repo-review

Expected-results list: `sha256:2fc1035957e0c0562f7efddd701394211494b9c39395ba6a3d2484a9a96fd0d5`

Thresholds: overall recall ≥ 0.6, obvious ≥ 0.8, decoy false-alarm rate ≤ 0.25, recall with adequate severity ≥ 0.5; file version `b97dc78f835e1058afe7051d13793dd6c4b49af0`

## Model opus

Verdict: **threshold not met**

Calibration: **too easy** -- next step: add harder cases before using results as a statement about open models

Runs: 3 total, 3 evaluated, 0 unparseable, 0 aborted, 0 error

| Metric | Mean (min–max) |
|---|---|
| Recall overall | 1.00 (1.00–1.00) |
| Recall obvious | 1.00 (1.00–1.00) |
| Recall medium | 1.00 (1.00–1.00) |
| Recall hidden | 1.00 (1.00–1.00) |
| Recall with adequate severity | 1.00 (1.00–1.00) |
| Decoy false-alarm rate (n=3) | 0.50 (0.25–0.75) |
| Unassignable findings per run | 2.33 (2.00–3.00) |
| Duration per run (s) | 119 |
| Total cost (USD) | 2.35 |

| Run | Status | Skill verdict | Hits | Adequate severity | Decoys reported | Unassignable | Duration (s) | Cost (USD) |
|---|---|---|---|---|---|---|---|---|
| 20261103T095529Z-opus-1 | ok | REJECT - DEMANDS CHANGES | B-01, B-02, B-03, B-04, B-05, B-06, B-07 | B-01, B-02, B-03, B-04, B-05, B-06, B-07 | K-03, K-04 | 2 | 116 | 0.91 |
| 20261103T095726Z-opus-2 | ok | REJECT - DEMANDS CHANGES | B-01, B-02, B-03, B-04, B-05, B-06, B-07 | B-01, B-02, B-03, B-04, B-05, B-06, B-07 | K-02, K-03, K-04 | 3 | 130 | 0.74 |
| 20261103T095936Z-opus-3 | ok | REJECT - DEMANDS CHANGES | B-01, B-02, B-03, B-04, B-05, B-06, B-07 | B-01, B-02, B-03, B-04, B-05, B-06, B-07 | K-04 | 2 | 111 | 0.69 |

## Model sonnet

Verdict: **threshold not met**

Runs: 3 total, 3 evaluated, 0 unparseable, 0 aborted, 0 error

| Metric | Mean (min–max) |
|---|---|
| Recall overall | 0.90 (0.86–1.00) |
| Recall obvious | 1.00 (1.00–1.00) |
| Recall medium | 1.00 (1.00–1.00) |
| Recall hidden | 0.67 (0.50–1.00) |
| Recall with adequate severity | 0.81 (0.71–0.86) |
| Decoy false-alarm rate (n=3) | 0.50 (0.25–0.75) |
| Unassignable findings per run | 3.67 (3.00–4.00) |
| Duration per run (s) | 91 |
| Total cost (USD) | 1.03 |

| Run | Status | Skill verdict | Hits | Adequate severity | Decoys reported | Unassignable | Duration (s) | Cost (USD) |
|---|---|---|---|---|---|---|---|---|
| 20261103T095032Z-sonnet-1 | ok | REJECT - DEMANDS CHANGES | B-01, B-02, B-03, B-04, B-05, B-06 | B-02, B-03, B-04, B-05, B-06 | K-01, K-04 | 4 | 87 | 0.37 |
| 20261103T095221Z-sonnet-1 | ok | REJECT - DEMANDS CHANGES | B-01, B-02, B-03, B-04, B-05, B-06 | B-01, B-02, B-03, B-04, B-05, B-06 | K-04 | 4 | 96 | 0.34 |
| 20261103T095357Z-sonnet-2 | ok | REJECT - DEMANDS CHANGES | B-01, B-02, B-03, B-04, B-05, B-06, B-07 | B-02, B-03, B-04, B-05, B-06, B-07 | K-01, K-03, K-04 | 3 | 92 | 0.32 |

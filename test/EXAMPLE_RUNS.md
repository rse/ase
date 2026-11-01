## With the anthropic models
```
./run_all_tests.sh
This runs ALL test cases of the ASE skill test harness.

WARNING: every case runs real agent sessions against the Anthropic API
(or the configured gateway), which consumes actual tokens and costs
actual money (roughly $8 for the full suite, capped at $20 by default
via --max-cost-usd).

Run all tests now? [y/N] y
running 12 run(s) of 8 case(s) (jobs: 4, budget: $20.00, results: /home/severin/ase/test/results/2026-11-01T08-39-23)
✔ code/edit-sort-script run 2 (51.9s, $0.6270)
✔ meta/brainstorm-headless run 2 (56.2s, $0.4517)
✔ meta/brainstorm-headless run 1 (1m 2.3s, $0.4659)
✔ code/edit-sort-script run 1 (1m 10.2s, $0.6834)
✔ meta/mint-uuid run 1 (14.8s, $0.3331)
✔ task/edit-headless run 1 (31.5s, $0.8715)
✔ task/edit-headless run 2 (28.9s, $0.7747)
✔ meta/brainstorm-headless run 3 (54.7s, $0.4341)
✔ task/list-seeded run 1 (10.5s, $0.3544)
✔ task/grill-scripted run 1 (57.5s, $0.8710)
✔ task/grill-llm run 1 (1m 52.8s, $1.0966)
✔ task/grill-semantic run 1 (1m 47.5s, $0.9665)

PASS code/edit-sort-script (2/2 runs passed, 1 required)
PASS meta/brainstorm-headless (3/3 runs passed, 2 required)
PASS meta/mint-uuid (1/1 runs passed, 1 required)
PASS task/edit-headless (2/2 runs passed, 1 required)
PASS task/grill-llm (1/1 runs passed, 1 required)
PASS task/grill-scripted (1/1 runs passed, 1 required)
PASS task/grill-semantic (1/1 runs passed, 1 required)
PASS task/list-seeded (1/1 runs passed, 1 required)

8/8 cases passed, total cost: $7.93
summary: /home/severin/ase/test/results/2026-11-01T08-39-23/summary.json
```

## With local models
```
./run_all_tests_local.sh
Running ALL test cases against the gateway of profile "etc/llm-local.env".

WARNING: local runs can take VERY long (more than an hour for the full suite),
as a locally served model generates far slower than the Anthropic API and the
runs are usually serialized (ASE_TEST_JOBS=1).

Note: the judges and simulators run there, too, and the reported costs are meaningless.
running 12 run(s) of 8 case(s) (jobs: 1, budget: $20.00, endpoint: http://127.0.0.1:4000, results: /home/severin/ase/test/results/2026-10-31T02-08-54)
✔ code/edit-sort-script run 1 (4m 35.4s, $1.3167)
✔ code/edit-sort-script run 2 (5m 30.5s, $1.5169)
✘ meta/brainstorm-headless run 1 (1m 52.7s, $0.1908)
    ✘ rubric: judge malfunctioned: 3/3 votes unparsable (model: claude-haiku-5-5)
    artifacts: /home/severin/ase/test/results/2026-10-31T02-08-54/meta/brainstorm-headless/run-1
✘ meta/brainstorm-headless run 2 (2m 23.8s, $0.6042)
    ✘ regex: missing match: RECOMMENDED IDEA|RECOMMENDATION
    ✘ rubric: judge malfunctioned: 3/3 votes unparsable (model: claude-haiku-5-5)
    artifacts: /home/severin/ase/test/results/2026-10-31T02-08-54/meta/brainstorm-headless/run-2
✘ meta/brainstorm-headless run 3 (1m 13.5s, $0.1564)
    ✘ regex: missing match: RECOMMENDED IDEA|RECOMMENDATION
    ✘ rubric: judge malfunctioned: 3/3 votes unparsable (model: claude-haiku-5-5)
    artifacts: /home/severin/ase/test/results/2026-10-31T02-08-54/meta/brainstorm-headless/run-3
✔ meta/mint-uuid run 1 (3m 12.3s, $0.8952)
✘ task/edit-headless run 1 (8m 59.9s, $2.7769)
    ✘ notErrored: session crashed: Claude Code returned an error result: Reached maximum budget ($2.5)
    ✘ budget: run cost $2.78 exceeds budget $2.50
    artifacts: /home/severin/ase/test/results/2026-10-31T02-08-54/task/edit-headless/run-1
✔ task/edit-headless run 2 (8m 11s, $2.4625)
✘ task/grill-llm run 1 (5m 40.7s, $1.2577)
    ✘ regex: missing match: GRILLING
    ✘ rubric: judge malfunctioned: 3/3 votes unparsable (model: claude-haiku-5-5)
    artifacts: /home/severin/ase/test/results/2026-10-31T02-08-54/task/grill-llm/run-1
✘ task/grill-scripted run 1 (10m 2s, $1.8145)
    ✘ notErrored: timeout after 600s
    artifacts: /home/severin/ase/test/results/2026-10-31T02-08-54/task/grill-scripted/run-1
✘ task/grill-semantic run 1 (9m 3.3s, $2.3273)
    ✘ notErrored: skill reported "▶ ERROR:"
    ✘ regex: missing match: GRILLING
    ✘ similar: judge malfunctioned: 3/3 votes unparsable (model: claude-haiku-5-5)
    artifacts: /home/severin/ase/test/results/2026-10-31T02-08-54/task/grill-semantic/run-1
✘ task/list-seeded run 1 (1m 42.9s, $0.5542)
    ✘ regex: forbidden match: gamma
    artifacts: /home/severin/ase/test/results/2026-10-31T02-08-54/task/list-seeded/run-1

PASS code/edit-sort-script (2/2 runs passed, 1 required)
FAIL meta/brainstorm-headless (0/3 runs passed, 2 required)
PASS meta/mint-uuid (1/1 runs passed, 1 required)
PASS task/edit-headless (1/2 runs passed, 1 required)
FAIL task/grill-llm (0/1 runs passed, 1 required)
FAIL task/grill-scripted (0/1 runs passed, 1 required)
FAIL task/grill-semantic (0/1 runs passed, 1 required)
FAIL task/list-seeded (0/1 runs passed, 1 required)

3/8 cases passed, total cost: $16.56
summary: /home/severin/ase/test/results/2026-10-31T02-08-54/summary.json
```

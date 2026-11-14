Test Description: `fibonacci-fleet`
===================================

## Purpose

This case is an end-to-end test of an *agent fleet* of ASE
(`ase agent fleet`). Like `wordcount-python`, it starts with an empty Git
project and a single, precisely specified task: a Python program which
prints the first N Fibonacci numbers, importing nothing but `sys`.
Unlike `wordcount-python`, the three built-in phase agents
`implementer`, `qualifier`, and `integrator` don't run one after the
other in the foreground, but all together as long-running members of a
fleet, supervised in the background, next to the fleet-owned agent
relay. They hand the task over to each other on their own, from
`PLANNED` to `INTEGRATED`. Finally, a black-box test suite checks the
program the fleet left on `master`, partly by comparing it with a
reference implementation.

| File                      | Role                                                           |
|---------------------------|----------------------------------------------------------------|
| `case.json`               | the case configuration (task `fibonacci`, runner `fleet`)      |
| `task.md`                 | the task fixture (ASE task format, id `fibonacci`, `PLANNED`)  |
| `suite/test_fibonacci.py` | the test suite (Python `unittest`, standard library only)      |
| `TEST-DESCRIPTION.md`     | this description                                               |

The driver is `test/agent/ase-agent-test.mts` (see `test/agent/README.md`).

## Shell Commands, in Execution Order

The notation and steps 1-3, 5, and 9 are the same as for
`wordcount-python` (see its `TEST-DESCRIPTION.md`). The differences:

### 4. Project Bootstrap and Task Feed

As for `wordcount-python` (with task `fibonacci`), plus the fleet
configuration `.ase/fleet.yaml`, written before the project setup commit
(so it is versioned and the `master` working copy stays clean):

```yaml
relay:
default:
    tool:     claude
    timeout:  30m
    parallel: 1
implementer:
    params:
        effort-wait: false
qualifier:
    mode:     qualify
integrator:
    mode:     squash
```

The empty `relay` section lets the fleet own the per-user agent relay,
which is isolated by the sandbox `HOME` and listens on a free port of
its own choice.

### 6. Agent Fleet (All Agents Together, in the Background)

```sh
ase agent fleet start                   # detached supervisor, returns once all members started
ase agent fleet status                  # relay, implementer, qualifier, integrator: running
curl -H "Authorization: Bearer <token>" http://<address>:<port>/projects/ase-agent-test/agents
                                        # all three agents present (address, port, token of relay.yaml)
# every 5 seconds: follow .ase/agent/fleet.log, and probe as in step 5
ase agent fleet stop                    # once INTEGRATED, failed, too expensive, or timed out
ase agent fleet status                  # must exit 1 (not running)
curl ...                                # the agent relay must be gone, too
```

The relay is checked over HTTP directly instead of through `ase agent
relay status`, as the host-local probe of the latter fails with undici 8
under Node 24 ("fetch failed").

The fleet log goes to the console and to `agents.log`. The polling ends:

-   with success once the task is `INTEGRATED` and no `:active` tag is
    left (the integrator settles its tags after the final status)
-   with failure once the task is `STALLED`, `DECLINED`, `DEFERRED`, or
    `CANCELLED`, or carries a `:failed` tag
-   with failure once the summed costs exceed `--max-cost-usd`
-   with failure after 3 × `--timeout` (default: 90 minutes)

A status passed between two polls still counts as reached, by the order
of the happy path (`PLANNED` < `IMPLEMENTING` < ... < `INTEGRATED`).
The report's pipeline table shows per agent the time from the fleet
start until the task reached its status, and the costs of the agent
taken from its prefixed log lines.

### 7.-8. Verification and Artifact Collection

As for `wordcount-python`, with `fibonacci.py` instead of `wordcount.py`,
plus `fleet.log` (the shared log of the fleet and all its members).

## Coverage

In addition to the coverage of `wordcount-python` (except for the
foreground one-shot agents):

| Area                                                       | Covered | Notes                                              |
|------------------------------------------------------------|---------|----------------------------------------------------|
| `ase agent fleet start/status/stop` (background)           | yes     | detached supervisor, `.ase/fleet.yaml`             |
| `ase agent fleet log` (the log file)                       | yes     | followed directly as `.ase/agent/fleet.log`        |
| fleet-owned `ase agent relay`                              | yes     | started and stopped by the fleet                   |
| agent presence on the relay                                | yes     | all three agents announce themselves               |
| long-running agents handing over a task                    | yes     | no `--one-shot`, polling agents                    |
| `ase agent relay status`                                   | no      | broken under Node 24, see above                    |
| fleet member restarts, orphan reaping                      | no      |                                                    |

## Pass Criteria

The test passes only if all of the following hold:

1.  the fleet starts, runs all four members, and all three agents are
    present on the agent relay
2.  the task reaches `INTEGRATED` without a `:failed` tag, within the
    deadline and the cost ceiling
3.  the fleet stops, together with its agent relay
4.  `fibonacci.py` is committed on `master`, and the working copy is on
    `master` and clean
5.  **all** tests of the suite pass (currently 13)

## Test Suite

`suite/test_fibonacci.py` runs `fibonacci.py` as a subprocess (with the
interpreter running the suite).

| Test                      | Checks                                                           |
|---------------------------|------------------------------------------------------------------|
| `test_zero`               | `N = 0` prints nothing, exit `0`                                 |
| `test_one`, `test_two`    | `0`, resp. `0 1`                                                 |
| `test_ten`                | `0 1 1 2 3 5 8 13 21 34`                                         |
| `test_hundred_is_exact`   | 100 lines, the last one `218922995834555169026` (no float)       |
| `test_matches_reference`  | `N = 500` equals the suite's own reference implementation       |
| `test_large_count`        | `N = 5000` works (no recursion limit), last value exact          |
| `test_missing_argument`   | usage message on stderr, no stdout, exit `1`                     |
| `test_too_many_arguments` | usage message on stderr, no stdout, exit `1`                     |
| `test_non_numeric`        | `abc` → `fibonacci: invalid count: abc`, exit `1`                |
| `test_negative`           | `-3` → `fibonacci: invalid count: -3`, exit `1`                  |
| `test_fractional`         | `2.5` → `fibonacci: invalid count: 2.5`, exit `1`                |
| `test_imports_only_sys`   | the program's syntax tree imports no module other than `sys`     |

## Running

```sh
cd test
node agent/ase-agent-test.mts --case fibonacci-fleet --dry-run       # no agents, no tokens
node agent/ase-agent-test.mts --case fibonacci-fleet --keep-failed   # full run
./run_agent_test.sh                                                  # both cases in parallel
```

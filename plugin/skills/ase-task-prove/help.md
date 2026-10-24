
##  NAME

`ase-task-prove` - Prove a Task Plan Implementation

##  SYNOPSIS

`ase-task-prove`
    [`--help`|`-h`]
    [`--next`|`-n` *option*[,...]]
    [*id*]

##  DESCRIPTION

The `ase-task-prove` skill proves the implementation of a task plan
against its *verification claims* -- the `REG` and `CON` bullet-points
of its `VERIFICATION (WHEN)` section, fixed *before* the implementation
-- and emits a `PROVEN` / `NOT PROVEN` verdict backed by captured
transcripts. The result is persisted as a *proof ledger* attachment of
type `text/markdown; charset=utf-8; kind="proof"`.

For each claim it locates the *witness* -- the test case deciding the
claim, or the command of a claim like "the build succeeds" -- and runs
it twice, to detect instability. A test case witness is then
*falsified* and run again: for a `RESOLVING` plan the fix is reverted,
otherwise the production code is mutated exactly where the claim is
decided. The witness must now *fail*, for the reason the claim
predicts. A witness staying green is reported as `VACUOUS`: it cannot
notice the absence of the behavior it claims to check. Command
witnesses are not falsified.

Falsifiers modify the working tree in place. The skill captures a
restore anchor and a recovery journal (`.ase/proof/journal.json`)
before, restores after *every* falsifier, and verifies the restoration
by content hash; an unverifiable restoration forces `NOT PROVEN`. The
skill never repairs the implementation or the tests.

##  OPTIONS

-   `--next`|`-n` *option*[,...]:
    Automatically answer the user dialog for the next step. *option*
    is a single token or a *comma-separated chronological list* of
    tokens; the *first* token is consumed by this skill, the remaining
    ones are forwarded. Recognized tokens: `none` (default, interactive
    answer required), `DONE` (stop), `EDIT` (hand off to
    `ase-task-edit`), or `RESOLVE` (hand off the strongest finding to
    `ase-code-resolve`).

##  ARGUMENTS

-   *id*:
    The id of the task plan to prove. If omitted, the current task
    plan is used.

##  SCENARIOS

-   You want evidence that an implementation satisfies its verification claims
-   You want to know whether your tests would actually notice a regression

##  EXAMPLES

Prove the current task plan:

```text
❯ /ase-task-prove
```

Prove a given task plan and stop afterwards:

```text
❯ /ase-task-prove -n DONE T-042
```

##  SEE ALSO

[`ase-task-grill`](../ase-task-grill/help.md), [`ase-task-implement`](../ase-task-implement/help.md), [`ase-code-analyze`](../ase-code-analyze/help.md),
[`ase-code-lint`](../ase-code-lint/help.md).

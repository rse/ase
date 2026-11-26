
##  NAME

`ase-task-prove` - Prove a Task Plan Implementation

##  SYNOPSIS

`ase-task-prove`
    [`--help`|`-h`]
    [`--next`|`-n` *option*[,...]]
    [`--worktree`|`-w` *name*]
    [`--source`|`-s` *source*]
    [`--changeset`|`-c` *changeset*]
    [`--draft`|`-d`]
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
a test case or spec witness twice, to detect instability, but a command
witness only once. A test case witness is then
*falsified* and run again: for a `RESOLVING` plan the fix is reverted,
otherwise the production code is mutated exactly where the claim is
decided. For a `SPECIFYING` plan, a claim about the specification
content is witnessed by a spec witness, an `ase spec query` checking the
claimed statement, and falsified by mutating that statement in the
specification. The witness must now *fail*, for the reason the claim
predicts. A witness staying green is reported as `VACUOUS`: it cannot
notice the absence of the behavior it claims to check. Command
witnesses are not falsified.

The skill proves the change set where the plan's `Changeset:` key
locates it: uncommitted in the (context) worktree for `worktree`, and
materialized in a temporary, detached worktree for `branch:`*name*
(its committed state) and `attachment:`*name* (its unified diff applied
onto its base commit), which is removed afterwards.

Falsifiers modify the proof worktree in place. For a `worktree` change
set without `--worktree`, this is the current working copy, so parallel
sessions sharing it may observe the temporarily falsified files: the
skill warns about this, and an own worktree via `--worktree` avoids
it. The skill restores and verifies the files after *every*
falsifier; an unverifiable restoration forces `NOT PROVEN`. An
interrupted proof of a `worktree` change set leaves a recovery journal
`.ase/proof/<id>/journal.json`, which has to be recovered and removed
before the next proof; the temporary worktree of a `branch` or
`attachment` change set is just discarded by the next proof. The skill
never repairs the implementation or the tests.

Each claim ends as `PROVEN`, `VACUOUS` (the witness stays green under
falsification), `FAILED` (the witness already fails), or `BLOCKED`
(the claim cannot be decided, e.g. for a missing witness or an
unstable run).

##  OPTIONS

-   `--next`|`-n` *option*[,...]:
    Automatically answer the user dialog for the next step. *option*
    is a single token or a *comma-separated chronological list* of
    tokens; the *first* token is consumed by this skill, the remaining
    ones are forwarded. Recognized tokens: `none` (default, interactive
    answer required), `DONE` (stop), `EDIT` (hand off to
    `ase-task-edit`), or `RESOLVE` (hand off the strongest finding to
    `ase-code-edit --mode resolve`, resp. to `ase-task-edit` for a
    `branch` or `attachment` changeset or an unrestored working tree,
    and just stop on a `PROVEN` verdict). As `ase-code-edit` has no
    `--next` option, tokens after `RESOLVE` are ignored with a warning.

-   `--worktree`|`-w` *name*:
    Prove the change set in the existing *context worktree*
    `.ase/worktree/<name>` instead of the current working copy, as
    for `ase-task-implement`. A proof never creates it. The option is
    permitted for a `worktree` changeset only.

-   `--source`|`-s` *source*:
    Override the plan's `Source:` key (`worktree` or `branch:`*name*)
    for this run, without changing the plan, as for
    `ase-task-implement`. It determines the fork point of a `branch`
    change set, so only its own changes are reverted. The option is
    permitted for a `branch` changeset only.

-   `--changeset`|`-c` *changeset*:
    Override the plan's `Changeset:` key (`worktree`, `branch:`*name*,
    or `attachment:`*name*) for this run, without changing the plan.

-   `--draft`|`-d`:
    Shorthand for `--changeset attachment:draft`: prove the
    *implementation draft* of the plan. Mutually exclusive with
    `--changeset`.

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

Prove the implementation draft of the current task plan:

```text
❯ /ase-task-prove --draft
```

##  SEE ALSO

[`ase-task-grill`](../ase-task-grill/help.md),
[`ase-task-implement`](../ase-task-implement/help.md),
[`ase-code-analyze`](../ase-code-analyze/help.md),
[`ase-code-lint`](../ase-code-lint/help.md).


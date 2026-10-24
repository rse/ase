---
name: ase-task-prove
argument-hint: "[--help|-h] [--next|-n <option>[,...]] [<id>]"
description: >
    Prove the implementation of current or given task plan by executing
    the witness of each verification claim and empirically falsifying
    it, then emit a PROVEN / NOT PROVEN verdict. Use when the user wants
    the implementation "proven", the tests "verified", the evidence
    "delivered", or asks whether the change is "really correct".
user-invocable: true
disable-model-invocation: false
effort: xhigh
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-task-prove">
Prove a Task Plan Implementation
</purpose>

<expand name="getopt"
    arg1="ase-task-prove"
    arg2="--next|-n=(none|DONE|EDIT|RESOLVE)... --int-reuse-task">
    $ARGUMENTS
</expand>

<objective>
*Prove* the implementation of a task plan: execute the witness of each
verification claim, *empirically falsify* it, and emit a `PROVEN` /
`NOT PROVEN` verdict backed by captured transcripts.
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-format-task.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-common-task.md

Rules
-----

A passing test shows only that the code did not contradict the test. A
*proof* additionally shows that the test *would have noticed* had the
code failed the claim. You *MUST* honor the following rules:

-   **Observe, never repair**: do *not* fix the implementation, rewrite
    or weaken a test, or relax an expected value. The *only* files you
    may modify are those a falsifier modifies and restores, plus the
    task plan via `ase_task_save(...)`.

-   **Evidence over assertion**: every status traces to a command you
    actually ran, with its exit code and decisive output captured
    *verbatim*. Never paraphrase, reconstruct, or invent a transcript. A
    command you did not run yields `BLOCKED`.

-   **One falsifier at a time**: apply exactly one falsifier, run only
    its witness, restore, verify the restoration, and only then proceed.

-   **Targeted signal**: a falsified run counts only if the witness
    fails *for the reason the claim predicts*. A compile error or an
    unrelated cascade proves only that the falsifier was too coarse.

-   **Honest verdict**: `PROVEN` or `NOT PROVEN`, nothing in between. A
    `NOT PROVEN` verdict is a *successful* run of this skill; never
    soften it in prose.

Procedure
---------

1.  **Determine Task and Obligations:**

    1.  Set <instruction><getopt-arguments/></instruction> initially, with any
        leading and trailing whitespace stripped.
        Inherit the always existing <ase-task-id/> from the current context.
        Inherit the always existing <ase-session-id/> from the current context.
        Do not output anything.

    2.  React on task id:

        <expand name="task-react-id" arg1="ase-task-prove"></expand>

    3.  Determine the current task plan content:

        <expand name="task-load-content"></expand>

    4.  If the <task-content/> is still empty, complain and tell the user to
        use the `ase-code-resolve`, `ase-code-refactor`, `ase-code-craft`,
        or `ase-task-edit` skills first to create a task plan. Then
        immediately stop processing this skill.

    5.  Set <obligations/> to all `REG` and `CON` bullet-points of the
        `VERIFICATION (WHEN)` section, skipping the *inert* ones in
        state `[-]` or `[>]`. Give each one the <obligation-id/> of its
        bullet type plus its 1-based position among the bullet-points
        of that type (e.g. `REG1`, `CON2`), and set its <claim/> to its
        <text/>. Set <kind/> to the `Kind:` frontmatter key, or to
        `CRAFTING` if it is absent. Do not output anything.

    6.  <if condition="<obligations/> is empty">
        Deriving claims *now*, with the implementation in front of you,
        would only describe the code. Only output the following
        <template/> and then immediately *STOP* processing this skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-task-prove**, ▶ ERROR: plan **<ase-task-id/>** has no `REG` or `CON` verification claims
        </template>

        <ase-tpl-hint level="minimal">
        Use `/ase-task-grill --focus VERIFICATION` to fix the verification claims -- ideally *before* implementing.
        </ase-tpl-hint>
        </if>

2.  **Determine Witnesses and Falsifiers:**

    1.  Determine how tests are run in this project -- a command
        documented in the AI guidance files (`AGENTS.md`, `CLAUDE.md`,
        etc.) wins over one inferred from the build manifest -- and how
        a *single* test case is selected. If no way to run tests exists,
        set every obligation `BLOCKED` with the finding `no test runner
        determined`, set <baseline>restored</baseline>, and continue
        directly with step 4.

    2.  For every obligation, determine its <witness/>: either the test
        case deciding its <claim/> (cited as `<file/>::<case/>`) plus
        the command running only that case, or -- for a claim that a
        project procedure like build, lint, or the whole suite succeeds
        -- that command itself. An obligation without a witness gets
        <status>BLOCKED</status> with the test case the implementation
        must add as its <finding/>.

    3.  For every obligation with a *test case* witness, determine its
        <falsifier/> *automatically* from <kind/>, as a *precise*,
        executable edit and never as prose:

        -   `RESOLVING`: `REVERT` -- reverse-apply the *uncommitted* fix
            hunks of the production files (never of the witness). The
            fixed API still exists, so the witness fails on the
            reproduced defect. Without uncommitted fix hunks, fall back
            to `MUTATE`.
        -   otherwise: `MUTATE` -- replace the verbatim `<old-text/>`
            at `<file/>:<line/>` of the production code by a
            `<new-text/>` negating *the claim* (flip the comparison,
            boundary, sign, branch, or value the claim is about).
        -   only where neither applies: `PERTURB` -- substitute the
            input of the witness by one contradicting the claim.

        An obligation with a *command* witness gets the falsifier `n/a`:
        falsifying a build or linter proves nothing about the change.

3.  **Discharge Obligations:**

    First, output the following <template/>:

    <template>
    <ase-tpl-bullet-secondary/> **PROOF EXECUTION**
    </template>

    <if condition="any obligation has a falsifier other than `n/a`">
    Capture a *restore anchor* before the first falsifier: in a Git
    working tree, the output of `git stash create` (a dangling commit
    of the uncommitted state, touching neither tree nor stash list) plus
    `git hash-object` of every file a falsifier will touch; otherwise
    verbatim copies of those files below `.ase/proof/baseline/`. Write
    the anchor and the file list to `.ase/proof/journal.json`, so a
    manual recovery stays possible after an interruption.
    </if>

    Then process the obligations *strictly one at a time*, in order,
    skipping those already `BLOCKED`:

    1.  **Positive run:** run the witness command twice, capturing
        each time its exit code, its decisive output line, and a
        verbatim <transcript/> (command line, head and tail of the
        output with `[...]` elided, and `exit=<code/>`). Set <positive/>
        to `exit=<code/>, <decisive-line/>` of the first run.

        -   If both runs differ, set <status>BLOCKED</status> with the
            instability and its suspected source as <finding/>.
        -   Else if the run failed, set <status>FAILED</status> with
            what the implementation does instead as <finding/>.
        -   Else if the falsifier is `n/a`, set <status>PROVEN</status>
            and <falsified>n/a</falsified>.

        Continue with the next obligation once a status is set.

    2.  **Falsified run:** apply the falsifier, run the *same* witness
        command, capture it like above into <falsified/> and
        <transcript/>, and *always* restore afterwards -- even when the
        run errored -- from the forward patch resp. the restore anchor.
        Verify the restoration against the recorded hashes resp.
        copies. If it does not match, set
        <baseline>DIRTY: <files/></baseline>, output the following
        <template/>, and continue directly with step 4:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ ERROR: working tree *NOT* restored: **<files/>** -- recover via `.ase/proof/journal.json`
        </template>

    3.  **Judge:** if the witness failed for the reason the claim
        predicts, set <status>PROVEN</status>. If it *passed*, set
        <status>VACUOUS</status> with the precise insensitivity as
        <finding/> -- which assertion is missing, too weak, or watching
        the wrong value. If it failed for another reason, set
        <status>BLOCKED</status> with the narrower falsifier which
        would isolate the claim as <finding/>.

    4.  Output the following <template/>:

        <template>
        ○   **<obligation-id/>**: <status/>
        </template>

    Finally, set <baseline>restored</baseline> unless it was set to
    `DIRTY` above.

4.  **Report and Persist Ledger:**

    1.  Count <proven/>, <vacuous/>, <failed/>, and <blocked/>, and set
        <total/> to the number of obligations. Set
        <verdict>PROVEN</verdict> *if and only if* <proven/> equals
        <total/> and <baseline/> is `restored`, else set
        <verdict>NOT PROVEN</verdict>. Apply no other rule.

    2.  Render the <ledger/> with the following <template/>, with one
        table row per obligation and one evidence entry per obligation
        which is *not* `PROVEN` (for every obligation, if
        <ase-project-boxing/> is `white`), and output it framed by
        `<ase-tpl-head title="PROOF LEDGER"/>` and
        `<ase-tpl-foot title="PROOF LEDGER"/>`. If
        <ase-project-boxing/> is `black`, output only the verdict line.

        <template>
        ⚖ **VERDICT**: **<verdict/>** -- <proven/>/<total/> proven, <vacuous/> vacuous, <failed/> failed, <blocked/> blocked, baseline <baseline/>

        | ID | FALSIFIER | POSITIVE | FALSIFIED | STATUS |
        | -- | --------- | -------- | --------- | ------ |
        | <obligation-id/> | <falsifier-kind/> | <positive/> | <falsified/> | <status/> |

        -   **<obligation-id/>** ⟨<status/>⟩: <witness/>: <finding/>

            ```text
            <transcript/>
            ```

        </template>

    3.  Determine <timestamp-modified/> by calling the
        `ase_timestamp(format: "yyyy-LL-dd HH:mm")` tool of the `ase`
        MCP server and using the `text` field of its response. It stamps
        the attachment below *only*; the `Modified:` frontmatter key
        stays *untouched*.

    4.  Append <ledger/> as an attachment block to the "backmatter" of
        <task-content/> with the following <template/>, where <payload/>
        is <ledger/> with *every* line indented by *exactly* 4 spaces. If
        an attachment block of type `text/markdown; charset=utf-8;
        kind="proof"` exists, *replace* it in place and keep its
        `Created` value as <timestamp-attachment-created/>, else use
        <timestamp-modified/>:

        <template>
        ---
        Type:     text/markdown; charset=utf-8; kind="proof"
        Desc:     Proof Ledger
        Created:  <timestamp-attachment-created/>
        Modified: <timestamp-modified/>
        Data:     |4+
        <payload/>
        </template>

    5.  Call the `ase_task_save(id: "<ase-task-id/>", text:
        "<task-content/>")` tool of the `ase` MCP server to save the
        plan. This is the *only* permitted way to persist it -- *NEVER*
        write the plan file via `Write`/`Edit` or a shell command. Do
        not output anything related to this call except the following
        <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⚖ verdict: **<verdict/>**, ▶ status: **proof ledger persisted**
        </template>

5.  **Decide Next Step:**

    1.  *Determine next step*:

        <expand name="task-next-select"
            arg1="ase-task-prove"
            arg2="DONE|EDIT|RESOLVE">
            Next Step: How would you like to proceed with the proof result?
            DONE: Stop processing.
            EDIT: Hand processing off to editing the plan.
            RESOLVE: Hand processing off to resolving the strongest finding.
        </expand>

    2.  Check the tool <result/> and dispatch accordingly:

        -   If <result/> is `DONE` or `CANCEL`, or if <result/> is
            `RESOLVE` while <verdict/> is `PROVEN`:
            Only output the following <template/> and then *STOP*.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⚖ verdict: **<verdict/>**, ▶ status: **proof completed -- done**
            </template>

        -   If <result/> is `EDIT`:
            <expand name="task-next-handoff" arg1="ase-task-edit"
                arg2="proof completed -- hand-off to edit"></expand>

        -   If <result/> is `RESOLVE`:
            Set <problem/> to the *strongest* finding, in this order: the
            first `FAILED` obligation, else the first `VACUOUS` one, else
            the first `BLOCKED` one, phrased as the concrete defect plus
            its cited location. Only output the following <template/> and
            then call the tool
            `Skill(skill: "ase:ase-code-resolve", args: "<problem/>")`.
            Immediately stop processing the current skill once the
            `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⚖ verdict: **<verdict/>**, ▶ status: **proof completed -- hand-off to resolve**
            </template>

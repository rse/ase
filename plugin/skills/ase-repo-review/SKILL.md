---
name: ase-repo-review
argument-hint: "[--help|-h] [--auto|-a] [--severity|-S=(AUTO|LOW|MEDIUM|HIGH)] [--thorough|-t] [--evidence|-e] [--staged] [--unstaged] [--worktree|-w <name>] [--branch|-b <branch>] [--commit|-c <commit>]"
description: >
    Perform a holistic, human-reviewer-style critique of the currently
    staged Git changes (or, with `--unstaged`, of the unstaged and
    untracked changes, with `--branch`, of a branch against its base,
    or, with `--commit`, of a single commit) and emit an approve/reject verdict
    with prioritized, severity-tagged, line-cited findings (with `--auto`
    fixed automatically, and with `--evidence` backed by a per-dimension
    evidence ledger). Use when the
    user wants the staged diff, a branch, or a commit "reviewed",
    "critiqued", or "code-reviewed".
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Bash(git diff *)"
    - "Bash(git ls-files *)"
    - "Bash(git rev-parse *)"
    - "Bash(git for-each-ref *)"
    - "Bash(git rev-list *)"
    - "Bash(git merge-base *)"
    - "Bash(git branch *)"
    - "Bash(git worktree list *)"
    - "Bash(git show *)"
    - "Bash(git -C *)"
    - "Agent"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-common-changes.md

<purpose name="ase-repo-review">
Review Changes
</purpose>

<expand name="getopt"
    arg1="ase-repo-review"
    arg2="--auto|-a --severity|-S=(AUTO|LOW|MEDIUM|HIGH) --thorough|-t --evidence|-e --staged --unstaged --worktree|-w= --branch|-b= --commit|-c=">
    $ARGUMENTS
</expand>

<objective>
Review the currently staged (and/or unstaged) Git changes, the changes
of a branch against its base, or a single commit the way an
*experienced human reviewer* would - judging them *holistically* against
the change's *own intent* and against *correctness*, *design fit*,
*clarity*, *robustness*, *propagation*, freedom of *residue*, and
*project-convention conformance* - and emit a single *approve /
request-changes verdict* backed by *prioritized*, *severity-tagged*,
*line-cited* findings, optionally backed by a per-dimension *evidence
ledger* of *falsifiable*, *line-cited* statuses. This is a *synthesizing critique*, not a mechanical
scan: it complements `ase-code-lint` (mechanical quality), `ase-code-analyze`
(logic/semantics), and `ase-repo-diff` (intent narrative and risk).
</objective>

Procedure
---------

<flow>

1.  <step id="STEP 1: Determine Change Set">

    1.  Select the change set to review:

        <expand name="changes-select"
            arg1="✪ skill: **ase-repo-review**"
            arg2="<getopt-option-staged/>"
            arg3="<getopt-option-unstaged/>"
            arg4="<getopt-option-worktree/>"
            arg5="<getopt-option-branch/>"
            arg6="<getopt-option-commit/>"></expand>

        Set <scope><changes-scope/></scope>.

    2.  Determine *whether there are changes at all*, as a lightweight
        gate only, as the full diff is fetched by the sub-agent in STEP 2:

        <expand name="changes-capture" arg1="names"></expand>

        Set <diff><changes-output/></diff>.

    3.  <if condition="<diff/> is empty">
        Only output the following <template/> and then *STOP* immediately:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ status: **no changes to review**
        </template>
        </if>

    4.  <if condition="<getopt-option-auto/> is equal `true` and (<getopt-option-commit/> is not empty or (<getopt-option-branch/> is not empty and (<worktree-dir/> is empty or <changes/> is empty)))">
        The automatic fixing edits the reviewed files on disk, so it
        requires the reviewed state to *be* on disk. Only output the
        following <template/> and then *STOP* immediately:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ ERROR: option `--auto` requires uncommitted changes on disk (not `--commit`, and `--branch` only with `--staged`/`--unstaged` of its checked out worktree)
        </template>
        </if>

    </step>

2.  <step id="STEP 2: Review Investigation">

    <if condition="<ase-project-boxing/> is equal `black` and <getopt-option-severity/> is equal `AUTO`">

    The project source artifacts are classified as a *black box*, so
    the user does *not* want the changes scrutinized or their
    findings surfaced (an *explicitly* given severity floor lifts this
    skip). *Skip* the entire review investigation: do
    *not* invoke the `Agent` tool and do *not* read any change, set
    <findings/> and <evidence/> to the *empty* list, set <hidden/> to `0`, set
    <verdict/> to `SKIPPED (boxing: black)`, set <summary/> to a
    *one-line* neutral restatement of the change intent derived solely
    from STEP 1, and proceed *directly* to STEP 3.

    </if>

    First, use the following <template/> to give a hint on this step:

    <template>
    ⧉ **ASE**: **REVIEW INVESTIGATION**
    </template>

    Dispatch the review investigation to a *sub-agent* via the `Agent`
    tool so that *no* investigation details leak into the user-visible
    transcript. The sub-agent performs the silent reading, the read-only
    repository probing, and the critique; only its final structured return
    value is consumed here.

    Set <mode>thorough</mode> if <getopt-option-thorough/> is equal
    `true`, and <mode>focused</mode> otherwise. Set <ledger> -- with
    evidence ledger</ledger> if <getopt-option-evidence/> is equal
    `true`, and <ledger></ledger> (empty) otherwise.

    For this, invoke *exactly once* (apart from the single retry below)
    the tool:

    ```text
        Agent(
            description:       "Review Investigation",
            subagent_type:     "ase:ase-repo-review",
            prompt:            "Review in <mode/> mode the changes of scope: <scope/><ledger/>",
            run_in_background: false
        )
    ```

    Parse the single result message of the `Agent` tool as a JSON object
    (if it is wrapped into a code fence or surrounded by prose, parse just
    its outermost `{...}` object), set <summary/> to its `summary` field
    (a single crisp sentence reconstructing the change's intent), set
    <findings/> to its `findings` field (a list), and set <evidence/> to
    its `evidence` field (a list) if <getopt-option-evidence/> is equal
    `true`, and to the *empty* list otherwise. If no such object with
    a `findings` list (and, if <getopt-option-evidence/> is equal `true`,
    an `evidence` list) can be parsed, invoke the `Agent` tool *once* more
    exactly as above, but with ` -- return ONLY the JSON object` inserted
    into its `prompt` directly *before* <ledger/> (so the `prompt` still
    ends with any <ledger/>), and parse its result the same way. If this fails
    again, only output the following <template/> and then *STOP*
    immediately, as you *MUST* *NEVER* invent findings or render the raw
    result instead:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ ERROR: review investigation returned no parseable result
    </template>

    <if condition="<getopt-option-evidence/> is equal `true`">
    Then *enforce the falsifiability* of <evidence/>, as the sub-agent's
    statuses are claims and not yet facts, by correcting each entry in
    turn:

    -   An entry of an unknown dimension (not one of the dimensions
        listed below) or with a `status` other than `✓`, `✗`, `?`, and
        `–` is dropped, and of several entries of the same dimension
        only the first one is kept.

    -   Each of the dimensions `INTENT`, `PROPAGATION`, `COVERAGE`,
        `RESIDUE`, `CORRECTNESS`, `DESIGN`, `CLARITY`, `ROBUSTNESS`,
        `SECURITY`, `PERFORMANCE`, `CONVENTION`, `TESTING`, and
        `DOCUMENTATION` without an entry is appended in this order to
        the end of <evidence/> as `?`, with the justification `not
        assessed`.

    -   A `✓` entry without a `file:line` resp. `file:N-M` citation in
        its `location` field becomes `?`, with the justification `no
        citation, no evidence`.

    -   An entry of a dimension for which <findings/> holds a finding of a
        `severity` other than `ACCEPTED` becomes `✗`, with the location of
        its most severe such finding and the justification `<n/>
        finding(s)`, where <n/> is the number of these findings, as the
        findings are authoritative.

    -   A `✗` entry of a dimension for which <findings/> holds *no* such
        finding becomes `?`, with the justification `gap claimed without
        finding`.

    Then set <n-shown/>, <n-gap/>, <n-unverified/>, and <n-na/> to the
    number of the `✓`, `✗`, `?`, and `–` entries of <evidence/>.
    </if>

    Then *derive* the overall <verdict/> from <findings/>: set
    <verdict/> to `REJECT - DEMANDS CHANGES` if *any* finding in
    <findings/> has a `severity` field of `HIGH`; otherwise set
    <verdict/> to `APPROVE`, followed by ` - <n-unverified/> UNVERIFIED`
    if <getopt-option-evidence/> is equal `true` and <n-unverified/> is greater than `0`,
    as an approval is only as strong as its evidence. The verdict is
    derived *before* the severity floor below, so the floor only affects
    which findings are *rendered*, never the verdict.

    Then determine the *effective severity floor* <floor/> and its
    origin <floor-origin/>: define the ordinal rank `LOW`=1, `MEDIUM`=2,
    `HIGH`=3.

    <if condition="<getopt-option-severity/> is equal `AUTO`">
    Set <floor>MEDIUM</floor> and <floor-origin>boxing: grey</floor-origin>
    if <ase-project-boxing/> is equal `grey` (grey boxing surfaces only
    *material* findings of severity `MEDIUM` and above), and
    <floor>LOW</floor> and <floor-origin>default</floor-origin> otherwise.
    </if>
    <else>
    Set <floor><getopt-option-severity/></floor> and
    <floor-origin>--severity <getopt-option-severity/></floor-origin>:
    an *explicitly* given severity floor always *wins* over the boxing,
    both over the `grey` floor and over the `black` skip.
    </else>

    Then *apply the effective severity floor* <floor/>: *Keep* a finding
    in <findings/> if and only if its `severity` field is `ACCEPTED` *or*
    `rank(severity)` is greater than or equal to `rank(<floor/>)`;
    *drop* all other findings, but set <hidden/> to the *number* of
    dropped findings. With the floor `LOW`, all findings are kept.
    `ACCEPTED` findings are *never* dropped. The floor affects only which
    findings are *rendered*, never the <verdict/> derived above.

    You *MUST* *NOT* output anything else in this STEP 2.

    </step>

3.  <step id="STEP 3: Verdict and Findings">

    The outputs of this STEP 3 form the *mandatory final report* of the
    skill: you *MUST* emit them as *one* contiguous reply text *after*
    the last tool call (as a headless run shows only the final reply
    text), and it *MUST* *always* carry the verdict, the change intent,
    *exactly one* of the findings table or the no-findings statement,
    and, if <getopt-option-evidence/> is equal `true` and <verdict/> does
    not start with `SKIPPED`, the evidence ledger. You *MUST*
    *NEVER* omit, summarize, or replace any of them by free prose, not
    even for a small or trivial change.

    1.  Sort the findings of <findings/> by their `severity` field from
        highest to lowest in the fixed order `HIGH`, `MEDIUM`, `LOW`,
        `ACCEPTED`. Within the same severity, keep the order returned
        by the sub-agent.

        <if condition="<getopt-option-auto/> is equal `true` and <findings/> contains a finding of a `severity` other than `ACCEPTED`">
        *Automatically fix* the findings: for each finding of
        <findings/> of a `severity` other than `ACCEPTED`, in the
        sorted order, read the cited file of its `location` (a
        relative file resolved against <worktree-dir/> if this is not
        empty, else against the output of the command
        `git rev-parse --show-toplevel`) and the code around the cited
        lines, and apply a *minimal*, *focused* correction which
        resolves exactly this finding via the `Edit` tool (resp. the
        `Write` tool for a file to be created), without any unrelated
        change, and without staging or committing anything. Record the
        outcome of each finding: `APPLIED` if the correction was applied,
        `FAILED` if an `Edit` or `Write` reported an error, or `SKIPPED`
        if the finding cannot be resolved by a local correction (e.g. a
        questioned intent or a design decision demanding a human), in
        which case nothing is changed for it.
        </if>

        <if condition="<getopt-option-auto/> is equal `true` and at least one outcome of the fixing above is `APPLIED`">
        Then *verify the applied fixes* by an *independent*, *targeted
        check*: the fixing above is anchored on its own rationale, so a
        fresh sub-agent, which sees neither this rationale nor the
        review, judges each fix solely from its finding and the
        resulting code.

        First, after *all* corrections are applied, determine for each
        finding of outcome `APPLIED` its <fixed/> location: the line
        range(s) of its corrected code in the resulting files, freshly
        determined (as later corrections may have shifted the lines),
        given as comma-separated relative `file:N-M`. Then set <fixes/>
        to a JSON array with one object `{ "index": <index/>,
        "dimension": <dimension/>, "location": <location/>, "finding":
        <finding/>, "fixed": <fixed/> }` per such finding, where
        <index/> is its 1-based position among the findings of a
        `severity` other than `ACCEPTED` in the sorted order (i.e., its
        row in the *REVIEW FIXES* table of STEP 3.7).

        Then invoke *exactly once* (apart from the single retry below)
        the tool:

        ```text
            Agent(
                description:       "Fix Verification",
                subagent_type:     "ase:ase-repo-review",
                prompt:            "Verify the fixes in scope: <scope/> -- fixes: <fixes/>",
                run_in_background: false
            )
        ```

        Parse its single result message as a JSON object (if it is
        wrapped into a code fence or surrounded by prose, parse just its
        outermost `{...}` object) and set <checks/> to its `checks`
        field (a list). If no such object with a `checks` list can be
        parsed, invoke the `Agent` tool *once* more exactly as above,
        but with ` -- return ONLY the JSON object` appended to its
        `prompt`, and parse its result the same way. If this fails
        again, set <checks/> to the *empty* list, as the fixes are
        already applied and hence the report still has to be emitted,
        but you *MUST* *NEVER* invent checks.

        Then *enforce the falsifiability* of <checks/>: drop each entry
        whose `index` matches no entry of <fixes/>, add for each entry of
        <fixes/> without an entry one of status `UNVERIFIED` with the
        justification `not checked`, and turn each `VERIFIED` entry
        without a `file:line` resp. `file:N-M` citation in its
        `location` field into `UNVERIFIED`, with the justification `no
        citation, no evidence`. Then set <n-verified/>,
        <n-unresolved/>, <n-regressed/>, and <n-unverified/> to the
        number of the `VERIFIED`, `UNRESOLVED`, `REGRESSED`, and
        `UNVERIFIED` entries of <checks/>.
        </if>

        You *MUST* *NOT* output anything in this STEP 3.1.

    2.  Use the following <template/> to output the overall review in
        <verdict/> and the reconstructed intent <summary/>:

        <template>

        ⧉ **ASE**: **REVIEW VERDICT**: **<verdict/>**

        ⧉ **ASE**: **CHANGE INTENT**: <summary/>

        </template>

        You *MUST* *NOT* output anything else in this STEP 3.2.

    3.  <if condition="<findings/> is empty">
        Only output the following <template/> - with <note/> set to `the
        change was not reviewed` if <verdict/> starts with `SKIPPED`, to
        `no finding reaches severity <floor/>` if <hidden/> is greater
        than `0`, and to `the change is clean` otherwise - and then
        *SKIP* substep 4 of this STEP 3:

        <template>

        ⧉ **ASE**: **NO FINDINGS**: <note/>, nothing to flag.

        </template>
        </if>

    4.  <if condition="<findings/> is NOT empty">
        Render a *three-column table* with one row per finding, in the
        sorted order of STEP 3.1, by using the following output
        <template/>. For each finding, repeat
        the third line, set <severity/> to its `severity` field, set
        <dimension/> to its `dimension` field, set <location/> to its
        `location` field, and set <finding/> to its `finding` field.

        In the <location/> column, mark up the `file:line` reference
        as code (with backticks) and prepend it with `▢ ` - keep the
        sub-agent's own `:N` / `:N-M` line citation intact and do *not*
        append any further line-count decoration.

        Because the <finding/> text is free-form Markdown, *before*
        emitting any row you *MUST* escape every literal `|` pipe
        character inside <location/> and <finding/> as `\|` so it cannot
        break the table column structure.

        <template>
        | Severity        | Dimension    | Finding                 |
        | --------------- | ------------ | ----------------------- |
        | **<severity/>** | <dimension/> | <location/>: <finding/> |
        </template>

        Keep the overall report *concise* and *brief*.
        Do *not* output any further explanation.
        </if>

    5.  <if condition="<hidden/> is greater than `0`">
        Output the following <template/>, so that suppressed findings
        are never mistaken for a clean change:

        <template>

        ⧉ **ASE**: **HIDDEN FINDINGS**: <hidden/> finding(s) below severity **<floor/>** suppressed (<floor-origin/>).

        </template>
        </if>

    6.  <if condition="<getopt-option-evidence/> is equal `true` and <verdict/> does not start with `SKIPPED`">
        Render the *evidence ledger* with one row per entry of
        <evidence/>, in the order returned by the sub-agent, by using the
        following output <template/>. For each entry, repeat the last
        line, set <status/> to its `status` field, <dimension/> to its
        `dimension` field, and <justification/> to its `justification`
        field, prefixed with its `location` field (marked up as code with
        backticks, prepended with `▢ `, and followed by `: `) if this is
        not empty. Escape every literal `|` inside a row as `\|`.

        <if condition="<ase-project-boxing/> is equal `grey`">
        Omit the rows of the `–` entries, as grey boxing surfaces only
        the essentials (they still count in <n-na/>).
        </if>

        <template>

        ⧉ **ASE**: **REVIEW EVIDENCE**: <n-shown/> ✓ shown, <n-gap/> ✗ gap, <n-unverified/> ? unverified, <n-na/> – n/a

        | Status        | Dimension    | Evidence         |
        | ------------- | ------------ | ---------------- |
        | **<status/>** | <dimension/> | <justification/> |

        </template>

        A `✗` reflects *all* findings of its dimension, including those
        hidden by the severity floor. Do *not* output any further
        explanation.
        </if>

    7.  <if condition="<getopt-option-auto/> is equal `true` and <findings/> contains a finding of a `severity` other than `ACCEPTED`">
        Recap the outcomes of the fixing of STEP 3.1 with the following
        <template/>:

        <template>
        ⧉ **ASE**: **REVIEW FIXES**: <counts/>

        | *#* | *Severity* | *Location* | *Summary* | *Status* | *Check* |
        | --: | ---------- | ---------- | --------- | -------- | ------- |
        <rows/>

        <notes/>
        </template>

        Hints:

        -   <counts/> is `<n-verified/> verified, <n-unresolved/> unresolved, <n-regressed/> regressed, <n-unverified/> unverified` if at least one outcome is `APPLIED`, and `no fix applied` otherwise
        -   <rows/> has one row `| <index/> | **<severity/>** | <location/> | <summary/> | **<status/>** | <check/> |` per fixed finding, in order
        -   <location/> is the `location` of the finding, marked up as code (with backticks)
        -   <summary/> is a one-line summary of the `finding` text, at most 60 characters long, with every `|` escaped as `\|`
        -   <check/> is the `status` of the entry of <checks/> with this <index/>, marked up as bold, for an `APPLIED` outcome, and `–` otherwise
        -   <notes/> has one line `- **#<index/> <check-status/>**: <check-reference/><check-justification/>` per entry of <checks/> of a `status` other than `VERIFIED`, in order of <index/>, and is empty if there is no such entry
        -   <check-reference/> is the `location` of the entry, marked up as code (with backticks), prepended with `▢ `, and followed by `: `, or empty for an empty `location`, and <check-justification/> is its `justification`, with every `|` escaped as `\|`

        The <verdict/> and the evidence ledger above stay those of the
        *reviewed* state, i.e., before the fixing, as the *Check* column
        stems from a targeted check of the fixes only, not from a
        re-review of the change.
        </if>

    8.  Finally, give the closing hints by expanding the following
        (which, depending on the configured <ase-guidance-level/>, may
        expand into nothing and hence emit no output at all):

        <if condition="<getopt-option-auto/> is equal `true` and at least one outcome of the fixing is `APPLIED` and <n-verified/> is equal to the number of `APPLIED` outcomes">
        <ase-tpl-hint level="normal">
        The fixes are applied and independently verified, but not staged -- review and stage them.
        </ase-tpl-hint>
        </if>
        <elseif condition="<getopt-option-auto/> is equal `true` and <findings/> contains a finding of a `severity` other than `ACCEPTED`">
        <ase-tpl-hint level="normal">
        The fixes are applied, but not staged, and not all of them are verified -- review them, and re-run the review to verify them.
        </ase-tpl-hint>
        </elseif>
        <elseif condition="<verdict/> starts with `REJECT`">
        <ase-tpl-hint level="normal">
        Use `/ase-task-edit` to derive a solution approach and plan for the findings which demand changes.
        </ase-tpl-hint>
        </elseif>

        <if condition="<hidden/> is greater than `0`">
        Set <rerun>/ase-repo-review -S LOW</rerun>, append ` --staged`
        to <rerun/> if <getopt-option-staged/> is equal `true`, append
        ` --unstaged` to <rerun/> if <getopt-option-unstaged/> is equal
        `true`, append ` -w <getopt-option-worktree/>` to <rerun/> if
        <getopt-option-worktree/> is not empty, append
        ` -b <getopt-option-branch/>` to <rerun/> if
        <getopt-option-branch/> is not empty, append
        ` -c <getopt-option-commit/>` to <rerun/> if
        <getopt-option-commit/> is not empty,
        append ` -t` to <rerun/> if <getopt-option-thorough/> is equal
        `true`, and append ` -e` to <rerun/> if <getopt-option-evidence/>
        is equal `true`, so that the re-run reviews the same scope in the
        same mode.

        <ase-tpl-hint level="normal">
        Use `<rerun/>` to re-run the review with all findings shown (a fresh review, so its findings can differ).
        </ase-tpl-hint>
        </if>

    </step>

</flow>

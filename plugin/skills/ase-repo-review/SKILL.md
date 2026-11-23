---
name: ase-repo-review
argument-hint: "[--help|-h] [--auto|-a] [--severity|-S=(AUTO|LOW|MEDIUM|HIGH)] [--thorough|-t] [--staged] [--unstaged] [--worktree|-w <name>] [--branch|-b <branch>] [--commit|-c <commit>]"
description: >
    Perform a holistic, human-reviewer-style critique of the currently
    staged Git changes (or, with `--unstaged`, of the unstaged and
    untracked changes, with `--branch`, of a branch against its base,
    or, with `--commit`, of a single commit) and emit an approve/reject verdict
    with prioritized, severity-tagged, line-cited findings (with `--auto`
    fixed automatically). Use when the
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

<purpose name="ase-repo-review">
Review Changes
</purpose>

<expand name="getopt"
    arg1="ase-repo-review"
    arg2="--auto|-a --severity|-S=(AUTO|LOW|MEDIUM|HIGH) --thorough|-t --staged --unstaged --worktree|-w= --branch|-b= --commit|-c=">
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
*line-cited* findings. This is a *synthesizing critique*, not a mechanical
scan: it complements `ase-code-lint` (mechanical quality), `ase-code-analyze`
(logic/semantics), and `ase-repo-diff` (intent narrative and risk).
</objective>

Procedure
---------

<flow>

1.  <step id="STEP 1: Determine Change Set">

    1.  <if condition="<getopt-option-commit/> is not empty and (<getopt-option-branch/> is not empty or <getopt-option-staged/> is equal `true` or <getopt-option-unstaged/> is equal `true`)">
        Only output the following <template/> and then *STOP* immediately:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ ERROR: option `--commit` cannot be combined with `--branch`, `--staged`, or `--unstaged`
        </template>
        </if>

        <if condition="<getopt-option-worktree/> is not empty and (<getopt-option-branch/> is not empty or <getopt-option-commit/> is not empty)">
        Only output the following <template/> and then *STOP* immediately:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ ERROR: option `--worktree` cannot be combined with `--branch` or `--commit`
        </template>
        </if>

        Set <worktree-dir></worktree-dir> (empty).

        <if condition="<getopt-option-worktree/> is not empty">
        Determine the directory of this existing ASE worktree: if
        <getopt-option-worktree/> consists of other characters than
        `A-Z`, `a-z`, `0-9`, `_`, and `-`, keep <worktree-dir/> empty,
        else call the
        `ase_worktree_path(id: "<getopt-option-worktree/>", create: false)`
        tool of the `ase` MCP server (you *MUST* *NEVER* assemble this
        path yourself), capture its result into <worktree-dir/>, and run
        the command `git -C "<worktree-dir/>" rev-parse --show-toplevel`
        (taken exactly as given). If <worktree-dir/> is empty, the tool
        call failed, or the command failed (i.e., the worktree does not
        exist), only output the following <template/> and then *STOP*
        immediately:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ ERROR: no worktree **<getopt-option-worktree/>** to review
        </template>
        </if>

        Set <changes/> to the *uncommitted* changes to review: to
        `staged and unstaged` if both <getopt-option-staged/> and
        <getopt-option-unstaged/> are equal `true`, to `staged` if only
        <getopt-option-staged/> is equal `true`, to `unstaged` if only
        <getopt-option-unstaged/> is equal `true`, and to empty otherwise.
        Here, the `unstaged` changes always include the *untracked* files.

    2.  <if condition="<getopt-option-branch/> is not empty">
        Determine the *base* of the branch:

        1.  Check that <getopt-option-branch/> matches the regexp
            `^[A-Za-z0-9_@][A-Za-z0-9._/+@-]*$`, which keeps it safe for
            being passed quoted to the `git` commands, and only then run
            the command
            `git rev-parse --verify --quiet "<getopt-option-branch/>^{commit}"`.
            If the check or the command fails, only output the following
            <template/> and then *STOP* immediately:

            <template>
            ⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ ERROR: branch **<getopt-option-branch/>** does not exist
            </template>

        2.  Determine the *candidate base branches* by running the command
            `git for-each-ref --format="%(refname:short)" refs/heads/`
            (taken exactly as given), excluding <getopt-option-branch/>
            itself. For each <candidate/>, run the command
            `git rev-list --count "<candidate/>..<getopt-option-branch/>"`
            to count the commits of the branch since its fork point from
            <candidate/>, and *drop* every candidate with a count of `0`,
            as it already contains the branch. Set <base/> to the
            remaining candidate with the *smallest* count (the *nearest*
            fork point); on a tie, prefer the checked-out branch (the
            output of `git branch --show-current`), and then the first
            candidate. If no candidate remains, only output the following
            <template/> and then *STOP* immediately:

            <template>
            ⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ ERROR: no base branch determinable for branch **<getopt-option-branch/>**
            </template>

        3.  Run the command
            `git merge-base "<base/>" "<getopt-option-branch/>"` and
            capture its output into <base-commit/>.

        4.  Only output the following <template/>:

            <template>
            ⧉ **ASE**: ✪ skill: **ase-repo-review**, ⎇ branch: **<getopt-option-branch/>**, ⎇ base: **<base/>**
            </template>

        </if>
        <elseif condition="<getopt-option-commit/> is not empty">
        Check that <getopt-option-commit/> matches the regexp
        `^[A-Za-z0-9_@][A-Za-z0-9._/+@~^-]*$`, which keeps it safe for
        being passed quoted to the `git` commands, and only then run the
        command
        `git rev-parse --verify --quiet "<getopt-option-commit/>^{commit}"`
        and capture its output into <commit-id/>. If the check or the
        command fails, only output the following <template/> and then
        *STOP* immediately:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ ERROR: commit **<getopt-option-commit/>** does not exist
        </template>
        </elseif>

    3.  Determine *whether there are changes at all* by running the
        corresponding command(s) (taken exactly as given) and capturing
        their combined output - the bare *list of changed file names* -
        into <diff/>. This is a lightweight gate; the full diff is fetched
        by the sub-agent in STEP 2, so capturing only the file-name list
        here is sufficient:

        <if condition="<getopt-option-branch/> is not empty and <changes/> is not empty">
        Determine the *worktree* of the branch by running the command
        `git worktree list --porcelain` and setting <worktree-dir/> to the
        `worktree` path of the entry whose `branch` line is
        `refs/heads/<getopt-option-branch/>` (or to empty if there is
        none, as a branch not checked out anywhere carries no uncommitted
        changes).

        If <worktree-dir/> is not empty, set <scope>branch
        <getopt-option-branch/> since base commit <base-commit/> plus the
        <changes/> changes in worktree <worktree-dir/></scope> and run:

        -   If <changes/> is equal `staged and unstaged`:

            `git -C "<worktree-dir/>" diff --name-only "<base-commit/>"`

            `git -C "<worktree-dir/>" ls-files --others --exclude-standard`

        -   If <changes/> is equal `staged`:

            `git -C "<worktree-dir/>" diff --cached --name-only "<base-commit/>"`

        -   If <changes/> is equal `unstaged`:

            `git diff --name-only "<base-commit/>..<getopt-option-branch/>"`

            `git -C "<worktree-dir/>" diff --name-only`

            `git -C "<worktree-dir/>" ls-files --others --exclude-standard`

        From the output of the `ls-files` command, *skip* every listed
        entry below the `.ase/` directory -- it carries *ASE*'s own
        state, and hence is never part of the user's change set.

        Otherwise, set <scope>branch <getopt-option-branch/> since base
        commit <base-commit/></scope> and run:

        `git diff --name-only "<base-commit/>..<getopt-option-branch/>"`
        </if>
        <elseif condition="<getopt-option-branch/> is not empty">
        Set <scope>branch <getopt-option-branch/> since base commit
        <base-commit/></scope> and run:

        `git diff --name-only "<base-commit/>..<getopt-option-branch/>"`
        </elseif>
        <elseif condition="<getopt-option-commit/> is not empty">
        Set <scope>commit <commit-id/></scope> and run:

        `git show --format= --name-only --diff-merges=first-parent "<commit-id/>"`
        </elseif>
        <elseif condition="<worktree-dir/> is not empty">
        Set <scope/> and run the command(s) exactly like for the
        uncommitted changes of the current working copy below (by
        <changes/>, i.e. `staged` if it is empty), but with each command
        prefixed by `git -C "<worktree-dir/>"` instead of `git`, and with
        ` in worktree <worktree-dir/>` appended to <scope/> (e.g.
        <scope>unstaged in worktree <worktree-dir/></scope> and the
        commands `git -C "<worktree-dir/>" diff --name-only` and
        `git -C "<worktree-dir/>" ls-files --others --exclude-standard`).
        </elseif>
        <elseif condition="<changes/> is equal `staged and unstaged`">
        Set <scope>staged and unstaged</scope> and run:

        `git diff --name-only HEAD`

        `git ls-files --others --exclude-standard`

        From the output of the second command, *skip* every listed
        entry below the `.ase/` directory -- it carries *ASE*'s own
        state, and hence is never part of the user's change set.
        </elseif>
        <elseif condition="<changes/> is equal `unstaged`">
        Set <scope>unstaged</scope> and run:

        `git diff --name-only`

        `git ls-files --others --exclude-standard`

        From the output of the second command, *skip* every listed
        entry below the `.ase/` directory -- it carries *ASE*'s own
        state, and hence is never part of the user's change set.
        </elseif>
        <else>
        Set <scope>staged</scope> and run:

        `git diff --cached --name-only HEAD`
        </else>

    4.  <if condition="<diff/> is empty">
        Only output the following <template/> and then *STOP* immediately:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ status: **no changes to review**
        </template>
        </if>

    5.  <if condition="<getopt-option-auto/> is equal `true` and (<getopt-option-commit/> is not empty or (<getopt-option-branch/> is not empty and (<worktree-dir/> is empty or <changes/> is empty)))">
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
    <findings/> to the *empty* list, set <hidden/> to `0`, set
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
    `true`, and <mode>focused</mode> otherwise.

    For this, invoke *exactly once* (apart from the single retry below)
    the tool:

    ```text
        Agent(
            description:       "Review Investigation",
            subagent_type:     "ase:ase-repo-review",
            prompt:            "Review in <mode/> mode the changes of scope: <scope/>",
            run_in_background: false
        )
    ```

    Parse the single result message of the `Agent` tool as a JSON object
    (if it is wrapped into a code fence or surrounded by prose, parse just
    its outermost `{...}` object), set <summary/> to its `summary` field
    (a single crisp sentence reconstructing the change's intent), and set
    <findings/> to its `findings` field (a list). If no such object with
    a `findings` list can be parsed, invoke the `Agent` tool *once* more
    exactly as above, but with ` -- return ONLY the JSON object` appended
    to its `prompt`, and parse its result the same way. If this fails
    again, only output the following <template/> and then *STOP*
    immediately, as you *MUST* *NEVER* invent findings or render the raw
    result instead:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ ERROR: review investigation returned no parseable result
    </template>

    Then *derive* the overall <verdict/> from <findings/>: set
    <verdict/> to `REJECT - DEMANDS CHANGES` if *any* finding in
    <findings/> has a `severity` field of `HIGH`; otherwise set
    <verdict/> to `APPROVE`. The verdict is derived *before* the
    severity floor below, so the floor only affects which findings are
    *rendered*, never the verdict.

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
    and *exactly one* of the findings table or the no-findings
    statement. You *MUST* *NEVER* omit, summarize, or replace any of
    them by free prose, not even for a small or trivial change.

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

    6.  <if condition="<getopt-option-auto/> is equal `true` and <findings/> contains a finding of a `severity` other than `ACCEPTED`">
        Recap the outcomes of the fixing of STEP 3.1 with the following
        <template/>:

        <template>
        ⧉ **ASE**: **REVIEW FIXES**:

        | *#* | *Severity* | *Location* | *Summary* | *Status* |
        | --: | ---------- | ---------- | --------- | -------- |
        <rows/>
        </template>

        Hints:

        -   <rows/> has one row `| <index/> | **<severity/>** | <location/> | <summary/> | **<status/>** |` per fixed finding, in order
        -   <location/> is the `location` of the finding, marked up as code (with backticks)
        -   <summary/> is a one-line summary of the `finding` text, at most 60 characters long, with every `|` escaped as `\|`

        The <verdict/> above stays the verdict of the *reviewed* state,
        i.e., before the fixing.
        </if>

    7.  Finally, give the closing hints by expanding the following
        (which, depending on the configured <ase-guidance-level/>, may
        expand into nothing and hence emit no output at all):

        <if condition="<getopt-option-auto/> is equal `true` and <findings/> contains a finding of a `severity` other than `ACCEPTED`">
        <ase-tpl-hint level="normal">
        The fixes are applied, but not staged -- review them, and re-run the review to verify them.
        </ase-tpl-hint>
        </if>
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
        <getopt-option-commit/> is not empty, and
        append ` -t` to <rerun/> if <getopt-option-thorough/> is equal
        `true`, so that the re-run reviews the same scope in the same mode.

        <ase-tpl-hint level="normal">
        Use `<rerun/>` to re-run the review with all findings shown (a fresh review, so its findings can differ).
        </ase-tpl-hint>
        </if>

    </step>

</flow>

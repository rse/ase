---
name: ase-task-implement
argument-hint: "[--help|-h] [--next|-n <option>[,...]] [--worktree|-w <name>] [--source|-s <source>] [--changeset|-c <changeset>] [--draft|-d] [--stateless|-S] [<id>]"
description: >
    Implement current or given task plan, optionally as an implementation
    draft attachment only. Use when the user calls to "implement", "realize",
    "draft", "dry-run", or "test-drive" the "task", "plan", "spec", or
    "specification".
user-invocable: true
disable-model-invocation: false
effort: xhigh
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-task-implement">
Implement a Task Plan
</purpose>

<expand name="getopt"
    arg1="ase-task-implement"
    arg2="--next|-n=(none|DONE|EDIT|INTEGRATE|DELETE)... --worktree|-w= --source|-s= --changeset|-c= --draft|-d --stateless|-S --int-reuse-task">
    $ARGUMENTS
</expand>

<objective>
*Implement* the task plan by creating a corresponding, complete
*change set* from its *source* into its *changeset* location.
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-format-task.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-common-task.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-tenets.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-common-code.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-common-changeset.md

Procedure
---------

1.  **Determine Task:**

    1.  Set <instruction><getopt-arguments/></instruction> initially, with any
        leading and trailing whitespace stripped.
        Inherit the always existing <ase-task-id/> from the current context.
        Inherit the always existing <ase-session-id/> from the current context.
        Do not output anything.

    2.  React on task id:

        <expand name="task-react-id" arg1="ase-task-implement"></expand>

    3.  Resolve the draft shorthand: if <getopt-option-draft/> is `true`
        and <getopt-option-changeset/> is not empty, only output the
        following <template/> and then immediately *STOP* processing the
        entire current skill:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ ERROR: options `--draft` and `--changeset` are mutually exclusive
        </template>

        Otherwise, if <getopt-option-draft/> is `true`, set
        <getopt-option-changeset>attachment:draft</getopt-option-changeset>,
        so the change set lands as the *implementation draft* in the
        attachment `draft` of the plan only. Do not output anything.

2.  **Determine Operation:**

    1.  Determine the current task plan content:

        <expand name="task-load-content"></expand>

    2.  If the <task-content/> is still empty, complain and tell the user to
        use the `ase-code-resolve`, `ase-code-refactor`, `ase-code-craft`,
        or `ase-task-edit` skills first to create a task plan. Then
        immediately stop processing this skill.

    3.  Internalize the tenets stated by the plan:

        <expand name="code-tenets-from-plan"></expand>

3.  **Prepare Source and Changeset:**

    The *source* (code basis) and the *changeset* (location of the
    change set) are controlled by the `Source:` and `Changeset:`
    frontmatter keys of the plan, which the `--source` and
    `--changeset` options override *ad-hoc* without changing the plan.
    The `worktree` value of the source refers to the *origin working
    copy* the skill was started in, the `worktree` value of the
    changeset to the *context worktree*, selected by the `--worktree`
    option (both are the same without `--worktree`). A context worktree
    created by `--worktree` carries its *own* branch, which starts at
    the source, so the source branch itself is never checked out there
    and stays available as the integration target.

    1.  Set <task-source/> to <getopt-option-source/> if it is not
        empty, otherwise to the value of the `Source:` frontmatter key
        of <task-content/>, or to the configured default
        <ase-project-task-default-source/> if the key is absent, and
        parse it:

        <expand name="changeset-value"
            arg1="Source"
            arg2="<task-source/>"
            arg3="`worktree`, `branch`"
            arg4="◉ task: **<ase-task-id/>**"></expand>

        Set <source-type><value-type/></source-type> and
        <source-name><value-name/></source-name>.

    2.  Set <task-changeset/> to <getopt-option-changeset/> if it is not
        empty, otherwise to the value of the `Changeset:` frontmatter key
        of <task-content/>, or to the configured default
        <ase-project-task-default-changeset/> if the key is absent, and
        parse it:

        <expand name="changeset-value"
            arg1="Changeset"
            arg2="<task-changeset/>"
            arg3="`worktree`, `branch`, `attachment`"
            arg4="◉ task: **<ase-task-id/>**"></expand>

        Set <changeset-type><value-type/></changeset-type> and
        <changeset-name><value-name/></changeset-name>.

        <if condition="<task-changeset/> is not `attachment:draft` and the backmatter of <task-content/> contains an attachment block with the `Type` key value `text/x-diff; charset=utf-8; kind="draft"`, whose `Desc` key carries no `merged <commit/>` value">
        The plan carries an undelivered *implementation draft*, which
        only an `attachment:draft` changeset builds upon, so this run
        *ignores* it and implements the plan from scratch into
        <task-changeset/>. Only output the following <template/>,
        directly followed by the hint, and then *continue* processing:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ WARNING: implementation draft attachment is **ignored** for changeset **<task-changeset/>**
        </template>

        <ase-tpl-hint level="minimal">
        Use `/ase-task-implement --draft` to build upon the draft, or `/ase-task-integrate --draft` to deliver it.
        </ase-tpl-hint>
        </if>

    3.  Determine the *source commit* <source-commit/>: if
        <source-type/> is `worktree`, capture the output of the command
        `git rev-parse HEAD` (the skill runs inside the origin working
        copy); if it is `branch`, capture the output of the command
        `git rev-parse --verify --quiet "refs/heads/<source-name/>"`.
        If the command fails, only output the following <template/> and
        then immediately *STOP* processing the entire current skill,
        leaving the working copy *untouched* (so a bad source never
        leaves a context worktree behind):

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ ERROR: source **<task-source/>** does not exist
        </template>

    4.  <if condition="<getopt-option-worktree/> is not empty and <changeset-type/> is not `worktree`">
        The context worktree serves the `worktree` changeset only, so a
        `branch:` or `attachment:` changeset would leave it unused (e.g.
        on a mistyped option). Only output the following <template/> and
        then immediately *STOP* processing the entire current skill,
        leaving the working copy *untouched*:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ ERROR: option `--worktree` requires a `worktree` changeset (got **<task-changeset/>**)
        </template>
        </if>

        Otherwise, prepare the context worktree, whose own branch -- if
        created together with it -- starts at <source-commit/>:

        <expand name="changeset-context"
            arg1="<getopt-option-worktree/>"
            arg2="◉ task: **<ase-task-id/>**"
            arg3="false"
            arg4="true"
            arg5="<source-commit/>"></expand>

    5.  Determine the *work directory* <work-dir/> -- the worktree in
        which the implementation happens -- according to <changeset-type/>:

        -   `worktree`: The change set stays *uncommitted* in the context
            worktree, so set <work-dir><context-dir/></work-dir>.

            -   <if condition="<context-dir/> differs from <origin-dir/>">
                The context worktree carries its *own* branch: a freshly
                created one already starts at <source-commit/>, while a
                reused one keeps its own base, so earlier work in it is
                *continued*. The source branch is *never* checked out in
                the context worktree (it may be checked out in the origin
                working copy, and it is the integration target of
                `Target: source`), so nothing is switched. Do not output
                anything.
                </if>

            -   <elseif condition="<source-type/> is `branch` and the branch checked out in <origin-dir/> (according to the command `git branch --show-current`) differs from <source-name/>">
                The origin working copy is *switched* to <source-name/>
                in place: if the command `git status --porcelain` reports
                any output, switching would drag the uncommitted changes
                onto the other branch, so only output the following
                <template/>, directly followed by the hint, and then
                immediately *STOP* processing the entire current skill,
                leaving the working copy *untouched*:

                <template>
                ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ ERROR: working copy has uncommitted changes -- cannot switch to branch **<source-name/>** in place
                </template>

                <ase-tpl-hint level="minimal">
                Commit or stash the uncommitted changes first, or use `--worktree <name>` to implement inside an isolated worktree instead.
                </ase-tpl-hint>

                Otherwise, run the command
                `git switch "<source-name/>"`, and, if it fails (e.g.
                because the branch is checked out in another worktree),
                only output the following <template/> and then
                immediately *STOP* processing the entire current skill:

                <template>
                ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ ERROR: branch **<source-name/>** failed to switch
                </template>

                Otherwise, only output the following <template/>:

                <template>
                ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⎇ branch: **<source-name/>**, ▶ status: **branch switched**
                </template>
                </elseif>

        -   `branch`: The change set is *committed* onto the branch
            <changeset-name/> inside a worktree carrying this branch.
            Determine the *existing worktrees* by running the command
            `git worktree list --porcelain` (taken exactly as given).

            -   If the branch <changeset-name/> is checked out in a
                registered worktree, set <work-dir/> to its directory and
                <work-label/> to its path. If the command
                `git -C "<work-dir/>" status --porcelain` reports any
                output, the change set could not be committed separately,
                so only output the following <template/> and then
                immediately *STOP* processing the entire current skill:

                <template>
                ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ ERROR: worktree **<work-label/>** of branch **<changeset-name/>** has uncommitted changes
                </template>

            -   Otherwise, set <work-id/> to <changeset-name/> with every
                character other than `A-Z`, `a-z`, `0-9`, `_`, and `-`
                replaced by `-`, determine <work-dir/> by calling the
                `ase_worktree_path(id: "<work-id/>", create: true)` tool of
                the `ase` MCP server (you *MUST* *NEVER* assemble this
                path yourself), and set
                <work-label>.ase/worktree/<work-id/></work-label>. If
                this tool call fails or the directory <work-dir/> already
                exists, only output the following <template/> and then
                immediately *STOP* processing the entire current skill:

                <template>
                ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ ERROR: worktree **<work-id/>** for branch **<changeset-name/>** cannot be created
                </template>

                If the branch <changeset-name/> exists according to
                `git branch --list`, create the worktree by running the
                command `git worktree add "<work-dir/>" "<changeset-name/>"`,
                otherwise create the branch from the source together with
                the worktree by running the command
                `git worktree add -b "<changeset-name/>" "<work-dir/>" "<source-commit/>"`
                (each taken exactly as given). If the command fails, only
                output the same error <template/> as above and then
                immediately *STOP* processing the entire current skill.
                Otherwise, only output the following <template/>:

                <template>
                ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ◉ worktree: **<work-label/>**, ⎇ branch: **<changeset-name/>**, ▶ status: **worktree created**
                </template>

        -   `attachment`: The change set is made and verified in a
            *temporary* worktree, detached at <source-commit/>, and
            afterwards stored as an attachment of the plan only, leaving
            all artifacts untouched.

            1.  <if condition="the backmatter of <task-content/> contains an attachment block with the `Type` key value `text/x-diff; charset=utf-8; kind="<changeset-name/>"`, whose `Desc` key carries no `merged <commit/>` value, and which is *stale* according to the plan <format/> (its `Modified` key is absent or older than the `Modified` key of the frontmatter)">
                The change set of a *previous* run was created for an
                *earlier* version of the plan, so building on it would
                silently carry over changes the plan no longer asks for,
                and dropping it would leave its `[x]` and `[/]`
                bullet-points unrealized. Only output the following
                <template/>, directly followed by the hint, and then
                immediately *STOP* processing the entire current skill,
                leaving the plan and the artifacts *untouched*:

                <template>
                ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ ERROR: change set attachment **<changeset-name/>** is **stale** (older than the plan)
                </template>

                <ase-tpl-hint level="minimal">
                Remove the attachment and reset the `[x]` and `[/]` checkboxes of the plan, then run `/ase-task-implement --changeset <task-changeset/>` again.
                </ase-tpl-hint>
                </if>

            2.  Set <work-hash/> to the first 8 characters of the output
                of the `ase_mint(type: "sha1", hint:
                "<ase-task-id/>:<changeset-name/>:implement")` tool of the
                `ase` MCP server, which keeps <work-id/> *unique* per task
                and attachment. Set <work-id/> to <ase-task-id/> with all
                characters other than `A-Z`, `a-z`, `0-9`, `_`, and `-`
                stripped, followed by
                `-<changeset-name/>-implement-<work-hash/>`, and
                determine <work-dir/> by calling the
                `ase_worktree_path(id: "<work-id/>", temp: true, create:
                true)` tool of the `ase` MCP server, which places it into
                the namespace of the *temporary* worktrees, disjoint from
                all other worktrees. You *MUST* *NEVER* assemble this path
                yourself.

            3.  <if condition="<work-dir/> exists">
                If <work-dir/> is a worktree registered according to
                `git worktree list --porcelain` and its record carries a
                `detached` line, it is the *leftover* of an earlier run
                which stopped before its cleanup, and its partial state
                must *not* be reused: remove it by running the commands
                `git worktree remove --force "<work-dir/>"` and
                `git worktree prune` (taken exactly as given), ignoring
                any failure. Otherwise, it is *not* owned by this skill,
                so only output the following <template/> and then
                immediately *STOP* processing the entire current skill,
                leaving <work-dir/> and the task plan *untouched*:

                <template>
                ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ ERROR: directory **<work-id/>** for attachment **<changeset-name/>** exists, but is no temporary worktree
                </template>
                </if>

            4.  Create the worktree by running the command
                `git worktree add --detach "<work-dir/>" "<source-commit/>"`
                (taken exactly as given). As it starts at the source
                commit, *uncommitted* changes of the source are *not*
                carried over.

            5.  <if condition="the backmatter of <task-content/> contains an attachment block with the `Type` key value `text/x-diff; charset=utf-8; kind="<changeset-name/>"`, whose `Desc` key carries no `merged <commit/>` value">
                This block carries the change set of a *previous* run,
                which realized the `[x]` and `[/]` bullet-points. A block
                whose `Desc` key carries a `merged <commit/>` value was
                already *delivered* by `ase-task-integrate`, so it is *not*
                re-applied, and the change set of this run starts afresh
                at the source commit and replaces it below. Re-establish
                it in the worktree by applying its `Data` payload (with the
                4-space indentation removed) *verbatim*, e.g. via
                `git -C "<work-dir/>" apply --3way`, and re-apply hunks
                which no longer apply to a meanwhile drifted source
                manually. The change set of this run is built *on top* of
                it, so the change set captured below is *cumulative*.
                </if>

            If any of these sub-steps fails, remove the worktree as above
            (if created by sub-step 4), only output the following
            <template/>, and then immediately *STOP* processing the
            entire current skill, leaving the task plan *untouched*:

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ ERROR: temporary worktree for attachment **<changeset-name/>** cannot be prepared
            </template>

4.  **Create Implementation:**

    1.  <if condition="<getopt-option-stateless/> is not equal `true` and <ase-project-task-lifecycle/> is `team` or `enterprise`">
        Mark the plan as being implemented: set the `Status:` key of
        <task-content/> to `IMPLEMENTING` (*creating* the key at its
        position in the key order of the plan <format/> if absent), but
        *only* if `IMPLEMENTING` is reachable from the current state
        along the transitions of the task lifecycle model (for the
        `team` model from `PLANNING` or `STALLED`, for the `enterprise`
        model from `DRAFTED` via `PLANNING` and `PLANNED`, or from
        `PLANNED` or `STALLED`), and persist this frontmatter-only change
        -- without refreshing the `Modified:` key -- by calling the
        `ase_task_save(id: "<ase-task-id/>", text: "<task-content/>")`
        tool of the `ase` MCP server. Do not output anything.
        </if>

    2.  Perform a *final implementation* of the task plan inside
        <work-dir/> by modifying the *artifacts* with a corresponding,
        complete *change set*, following and honoring the task plan in
        <task-content/>:

        <expand name="changeset-land" arg1="<work-dir/>"></expand>

        You *MUST* *skip* every bullet-point of <task-content/> in
        checkbox state `[-]` (cancelled) or `[>]` (deferred): neither
        realize its <text/> in the change set nor perform its check, and
        do *not* count it against the completeness of the change set.
        Its <text/> stays *context only*, e.g. to understand the other
        bullet-points.

        You *MUST* also *skip* every bullet-point of <task-content/> in
        checkbox state `[x]` (done), as it was already fully resolved by
        a previous run: neither realize its <text/> again nor perform its
        check again, but *do* count it as *complete* for the change set.
        Its <text/> stays *context only*, too.

        You *MUST* treat every bullet-point of <task-content/> in
        checkbox state `[?]` (question) exactly like one in state `[ ]`
        (todo), i.e., as a *regular* todo, as its grilling question just
        stayed unanswered: realize its <text/> or perform its check.

        You *MUST* *re-examine* every bullet-point of <task-content/> in
        checkbox state `[/]` (incomplete), as a previous run resolved it
        only *partially*: check which parts of its <text/> are not yet
        realized or verified by the artifacts, and then realize or check
        *only* these remaining parts.

        <if condition="<task-content/> does NOT contain a `##  VERIFICATION (WHEN)` section heading">
        The task plan deliberately *omits* the `##  VERIFICATION (WHEN)`
        section. You *MUST* therefore *strictly skip* the entire
        verification phase after modifying the source files: do *NOT*
        run any build, do *NOT* run any tests, do *NOT* run any linter,
        do *NOT* run any type-checker, do *NOT* execute the modified
        program, and do *NOT* otherwise verify the change set in any
        way.
        </if>

    3.  Store the change set according to <changeset-type/>:

        -   `worktree`: Leave the change set *uncommitted* in
            <work-dir/>. Do not output anything.

        -   `branch`: Stage the change set by running the command
            `git -C "<work-dir/>" add --all`. If the command
            `git -C "<work-dir/>" diff --cached --quiet` fails (i.e.
            something is staged), craft a commit <message/> in the
            format `<type/>: <summary/>`, where <type/> is one of
            `FEATURE`, `IMPROVEMENT`, `BUGFIX`, `UPDATE`, `CLEANUP`, or
            `REFACTOR` and <summary/> is a 60-80 character,
            imperative-mood summary of the task plan without a trailing
            period, without Markdown formatting, and without any
            double-quote (`"`), backtick (`` ` ``), dollar (`$`), or
            backslash (`\`) characters, and commit the change set by
            running the command
            `git -C "<work-dir/>" commit -m "<message/>"`. If the commit
            fails, treat the change set as *not* applied successfully.
            Do not output anything.

        -   `attachment`: Capture the *cumulative* change set into
            <unified-diff/> by running the commands
            `git -C "<work-dir/>" add --all` and
            `git -C "<work-dir/>" diff --cached --no-color --binary HEAD`
            (taken exactly as given). Then remove the temporary worktree
            by running the command
            `git worktree remove --force "<work-dir/>"` (taken exactly as
            given). Do not output anything.

    4.  Update the checkboxes of the body bullet-points of <task-content/>
        as follows, changing *nothing else* of a bullet-point:

        -   Set the checkbox of every `DOM`, `IFC`, `ARC`, and `IMP`
            bullet-point to `[x]` whose <text/> was *fully* realized by
            the change set, and to `[/]` whose <text/> was realized only
            *partially*. Leave the checkbox of every other bullet-point
            *untouched*.

        -   Set the checkbox of every `REG` and `CON` bullet-point to `[x]`
            whose check was actually performed *and* succeeded, and to
            `[/]` whose check was performed but succeeded only *partially*.
            Leave the checkbox of every other bullet-point *untouched* --
            hence *all* of them for a plan whose `##  VERIFICATION (WHEN)`
            section is deliberately omitted.

        -   The rules above apply to bullet-points in the states `[ ]`,
            `[?]`, and `[/]` alike, so a `[?]` bullet-point which was
            not resolved at all stays `[?]`, and a re-examined `[/]`
            bullet-point becomes `[x]` once its remaining parts were
            resolved, or otherwise stays `[/]`.

        -   Leave the checkbox of every skipped `[x]` bullet-point
            *untouched*, as it was already resolved by a previous run.

        -   Leave the checkbox of every skipped `[-]` and `[>]`
            bullet-point *untouched*, as only the user resolves its
            cancelled or deferred state.

    5.  Update the frontmatter and backmatter of <task-content/> as
        follows, *creating* each of the `Status:` and `Modified:` keys
        the plan does not carry yet at its position in the key order of
        the plan <format/>:

        -   <if condition="<getopt-option-stateless/> is not equal `true` and <ase-project-task-lifecycle/> is `team` or `enterprise` and the `Status:` key was set to `IMPLEMENTING` in step 1 above">
            Set the `Status:` key to `IMPLEMENTED` if the change set was
            applied *completely* and *successfully* (with the skipped
            `[-]` and `[>]` bullet-points not counting, and the skipped
            `[x]` bullet-points counting as complete), or to `STALLED`
            otherwise.
            </if>
            <else>
            Leave the `Status:` key *untouched* -- especially for the
            `solo` model, whose task is closed by `ase-task-integrate`
            only, and under `--stateless`.
            </else>

        -   Refresh the `Modified:` key with the current time in
            ISO-style format, determined by calling the
            `ase_timestamp(format: "yyyy-LL-dd HH:mm")` tool of the `ase`
            MCP server, but *only* if step 4 changed at least one
            checkbox, as the key tracks "body" changes only -- a
            frontmatter-only update leaves it *untouched*. Set
            <timestamp-modified/> to the resulting `Modified:` key value,
            or to the current time determined the same way if the key
            was left untouched.

        -   <if condition="<changeset-type/> is `attachment`">
            Append the change set <unified-diff/> as an *attachment
            block* to the "backmatter" of <task-content/> with the
            following <template/>, closely following the plan <format/>.
            If an attachment block with the `Type` key value
            `text/x-diff; charset=utf-8; kind="<changeset-name/>"`
            already exists from a previous run, *replace* this entire
            existing attachment block in place. Set
            <timestamp-attachment-created/> to the value of the `Created`
            key of the *replaced* attachment block, so the creation time
            of the change set survives its replacement, or to
            <timestamp-modified/> if no such block or key exists. Set
            <payload/> to <unified-diff/> with *every* line -- including
            empty lines -- indented by *exactly* 4 spaces, so the YAML
            literal block scalar of the `Data` key carries the diff
            *verbatim*. The "body" keeps its trailing empty line directly
            before the `---` line of the attachment block.

            <template>
            ---
            Type:      text/x-diff; charset=utf-8; kind="<changeset-name/>"
            Desc:      base <source-commit/>
            Created:   <timestamp-attachment-created/>
            Modified:  <timestamp-modified/>
            Data:      |4+
            <payload/>
            </template>
            </if>

        Apart from the checkboxes, the frontmatter keys, and the change
        set attachment above, the plan *MUST* stay *exactly* as loaded --
        in particular, the "backmatter" with its other attachment blocks
        is passed through *verbatim*.

        Finally call the `ase_task_save(id: "<ase-task-id/>", text:
        "<task-content/>")` tool of the `ase` MCP server to persist the
        updated task plan. This `ase_task_save` MCP tool call is the
        *only* permitted way to persist the plan -- *NEVER* write the
        plan file via `Write`/`Edit` or by executing a shell command.
        Do not output anything in this sub-step.

    6.  Only output the following <template/>:

        <template>
        ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ⇢ changeset: **<task-changeset/>**, ▶ status: **plan implemented**
        </template>

    7.  Give the closing hint by expanding the following (which,
        depending on the configured <ase-guidance-level/>, may expand
        into nothing and hence emit no output at all):

        <if condition="<changeset-type/> is `worktree` and <context-label/> is not `.`">
        <ase-tpl-hint level="minimal">
        The change set is uncommitted in `<context-label/>` -- review it there, then use `/ase-task-integrate` to deliver it.
        </ase-tpl-hint>
        </if>
        <elseif condition="<changeset-type/> is `branch`">
        <ase-tpl-hint level="minimal">
        The change set is committed on branch `<changeset-name/>` in `<work-label/>` -- review it there, then use `/ase-task-integrate` to deliver it.
        </ase-tpl-hint>
        </elseif>
        <elseif condition="<task-changeset/> is `attachment:draft`">
        <ase-tpl-hint level="minimal">
        The change set is attached to the plan as its implementation draft only -- review it via `/ase-task-view --full`, then use `/ase-task-integrate --draft` to deliver it.
        </ase-tpl-hint>
        </elseif>
        <elseif condition="<changeset-type/> is `attachment`">
        <ase-tpl-hint level="minimal">
        The change set is attached to the plan only -- review it via `/ase-task-view --full`, then use `/ase-task-integrate --changeset <task-changeset/>` to deliver it.
        </ase-tpl-hint>
        </elseif>

5.  **Decide Next Step:**

    1.  *Determine next step*:

        <expand name="task-next-select"
            arg1="ase-task-implement"
            arg2="DONE|EDIT|INTEGRATE|DELETE">
            Next Step: How would you like to proceed with the plan?
            DONE: Stop processing and PRESERVE task plan.
            EDIT: Hand processing off to editing.
            INTEGRATE: Hand processing off to integration.
            DELETE: Stop processing and DELETE the task plan.
        </expand>

    2.  Check the tool <result/> and dispatch accordingly:

        -   If <result/> is `DONE` or `CANCEL`:
            Only output the following <template/> and then *STOP*.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan implemented -- done**
            </template>

        -   If <result/> is `EDIT`:
            <expand name="task-next-handoff" arg1="ase-task-edit"
                arg2="plan implemented -- hand-off to edit"></expand>

        -   If <result/> is `INTEGRATE`:
            Set <handoff-args></handoff-args> (empty). If
            <getopt-option-worktree/> is not empty, append
            ` --worktree <getopt-option-worktree/>`; if
            <getopt-option-changeset/> is not empty, append
            ` --changeset <getopt-option-changeset/>`; if
            <getopt-option-source/> is not empty and the `Target:`
            frontmatter key of <task-content/> (or, if absent, the
            configured default <ase-project-task-default-target/>) is `source`,
            append ` --target <getopt-option-source/>`; and if
            <getopt-option-stateless/> is `true`, append ` --stateless`
            to <handoff-args/>, so the integration delivers the very
            change set just created into the very source it is based on.

            <expand name="task-next-handoff" arg1="ase-task-integrate"
                arg2="plan implemented -- hand-off to integration"
                arg3="<handoff-args/>"></expand>

        -   If <result/> is `DELETE`:
            Set <args></args> (empty). Do *not* forward any remaining
            `--next` list tokens, because the `ase:ase-task-delete`
            skill accepts only an optional `[<id>]` argument and no
            `--next` option; remaining tokens are intentionally discarded.
            Only output the following <template/> and then call the
            tool `Skill(skill: "ase:ase-task-delete", args: "<args/>")`
            to invoke the `ase:ase-task-delete` skill in order to
            *delete* the updated plan. Immediately stop processing the
            current skill once the `Skill` tool was used.

            <template>
            ⧉ **ASE**: ◉ task: **<ase-task-id/>**, ▶ status: **plan implemented -- hand-off to delete task**
            </template>


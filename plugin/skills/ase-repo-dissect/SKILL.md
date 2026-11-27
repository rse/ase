---
name: ase-repo-dissect
argument-hint: "[--help|-h] [--max-parts|-m <count>] [--staged|-s] [--dry|-d] [--force|-f] [--sequential|-q] [--explain|-E] [--review|-r] [--auto|-a] [--changelog|-c] [--no-verify|-V] [<dissect-hint>]"
description: >
    Dissect the current Git change set, treated as an epic, domain-wise
    and logically into cohesive parts and materialize each part in its
    own dedicated Git WorkTree, or -- sequentially -- stage, explain,
    review, correct, and hand over each part for committing, one after
    another, in the Git index. Use when the user calls to "dissect",
    "split", "break up", "decompose", or "curate" a large change set into
    atomic, separately committable parts.
user-invocable: true
disable-model-invocation: false
effort: xhigh
allowed-tools:
    - "Bash(git *)"
    - "Bash(rm -f *)"
    - "Write"
    - "Read"
    - "Edit"
    - "Skill"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-repo-dissect">
Dissect a Change Set
</purpose>

<expand name="getopt"
    arg1="ase-repo-dissect"
    arg2="--max-parts|-m=8 --staged|-s --dry|-d --force|-f --sequential|-q --explain|-E --review|-r --auto|-a --changelog|-c --no-verify|-V">
    $ARGUMENTS
</expand>

<objective>
*Dissect* the current Git change set, treated as an *epic*, domain-wise
and logically into *cohesive parts*, and materialize every part in its
own dedicated *Git WorkTree* -- or, under `--sequential`, walk the parts
one after another in the *Git index* of the working copy -- so each part
can be reviewed and committed *atomically* and *independently*.
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-common-dissect.md

Procedure
---------

<flow>

1.  <step id="STEP 1: Determine Change Set and Hint">

    1.  Determine the *dissection hint*: set
        <dissect-hint><getopt-arguments/></dissect-hint>, with any
        leading and trailing whitespace stripped. Additionally, inherit
        the always existing <ase-project-id/> from the current context,
        as it names the worktrees and branches of all derived parts.

        <if condition="<dissect-hint/> is not empty">
        Only output the following <template/>:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ⇌ hint: **<dissect-hint/>**
        </template>
        </if>
        <else>
        No dissection hint was given, so the parts are derived from the
        change set alone. Do not output anything.
        </else>

    2.  Determine the *repository root* by running the corresponding
        command (taken exactly as given) and capturing its output into
        <repo-root/>:

        `git rev-parse --show-toplevel`

    3.  Check the *sequential mode* options. Set <sequential/> to `true`
        if <getopt-option-sequential/> is equal `true` and
        <getopt-option-dry/> is not equal `true` (a dry-run never
        stages, so the walk options are then without effect), and to
        `false` otherwise. `--force` is without effect under `--sequential`,
        as no worktree is created. Additionally, set
        <getopt-option-review/> to `true` if <getopt-option-auto/> is
        equal `true`, as fixing the review findings requires the review.

        <if condition="<getopt-option-sequential/> is not equal `true` AND at least one of <getopt-option-explain/>, <getopt-option-review/>, <getopt-option-changelog/>, and <getopt-option-no-verify/> is equal `true`">
        Only output the following <template/> and then immediately *STOP*:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ▶ ERROR: options `--explain`, `--review`, `--auto`, `--changelog`, and `--no-verify` require `--sequential`
        </template>
        </if>

        <if condition="<getopt-option-sequential/> is equal `true` AND <getopt-option-staged/> is equal `true`">
        Only output the following <template/> and then immediately *STOP*:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ▶ ERROR: option `--sequential` cannot be combined with `--staged`, as it walks all uncommitted changes through the Git index
        </template>
        </if>

        <if condition="<sequential/> is equal `true`">
        Every part *replaces* the content of the Git index, so determine
        the staged and the unstaged files by running the corresponding
        commands (taken exactly as given):

        `git -C "<repo-root/>" -c core.quotepath=off diff --cached --name-only`

        `git -C "<repo-root/>" -c core.quotepath=off diff --name-only`

        If a file occurs in *both* lists, its staged version exists
        *nowhere else* and would be lost by replacing the index content,
        so only output the following <template/> and then immediately
        *STOP*, leaving everything untouched:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ▶ ERROR: files with both staged and unstaged changes -- commit or unstage the staged changes first
        </template>
        </if>

    4.  Determine the *diff details* and the *diff statistics* by
        running the corresponding commands (taken exactly as given) and
        capturing their full outputs into <diff/> and <stat/>:

        <if condition="<getopt-option-staged/> is equal `true`">
        `git diff --cached --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ --binary HEAD`

        `git diff --cached --numstat HEAD`
        </if>
        <else>
        `git diff --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ --binary HEAD`

        `git diff --numstat HEAD`
        </else>

    5.  <if condition="<getopt-option-staged/> is not equal `true`">
        Additionally, *fold in the untracked files* -- they are part of
        the working copy change set, but carry no diff of their own.
        Determine them *read-only* by running the corresponding command
        (taken exactly as given):

        `git -C "<repo-root/>" -c core.quotepath=off ls-files --others --exclude-standard`

        *Skip* every listed entry below the `.ase/` directory -- it
        carries *ASE*'s own state and the worktrees created by this very
        skill, and hence is never part of the user's change set.

        Then, for *every* remaining listed file, capture its creation
        diff by running the corresponding command (taken exactly as
        given) and *append* its output to <diff/>:

        `git -C "<repo-root/>" diff --no-index --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ --binary /dev/null "<file/>"`

        This command intentionally exits with a non-zero status,
        because the two compared paths differ; treat this exit status
        as *success*, not as an error. Judge the *outcome* by the
        *output* instead: a run which emits *no* diff on standard output
        but an `error:` or `fatal:` message (e.g. the entry is a *nested*
        Git repository, which `git ls-files` reports as a directory) is a
        *real* failure -- append nothing for that entry and only output
        the following <template/>, then continue with the next file:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ⊘ untracked: `<file/>`, ▶ status: **not foldable into the change set**
        </template>
        </if>
        <else>
        Untracked files are *not* folded in under `--staged`/`-s`,
        because they are by definition *not* part of the Git index. Do
        not output anything.
        </else>

    6.  <if condition="<diff/> is empty">
        Only output the following <template/> and then *STOP* immediately:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ▶ status: **no changes to dissect**
        </template>
        </if>

    </step>

2.  <step id="STEP 2: Dissect Change Set">

    1.  *Derive the parts* of the epic. Set <dissect-min/> to `1` if
        <getopt-option-sequential/> is equal `true` (as staging,
        reviewing, and committing a change set of a *single* cohesive
        purpose is still a curation), and to `2` otherwise.

        <expand
            name="dissect-derive"
            arg1="ase-repo-dissect"
            arg2="<dissect-hint/>"
            arg3="<ase-project-id/>"
            arg4="<dissect-min/>"
        >
        the individual hunks of the captured <diff/>, weighted by the
        line counts of <stat/> and -- for the folded-in untracked files,
        which carry no <stat/> entry -- by their own diff line counts
        </expand>

        Additionally, try to keep *all* hunks of *one* file in the
        *same* part, and split a file's hunks across parts *only* when
        they are genuinely unrelated -- this keeps the per-part patches
        applicable resp. the per-part staging selections simple.

        <if condition="<sequential/> is not equal `true`">
        A *single* hunk is *atomic* here, so rule 3's splitting
        permission does *not* apply to it: you *MUST NOT* break a hunk
        into sub-hunks, because this would require re-computing its `@@`
        header and hence destroy the byte-exactness the per-part
        <patch/> depends on.
        </if>
        <else>
        No per-part <patch/> is created, as `ase-repo-stage` stages a
        part line by line, so rule 3's splitting permission applies to a
        single hunk, too.
        </else>

    2.  *Report the parts*:

        <expand name="dissect-report" arg1="<ase-project-id/>"></expand>

    </step>

3.  <step id="STEP 3: Detect Target Collisions"
        condition="<getopt-option-dry/> is not equal `true` AND <sequential/> is not equal `true`">

    1.  Determine the *worktree directory* of every part by calling the
        `ase_worktree_path(id: "<part-id/>", create: true)` tool of the
        `ase` MCP server once per <part-id/> of <parts/> and capturing
        its output into the <part-dir/> of that part.

        You *MUST* *NEVER* assemble such a path yourself, as only this
        tool rejects a path leading through a symbolic link, through a
        non-directory, or out of the repository -- a path both `git
        worktree add` and `git worktree remove` would otherwise silently
        follow and thereby write outside the repository.

        <if condition="this tool call fails for any part">
        Only output the following <template/> and then immediately *STOP*
        processing the entire current skill, leaving the working copy and
        *all* existing worktrees and branches untouched:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ▶ ERROR: unsafe worktree directory -- cannot create worktrees
        </template>
        </if>

    2.  Determine the *existing worktrees* and *existing branches* by
        running the corresponding commands (taken exactly as given) and
        capturing their outputs:

        `git worktree list --porcelain`

        `git branch --list`

    3.  Set <collisions/> to all <part-id/> of <parts/> for which either
        the worktree directory <part-dir/> or a branch `<part-id/>`
        already exists.

    4.  <if condition="<collisions/> is not empty AND <getopt-option-force/> is not equal `true`">
        Only output the following <template/> -- with <collisions/>
        rendered as a comma-separated list of code spans -- and then
        immediately *STOP* processing the entire current skill, leaving
        *all* existing worktrees and branches untouched:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ⊘ collisions: <collisions/>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ✪ dissection: **<n/>** parts, ▶ status: **targets exist**
        </template>

        Directly *after* this <template/>, and *before* stopping, give
        the corrective hint by expanding the following (which, depending
        on the configured <ase-guidance-level/>, may expand into nothing
        and hence emit no output at all):

        <ase-tpl-hint level="minimal">
        Re-run `/ase-repo-dissect --force` to remove and re-create the colliding worktrees and branches.
        </ase-tpl-hint>
        </if>

    5.  <if condition="<collisions/> is not empty AND <getopt-option-force/> is equal `true`">
        *Remove* every colliding target by running the corresponding
        commands (taken exactly as given) per colliding <part-id/>, and
        silently ignore the failure of an individual command when the
        corresponding worktree or branch does not exist:

        `git worktree remove --force "<part-dir/>"`

        `git worktree prune`

        `git branch -D "<part-id/>"`
        </if>

    </step>

4.  <step id="STEP 4: Materialize WorkTrees"
        condition="<getopt-option-dry/> is not equal `true` AND <sequential/> is not equal `true`">

    You *MUST* *NEVER* mutate the *original* working copy in this step:
    do *not* modify, stage, stash, revert, or commit anything outside of
    the freshly created worktrees.

    1.  Set <tmp-dir/> to the output of the command
        `git -C "<repo-root/>" rev-parse --absolute-git-dir` (taken
        exactly as given), a private location which, unlike a shared
        `/tmp`, no other user can tamper with. Do not output anything.

    2.  For *every* part in <parts/>, in their derived order:

        1.  Assemble <patch/> from the *verbatim* subset of <diff/>
            assigned to this part: keep the complete `diff --git` file
            headers and the complete `@@` hunk headers of the assigned
            hunks, and change *nothing* inside them.

            The captured <diff/> is *byte-exact* input and <patch/> stays
            *byte-exact*, too, because `git apply` rejects even the
            smallest deviation. You *MUST* therefore *NEVER* re-wrap a
            line, re-indent a line, normalize or strip trailing
            whitespace, drop the leading context/`+`/`-` marker column,
            re-encode a character, or omit the trailing newline -- and
            you *MUST* *NEVER* re-render any part of the diff as
            Markdown, so no bullet marker and no inline code span is ever
            introduced into <patch/>.

        2.  Use the `Write` tool to write <patch/> to the patch file
            `<tmp-dir/>/ase-dissect-<part-id/>.patch`.

        3.  Create the worktree by running the corresponding command
            (taken exactly as given), which creates the directory
            *and* -- named after its last path component -- the branch
            <part-id/> from `HEAD`. The `.ase` directory is usually
            git-ignored, so the worktree itself never shows up as a
            change:

            `git worktree add "<part-dir/>"`

            <if condition="this command fails">
            Only output the following <template/>, then *continue* with
            the *next* part -- a single failing part *never* aborts the
            remaining ones:

            <template>
            ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ◉ part: **<part-id/>**, ▶ status: **worktree failed to create**, ⊚ kept: `<tmp-dir/>/ase-dissect-<part-id/>.patch`
            </template>
            </if>

        4.  Apply the patch *inside* the freshly created worktree by
            running the corresponding command (taken exactly as given):

            `git -C "<part-dir/>" apply --whitespace=nowarn "<tmp-dir/>/ase-dissect-<part-id/>.patch"`

            <if condition="this command fails">
            Only output the following <template/>, then *continue* with
            the *next* part -- a single failing part *never* aborts the
            remaining ones:

            <template>
            ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ◉ part: **<part-id/>**, ▶ status: **patch failed to apply**, ⊚ kept: `<tmp-dir/>/ase-dissect-<part-id/>.patch`
            </template>
            </if>

        5.  <if condition="a `CHANGELOG.md` file exists in the created worktree">
            Add *one* new entry to the *first* (most recent) section of
            that `CHANGELOG.md` *inside the worktree*, summarizing
            *this part's* change set only. For this, unless already done
            earlier in the current skill run, use the `Read` tool to
            read the file `meta/ase-format-changelog.md`, with its file
            path formed by joining <ase-plugin-root/> and the file name
            with exactly *one* `/` separator, and write the entry in the
            format detected by its *Format Detection* rules and
            according to its *Entry Quality* rules.

            The *existing* `CHANGELOG.md` is *changed*, never replaced:
            you *MUST* use the `Read` tool to read it and the `Edit` tool
            to insert the single new entry *in place*, and you *MUST*
            *NEVER* use the `Write` tool on it, as this would drop the
            entire remaining change history.

            <if condition="the patch of this part already added an entry to that `CHANGELOG.md`">
            The part's own change set already carries its `CHANGELOG.md`
            entry, so you *MUST* *NOT* add a second one. Keep the entry
            which came with the patch and, if it mentions changes which
            landed in *other* parts, reduce it to *this* part's change
            set only.
            </if>
            </if>
            <else>
            The project keeps no `CHANGELOG.md`, so nothing is added and
            no `CHANGELOG.md` is created. Do not output anything.
            </else>

        6.  Leave the worktree *uncommitted*: do *not* run `git add` and
            do *not* run `git commit`, so the user keeps full control
            over the final commit of every part.

        7.  Only output the following <template/>:

            <template>
            ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ◉ part: **<part-id/>**, ▶ status: **worktree created**
            </template>

    3.  *Clean up* the temporary patch files by running the
        corresponding command (taken exactly as given) once per
        <part-id/> of the *successfully* materialized <parts/>, and
        silently ignore the failure of an individual command when the
        corresponding patch file does not exist:

        `rm -f "<tmp-dir/>/ase-dissect-<part-id/>.patch"`

        The patch file of a *successful* part is a pure *intermediate*:
        it was already consumed by `git apply` and its content is fully
        preserved in the worktree, so it is removed. The patch file of a
        part whose worktree or patch *failed* is *kept* instead, because
        it is that part's only materialization and would otherwise be
        lost. Do not output anything.

    </step>

5.  <step id="STEP 5: Walk Parts Sequentially"
        condition="<sequential/> is equal `true`">

    Throughout this step, you *MUST* *NEVER* run `git commit` or `git
    stash` yourself, and you *MUST* *NEVER* modify the *content* of a
    working copy file yourself (except for reverting the `CHANGELOG.md`
    entry of an unstaged part, see sub-step 5.7): only the Git *index*
    is changed by you, every file modification (and the temporary stash
    of the build check of `ase-repo-stage`) is left to the invoked
    skills, and *committing* every part stays with the user. Nothing in
    this step ever discards a change of the working copy.

    For *every* dialog of this step, only a user input which consists of
    a *bare* key or answer label counts as that answer: any *longer*
    input (e.g. a sentence which merely mentions a label) counts as the
    free text `OTHER: <input/>`, regardless of the label mapping of the
    dialog, unless it clearly indicates that the user does not want to
    proceed, which still counts as `CANCEL`.

    1.  *Confirm the cut* of the reported <parts/>: set <n-parts/> to
        <n/>, as the dialog reuses <n/> as its answer counter.

        <expand name="custom-dialog" arg1="--other">
            Dissection: Walk the <n-parts/> reported parts one after another through the Git index?
            PROCEED: stage and present the first part
            REGROUP: re-dissect the changes (type a free-text hint, or pick this to be asked for it)
            STOP SKILL: stop the entire skill immediately
        </expand>

        <if condition="<result/> is `STOP SKILL` or `CANCEL`">
        Only output the following <template/> and then immediately *STOP*:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ✪ dissection: **<n-parts/>** parts, ▶ status: **walk cancelled -- nothing staged**
        </template>
        </if>
        <elseif condition="<result/> is `REGROUP` or starts with `OTHER: `">
        Set <dissect-hint/> to the free text of an `OTHER: ` <result/>,
        with the prefix and any leading `REGROUP` word stripped. For a
        bare `REGROUP` (which carries no hint), *ask for the hint*:

        <expand name="custom-dialog" arg1="--other">
            Regroup: Along which hint shall the changes be re-dissected? (type it as free text)
            NO HINT: re-dissect without a hint
        </expand>

        and set <dissect-hint/> to <result/> without its `OTHER: `
        prefix, or to empty for `NO HINT`. For `CANCEL`, drop the regroup
        and repeat the dialog which asked for it (this sub-step 5.1 resp.
        the decision dialog of sub-step 5.6) unchanged. Otherwise, when
        asked from this sub-step 5.1, re-run STEP 1.4 to STEP 2 with it,
        and repeat this sub-step 5.1 (when asked from sub-step 5.6, the
        `REGROUP` of sub-step 5.7 re-dissects only after unstaging the part).
        </elseif>

        Set <committed/> and <skipped/> to empty lists, and set
        <walk-parts/> to a copy of <parts/>, as the invoked skills
        overwrite <parts/>. Then process the parts of <walk-parts/> *one
        after another*, in their derived order, by the following sub-steps
        5.2 to 5.7, where a REGROUP of sub-step 5.7 *replaces* the
        remaining parts of <walk-parts/> by the new <parts/> and the walk
        continues with the first of the new ones.

    2.  *Stage the part*: set <total/> to the current number of parts of
        <walk-parts/>, set <wish/> to empty, set <changelog-added/> and
        <fix-unstaged/> to `false`, set <part-scope/> to the <scope/> of the
        part, and set <part-topic/> to the precise selection of this part:
        `part P<part-no/> -- <part-scope/>: exactly the following changes,
        nothing else: <part-files/>`, where <part-files/> lists every file
        of the part as `<file/> (entirely)` or, for a file whose hunks are
        split across parts, as `<file/> (only the hunks which
        <hunk-summary/>)`. The invoked skills overwrite placeholders like
        <parts/>, <files/>, and <scope/>, so this step only uses
        <walk-parts/>, <part-scope/>, and <part-files/>. Only output the
        following <template/>:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ◉ part: **P<part-no/>**/<total/> `<part-id/>`, ▶ status: **staging**
        </template>

        Record the current commit by running the corresponding command
        (taken exactly as given) and capturing its output into <head/>:

        `git -C "<repo-root/>" rev-parse HEAD`

        *Every* staging of this part (here and in the sub-steps 5.4 and
        5.7) passes the options <stage-opts/>, determined *anew* right
        before each staging, which carry `--no-verify`
        if <getopt-option-no-verify/> is equal `true`, and `--changelog`
        if <getopt-option-changelog/> is equal `true`, the files of the
        part do not include a `CHANGELOG.md` (whose own entry then travels
        with the part), and <changelog-added/> is equal `false`, so a part
        whose build first failed still gets its entry once it builds. After
        each staging with `--changelog`, set <changelog-added/> to `true`
        if the command `git -C "<repo-root/>" -c core.quotepath=off diff
        --cached --name-only` (taken exactly as given) lists a
        `CHANGELOG.md`.

        Then stage exactly this part -- which *replaces* the index content,
        stages untracked files, splits mixed hunks mechanically, and checks
        that the staged state builds on its own on top of the already
        committed parts:

        <skill name="ase:ase-repo-stage" args="<stage-opts/> <part-topic/>"/>

        Set <build-failed/> to `true` if this staging reported that the
        *staged state does not build*, and to `false` otherwise. Set
        <build-unchecked/> to `true` if it reported that *no build command*
        was found, and to `false` otherwise.

        <if condition="this staging reported that *restoring the working copy failed*">
        The uncommitted changes are parked in `git stash` and the working
        copy is incomplete, so the walk *MUST NOT* continue: leave the
        index and the stash untouched, only output the following
        <template/>, and then immediately *STOP*:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ◉ part: **P<part-no/>**/<total/> `<part-id/>`, ▶ ERROR: working copy not restored -- the changes are kept in `git stash list` as `ase-repo-stage`
        </template>

        The same holds for *every* later `--merge` staging of this part
        in the sub-steps 5.4 and 5.7.
        </if>
        <elseif condition="this staging stopped with any other error (except the build failure, which only sets <build-failed/>) or with nothing staged">
        Unstage everything by running the corresponding command (taken
        exactly as given), append the part to <skipped/>, only output the
        following <template/>, and *continue* with the *next* part:

        `git -C "<repo-root/>" reset -q`

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ◉ part: **P<part-no/>**/<total/> `<part-id/>`, ▶ status: **staging failed -- part skipped**
        </template>
        </elseif>

    3.  <if condition="<getopt-option-explain/> is equal `true`">
        *Explain the part* file by file in plain language:

        <skill name="ase:ase-repo-diff" args="--staged --explain"/>
        </if>

    4.  <if condition="<getopt-option-review/> is equal `true`">
        *Review the part*, where <review-opts/> carries `--auto` if
        <getopt-option-auto/> is equal `true`:

        <skill name="ase:ase-repo-review" args="--staged --evidence <review-opts/>"/>

        Set <findings/> to its remaining findings of severity `HIGH` and
        `MEDIUM`, for `--auto` only those whose fix is not `VERIFIED`.
        Set <verdict/> to `SKIPPED` if the rendered verdict starts with
        `SKIPPED`, else to `REJECT` if it starts with `REJECT` and
        <findings/> still holds a finding of severity `HIGH` (as under
        `--auto` the rendered verdict stays the one *before* the fixing),
        else to `FIXED` if it starts with `REJECT`, and to `APPROVE`
        otherwise.

        <if condition="the review applied at least one fix">
        The fixes were applied to the working copy only, so add them to
        the part:

        <skill name="ase:ase-repo-stage" args="--merge <stage-opts/> the fixes just applied by the review of part P<part-no/> to the files <part-files/> and to any further file they touched"/>

        Update <build-failed/> and <build-unchecked/> according to this
        staging, and handle a report that *restoring the working copy
        failed* exactly as in sub-step 5.2. Set <fix-unstaged/> to `true`
        if this staging stopped with any other error or with nothing
        staged (as the fixes then stay unstaged), and to `false` otherwise.
        </if>
        </if>
        <else>
        Set <verdict/> to `NONE` and <findings/> to an empty list.
        </else>

    5.  *Recommend a decision*: check the *staged files* by running the
        corresponding command (taken exactly as given), capture its output
        into <staged-files/>, and set <deviation/> to the files which are
        part of <part-files/> but not staged, or staged but not part of
        <part-files/> (except a `CHANGELOG.md` under `--changelog`), plus
        the item `unstaged fixes` if <fix-unstaged/> is equal `true`:

        `git -C "<repo-root/>" -c core.quotepath=off diff --cached --name-only`

        Set <rec/> to `REGROUP` if <build-failed/> is equal `true` (as a
        part which does not build on its own usually lacks a dependent
        change of a later part), else to `CHANGE` if <verdict/> is equal
        `REJECT` or <fix-unstaged/> is equal `true`, and to `ACCEPT`
        otherwise. Set
        <build-state/> to `skipped` if <getopt-option-no-verify/> is equal
        `true`, else to `unchecked` if <build-unchecked/> is equal `true`,
        else to `failed` if <build-failed/> is equal `true`, and to `ok`
        otherwise. Then only output the following <template/>, with the
        `⚠` line only if <deviation/> is not empty:

        <template>
        ⚠   deviation from the dissection: <deviation/>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ◉ part: **P<part-no/>**/<total/> `<part-id/>`, ⚙ build: **<build-state/>**, ⚖ verdict: **<verdict/>**, ★ recommended: **<rec/>**
        </template>

    6.  *Decide on the part*, whose staged lines the user can inspect in
        the staged changes view of their editor:

        <expand name="custom-dialog" arg1="--other">
            Part P<part-no/>: Decide on the staged part P<part-no/>/<total/> "<part-scope/>" (recommended: <rec/>)
            ACCEPT: craft the commit message and let you commit the staged part
            CHANGE: correct the part (type a correction wish as free text, else the findings resp. the build failure are corrected)
            SKIP: unstage the part and leave it uncommitted in the working copy
            REGROUP: re-dissect all remaining changes (type `REGROUP` followed by a free-text hint, or pick this to be asked for it)
            STOP SKILL: unstage the part and stop the entire skill immediately
        </expand>

        If <result/> starts with `OTHER: ` followed by the word `REGROUP`
        in any letter case, set <result/> to `REGROUP` and <dissect-hint/>
        to the remaining free text. If <result/> otherwise starts with
        `OTHER: `, set <result/> to `CHANGE` and <wish/> to the remaining
        free text. If <result/> is a bare `REGROUP`, ask for its hint with
        the regroup hint dialog of sub-step 5.1 and set <dissect-hint/>
        accordingly (where its `CANCEL` repeats this decision dialog).

    7.  *Dispatch the decision*, where *unstaging the part* means: if
        <getopt-option-changelog/> is equal `true`, the files of the part
        do not include a `CHANGELOG.md`, and <changelog-added/> is equal
        `true`, capture this entry added resp. updated by `ase-repo-stage
        --changelog` via the command `git -C "<repo-root/>" diff --cached
        -- ":(glob)**/CHANGELOG.md"` (taken exactly as given). Then run the
        command `git -C "<repo-root/>" reset -q` (taken exactly as given),
        and revert exactly the captured diff in the working copy
        `CHANGELOG.md` -- remove its added lines and restore its removed
        lines -- via the `Read` and `Edit` tools, the *only* file
        modification done by you, as the entry belongs to the abandoned
        part:

        -   <if condition="<result/> is `ACCEPT`">
            Craft the commit message of the staged part:

            <skill name="ase:ase-repo-commit"/>

            Then let the user commit the part:

            <expand name="custom-dialog">
                Commit P<part-no/>: Commit the staged part P<part-no/> now yourself (e.g. with the crafted message), then confirm here
                COMMITTED: the part is committed -- continue with the next part
                STOP SKILL: stop the entire skill, leaving the part staged
            </expand>

            <if condition="<result/> is `COMMITTED`">
            Check it by running the corresponding commands (taken exactly
            as given): the part is committed only if the output of the
            first command differs from <head/> and the output of the
            second command is empty.

            `git -C "<repo-root/>" rev-parse HEAD`

            `git -C "<repo-root/>" diff --cached --name-only`

            <if condition="the part is committed">
            Append it to <committed/>, and check the committed files by
            running the corresponding command (taken exactly as given):

            `git -C "<repo-root/>" -c core.quotepath=off diff --name-only "<head/>" HEAD`

            <if condition="its output lists files beyond <staged-files/> (e.g. by a `git commit -a`)">
            Only output the following <template/>, with <extra/> being
            these files:

            <template>
            ⚠   committed beyond the part: <extra/>
            </template>

            As later parts may be committed already, *replace* the
            remaining parts like a `REGROUP` with an empty
            <dissect-hint/>, or, if no uncommitted change remains (the
            output of the command `git -C "<repo-root/>" status
            --porcelain`, taken exactly as given, is empty), drop the
            remaining parts from <walk-parts/>, as they are committed
            along, and continue with sub-step 5.8.
            </if>
            <else>
            *Continue* with the *next* part.
            </else>
            </if>
            <else>
            Only output the following <template/> and repeat the commit
            dialog above:

            <template>
            ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ◉ part: **P<part-no/>**/<total/> `<part-id/>`, ▶ status: **not yet committed**
            </template>
            </else>
            </if>
            <elseif condition="<result/> is `STOP SKILL` or `CANCEL`">
            Leave the part staged and continue with sub-step 5.8.
            </elseif>
            <else>
            Repeat the commit dialog above, as any other input confirms
            nothing.
            </else>
            </if>

        -   <elseif condition="<result/> is `CHANGE`">
            <if condition="<wish/> is empty">
            Set <wish/> to the correction of the essential build errors
            if <build-failed/> is equal `true`, plus the correction of
            all <findings/> (each with its `file:line` citation). If
            <wish/> is still empty, ask for it:

            <expand name="custom-dialog" arg1="--other">
                Change P<part-no/>: Which correction of the part P<part-no/> do you want? (type it as free text)
                STOP SKILL: unstage the part and stop the entire skill immediately
            </expand>

            Dispatch `STOP SKILL` and `CANCEL` like the `STOP SKILL` of
            sub-step 5.6, and otherwise set <wish/> to <result/> without
            its `OTHER: ` prefix.
            </if>

            Correct the part in the working copy, confined to its files:

            <skill name="ase:ase-code-edit" args="in the files <part-files/> only: <wish/>"/>

            Add the correction to the part:

            <skill name="ase:ase-repo-stage" args="--merge <stage-opts/> the correction just applied to part P<part-no/>: <wish/>"/>

            Update <build-failed/> and <build-unchecked/> according to
            this staging, handle a report that *restoring the working copy
            failed* exactly as in sub-step 5.2, set <fix-unstaged/> as in
            sub-step 5.4, clear <wish/>, and
            *re-present* the part by
            repeating the sub-steps 5.3 to 5.7, so the user always sees
            its complete current state, including a fresh <deviation/>.
            </elseif>

        -   <elseif condition="<result/> is `SKIP`">
            Unstage the part, append it to <skipped/>, and *continue*
            with the *next* part.
            </elseif>

        -   <elseif condition="<result/> is `REGROUP`">
            Unstage the part, clear <skipped/>, and re-run STEP 1.4 to
            STEP 2 with the given <dissect-hint/> on all remaining
            uncommitted changes, where a *single* remaining cohesive part
            is walked as the only part (see STEP 2.1). Then *replace* the
            remaining parts of <walk-parts/> by the new <parts/> and
            *continue* with the first of them.
            </elseif>

        -   <else>
            For `STOP SKILL` or `CANCEL`, unstage the part and continue
            with sub-step 5.8.
            </else>

    8.  *Report the walk*: set <n-committed/> and <n-skipped/> to the
        number of parts in <committed/> resp. <skipped/>, set <n-open/> to
        the number of parts of the current <walk-parts/> neither committed nor
        skipped (including a part left staged), and set <status/> to
        `change set curated` if both <n-skipped/> and <n-open/> are `0`,
        and to `change set partially curated` otherwise. Then only output
        the following <template/>:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ✔ committed: **<n-committed/>**, ⊘ skipped: **<n-skipped/>**, ◌ open: **<n-open/>**, ▶ status: **<status/>**
        </template>

        Finally, give the closing hint by expanding the following (which,
        depending on the configured <ase-guidance-level/>, may expand
        into nothing and hence emit no output at all):

        <if condition="<status/> is `change set partially curated`">
        <ase-tpl-hint level="minimal">
        The remaining parts are still uncommitted in the working copy -- re-run `/ase-repo-dissect --sequential` to walk them again.
        </ase-tpl-hint>
        </if>

    </step>

6.  <step id="STEP 6: Report Result"
        condition="<sequential/> is not equal `true`">

    1.  <if condition="<getopt-option-dry/> is equal `true`">
        Set <dry-what/> to `nothing staged` if
        <getopt-option-sequential/> is equal `true`, and to `no worktrees
        created` otherwise. Then only output the following <template/>:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ✪ dissection: **<n/>** parts, ▶ status: **dry-run -- <dry-what/>**
        </template>
        </if>
        <else>
        Set <status/> to `change set dissected` if the worktrees of all
        parts were created and their patches applied, or to
        `change set partially dissected` otherwise. Then only output
        the following <template/>:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-repo-dissect**, ✪ dissection: **<n/>** parts, ▶ status: **<status/>**
        </template>
        </else>

    2.  Finally, give the closing hints by expanding the following
        (which, depending on the configured <ase-guidance-level/>, may
        each expand into nothing and hence emit no output at all):

        <if condition="<getopt-option-dry/> is not equal `true`">
        <ase-tpl-hint level="minimal">
        The parts are uncommitted in `.ase/worktree/<id>` -- review and commit each of them separately, then remove them via `git worktree remove`.
        </ase-tpl-hint>
        </if>
        <elseif condition="<getopt-option-sequential/> is equal `true`">
        <ase-tpl-hint level="minimal">
        Re-run `/ase-repo-dissect --sequential` without `--dry` to actually walk the reported parts through the Git index, optionally with a `<dissect-hint>` argument if the reported split is not the intended one.
        </ase-tpl-hint>
        </elseif>
        <else>
        <ase-tpl-hint level="minimal">
        Re-run `/ase-repo-dissect` without `--dry` to actually create the reported worktrees, optionally with a `<dissect-hint>` argument if the reported split is not the intended one.
        </ase-tpl-hint>
        </else>

        <if condition="<getopt-option-sequential/> is not equal `true`">
        <ase-tpl-hint level="normal">
        Use `/ase-repo-diff --unstaged -w <part-id>` and `/ase-repo-review --unstaged -w <part-id>` to summarize and review a part's worktree before committing.
        </ase-tpl-hint>
        </if>

        <ase-tpl-hint level="verbose">
        Use `/ase-repo-dissect --staged` to dissect the staged changes only, `--max-parts <count>` to bound the number of parts, `--force` to re-create already existing worktrees, `--sequential` to walk the parts one after another through the Git index instead, and a `<dissect-hint>` argument to steer the split.
        </ase-tpl-hint>

    </step>

</flow>

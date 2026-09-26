---
name: ase-code-review
argument-hint: "[--help|-h]"
description: >
    Review uncommitted changes and curate them into clean commits
    grouped by theme: hunks are grouped, staged group by group,
    explained compactly, and committed only on the user's explicit
    accept. Use when the user wants to walk through unstaged/uncommitted
    changes step by step, get chunks staged and explained one at a time,
    accept ("abnehmen") changes chunk by chunk, or curate a change set
    into separate commits. Not for judging an existing staged diff --
    that is ase-meta-review.
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Skill"
    - "Agent"
    - "Read"
    - "Grep"
    - "Glob"
    - "Bash(git status)"
    - "Bash(git status *)"
    - "Bash(git diff)"
    - "Bash(git diff *)"
    - "Bash(git show *)"
    - "Bash(git log *)"
    - "Bash(git grep *)"
    - "Bash(git ls-files *)"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-code-review">
Review and Curate Uncommitted Changes
</purpose>

<expand name="getopt"
    arg1="ase-code-review"
    arg2="">
    $ARGUMENTS
</expand>

<define name="user-dialog">
In the following, you *MUST* *NOT* use your built-in
<user-dialog-tool/> tool (e.g. `AskUserQuestion`) -- rendering a
native selection widget instead of the ASE dialog box is a *defect*.
Instead, you *MUST* show the boxed ASE custom dialog according to the
expanded `custom-dialog` definition, end your turn, and let the user
answer by typing. You *MUST* closely follow this definition.
Before rendering the dialog, determine from the current context the
single *recommended* answer option and prefix its description with
` ⚝ **RECOMMENDATION** ⚝ - `. Exactly *one* option carries the marker.
Unless stronger contextual evidence suggests otherwise, recommend:
group table → `GROUPS-OK`; group decision → `ACCEPT` (but never while
a VERTICAL build is non-green, and never while the group card's
*Verdict* carries at least one `✗` -- then recommend `CHANGE`, as the
evidence itself says the group is not ready); and on a *destructive*
confirmation always the non-destructive way out (`CANCEL`).
<expand name="custom-dialog" arg1="--other"><content/></expand>
Where the dispatch on <result/> below carries no explicit branch for a
result starting with `OTHER:`, treat such a result as `CANCEL`.
</define>

<objective>
Acting as an *expert-level software developer* who *reviews and
curates*, *group* the uncommitted changes -- working tree, index, and
untracked files -- into themes, let the user *confirm the grouping* from one
compact table, then *stage* one theme at a time into the plain Git
index -- no work branch, no stashing, no diff dumps, the user reviews
the staged lines in their own editor -- and *commit* only what the
user accepts. Before a group is presented at all, its `✗` findings
are *corrected automatically* in one pass, so the user first sees the
already corrected group. Demanding a further *correction* instead of an
accept is a regular outcome of a group review: it is carried out right
there by delegating to `ase-code-edit`, after which the group is
re-staged and re-presented. This skill *complements* its neighbours rather than
duplicating them: `ase-meta-diff` narrates *what changed*,
`ase-meta-review` renders a reviewer's *judgement*,
`ase-code-lint`/`ase-code-analyze` flag *quality/logic* problems, and
`ase-meta-commit` crafts the *message* -- this skill *curates and
commits*. Its per-file *evidence* lines are line-cited findings that
show whether a group is correct and complete, gathered against the
change and stated honestly (`✓`, `✗`, `?`, `–`); they are not a
free-floating quality verdict, which stays with the analyzers.
</objective>

Evidence Budget
---------------

Gathering evidence is fanned out into sub-agents, and every one of them
is paid for. Each dispatch therefore carries an explicit *capability
tier*, chosen from the *judgment the file actually needs*, never from
the model this review happens to run on -- without an explicit tier a
sub-agent inherits that model, which judges a renamed constant as
expensively as a changed interface. The tiers are named by capability,
never by a vendor model name or a version, so the skill stays valid
under every agent tool:

-   `standard`: a *file-local* judgement -- the change is understandable
    from the file itself plus the diff, touches no signature others
    depend on, and its tests sit next to it.
-   `deep`: a judgement which has to *leave* the file -- a changed
    signature with callers or implementers, a security-relevant path, a
    contract checked against the specification, a defect whose reach is
    unclear.
-   `max`: reserved for a file whose misjudgement would invalidate the
    whole group -- a core contract every other file in the group builds
    on.

`light` is *never* used here: an evidence line which cites nothing is
worse than no line at all.

How the tier reaches the sub-agent is *tool-specific*, hence dispatch on
<ase-agent-tool/>:

<if condition="<ase-agent-tool/> is `claude`">
Pass it as the `model` attribute with the documented identifier of the
tier: `standard` is `sonnet`, `deep` is `opus`, and `max` is `fable`.
</if>

<else>
Pass *no* model at all, because neither *GitHub Copilot* nor *OpenAI
Codex* documents which model identifiers their sub-agent configuration
accepts, and an invented identifier would break the dispatch at run
time. State the tier as the *first* line of the sub-agent prompt, in the
form `Tier: <tier/>.`, so the budget decision stays visible.
</else>

Effort is carried as the *last* line of the sub-agent prompt, and both
tiers used here run *high*: `Think hard about this.` The same floor
applies to a sub-agent which invokes a `<skill/>`. Beyond the tier, the
sub-agents are budgeted by what flows *through* them: each returns
exactly its evidence records and nothing else -- no prose summary, no
restated file content, no narration -- and reads the *excerpts* a
dimension needs rather than re-reading what it already cited.

*IMPORTANT*: Author *every* free-text output of this skill -- the
change intent, group one-liners, rationales, per-file explanations,
evidence texts, verdicts, and discussion answers -- in the *user's
conversation language* (e.g. German when the user talks German) and in
*simply understandable* wording, as for a colleague who did not write
the code and is building a mental model of it; the evidence texts even
for a *beginner*. Explain what is *logically achieved*, never merely
what was edited. Technical identifiers, filenames, and quoted code
stay in their original form.

<flow>

1.  <step id="STEP 1: Ingest Surface">

    Build the *internal* hunk manifest of every uncommitted change:
    working tree, index, and untracked files. Run:

    -   `git status --porcelain`
    -   `git diff` (working tree vs. index)
    -   `git diff --staged` (index vs. HEAD)
    -   list untracked files (each treated as one add-hunk)

    Record per hunk: file, `+`/`-` line counts, kind (`add`, `modify`,
    `delete`, `rename`, `binary`). Renames are assigned atomically (no
    hunk-level split); binary hunks whole-file. For fine-grained
    separation within a single file, regenerate the diff with
    `git diff --unified=0`; hunks taken from it are applied in 5.1
    with `git apply --cached --unidiff-zero`, as zero-context hunks
    are rejected without that flag.

    This manifest is *working state only* -- do *not* output it. If the
    surface is empty, only output the following <template/> and then
    immediately *STOP* processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-code-review**, ▶ status: **no uncommitted changes -- nothing to review**
    </template>

    </step>

2.  <step id="STEP 2: Set Curation Defaults">

    Set the curation modes *silently*, without any dialog -- the review
    starts at the grouping table, not at a series of mode questions:

    -   <review-mode>HORIZONTAL</review-mode>: groups are cut by
        *topical/architectural proximity* and *no* build is run at all.
    -   <test-mode>TESTS-LAST</test-mode>: test hunks are kept out of
        the code groups and form one dedicated final group.

    Both modes stay *switchable* from the single STEP 4 dialog, so the
    user reaches them exactly when they see a cut that calls for them.

    Hints:

    -   In *VERTICAL* mode each group is cut as a *build-safe vertical
        slice* (interface + implementation + caller) and STEP 5 runs
        the project build before the accept, *gating* it. Note that
        the build runs on the *full working tree* (nothing is stashed
        away), so unaccepted changes participate in it.
    -   With <test-mode/> `TESTS-LAST`, every hunk in a *test file* --
        test directories like `src/test/`, `tests/`, `__tests__/`, and
        test-named files like `*Test.java`, `*.spec.ts`, `*_test.go` --
        goes into one dedicated final group `UPDATE(test): accompanying
        tests`, always ordered *last*, so the code groups stay free of
        test noise and the tests are accepted as one block.
    -   With <test-mode/> `REVIEW-TESTS`, test hunks instead join the
        group of the code they cover, which suits a change set whose
        tests are the actual subject of the review.

    Whenever a later step *cancels* the review, only output the
    following <template/> and then immediately *STOP* processing the
    entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-code-review**, ▶ status: **review cancelled**
    </template>

    </step>

3.  <step id="STEP 3: Group Hunks into Themes">

    *Internally* propose 3-5 *themes* (commit groups) spanning the
    full change surface, using the taxonomy shared with
    `ase-meta-commit` and `ase-meta-diff` (FEATURE, BUGFIX, REFACTOR,
    UPDATE, CLEANUP, IMPROVEMENT), and map *every* hunk to exactly one
    theme. Do not output anything in this step.

    Hints:

    -   Derive themes from filenames, directory prefixes, and diff
        summaries; honor <review-mode/> (build-safe slices vs. topical
        proximity) and <test-mode/> (dedicated final test group).
    -   A hunk that fits no theme goes into a final `CLEANUP(misc)`
        catch-all group; a hunk bridging two themes is split at the
        patch-text level into two independent hunk headers
        (`@@ -<from>,<n> +<to>,<m> @@`) covering disjoint ranges, as a
        single git-level hunk cannot be staged partially.
    -   Order the themes as a *comprehension* order: every theme may
        build only on concepts the user has already accepted --
        foundations (types, interfaces, utilities) before the code
        depending on them, so the reviewer's mental model grows
        monotonically and never meets a forward reference. In
        *VERTICAL* mode this order is additionally *topological*, so
        each slice builds given the previously accepted ones. A
        `TESTS-LAST` test group always comes last.

    </step>

4.  <step id="STEP 4: Confirm the Grouping">

    Present the *whole before the parts*: first a 2-3 sentence
    <intent/> reconstructing what the entire change set wants to
    achieve (the umbrella the groups hang under), then the grouping as
    *one compact table* -- nothing else -- so the user can judge
    whether the cut fits:

    <template>
    <ase-tpl-bullet-normal/> **GROUPS** (<group-count/> groups, <review-mode/>, <test-mode/>)

    *Intent*: <intent/>

    | G#    | Theme                           | Files         | +Lines    | -Lines       |
    |-------|---------------------------------|---------------|-----------|--------------|
    | G<n/> | <type/>(<scope/>): <one-liner/> | <file-count/> | +<added/> | -<removed/>  |
    </template>

    Then let the *user interactively choose*. This is the *only* dialog
    before the per-group walk, so it also carries the *mode switches*:
    offer of each mode pair only the option that switches *away* from
    the current mode, and offer the test option only when the manifest
    contains at least one test file:

    <expand name="user-dialog">
        Groups: Does this grouping fit?
        GROUPS-OK: Accept the groups and start the per-group review.
        REGROUP: Recut the groups; describe how (merge, split, move files).
        SHOW-FILES: List the files of each group first.
        VERTICAL: Recut as build-verified slices; every accept must build green.
        HORIZONTAL: Recut by topical proximity; no build runs during the review.
        REVIEW-TESTS: Let the test changes join the groups of the code they cover.
        TESTS-LAST: Keep the test changes out as one dedicated final group.
    </expand>

    Dispatch on the tool <result/>:

    -   <if condition="<result/> is `CANCEL`">
        Only output the review-cancelled <template/> of STEP 2 and then
        immediately *STOP* processing the entire current skill.
        </if>

    -   <if condition="<result/> is `REGROUP` or starts with `OTHER:`">
        Take the user's instruction (the free text, or ask for it),
        re-run STEP 3 honoring it, and re-enter this STEP 4.
        </if>

    -   <if condition="<result/> is `SHOW-FILES`">
        Emit one line per group `G<n/>: <file-list/>` (full repo-relative
        paths, comma-separated) and re-prompt this dialog.
        </if>

    -   <if condition="<result/> is `VERTICAL` or `HORIZONTAL`">
        Set <review-mode/> to the chosen mode, re-run STEP 3 under it,
        and re-enter this STEP 4.
        </if>

    -   <if condition="<result/> is `TESTS-LAST` or `REVIEW-TESTS`">
        Set <test-mode/> to the chosen mode, re-run STEP 3 under it,
        and re-enter this STEP 4.
        </if>

    -   <if condition="<result/> is `GROUPS-OK`">
        Record `<group-count/>` and continue with STEP 5.
        </if>

    </step>

5.  <step id="STEP 5: Per-Group Stage, Explain, Accept">

    Process the groups in table order. Five rules bind every
    iteration:

    -   *Index only*: staging happens exclusively in the plain Git
        index on the *current* branch -- no work branch, no
        `git stash`, and no working-tree mutation *except* the one
        automatic correction pass of 5.4 and the correction the user
        explicitly demands via `CHANGE`. The user's
        editor keeps showing staged changes and remaining unstaged
        changes side by side at all times.
    -   *No patch dumps*: never render raw diff text unprompted -- the
        user reviews the staged lines in their editor. The group card
        names the *changed symbols* per file, but the change bodies
        stay in the editor.
    -   *Git remains with the user beyond the accept*: `ACCEPT` is the
        only operation that commits, and nothing here ever discards
        working-tree content.
    -   *One group at a time*: never stage past the current group.
    -   *Whole card after every change*: whenever the group changes --
        a correction via `CHANGE`, a re-staging, a build re-run -- re-emit
        the *complete* group card with *all* file blocks, never a delta
        or only the touched blocks, so the user never has to scroll back
        in the chat to see the current state.

    For each group G<n/>:

    5.1. *Stage* exactly this group's hunks: `git add <file>` for
         whole-file hunks and `git apply --cached <patch-subset>` for
         partial files (`--unidiff-zero` added for zero-context hunks).
         Verify with `git diff --staged --name-only`
         that the staged set equals the group's planned file set; on a
         mismatch run `git reset`, report the mismatch, and re-enter
         STEP 4. Record the verified count as `<staged-count/>` of
         `<planned-count/>` for the group card -- the user must *see*
         that the index now holds exactly this group.

    5.2. <if condition="<review-mode/> is `VERTICAL`">
         *Build-verify*: discover the build command from `AGENTS.md`,
         `CLAUDE.md`, `package.json` scripts, `Makefile`, or
         language-idiomatic defaults (ask via a dialog only when
         ambiguous), run it, and record `<build-line/>` as
         `` `<command/>` — exit <exit-code/> `` plus a 1-3 line error
         excerpt on failure. A non-green build *withholds* `ACCEPT`.
         </if>
         <else>
         Set <build-line/> to `skipped (horizontal mode)`. Do *not*
         run any build, test, or linter.
         </else>

    5.3. *Gather evidence* for every staged file -- *before* any card
         text is authored, and *against* the change rather than for it.

         This is the *expensive* step of the review: it reads whole
         files, callers, implementers, and tests, while the card itself
         is a few lines long. It is therefore *fanned out*, one
         `<agent/>` per staged file -- files are independently decidable,
         and their evidence records are simply collected -- and each of
         them is dispatched at the *smallest capability tier* which can
         still judge that file, as defined by `Evidence Budget` above.
         The sub-agents return *only* their evidence records,
         telegraphically; the reviewing skill translates them into the
         user's language when it authors the card in 5.5. A group of a
         single small file is judged directly, without a sub-agent, as
         the dispatch would cost more than it saves.

         For each of the five dimensions `DOMAIN`, `ARCH`, `CLEAN`,
         `PERF`, and `TESTS`, first hunt for the *strongest reason the
         change could be wrong or incomplete* in that dimension, and
         only then record what the sources actually show. Read beyond
         the diff: the whole file, every caller and implementer of a
         changed symbol, adjacent comments and TODOs, the project
         guidance files, the specification, and the existing tests.
         Record per file and dimension one <evidence-status/> plus one
         <evidence-text/>. The text is written for a *beginner*: in the
         user's language, in plain words, it says what was checked,
         what was found, and what that means for the reader -- "kein
         Test prüft, was passiert, wenn gar keine Kursdaten da sind"
         rather than "BOUNDARY empty-feed uncovered". Only the cited
         identifiers and locations stay technical. The status is exactly
         one of:

         -   `✓` *shown*: a source line the reviewer *read* carries the
             claim *verbatim*; the text cites it as `<file/>:<line/>`.
             No citation, no `✓`.
         -   `✗` *gap*: something is wrong or missing; the text names the
             concrete spot, the input or case that exposes it, and the
             cheapest repair (e.g. the test case to add).
         -   `?` *unverified*: deciding it needs execution the current
             mode does not perform, or a source that could not be
             found; the text says which.
         -   `–` *n/a*: the dimension does not apply to this file; the
             text says why in a few words.

         Dimension-specific rules:

         -   `DOMAIN`: the claim is checked against the specification,
             project or vendor sources, or a documented contract --
             never against the changed code itself (`No
             Self-Reference`). A constraint the reviewer merely infers
             is `?`, not `✓`. This line also carries *correctness*
             against that contract: a latent defect, an unhandled edge
             case, or a control or data flow which cannot reach the
             promised outcome is a `✗` naming the input or state that
             exposes it.
         -   `ARCH`: boundaries, layering, dependency direction,
             *interface quality*, and *completeness across the diff*.
             Interface quality means every added or changed signature is
             *uniform with its siblings*: the same naming scheme, the
             same parameter order in the same logical sequence
             (subject before qualifier, e.g. the contract before the bar
             type, never swapped between two methods of one family), the
             same return-type family for the same kind of answer, and
             the same handling of absence (one sentinel, one optional,
             not both). A family whose members disagree on any of these
             is a `✗` that cites both signatures. Completeness means
             every caller and implementer of a changed interface is
             either in this group, already accepted, or the gap is
             named.
         -   `CLEAN`: naming, duplication, dead code, error handling,
             type safety, *robustness*, *convention*, and *method
             comments*, judged against the *surrounding* code, not
             against a style ideal. Robustness covers what survives
             failure: a resource opened but not released on every path,
             a lock held across an await, an unchecked concurrent
             access. Convention is measured against the *documented*
             conventions of the project -- `AGENTS.md`, `CLAUDE.md`, and
             the `ase-format-*` meta documents -- not against personal
             taste; a documented rule broken by the change is a `✗`
             citing the rule and the line. Every added
             or changed method, type, and non-trivial field carries a
             comment that says *what it is for* in one to two lines --
             at most four for a genuinely complex algorithm -- placed
             where the surrounding code places its comments. A missing
             comment, a comment that restates the signature ("returns
             the value"), or one that has grown into a paragraph is a
             `✗` that cites the line.
         -   `PERF`: hot-path allocation, complexity, helper-in-loop
             scans, lock scope, I/O amplification; a `✗` carries the
             evidence *and* the trade-off.
         -   `TESTS`: the strictest line. A `✓` names `<test-file/>::
             <case/>` *and* states why that case would turn red if the
             change were reverted -- a test that cannot fail is not
             evidence. Enumerate the boundary partitions the change
             touches (empty, zero, one, maximum, absent, duplicate,
             concurrent, time zone or DST, failure path) and name each
             one no test covers as a `✗`. In HORIZONTAL mode this is a
             *static* falsifiability judgement and is worded as such; in
             VERTICAL mode the build transcript of 5.2 is the execution
             evidence. Tests are cited from the *working tree*, not
             only from the staged set: under `TESTS-LAST` they sit in
             the final group and are not yet accepted, so a `✓` that
             cites one of them adds "noch nicht abgenommen, liegt in
             G<n/>" -- a test that exists but awaits its own review is
             evidence with a caveat, not a gap.

         Two further dimensions are *conditional*: they are gathered for
         every file like the five above, but they reach the card *only*
         when they carry a finding -- a `✗` or a `?`. A file where they
         hold or do not apply emits no line for them at all, so the card
         stays as short as it is today and every conditional line the
         user *does* see is one that has to be acted on:

         -   `SEC`: what the change exposes -- untrusted input reaching
             a sink without validation, a secret or token entering a log
             or an error message, a widened permission or authentication
             path, a dependency pulled in for a security-relevant task.
             Judged only for the change, never as a general audit of the
             file.
         -   `DOC`: what the change leaves stale -- a `README`, a help
             text, a usage document, or an AI guidance document which
             still describes the behavior as it was before this group.
             Which documents a change is expected to carry along is a
             *project* decision: judge against what this project's own
             guidance and history show, never against a rule imported
             from elsewhere.

         Their statuses are the same four, and a `✗` in them counts
         exactly like any other `✗`.

         Then derive the group <verdict/>: the counts of `✓`, `✗`, and
         `?` over all files, followed by `-- not ready without a
         correction` when any `✗` exists, by `-- ready to accept, <n/>
         unverified` when no `✗` but at least one `?` exists, or by
         `-- ready to accept` otherwise. Never soften a `✗` into prose,
         never average the statuses, and never let a reassuring summary
         outrank the lines above it.

    5.4. *Auto-correct* the group *once*, before the user sees it.
         <if condition="the verdict carries at least one `✗` and this group was not auto-corrected yet">
         Mark the group as auto-corrected -- this pass runs at most
         *once* per group, so the user always decides the *second*
         round -- and output one line `G<n/>: <count/> ✗ findings --
         correcting automatically before the review`. Then carry out
         steps 2 to 5 of the `CHANGE` dispatch in 5.6, with the
         *correction wish* composed of every `✗` evidence line of the
         group (file, dimension, cited spot, and named repair) and the
         instruction to leave a finding untouched when its repair needs
         a design decision the sources do not settle. `?` and `–` lines
         are never auto-corrected. Record for the card as
         <auto-corrected/> the addressed findings, each as
         `<filename/> <dimension/>` in a few words.
         </if>
         <else>
         Continue with 5.5; a group without `✗` records no
         <auto-corrected/> at all.
         </else>

    5.5. Emit the *group card* as a *boxed* card, no diff, so each
         group reads as one visually self-contained unit the user can
         give a *single* ok for. Every file contributes a block -- name
         with layer and line counts, its directory, what changed, and
         its evidence lines -- and the blocks are delimited by separator
         lines. Only output the following <template/>:

         <template>
         <ase-tpl-boxed title="GROUP" subtitle="G<n/>/<group-count/>">
         **<type/>(<scope/>)**: <one-liner/>

         *Why*: <rationale/>

         <separator/>
         **<filename/>** · *<layer/>* · +<added/>/-<removed/>
         `<dirpath/>`
         <explanation/>
         *Touched*: <symbols/>
         *Evidence*:
           <evidence-status/> DOMAIN  <evidence-text/>
           <evidence-status/> ARCH    <evidence-text/>
           <evidence-status/> CLEAN   <evidence-text/>
           <evidence-status/> PERF    <evidence-text/>
           <evidence-status/> TESTS   <evidence-text/>
           <evidence-status/> SEC     <evidence-text/>
           <evidence-status/> DOC     <evidence-text/>
         <separator/>

         *Verdict*: <verdict/>

         *Auto-corrected*: <auto-corrected/>

         *Staged*: <staged-count/>/<planned-count/> files verified in the Git
         index -- review them in your editor (VSCode Source Control:
         "Staged Changes")

         *Build*: <build-line/>
         </ase-tpl-boxed>
         </template>

         Hints:

         -   *Pre-wrap every body line at 96 columns* (box width minus
             the `│ ` prefix), breaking only at word boundaries and
             never inside an identifier, path, or quoted code: the
             agent tool wraps longer lines *without* the `│ ` prefix
             and visibly breaks the box.
         -   *Never* render the file blocks as a Markdown *list* or
             *table*: lists render *tight* (the blank lines between
             blocks vanish), table cells are single-line, and `<br>`
             appears literally. Plain lines inside the box keep their
             soft line breaks.
         -   `<separator/>` is a line of 96 `┈` characters, emitted
             before *every* file block and once after the last one, so
             each block is visually fenced off from its neighbours. It
             replaces the blank line between two blocks; never use a
             Markdown rule (`---`), which renders literally in the box.
         -   `<rationale/>` is 2-4 sentences reconstructing the goal
             this group addresses -- what problem, what outcome, what
             design choice. Anchor it in the mental model built so
             far: connect to already *accepted* groups where they
             relate, and never lean on a not-yet-reviewed group.
         -   One block per staged file. `<layer/>` is the file's coarse
             architectural layer (e.g. `interface`, `domain`,
             `service`, `adapter`, `ui`, `test`, `docs`); order the
             blocks bottom-up along the layers (foundations first), so
             the card reads in comprehension order.
         -   `<filename/>` is the bare file name and `<dirpath/>` the
             *full repo-relative* directory with a trailing `/`. Split
             this way, the name stays prominent while the path remains
             complete: never elide or abbreviate either part, as the
             user has to locate the file in their editor from the card
             alone. A full path plus its metadata exceeds the box width
             on its own, which is why it occupies two lines.
         -   `<explanation/>` is the *primary* text of the block: *1-2
             short sentences* in simple words, in the user's language,
             which tell a colleague who did not write the code *what*
             this file now does differently and *why* -- the reason in
             terms of the group's goal. Compact, but never cryptic:
             "Fragt jetzt den Kalender, ob der Handelstag wirklich zu
             Ende ist, statt ein Fenster schon als bedient zu werten,
             sobald nichts mehr gelesen wird" -- never "fügt drei
             Methoden hinzu" or a paraphrase of the diff. Symbol names
             appear in it only where they are needed to follow the
             thought, never as an enumeration.
         -   `<symbols/>` on the *Touched* line are the file's changed
             symbols -- the added or touched functions, methods,
             classes, types, or config keys, comma-separated in
             backticks -- as the *index* into the editor, not as the
             explanation. For a file without symbols (data, logs,
             assets) the whole *Touched* line is omitted.
         -   The five *Evidence* lines per file are *mandatory* and
             carry exactly the statuses and texts recorded in 5.3, in
             the fixed order `DOMAIN`, `ARCH`, `CLEAN`, `PERF`, `TESTS`.
             The status glyph and the padded dimension label form a
             fixed two-column gutter; a text that exceeds the line wraps
             onto continuation lines indented to the text column, so the
             gutter stays readable. Cited locations stay in backticks.
         -   The `SEC` and `DOC` lines are *conditional*: they follow the
             five in that order, but *only* for a file where 5.3 recorded
             a `✗` or a `?` for them. They are *never* emitted as `✓` or
             `–`, so their presence alone already says that something has
             to be acted on.
         -   The *Verdict* line is the honest sum of the evidence: it
             is what flips the recommendation of the following dialog
             from `ACCEPT` to `CHANGE`, so it is never dressed up.
             After an auto-correction it sums the *re-gathered*
             evidence, so a remaining `✗` is one the first pass could
             not repair.
         -   The *Auto-corrected* line is *conditional*: it appears only
             when 5.4 ran for this group and lists what that pass
             addressed, as the user did not see these findings before.
         -   The *Staged* line is *mandatory*: it is the user's only
             proof that the index matches the card, and it points them
             at where the actual lines are reviewed.

    5.6. Let the *user interactively choose* (omit `ACCEPT` while a
         VERTICAL build is non-green, and offer `RETRY-BUILD` only
         then):

         <expand name="user-dialog">
             Group G<n/>/<group-count/>: What should happen with this group?
             ACCEPT: Commit the staged group on the current branch.
             CHANGE: Correct the remaining ✗ findings (or a described wish) and re-stage.
             DISCUSS: Ask a question about this group.
             SKIP: Unstage this group and move it to the end of the queue.
             REGROUP: Unstage and recut the remaining groups.
             RETRY-BUILD: Re-run the build without changes.
         </expand>

         Dispatch on the tool <result/>:

         -   <if condition="<result/> is `ACCEPT`">
             Invoke `Skill(skill: "ase:ase-meta-commit")` to craft the
             commit message, then `git commit` (the index carries
             exactly this group). The group leaves the queue; continue
             with the next group at 5.1.
             </if>

         -   <if condition="<result/> is `CHANGE`">
             Demanding a correction is a *regular* review outcome, not
             an exception -- carry it out *now*, in this review run:

             1.  Take the *correction wish* from the free text
                 accompanying the answer; when it carries none, take the
                 remaining `✗` findings of the card as the wish, and
                 only when there are none, ask the user in one sentence
                 what has to change.
             2.  `git reset` -- the correction must not land on top of a
                 partially staged index. The working tree stays
                 untouched, so nothing of the group is lost.
             3.  Derive the *edit mode* from the nature of the
                 correction wish: `resolve` for wrong behavior, a bug,
                 or a defect; `refactor` for structure, naming, or
                 simplification at unchanged behavior; `craft` for
                 something still missing; `auto` only when the wish
                 stays genuinely ambiguous. Then invoke
                 `Skill(skill: "ase:ase-code-edit", args: "--mode
                 <edit-mode/> <correction-wish/>")` to *implement* it.
                 Pass *no* `--worktree`, as the change has to land in
                 the *current* working copy this review walks over, and
                 *no* `--loop`. State the group's theme and its files in
                 the query, so the edit stays scoped to this group.
                 Never delegate to `ase-code-craft`/`-refactor`/
                 `-resolve` directly: they compose a task plan first,
                 which is the wrong ceremony inside a review walk.
             4.  Re-ingest the affected files as in STEP 1 and rebuild
                 this group's hunk manifest: fresh hunks in the group's
                 files belong to the group. If the correction also
                 touched files *outside* the group, report that in one
                 line and add those hunks to the surface -- they are
                 either pulled into this group when they serve its
                 theme, or left to a later `REGROUP`.
             5.  Continue at 5.1, so the group is re-staged, re-verified
                 (VERTICAL), and its *complete* card re-emitted before
                 the next decision.

             Committing a *corrected* group is the user's call as
             before; the correction alone commits nothing.
             </if>

         -   <if condition="<result/> is `DISCUSS` or starts with `OTHER:`">
             Answer the question (or react to the instruction) scoped
             to this group -- review dialogue only, no code editing --
             then re-prompt this dialog. When the answer reveals that
             the *code* has to change, do not edit anything here: point
             at `CHANGE` and re-prompt.
             </if>

         -   <if condition="<result/> is `SKIP`">
             `git reset` (the group's changes return to the unstaged
             set, the working tree is untouched). Move the group to
             the *end* of the queue; when every remaining group is
             skipped, leave the loop for STEP 6.
             </if>

         -   <if condition="<result/> is `REGROUP`">
             `git reset`, then re-run STEP 3 for all *not yet
             committed* hunks and re-enter STEP 4.
             </if>

         -   <if condition="<result/> is `RETRY-BUILD`">
             Re-run 5.2, then re-emit the group card and re-prompt.
             </if>

         -   <if condition="<result/> is `CANCEL`">
             `git reset`, then leave the loop for STEP 6 (already
             committed groups stay committed; everything else stays in
             the working tree).
             </if>

    </step>

6.  <step id="STEP 6: Final Summary">

    Emit a concise recap:

    <template>
    <ase-tpl-head title="SUMMARY" subtitle="<review-mode/>"/>

    <commit-table/>

    *Left uncommitted*: <left-uncommitted/>

    <ase-tpl-foot title="SUMMARY" subtitle="<review-mode/>"/>
    </template>

    Hints:

    -   `<commit-table/>` columns: `G#`, `SHA`, `TYPE`, `SUBJECT`,
        `FILES`.
    -   `<left-uncommitted/>` is one bullet per skipped/cancelled
        group with its reason, or `none`.
    -   Do *not* propose further actions, and do *not* write any file
        of your own: this skill commits what the user accepted and
        nothing beyond it.

    </step>

</flow>

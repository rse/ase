---
name: ase-sync-reconcile
argument-hint: "[--help|-h] [--bidirectional|-b] [--operation|-o <op>[,...]] [--dry|-d] [--target|-t <target>[,...]] [--source|-s <source>[,...]] [<hint>]"
description: >
    Reconcile one set of artifact kinds (the target) to reflect the
    current state of another set of artifact kinds (the source), while
    optionally honoring a filtering hint. Use when the user wants to
    "reconcile", "sync", "align", or "update" artifacts like SPEC,
    CODE, DOCS, TASK, INFR, or OTHR against each other.
user-invocable: true
disable-model-invocation: false
effort: xhigh
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-sync-reconcile">
Reconcile Artifact Set to Artifact Set
</purpose>

<expand name="getopt"
    arg1="ase-sync-reconcile"
    arg2="--bidirectional|-b --operation|-o=(all|add|update|remove)... --dry|-d --target|-t=CODE,DOCS,INFR,OTHR --source|-s=AUTO">
    $ARGUMENTS
</expand>

<objective>
*Reconcile* the *target* artifact kinds to *reflect* the *current
state* of the *source* artifact kinds, by reading the source
artifacts and aligning the target artifacts accordingly:
<hint><getopt-arguments/></hint>.
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-format-meta.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-format-spec.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-format-task.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-tenets.md

Procedure
---------

<flow>

1.  <step id="STEP 1: Determine Target and Source">

    1.  The recognized artifact kinds are the six tokens `TASK`,
        `SPEC`, `CODE`, `DOCS`, `INFR`, and `OTHR`. Parse
        <getopt-option-target/> as the comma-separated <target/> kind list and
        <getopt-option-source/> as the comma-separated <source/> kind list.
        Upper-case and trim every parsed kind token. Do not output
        anything.

    2.  <if condition="<target/> is empty">

        Only output the following <template/> and then immediately *STOP*
        processing the entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-sync-reconcile**, ▶ ERROR: empty target artifact list
        </template>

        </if>

    3.  <if condition="<source/> is equal 'AUTO'">

        Set <source/> to the six recognized kinds
        `TASK,SPEC,CODE,DOCS,INFR,OTHR` *minus* all kinds present
        in <target/>. Do not output anything.

        </if>

    4.  If any token in <target/> or <source/> is *not* one of the six
        recognized kinds, only output the following <template/> (with
        <kind/> set to the first offending token) and then immediately
        *STOP* processing the entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-sync-reconcile**, ▶ ERROR: unknown or unsupported artifact kind: **<kind/>**
        </template>

    5.  <if condition="<getopt-option-bidirectional/> is not 'true'">

        Remove from <source/> any kind that is also present in <target/>
        (a kind is never its own source).

        <if condition="<source/> is empty">

        Only output the following <template/> and then immediately *STOP*
        processing the entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-sync-reconcile**, ▶ ERROR: empty source -- nothing to update from
        </template>

        </if>

        </if>

    6.  Treat <getopt-option-operation/> as a comma-separated list of
        *operation tokens*. The getopt parser validates only the *first*
        token, so you *MUST* validate each remaining token yourself
        against the allowed set `all`, `add`, `update`, `remove`. If any
        token is *not* in this set, bind <token/> to that offending
        token, then only output the following <template/> and then
        immediately *STOP* processing the entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-sync-reconcile**, ▶ ERROR: invalid `--operation` token: **<token/>**
        </template>

        Set <operations/> to `add,update,remove` if `all` is in
        <getopt-option-operation/>, or to the given tokens otherwise.
        Do not output anything.

    7.  Report the resolved target, source, and operations with the
        following <template/>:

        <template>
        ⧉ **ASE**: **TARGET**: <target/>
        ⧉ **ASE**: **SOURCE**: <source/>
        ⧉ **ASE**: **OPERATIONS**: <operations/>
        </template>

    </step>

2.  <step id="STEP 2: Resolve and Read Artifacts">

    1.  Do not output anything in this STEP 2.

    2.  For all kinds in the union of <target/> and <source/>,
        call the `ase_artifact_list(kind: [ ... ])` tool of the `ase`
        MCP server *once*, passing the lower-cased `kind` tokens, and
        read the returned `artifacts` array of `{ kind, files }` objects
        to obtain the project-relative file list per kind.

    3.  <if condition="<hint/> is not empty">

        Honor the filtering <hint/> to reduce the source and/or target
        artifacts and/or the aspects of those artifacts you should take
        into account.

        </if>

    4.  Read all (optionally filtered) source and target artifacts
        previously resolved and build a precise understanding of the
        *current state* they represent.

    </step>

3.  <step id="STEP 3: Update Artifacts">

    1.  Internalize and honor the artifact-format conventions:

        -   the artifact-set meta information (`ase-format-meta.md`),
        -   the `SPEC` format, i.e. the SpecBook models and formats plus
            the SpecBook schema configuration of the project
            (`ase-format-spec.md`),
        -   the `TASK` format (`ase-format-task.md`).

        Whenever a target artifact belongs to one of these
        kinds, the update *MUST* keep it conformant to the
        corresponding format (headings, structure, identifiers,
        references, and the `Modified:` timestamp rule). The kinds
        `CODE`, `DOCS`, `INFR`, and `OTHR` have no dedicated format
        contract and are treated as free-form.

    2.  You *MUST* internalize and strictly honor the **GENERIC TENETS**,
        the **RECONCILIATION TENETS**, the **REFACTORING TENETS**, and
        the **CRAFTING TENETS** of the **ASE Tenets** when updating in
        the following. Do not output anything.

    3.  Call the `ase_timestamp(format: "yyyy-LL-dd HH:mm")` tool of
        the `ase` MCP server *once* to find out the current time and store it in
        <timestamp-modified/>.

    4.  <if condition="<getopt-option-bidirectional/> is equal 'true'">

        *Bidirectionally update* the <target/> and <source/> artifacts
        so that they faithfully *reflect the current state* of each
        other.

        </if>
        <else>

        *Unidirectionally update* the <target/> artifact files so that
        they faithfully *reflect the current state* of the <source/>
        artifacts.

        </else>

        Keep changes as *surgical* as possible: change only what the
        input state actually requires, and do *not* rewrite unrelated
        parts of an output artifact.

        Restrict the update to the *operations* in <operations/>, on
        the level of both the content *inside* an output artifact and
        whole output artifact *files*: `add` creates output content and
        files the input warrants but the output lacks, `update` changes
        existing output content the input contradicts, and `remove`
        deletes output content and files the input no longer supports.
        Whatever an *excluded* operation would have changed stays
        silently *untouched*.

        For each formatted output artifact kind, strictly honor its
        format contract.

        Whenever an output artifact is changed and contains a `Modified:
        <timestamp-modified-old/>` line, replace this with `Modified:
        <timestamp-modified/>`.

        <if condition="<getopt-option-dry/> is equal 'true'">

        Do *not* modify any output artifact: you *MUST* *NOT* call
        `Edit`, `Write`, `NotebookEdit`, `ase_task_save`, or any other
        filesystem-modifying tool or shell command. Instead, store the
        *complete* change set in *unified diff* format in
        <unified-diff/>, diffing every touched file against its current
        on-disk content and every touched `TASK` output against its
        plan text loaded via the `ase_task_load` MCP tool, so all
        context lines match *exactly* and the diff would apply
        *cleanly*.

        </if>
        <else>

        Apply the update directly to the output artifacts via the
        `Write`/`Edit` tools. For a `TASK` output, apply it via the
        `ase_task_save` MCP tool instead -- *NEVER* write a task plan
        file via `Write`/`Edit` or by executing a shell command.

        </else>

    5.  <if condition="<getopt-option-dry/> is not 'true' and at least one `SPEC` output artifact was changed">

        Validate the specification by calling the `ase_specbook_lint()`
        tool of the `ase` MCP server and reading its returned
        `diagnostics` array of `{ file, line, column, severity, message }`
        objects. If it is not empty, fix the reported problems in the
        affected `SPEC` artifacts via the `Write`/`Edit` tools and call
        the tool again -- for at most *three* rounds in total. Do not
        output anything, unless diagnostics remain after the last round,
        in which case output the following <template/>, listing one
        bullet line per remaining diagnostic:

        <template>
        ⧉ **ASE**: **REMAINING DIAGNOSTICS**:

        -   `<file/>:<line/>:<column/>`: <message/>
        [...]
        </template>

        </if>

    6.  <if condition="<getopt-option-dry/> is equal 'true'">

        Report the intended updates with the following <template/>.
        Set <fence/> to a run of backtick characters *one longer* than
        the longest backtick run occurring anywhere inside
        <unified-diff/>, but to at least three, so a diff which itself
        carries fenced code blocks cannot terminate the block
        prematurely:

        <template>
        ⧉ **ASE**: **INTENDED CHANGES** (dry run, nothing applied):

        <fence/>diff
        <unified-diff/>
        <fence/>
        </template>

        <if condition="<unified-diff/> is empty">

        Only output the following <template/>:

        <template>
        ⧉ **ASE**: **INTENDED CHANGES**: none -- all outputs already reflect source state
        </template>

        </if>

        </if>
        <else>

        Report the performed updates with the following <template/>, listing
        one bullet line per changed output file (with <file/> its
        project-relative path and <note/> an ultra-brief description of
        what was reconciled):

        <template>
        ⧉ **ASE**: **UPDATED ARTIFACTS**:

        -   `<file/>`: <note/>
        [...]
        </template>

        <if condition="no output artifact required any change">

        Only output the following <template/>:

        <template>
        ⧉ **ASE**: **UPDATED ARTIFACTS**: none -- all outputs already reflected source state
        </template>

        </if>

        </else>

    7.  Finally, give the closing hints by expanding the following
        (which, depending on the configured <ase-guidance-level/>, may
        each expand into nothing and hence emit no output at all):

        <if condition="<getopt-option-dry/> is equal 'true' and <unified-diff/> is not empty">
        <ase-tpl-hint level="normal">
        Re-run `/ase-sync-reconcile` without `--dry` to apply the intended changes.
        </ase-tpl-hint>
        </if>

        <if condition="<getopt-option-dry/> is not 'true' and at least one output artifact was changed">
        <ase-tpl-hint level="normal">
        Use `/ase-sync-export` to re-materialize the derived export files of the reconciled artifacts.
        </ase-tpl-hint>
        </if>

        <ase-tpl-hint level="verbose">
        Use `/ase-sync-reconcile --bidirectional` to align target and source against *each other*, `--operation` to restrict the applied operations, `--dry` to preview the changes as a unified diff, and a trailing `<hint>` argument to narrow the reconciliation.
        </ase-tpl-hint>

    </step>

</flow>


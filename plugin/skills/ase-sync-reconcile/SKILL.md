---
name: ase-sync-reconcile
argument-hint: "[--help|-h] <target>[,...] [<source>[,...]]"
description: >
    Reconcile one set of artifact kinds (the target) to reflect the current
    state of another set of artifact kinds (the source). Use when the
    user wants to "reconcile", "sync", "align", or "update" artifacts like
    SPEC, ARCH, CODE, DOCS, TASK, INFR, or OTHR against each other.
user-invocable: true
disable-model-invocation: false
effort: xhigh
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<skill name="ase-sync-reconcile">
    Reconcile Artifacts from Artifacts
</skill>

<expand name="getopt" arg1="ase-sync-reconcile">
    $ARGUMENTS
</expand>

<objective>
    *Update* the *target* artifact kinds to *reflect* the *current
    state* of the *source* artifact kinds, by reading the source
    artifacts and adjusting the target artifacts accordingly:
    <request><getopt-arguments/></request>.
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-format-meta.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-format-spec.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-format-arch.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-format-task.md

Procedure
---------

You *MUST* follow the following numbered items *strictly* *sequentially*!
You *MUST* not skip any numbered item during processing!

You *MUST* *NOT* output anything in this entire procedure, *except* when
explicitly requested by this procedure via outputs based on a <template/>!

<flow>

1.  <step id="STEP 1: Determine Target and Source">

    1.  The recognized artifact kinds are the seven tokens `TASK`,
        `SPEC`, `ARCH`, `CODE`, `DOCS`, `INFR`, and `OTHR`. Parse
        <getopt-arguments/> as one or two whitespace-separated fields:
        the *first* field is the comma-separated <target/> kind list, the
        optional *second* field is the comma-separated <source/> kind list.
        Upper-case and trim every parsed kind token.

    2.  <if condition="<target/> is empty">

        Only output the following <template/> and then immediately *STOP*
        processing the entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-sync-reconcile**, ▶ ERROR: missing target argument
        </template>

        </if>

    3.  If any token in <target/> or <source/> is *not* one of the seven
        recognized kinds, only output the following <template/> (with
        <kind/> set to the first offending token) and then immediately
        *STOP* processing the entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-sync-reconcile**, ▶ ERROR: unknown artifact kind: **<kind/>**
        </template>

    4.  <if condition="<source/> is empty">

        Set <source/> to the seven recognized kinds
        `TASK,SPEC,ARCH,CODE,DOCS,INFR,OTHR` *minus* all kinds present
        in <target/> (preserving that fixed order). Do not output
        anything.

        </if>

    5.  Remove from <source/> any kind that is also present in <target/>
        (a kind is never its own source). If <source/> is then empty,
        only output the following <template/> and then immediately *STOP*
        processing the entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-sync-reconcile**, ▶ ERROR: empty source -- nothing to update from
        </template>

    6.  Report the resolved target and source with the following <template/>:

        <template>
        <ase-tpl-bullet-signal/> **TARGET**: <target/>
        <ase-tpl-bullet-normal/> **SOURCE**: <source/>
        </template>

    </step>

2.  <step id="STEP 2: Resolve and Read Artifact Files">

    1.  Do not output anything in this STEP 2.

    2.  For all kinds in the union of <target/> and <source/>,
        call the `ase_artifact_list(kind: [ ... ])` tool of the `ase`
        MCP server *once*, passing the lower-cased `kind` tokens, and
        read the returned `artifacts` array of `{ kind, files }` objects
        to obtain the project-relative file list per kind.

    3.  Read all <source/> artifact files previously resolved and build a
        precise understanding of the *current state* they represent.

    </step>

3.  <step id="STEP 3: Internalize Artifact Formats">

    1.  Do not output anything in this STEP 3.

    2.  Internalize and honor the artifact-format conventions imported above:
        -   the artifact-set/artifact/aspect meta information of `ase-format-meta.md`,
        -   the `SPEC` format of `ase-format-spec.md`,
        -   the `ARCH` format of `ase-format-arch.md`,
        -   the `TASK` format of `ase-format-task.md`.

        Whenever a target artifact belongs to one of these formatted
        kinds, the update *MUST* keep it conformant to the
        corresponding format (headings, structure, identifiers, and the
        `<timestamp-modified/>` rule). The kinds `CODE`, `DOCS`, `INFR`,
        and `OTHR` have no dedicated format contract and are treated as
        free-form.

    </step>

4.  <step id="STEP 4: Update Target Artifacts">

    1.  You *MUST* internalize and strictly honor the **GENERIC TENETS**,
        the **ALIGNMENT TENETS**, the **REFACTORING TENETS**, and the
        **CRAFTING TENETS** of the **ASE Tenets** when updating in the following. Do not
        output anything.

    2.  *Update* the <target/> artifact files so that they faithfully
        *reflect the current state* of the <source/> artifacts. Apply the
        update *directly* to the target files via `Write`/`Edit`, keeping
        changes as *surgical* as possible: change only what the source
        state actually requires, and do *not* rewrite unrelated parts of a
        target artifact.

        For each formatted target kind, honor its format contract
        internalized in STEP 3 and, whenever a target artifact is
        changed, update its `<timestamp-modified/>` line via a call to
        the `ase_timestamp(format: "yyyy-LL-dd HH:mm")` tool of the
        `ase` MCP server.

    3.  Report the performed update with the following <template/>, listing
        one bullet line per changed target file (with <file/> its
        project-relative path and <note/> an ultra-brief description of
        what was reconciled):

        <template>
        <ase-tpl-bullet-signal/> **UPDATED ARTIFACTS**:

        -   `<file/>`: <note/>
        </template>

        <if condition="no target artifact required any change">

        Instead, only output the following <template/>:

        <template>
        <ase-tpl-bullet-normal/> **UPDATED ARTIFACTS**: none -- target already reflects source state.
        </template>

        </if>

    </step>

</flow>


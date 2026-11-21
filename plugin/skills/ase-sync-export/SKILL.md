---
name: ase-sync-export
argument-hint: "[--help|-h] [--output|-o <output>[,...]]"
description: >
    Export the SpecBook-based specification (SPEC) into ready-to-consume
    renderings like HTML, PDF, normalized Markdown, or JSON. Use when the
    user wants to "export", "render", or "materialize" the specification.
user-invocable: true
disable-model-invocation: false
effort: xhigh
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-sync-export">
Export Specification into Rendered Files
</purpose>

<expand name="getopt"
    arg1="ase-sync-export"
    arg2="--output|-o=">
    $ARGUMENTS
</expand>

<objective>
*Export* the `SPEC` artifact set -- the SpecBook-based specification --
into the requested output files, by validating the specification and
rendering it through the SpecBook export.
</objective>

@${CLAUDE_SKILL_DIR}/../../meta/ase-format-meta.md

Procedure
---------

<flow>

1.  <step id="STEP 1: Determine Outputs">

    1.  Parse <getopt-option-output/> as the comma-separated <outputs/>
        list of `[<format>:]<file>` entries, with <format/> one of
        `json`, `json5`, `yaml`, `toon`, `html`, `pdf`, or `md`, and
        <file/> a project-relative output file path. Trim every parsed
        entry. Do not output anything.

    2.  <if condition="<outputs/> is empty">

        Determine the default output by calling the
        `ase_artifact_name(filename: "index.html", kind: "spec")` tool
        of the `ase` MCP server and set <outputs/> to the single entry
        of its returned `name`. Do not output anything.

        </if>

    3.  If any entry in <outputs/> is `-` (the standard output sentinel),
        only output the following <template/> and then immediately *STOP*
        processing the entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-sync-export**, ▶ ERROR: output `-` is not supported -- give an output file
        </template>

    4.  Report the resolved outputs with the following <template/>:

        <template>
        ⧉ **ASE**: **OUTPUTS**: <outputs/>
        </template>

    </step>

2.  <step id="STEP 2: Validate Specification">

    1.  Call the `ase_specbook_lint()` tool of the `ase` MCP server
        *once* and read its returned `diagnostics` array of `{ file,
        line, column, severity, message }` objects, reduced to those
        entries whose <severity/> is `error`, as only those make the
        export fail. Do not output anything.

    2.  <if condition="<diagnostics/> is not empty">

        Only output the following <template/> (listing one bullet line
        per diagnostic), give the closing hint by expanding the
        `<ase-tpl-hint/>` below it, and then immediately *STOP*
        processing the entire current skill:

        <template>
        ⧉ **ASE**: ☻ skill: **ase-sync-export**, ▶ ERROR: specification invalid -- nothing exported

        -   `<file/>:<line/>:<column/>`: <message/>
        [...]
        </template>

        <ase-tpl-hint level="minimal">
        Fix the reported diagnostics in the `SPEC` artifacts (e.g. via `/ase-spec-lint -i S01`), then re-run this skill.
        </ase-tpl-hint>

        </if>

    </step>

3.  <step id="STEP 3: Export Specification">

    1.  For *each* <output/> in <outputs/>, call the
        `ase_specbook_export(output: "<output/>")` tool of the `ase` MCP
        server, which infers the format from the `[<format>:]<file>`
        entry, writes the rendering to the file, and returns a
        confirmation `text` carrying the written byte size plus a
        `notices` array of environment notices. Set <notices/> to the
        *distinct* notices of all calls. Do not output anything.

    2.  Report the exported files with the following <template/>,
        listing one bullet line per written file (with <file/> its
        project-relative path and <note/> the format and the byte size):

        <template>
        ⧉ **ASE**: **EXPORTED SPECIFICATION**:

        -   `<file/>`: <note/>
        [...]
        </template>

    3.  <if condition="<notices/> is not empty">

        Report the environment notices *verbatim* with the following
        <template/>, listing one bullet line per notice:

        <template>
        ⧉ **ASE**: **ENVIRONMENT NOTICES**:

        -   <notice/>
        [...]
        </template>

        </if>

    4.  Finally, give the closing hints by expanding the following
        (which, depending on the configured <ase-guidance-level/>, may
        each expand into nothing and hence emit no output at all):

        <ase-tpl-hint level="normal">
        Exports are *derived* and go stale as the specification drifts -- use `/ase-sync-reconcile` to align the artifacts first, then re-run this skill.
        </ase-tpl-hint>

        <ase-tpl-hint level="verbose">
        Use `/ase-sync-export --output` with a comma-separated list of `[<format>:]<file>` entries to export several renderings at once (e.g. `-o docs/spec.html,docs/spec.pdf`).
        </ase-tpl-hint>

    </step>

</flow>

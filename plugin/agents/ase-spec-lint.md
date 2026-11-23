---
name: ase-spec-lint
description: "Specification Lint Investigation"
effort: high
disallowedTools:
    - "Skill"
---

Your role is an experienced, *expert-level requirements engineer*.

Your objective is to *analyze* and *fix* the **SpecBook**-based
specification (SPEC) for *potential problems* related to a set of
specification quality aspects.

Workflow
--------

1.  Set the requested context: <context>$ARGUMENTS</context>.
    It consists of the following labeled lines:

    -   `ASPECTS:` the comma-separated *aspect set* <aspects/> (a
        non-empty subset of the aspect ids `S01`...`S10`).
    -   `FILES:` the space-separated specification files <files/> to
        check, where all problems have to be located.
    -   `CORPUS:` the space-separated files <corpus/> of the *entire*
        specification, to be read for comprehension only.
    -   `META:` the space-separated files <meta/> of the bundled
        **SpecBook** format contract and **ASE Tenets**.
    -   `DIAGNOSTICS:` followed by the lines <diagnostics/> of the
        format `- <file/>:<line/>:<column/>: <severity/>: <message/>`,
        each a diagnostic of the syntax linters (*SpecBook* and
        *markdownlint*, the latter with a message prefixed by
        `markdownlint: `) located in <files/>, or the single line
        `(none)`.

2.  Use the `Read` tool to read all files of <meta/> to learn the
    **SpecBook** format contract and the **ASE Tenets**, especially the
    **SPECIFYING TENETS**. Then use the `Read` tool to read all files of
    <files/>.

    If <aspects/> contains any of the *model-wide* aspects `S07`...`S10`,
    additionally read *all* files of <corpus/>, as these aspects can be
    judged on the entire specification model only. Otherwise, read only
    those files of <corpus/> which are needed to really comprehend
    <files/>, like the targets of their `[[xxx]]` references.

    Finally, learn the allowed object kinds, properties, nestings, and
    value constraints of the **SpecBook SCHEMA Model** of the project,
    but only for the *artifacts* of the files of <files/> (resp. of
    <corpus/> for any *model-wide* aspect), where every level 1 heading
    `<kind/>: <name/>` of a file opens an artifact. For this, call the
    `ase_specbook_query(schema: true, selector: "// ARTIFACT-KIND [
    @name == '<kind/>' ] / ARTIFACT [ @name == '<name/>' ]", format:
    "yaml")` tool of the `ase` MCP server once per distinct artifact,
    emitting all calls in one single message, which yields the
    *effective* schema of just this artifact. Do *not* read any schema
    configuration file, as it covers all artifacts and is very large.

3.  Set <problems/> to empty.
    Then check the read specification for the following aspects (each
    aspect is uniquely identified by its `aspect` id `S01 - XXX`...`S10
    - XXX`), but *strictly limited* to those aspects whose id is
    contained in the aspect set <aspects/> -- all other aspects are
    *not* checked and their problems are *never* reported:

    -   **S01 - SYNTAX**:
        Report *exactly* one problem per line of <diagnostics/>: the
        linters are authoritative, so neither drop a diagnostic nor
        detect any further syntax problem yourself. Take the
        `<severity/>` `error` as `HIGH` and `warning` as `MEDIUM`.

        Propose the correction which resolves the diagnostic, e.g. a
        schema-allowed object kind, nesting, property key, or value, a
        uniquely resolvable `[[xxx]]` reference, or the Markdown
        construct the *markdownlint* rule demands.

    -   **S02 - FORMAT**:
        Check for unclean or inconsistently formatted Markdown not
        already covered by <diagnostics/>.

        The yardstick is the **SpecBook** format contract plus the
        *prevailing* formatting conventions of <corpus/> (the majority
        style). Especially, check the usage of the Complex, Concise, and
        Grouped format variants (sibling objects share their format),
        mixed ATX and Setext headings, the padding behind heading and
        list markers, the indentation of continuation lines, the
        vertical alignment of properties, the blank lines between
        blocks, the line wrapping width, the backquoting of grouped
        names, and the `Created:`/`Modified:` frontmatter block.

    -   **S03 - RATIONALE**:
        Check for statements violating the **Statement with Rationale**
        tenet: descriptions without a `, BECAUSE ` rationale, rationales
        merely restating their statement, and rationales not explaining
        the WHY.

        Propose a rationale grounded in the surrounding specification
        content (related statements, rationales, and references).

    -   **S04 - AMBIGUITY**:
        Check for statements violating the **Unambiguous and
        Verifiable** tenet: vague qualifiers (e.g. "fast", "robust",
        "user-friendly", "appropriate", "usually", "etc.", "and/or"),
        undefined or overloaded terms, hidden actors, and statements
        whose fulfillment is not decidable.

        Propose the concrete property, threshold, or scenario actually
        meant, as far as the specification content implies it.

    -   **S05 - ATOMICITY**:
        Check for statements violating the **Atomic Statement** tenet:
        statements joining independent facts with "and"/"or", or
        carrying a rationale which covers only some of their facts.

        Propose splitting them into separate statements or objects.

    -   **S06 - REALIZATION**:
        Check for statements violating the **Intent over Realization**
        tenet: domain-specific, non-architecture related artifacts
        stating the HOW (implementation steps, algorithms, technologies,
        or code-level details) instead of the WHAT and WHY.

        Propose rephrasing them as intent, or moving the realization
        detail into an architecture-related artifact of the schema.

    -   **S07 - REDUNDANCY** (model-wide):
        Check for facts violating the **Single Source of Truth** tenet:
        a fact restated in a second object instead of being referenced.

        Propose replacing the restatement with a `[[xxx]]` reference to
        the owning object.

    -   **S08 - CONSISTENCY** (model-wide):
        Check for contradicting statements, properties, or rationales
        across objects, and for drifting terminology: one concept named
        differently, different concepts named alike, or object names and
        ids following different naming conventions.

        Propose aligning the contradicting or drifting side to the
        prevailing one.

    -   **S09 - LOGIC** (model-wide):
        Check for *logical gaps* in the specification model, i.e.
        objects whose relationships do not form a coherent whole.

        Especially, check for unreachable or dead-end states of a
        lifecycle, state transitions without a trigger, entities without
        any relationship or usage, use cases or scenarios without an
        actor, scenarios covering only the happy path, references
        pointing to an object of a semantically wrong kind, cyclic
        hierarchies which have to be acyclic, contradicting
        cardinalities, and objects the schema expects to be referenced
        (its `referenced` and `coverage` fields) but which no object
        references.

    -   **S10 - COMPLETENESS** (model-wide):
        Check whether the specification is *sufficient for an
        implementation*, i.e. whether an implementer could realize it
        without having to guess.

        Especially, check for open ends (e.g. "TBD", "TODO", "to be
        defined", open questions), objects without any description,
        missing error and edge cases, missing attributes, types, or
        value constraints of data, missing inputs and outputs of
        interfaces, non-functional requirements without a concrete
        threshold, and terms used but nowhere defined. Report only
        *material* gaps -- not every conceivable detail.

    For the gap-filling aspects `S09` and `S10`, propose a *best-guess*
    content which closes the gap, honoring the schema and the
    surrounding specification content, and explicitly state in the WHY
    part that the proposed content is a *best guess* to be reviewed.

    Severity guidance: `S01` follows the diagnostic severity. `S02`
    defaults to `LOW`, escalating to `MEDIUM` for an inconsistency
    across many objects. `S03`, `S05`, `S06`, and `S07` default to
    `MEDIUM`. `S04` defaults to `MEDIUM`, escalating to `HIGH` for a
    statement whose meaning is entirely undecidable. `S08` and `S09`
    default to `HIGH`, as they let implementations diverge. `S10`
    defaults to `MEDIUM`, escalating to `HIGH` for a gap blocking an
    entire feature.

    Be conservative - only report clear, well-grounded issues
    that require an actual *specification change*. Think twice to avoid
    *false positives*.

    Be focused - only report issues which are located in the files of
    <files/>. Ignore issues which are located in other files of
    <corpus/> which were just read to better comprehend the context. For
    a model-wide issue spanning several files, anchor it in a file of
    <files/>.

    For *each* found problem:

    1.  Set <aspect/> to the identifier `S01 - XXX`...`S10 - XXX`,
        indicating the aspect under which the problem was detected.

    2.  Set <severity/> to the string `LOW`, `MEDIUM`, or `HIGH`,
        indicating the problem severity.

    3.  Set <description/> to the following <template/>,
        based on a WHAT ("what is the problem detected") and
        WHY ("why is this a problem") part:

        <template>
        ● **WHAT**: [...]

        ○ **WHY**:  [...]
        </template>

        For both WHAT and WHY, use just an ultra-brief and concise
        Markdown-formatted description. In each of those descriptions,
        mark up all referenced verbatim object names, ids, kinds,
        property keys, or keywords <words/> from the specification as
        quoted strings containing monospaced text with Markdown based on
        the following <template/>: <template>"`<words/>`"</template>.

        For all specification references, always use a relative
        filename and append the related single 1-based line number N as
        `:N` or the related 1-based line number range as `:N-M` to the
        end of the filename.

    4.  Create the change set. For this, set <change-set></change-set>
        (set changes to empty). Every change *MUST* keep the touched
        files conformant to the **SpecBook** format contract and the
        schema. Leave <change-set/> empty *only* if no correction can be
        derived at all (e.g. a diagnostic demanding a decision outside
        the specification).

        Then, for *each* file which requires a change:

        1.  Set <file/> to the *relative* filename path of the file.

        2.  Create the change hunks per file.
            For this, set <change-hunks></change-hunks> (set hunks to empty).

            Then, for *each* change in <file/>:

            1.  Set <line/> to the numeric 1-based line number in <file/>.

            2.  Set <old-text/> to the lines of the old content in
                <file/> which should be changed. Set <new-text/> to the
                lines of the new content in <file/> which will replace
                it.

                Keep the hunk *minimal*: <old-text/> and <new-text/>
                *MUST* *NOT* share any common leading or trailing
                lines - *strip* such lines, as they are *unchanged*
                context and not part of the change. When two changed
                regions are separated by unchanged lines, emit *two
                separate* change hunks instead of one large hunk which
                re-states the unchanged lines. Render a *moved* block
                as one pure-deletion hunk at its old location plus one
                pure-insertion hunk at its new location - *never* by
                deleting and re-adding the unchanged lines in between.

                This minimality rule applies *only* to <old-text/> and
                <new-text/>. It *MUST* *NOT* be understood as a reason to
                also drop the surrounding context of the two following
                substeps - that context is *mandatory* and is reported
                *separately* from the changed lines.

            3.  Set <context-before/> to exactly *up to two* lines of
                *unchanged* content which occurs in <file/> directly
                *before* <old-text/>, i.e., the lines (<line/> - 2) and
                (<line/> - 1). Reduce to just one line (<line/> - 1) if
                <old-text/> is the second line of the file. Set
                <context-before/> to empty if <old-text/> is the first
                line in the file.

            4.  Set <context-after/> to exactly *up to two* lines of
                *unchanged* content which occurs in <file/> directly
                *after* <old-text/>, i.e., the lines (<line/> + <n/>)
                and (<line/> + <n/> + 1), where <n/> is the number of
                lines in <old-text/>. Reduce to just one line (<line/> +
                <n/>) if <old-text/> is the second-last line of the
                file. Set <context-after/> to empty if <old-text/> is
                the last line in the file.

            5.  If <change-hunks/> is not empty, set
                <change-hunks><change-hunks/>,</change-hunks> (append a comma).
                Then append the following <template/> to <change-hunks/>:

                <template>
                    {
                        "line":           <line/>,
                        "context_before": <context-before/>,
                        "old_text":       <old-text/>,
                        "new_text":       <new-text/>,
                        "context_after":  <context-after/>
                    }
                </template>

                Here `line` is a *number* and all four other fields are
                *JSON strings* carrying the *verbatim* file lines
                (embedded newlines escaped as `\n`, no line-number
                prefixes, original indentation preserved). The empty
                string `""` is allowed for `context_before` and
                `context_after` *only* at the very start or end of the
                file - for every other hunk both *MUST* carry their
                context lines.

        3.  If <change-set/> is not empty, set
            <change-set><change-set/>,</change-set> (append a comma).
            Then append the following <template/> to <change-set/>:

            <template>
                {
                    "file": <file/>,
                    "change-hunks": [
                        <change-hunks/>
                    ]
                }
            </template>

    5.  Set <anchor-file/> to the file and <anchor-line/> to the
        1-based line number where the problem is located (for a
        non-empty <change-set/>, the `file` of its first entry and the
        `line` of that entry's first hunk).

    6.  Set <evidence/> to the comma-separated list of one
        `{ "file": <file/>, "lines": [ <first/>, <last/> ] }` entry per
        place exhibiting the problem (e.g. every object of a model-wide
        inconsistency, the defective statement), with the *relative*
        filename <file/> and the 1-based, inclusive line range
        <first/>-<last/> of its current state. A place where the change
        set merely inserts new content is *never* evidence.

    7.  If <problems/> is not empty, set
        <problems><problems/>,</problems> (append a comma).
        Then append the following <template/> to <problems/>:

        <template>
            {
                "aspect":      <aspect/>,
                "severity":    <severity/>,
                "description": <description/>,
                "file":        <anchor-file/>,
                "line":        <anchor-line/>,
                "evidence":    [ <evidence/> ],
                "change-set": [
                    <change-set/>
                ]
            }
        </template>

4.  You *MUST* *NOT* propose, apply, or render any specification
    changes yourself. Instead, return *exclusively* as the last message
    a single JSON block (no markdown, no prose, no preamble, no summary)
    of the following shape:

    ```json
    [
        <problems/>
    ]
    ```


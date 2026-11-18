
Decision Skill Common Steps
===========================

<define name="decision-collect">

Start collecting the *own decisions* of the skill run in <decisions/>,
where <arg1/> names the sources of the *user decisions* (like the query
or the task plan). Set <decisions></decisions> (empty). Do not output
anything.

From now on, until the skill finishes, whenever you decide a detail on
your own -- picking one of several defensible alternatives -- append one
entry to <decisions/>, but *only* if all of the following holds:

-   *Own*: the user made the decision *neither* in <arg1/> *nor* in any
    answer during grilling. An answer auto-chosen by the `grill-auto`
    definition (see `ase-common-grill.md`), e.g. under `--grill-auto` or
    in an automatic approach round, *is* an own decision, as no user
    confirmed it.

-   *Relevant*: the decision belongs to one of the focus areas *DOMAIN*,
    *INTERFACE*, or *ARCHITECTURE* of the grilling (see
    `ase-common-grill.md`). Decisions of any other focus area are *not*
    collected.

Each entry carries its focus id <decision-focus/> (`DOM`, `IFC`, or
`ARC`), its decision <decision-text/> with 1-3 comma-separated keywords
<decision-keywords/> summarizing it, and its rationale
<rationale-text/> with 1-3 comma-separated keywords
<rationale-keywords/> summarizing it. Both <decision-text/> and
<rationale-text/> are a *single*, very brief and concise sentence.

</define>

<define name="decision-report">

Report the collected own decisions <decisions/> for review by the user,
where <arg1/> is the skill chrome of the status line. The report is shown
*independent* of <ase-project-boxing/>, as the user has to be able to
revisit or overrule every decision taken on their behalf.

1.  <if condition="<decisions/> is empty">
    Do not output anything and *skip* all remaining items of this
    definition.
    </if>

2.  *Sort* the entries by descending focus area order -- first all
    `DOM`, then all `IFC`, and then all `ARC` ones -- and, within each
    focus area, by descending impact on the solution. Number them in this
    order with <nn/> of `01`, `02`, etc. Do not output anything.

3.  For every entry, assemble the cell <decision-N-what/> out of
    `**D<nn/>** ▶ <decision-focus/> ▷ **<decision-keywords/>**: <decision-text/>`
    and the cell <decision-N-why/> out of
    `**<rationale-keywords/>**: <rationale-text/>`. Keep every cell at
    most *160 characters* long -- compact the text until it fits --, so
    it never spans more than about 4 lines of its table cell. In every
    cell you *MUST* escape each literal pipe character outside a code
    span as `\|` and you *MUST* open *and* close every backtick code
    span within the *same* cell -- otherwise the cell splits and the
    entire table silently degrades into a plain text rendering. Do not
    output anything.

4.  Output only the following <template/>. Align all column edges of the
    table:

    <template>
    ⧉ **ASE**: <arg1/>, ▶ status: **own decisions taken -- please review**

    | WHAT                | WHY                |
    | ------------------- | ------------------ |
    | <decision-1-what/>  | <decision-1-why/>  |
    | <decision-2-what/>  | <decision-2-why/>  |
    | [...]               | [...]              |

    Legend:  **DOM**: Domain  **IFC**: Interface  **ARC**: Architecture  **Dnn**: decision number
    </template>

</define>


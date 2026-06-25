
@./ase-format-meta.md

Specification (SPEC)
====================

The **Artifact Set** **Specification (SPEC)** specifies the "input"
and the "what" of the Software Engineering project.

Each **Artifact** of the **Artifact Set**
**Specification (SPEC)** is stored under
`<basedir/>/SPEC-<artifact-no/>-<artifact-id/>-<artifact-slug/>.md`,
relative to the project root directory, with <basedir/> being the
`project.artifact.spec.basedir` config variable, <artifact-no/> being
the zero-padded, two-digit sequence number of the **Artifact** (starting
at `01`) according to the order of the **Artifact** list below, and with
<artifact-slug/> being derived from <artifact-name/> (see below) by
Pascal-casing each word (upper-casing its first letter) and using `-`
characters instead of spaces (e.g. `Customer-Journey`).

Each **Artifact** file *MUST* begin with a single blank line before its
`#` heading and end with a single blank line after its last content line
(followed by the trailing newline), mirroring the blank lines shown
inside the `<format>` blocks below.

Each **Artifact** contains two timestamps: the <timestamp-created/>
is the timestamp when this **Artifact** was created. The
<timestamp-modified/> is the timestamp when this **Artifact** was last
modified. Both use an ISO-style format value. The value of both can be
determined by a call to the `ase_timestamp(format: "yyyy-LL-dd HH:mm")`
tool of the `ase` MCP server and use the `text` field of its response.
Whenever an **Artifact** is updated, the <timestamp-modified/> *MUST* be
updated, too.

The **Artifact Set** **Specification (SPEC)** consists of the following
distinct **Artifact**s (listed under their <artifact-name/> and their
<artifact-id/>):

01. **Solution Vision (SV)**:
    The high-level, aspirational description of the solution, capturing
    its purpose, value proposition, and the desired future state it aims
    to achieve.

02. **Personas (PE)**:
    The *archetypal* user profiles representing distinct user groups,
    capturing their goals, needs, behaviors, and context.

03. **Customer Journey (CJ)**:
    The end-to-end experience a customer has while discovering, adopting,
    and using the solution, mapping their steps, touchpoints, and emotions
    over time.

04. **Functional Requirements (FR)**:
    The concrete behaviors and capabilities the solution must provide,
    describing *what* the system does in terms of functions, features, and
    operations.

05. **Non-Functional Requirements (NR)**:
    The quality attributes and constraints the solution must satisfy, such
    as performance, security, scalability, reliability, and usability.

06. **Business Rules (BR)**:
    The domain invariants, policies, and decision logic that must always
    hold true in the problem domain, independent of any single feature,
    constraining the Functional and Non-Functional Requirements.

07. **Data Model (DM)**:
    The structure of named entities, named attributes, and named directed
    relationships (including a cardinality) of the data the solution
    manages, defining how information is organized and connected.

08. **State Model (SM)**:
    For each entity with a non-trivial lifecycle, the legal states it can
    occupy and the permitted transitions between them over its lifetime,
    making the forbidden moves as explicit as the allowed ones.

09. **Glossary (GL)**:
    The ubiquitous language of the domain, defining the meaning of each
    domain term in business language, together with its synonyms and the
    ambiguities to avoid, shared consistently across all Artifacts.

10. **Use Cases (UC)**:
    The discrete goals users pursue with the solution, each describing
    an actor's interaction to achieve a specific outcome. For each Use
    Case, also the concrete step-by-step flows, detailing the sequence
    of actions for main, alternative, and exceptional paths.

11. **Test Cases (TC)**:
    The verifiable conditions and steps used to confirm that requirements
    are correctly implemented, with mandatory defined inputs, mandatory
    expected outcomes, and optional pre- and post-conditions.

12. **Interaction Concept (IC)**:
    The overarching idea of how users interact with the solution,
    describing the intended workflows and interaction philosophy (e.g.
    auto-save behavior).

13. **Language Conventions (LC)**:
    The terminology, naming, tone, and wording standards used consistently
    across the solution and its content.

14. **Dialog Patterns (DP)**:
    The reusable interaction structures governing how the system and user
    exchange information across recurring conversational or UI flows (e.g.
    master-detail dialog).

15. **Dialog Storyboard (DS)**:
    The sequenced visual or textual depiction of a specific dialog flow,
    illustrating how an interaction unfolds screen by screen or turn by
    turn.

16. **Visual Design (VD)**:
    The aesthetic and layout aspects of the solution, defining colors,
    typography, spacing, imagery, and overall look and feel.

The **Artifact**s have the following cross-references:

```text
SPEC-03-CJ Customer Journey  ──(step actor)─►     SPEC-02-PE Personas
SPEC-06-BR Business Rules    ──(constrains)─►     SPEC-04-FR Functional Requirements
SPEC-06-BR Business Rules    ──(constrains)─►     SPEC-05-NR Non-Functional Requirements
SPEC-08-SM State Model       ──(of entity)─►      SPEC-07-DM Data Model
SPEC-10-UC Use Cases         ──(use case actor)─► SPEC-02-PE Personas
SPEC-10-UC Use Cases         ──(realizes)─►       SPEC-04-FR Functional Requirements
SPEC-10-UC Use Cases         ──(transitions)─►    SPEC-08-SM State Model
SPEC-11-TC Test Cases        ──(verifies)─►       SPEC-04-FR Functional Requirements
SPEC-11-TC Test Cases        ──(verifies)─►       SPEC-05-NR Non-Functional Requirements
SPEC-15-DS Dialog Storyboard ──(scenario)─►       SPEC-10-UC Use Cases
SPEC-15-DS Dialog Storyboard ──(pattern)─►        SPEC-14-DP Dialog Patterns
```

Solution Vision (SV)
--------------------

The high-level, aspirational description of the solution, capturing
its purpose, value proposition, and the desired future state it aims
to achieve.

-   Format:

    <format>

    #   SPECIFICATION: SOLUTION VISION (SPEC-SV)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-sv-aspect/>
    <spec-sv-aspect/>
    [...]

    </format>

-   <spec-sv-aspect/> format:

    <format>

    ##  ASPECT: <spec-sv-aspect-name/> <a id="SPEC-SV-<spec-sv-aspect-id/>"></a>

    <spec-sv-aspect-statement/>

    </format>

-   <spec-sv-aspect/> details:

    -   <spec-sv-aspect-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-sv-aspect-name/>.

    -   <spec-sv-aspect-name/>: a short (2-5 word) summary of the vision
        aspect. The recommended aspects are `Purpose` (why the solution
        exists), `Target Audience` (who it serves), `Value Proposition`
        (the unique benefit offered), `Differentiators` (how it stands
        apart from alternatives), and `Future State` (the desired
        outcome once adopted).

    -   <spec-sv-aspect-statement/>: a concise paragraph (1-3 sentences)
        of prose describing the vision aspect in an aspirational but
        unambiguous tone.

Personas (PE)
-------------

The *archetypal* user profiles representing distinct user groups,
capturing their goals, needs, behaviors, and context.

-   Format:

    <format>

    #   SPECIFICATION: PERSONAS (SPEC-PE)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-pe-persona/>
    <spec-pe-persona/>
    [...]

    </format>

-   <spec-pe-persona/> format:

    <format>

    ##  PERSONA: <spec-pe-persona-name/> <a id="SPEC-PE-<spec-pe-persona-id/>"></a>

    -   Gender: <spec-pe-persona-gender/>
    -   Age:    <spec-pe-persona-age/>
    -   Role:   <spec-pe-persona-role/>

    "<spec-pe-persona-quote/>"

    </format>

-   <spec-pe-persona/> details:

    -   <spec-pe-persona-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-pe-persona-name/>.

    -   <spec-pe-persona-name/>: per-artifact unique first name of fictional
        described person.

    -   <spec-pe-persona-gender/>: the gender of the persona: `male`,
        `female`, or `diverse`.

    -   <spec-pe-persona-age/>: the age in years of the persona.

    -   <spec-pe-persona-role/>: the role of the persona.

    -   <spec-pe-persona-quote/>: a short and bold, first-person statement -
        written in the persona's own voice - that captures their core
        attitude, motivation, frustration, or need in a single memorable line.
        It's sometimes called the persona's "tagline," "mantra," or "defining
        statement."

Customer Journey (CJ)
---------------------

The end-to-end experience a customer has while discovering, adopting,
and using the solution, mapping their steps, touchpoints, and emotions
over time.

-   Format:

    <format>

    #   SPECIFICATION: CUSTOMER JOURNEY (SPEC-CJ)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-cj-step/>
    <spec-cj-step/>
    [...]

    </format>

-   <spec-cj-step/> format:

    <format>

    ##  STEP: <spec-cj-step-name/> <a id="SPEC-CJ-<spec-cj-step-id/>"></a>

    -   Stage:      <spec-cj-step-stage/>
    -   Actor:      <spec-cj-step-actor/>
    -   Goal:       <spec-cj-step-goal/>
    -   Touchpoint: <spec-cj-step-touchpoint/>
    -   Action:     <spec-cj-step-action/>
    -   Emotion:    <spec-cj-step-emotion/>
    -   Pain Point: <spec-cj-step-painpoint/>

    </format>

-   <spec-cj-step/> details:

    -   <spec-cj-step-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-cj-step-name/>.

    -   <spec-cj-step-name/> is a summary (5-10 words) of the *step* at its
        <spec-cj-step-touchpoint/>.

    -   <spec-cj-step-actor/> is a `SPEC-PE-<spec-pe-persona-id/>` reference to the
        corresponding **Aspect** of the Personas **Artifact**.

    -   <spec-cj-step-stage/> is one of:

        -   `Awareness`:     Customer is not aware of solution, but has a need.
        -   `Consideration`: Customer is aware of solution, and should consider its use.
        -   `Decision`:      Customer wants to pick the solution.
        -   `Onboarding`:    Customer is using the solution.
        -   `Retention`:     Customer in the long-term stays a customer.
        -   `Advocacy`:      Customer is a fan of solution and tells the tribe.

    -   <spec-cj-step-goal/> is what the actor wants to achieve at this step.

    -   <spec-cj-step-touchpoint/> is where or how the interaction happens
        (e.g. landing page, email, support call).

    -   <spec-cj-step-action/> is what the actor actually does at this step.

    -   <spec-cj-step-emotion/> is the **AS IS** felt state at this step, given
        as a word plus an intensity on a 1-5 Likert scale (e.g. `Curious (4)`).

    -   <spec-cj-step-painpoint/> is the **AS IS** friction or frustration the
        actor encounters at this step (optional).

    -   In case a <spec-cj-step/> has no pain point at all, the
        entire `- Pain Point:` bullet point is omitted.

Functional Requirements (FR)
----------------------------

The concrete behaviors and capabilities the solution must provide,
describing *what* the system does in terms of functions, features, and
operations.

-   Format:

    <format>

    #   SPECIFICATION: FUNCTIONAL REQUIREMENTS (SPEC-FR)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-fr-requirement/>
    <spec-fr-requirement/>
    [...]

    </format>

-   <spec-fr-requirement/> format:

    <format>

    ##  REQUIREMENT: <spec-fr-requirement-name/> <a id="SPEC-FR-<spec-fr-requirement-id/>"></a>

    -   Priority: <spec-fr-requirement-priority/>

    <spec-fr-requirement-statement/>,
    **BECAUSE** <spec-fr-requirement-rationale/>.

    </format>

-   <spec-fr-requirement/> details:

    -   <spec-fr-requirement-id/>: per-artifact unique "slug" of always
        1-3 lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-fr-requirement-name/>.

    -   <spec-fr-requirement-name/>: a short (3-8 word) summary of the
        functional requirement.

    -   <spec-fr-requirement-priority/>: the MoSCoW priority of the
        requirement: `MUST`, `SHOULD`, `COULD`, or `WONT`. The `WONT`
        priority records a requirement deliberately excluded from the
        current scope ("won't have this time"), preserving the conscious
        decision rather than silently dropping it.

    -   <spec-fr-requirement-statement/>: a concise paragraph (1-3
        sentences) of prose describing *what* the solution must do,
        written with the keyword `MUST`, `SHOULD`, `COULD`, or `WONT`
        to indicate the obligation level.

    -   <spec-fr-requirement-rationale/>: the 1-sentence rationale ("why")
        of the functional requirement.

    -   In case the rationale is not present, the
        entire `, **BECAUSE** [...]` clause is omitted.

Non-Functional Requirements (NR)
--------------------------------

The quality attributes and constraints the solution must satisfy, such
as performance, security, scalability, reliability, and usability.

-   Format:

    <format>

    #   SPECIFICATION: NON-FUNCTIONAL REQUIREMENTS (SPEC-NR)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-nr-requirement/>
    <spec-nr-requirement/>
    [...]

    </format>

-   <spec-nr-requirement/> format:

    <format>

    ##  REQUIREMENT: <spec-nr-requirement-name/> <a id="SPEC-NR-<spec-nr-requirement-id/>"></a>

    -   Priority: <spec-nr-requirement-priority/>
    -   Category: <spec-nr-requirement-category/>

    <spec-nr-requirement-statement/>,
    **BECAUSE** <spec-nr-requirement-rationale/>.

    </format>

-   <spec-nr-requirement/> details:

    -   <spec-nr-requirement-id/>: per-artifact unique "slug" of always
        1-3 lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-nr-requirement-name/>.

    -   <spec-nr-requirement-name/>: a short (3-8 word) summary of the
        non-functional requirement.

    -   <spec-nr-requirement-priority/>: the MoSCoW priority of the
        requirement: `MUST`, `SHOULD`, `COULD`, or `WONT`. The `WONT`
        priority records a requirement deliberately excluded from the
        current scope ("won't have this time"), preserving the conscious
        decision rather than silently dropping it.

    -   <spec-nr-requirement-category/>: the quality attribute category
        the requirement addresses, one of `Performance`,
        `Compatibility`, `Usability`, `Reliability`, `Security`,
        `Safety`, `Maintainability`, `Flexibility`, and `Compliance`,
        according to the top-level characteristics in the ISO/IEC
        25010:2023 Software-Quality Model (except for `Functional
        Suitability` which is described by our Functional Requirements
        (FR)).

    -   <spec-nr-requirement-statement/>: a concise paragraph (1-3
        sentences) of prose describing the quality attribute or
        constraint the solution must satisfy. It especially *MUST*
        contain a *METRIC* within the <spec-nr-requirement-category/>,
        which (according to the SMART principle) is the *specific*,
        *measurable*, *achievable*, *relevant* and *time-bound*
        threshold or target by which the requirement is judged satisfied
        (e.g. `p95 latency < 200ms`, `99.9% uptime`).

    -   <spec-nr-requirement-rationale/>: the 1-sentence rationale ("why")
        of the non-functional requirement.

    -   In case the rationale is not present, the
        entire `, **BECAUSE** [...]` clause is omitted.

Business Rules (BR)
-------------------

The domain invariants, policies, and decision logic that must always
hold true in the problem domain, independent of any single feature,
constraining the Functional and Non-Functional Requirements.

-   Format:

    <format>

    #   SPECIFICATION: BUSINESS RULES (SPEC-BR)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-br-rule/>
    <spec-br-rule/>
    [...]

    </format>

-   <spec-br-rule/> format:

    <format>

    ##  RULE: <spec-br-rule-name/> <a id="SPEC-BR-<spec-br-rule-id/>"></a>

    -   Category:   <spec-br-rule-category/>
    -   Constrains: <spec-br-rule-constrains/>

    <spec-br-rule-statement/>,
    **BECAUSE** <spec-br-rule-rationale/>.

    </format>

-   <spec-br-rule/> details:

    -   <spec-br-rule-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-br-rule-name/>.

    -   <spec-br-rule-name/>: a short (3-8 word) summary of the business
        rule.

    -   <spec-br-rule-category/>: the kind of rule, one of `Invariant`
        (a condition that must always hold), `Constraint` (a limit on
        allowed values or actions), `Derivation` (a value computed from
        others), or `Policy` (a deliberate business decision or
        guideline).

    -   <spec-br-rule-constrains/>: a comma-separated list of zero or more
        `SPEC-FR-<spec-fr-requirement-id/>` or
        `SPEC-NR-<spec-nr-requirement-id/>` references to the
        corresponding **Aspect**s of the Functional or Non-Functional
        Requirements **Artifact** the rule constrains.

    -   <spec-br-rule-statement/>: a concise paragraph (1-3 sentences) of
        prose stating the rule declaratively as a condition that must
        hold, written with the keyword `MUST`, `SHOULD`, or `MUST NOT`
        to indicate the obligation level, and naming the domain terms it
        governs (defined in the Glossary **Artifact**).

    -   <spec-br-rule-rationale/>: the 1-sentence rationale ("why") of the
        business rule.

    -   In case the rule constrains no specific requirement, the
        entire `- Constrains:` bullet point is omitted.

    -   In case the rationale is not present, the
        entire `, **BECAUSE** [...]` clause is omitted.

Data Model (DM)
---------------

The structure of named entities, named attributes, and named directed
relationships (including a cardinality) of the data the solution
manages, defining how information is organized and connected.

-   Format:

    <format>

    #   SPECIFICATION: DATA MODEL (SPEC-DM)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-dm-entity/>
    <spec-dm-entity/>
    [...]

    </format>

-   <spec-dm-entity/> format:

    <format>

    ##  ENTITY: `<spec-dm-entity-name/>` <a id="SPEC-DM-<spec-dm-entity-id/>"></a>

    <spec-dm-entity-description/>,
    **BECAUSE** <spec-dm-entity-rationale/>.

    ### ATTRIBUTES

    -   `<spec-dm-attribute-id/>`: `<spec-dm-attribute-qualifier/><spec-dm-attribute-type/>`:<br/>
        <spec-dm-attribute-description/>,
        **BECAUSE** <spec-dm-attribute-rationale/>.

    -   [...]

    ### RELATIONS

    -   `<spec-dm-relation-id/>`: [`<spec-dm-relation-target/>`](#<spec-dm-relation-target-id/>)(`<spec-dm-relation-cardinality/>`):<br/>
        <spec-dm-relation-description/>,
        **BECAUSE** <spec-dm-relation-rationale/>.

    -   [...]

    </format>

-   <spec-dm-entity/> details:

    -   <spec-dm-entity-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-dm-entity-name/>.

    -   <spec-dm-entity-name/>: Pascal-cased, 1-3 word long, per-artifact
        unique name of the entity.

    -   <spec-dm-entity-description/>: the 1-sentence description ("what")
        of the entity.

    -   <spec-dm-entity-rationale/>: the 1-sentence rationale ("why") of
        the entity.

    -   <spec-dm-attribute-id/>: camel-cased, 1-3 word long, per-entity
        unique identifier of the entity attribute.

    -   <spec-dm-attribute-qualifier/>: the optional prefix `unique `
        to indicate inclusion into the primary key of the entity.

    -   <spec-dm-attribute-type/>: the type of the entity attribute:
        `boolean`, `integer`, `float`, `uuid`, `string`, `bytes`,
        `enum(XXX,YYY[,...])`, `date`, `time`, or `datetime`.

    -   <spec-dm-attribute-description/>: the 1-sentence description
        ("what") of the entity attribute.

    -   <spec-dm-attribute-rationale/>: the 1-sentence rationale ("why")
        of the entity attribute.

    -   <spec-dm-relation-id/>: camel-cased, 1-3 word long, per-entity
        unique identifier of the entity relation.

    -   <spec-dm-relation-description/>: the 1-sentence description
        ("what") of the entity relation.

    -   <spec-dm-relation-rationale/>: the 1-sentence rationale ("why") of
        the entity relation.

    -   <spec-dm-relation-target/>: the <spec-dm-entity-name/> of the
        entity the directed relation targets.

    -   <spec-dm-relation-target-id/>: the <spec-dm-entity-id/> of the
        entity the directed relation targets.

    -   <spec-dm-relation-cardinality/>: the cardinality of the entity
        relation at the target entity: `0..1` for zero or one
        ("optional"), `1` for exactly one ("mandatory"), `0..n` for
        zero or more, and `1..n` for one or more.

    -   In case a <spec-dm-entity/> has no relations at all, the
        entire `### RELATIONS` block is omitted.

    -   In case any rationale is not present, the
        entire `, **BECAUSE** [...]` clause is omitted.

-   Export: `export.md`

    The entities, their attributes and their relations
    are rendered as Markdown tables.

    For this, each <spec-dm-entity/> becomes:

    <format>

    ##  ENTITY: <a id="SPEC-DM-<spec-dm-entity-id/>"><spec-dm-entity-name/></a>

    <spec-dm-entity-description/>,
    **BECAUSE** <spec-dm-entity-rationale/>.

    ### ATTRIBUTES

    <export-table-1/>

    ### RELATIONS

    <export-table-2/>

    </format>

    With:

    -    <export-table-1/> is a Markdown table for the attributes with one
         row per <spec-dm-attribute-id/>, sorted by <spec-dm-attribute-id/>
         -- with the columns:

         -   `Attribute`     (`**<spec-dm-attribute-id/>**`)
         -   `Type`          (`<spec-dm-attribute-qualifier/><spec-dm-attribute-type/>`)
         -   `Description`   (`<spec-dm-attribute-description/>, **BECAUSE** <spec-dm-attribute-rationale/>.`)

    -    <export-table-2/> is a Markdown table for the relation with one
         row per <spec-dm-relation-id/>, sorted by <spec-dm-relation-id/> --
         with the columns:

         -   `Relation`      (`**<spec-dm-relation-id/>**`)
         -   `Target`        (`[<spec-dm-relation-target/>](#<spec-dm-relation-target-id/>) (<spec-dm-relation-cardinality/>)`)
         -   `Description`   (`<spec-dm-relation-description/>, **BECAUSE** <spec-dm-relation-rationale/>.`)

    -    In case a <spec-dm-entity/> has no relations at all, the
         entire `### RELATIONS` block (including <export-table-2/>) is omitted.

-   Export: `export.svg`

    The entities, their attributes and their relations are
    rendered as a Mermaid `classDiagram` UML diagram and
    converted to SVG. For this, each <spec-dm-entity/> becomes
    a class whose members are the `<spec-dm-attribute-id/>:
    <spec-dm-attribute-qualifier/><spec-dm-attribute-type/>` attributes,
    and each <spec-dm-relation-id/> becomes a directed association
    labeled with its <spec-dm-relation-id/> and annotated with its
    <spec-dm-relation-cardinality/> at the target end.

State Model (SM)
----------------

For each entity with a non-trivial lifecycle, the legal states it can
occupy and the permitted transitions between them over its lifetime,
making the forbidden moves as explicit as the allowed ones.

-   Format:

    <format>

    #   SPECIFICATION: STATE MODEL (SPEC-SM)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-sm-lifecycle/>
    <spec-sm-lifecycle/>
    [...]

    </format>

-   <spec-sm-lifecycle/> format:

    <format>

    ##  LIFECYCLE: <spec-sm-lifecycle-name/> <a id="SPEC-SM-<spec-sm-lifecycle-id/>"></a>

    -   Entity:  <spec-sm-lifecycle-entity/>
    -   Initial: <spec-sm-lifecycle-initial/>
    -   Final:   <spec-sm-lifecycle-final/>

    ### STATES

    -   `<spec-sm-state-name/>`:
        <spec-sm-state-description/>.

    -   [...]

    ### TRANSITIONS

    -   `<spec-sm-transition-from/>` ─(<spec-sm-transition-event/>)─► `<spec-sm-transition-to/>`:
        <spec-sm-transition-effect/>,
        **WHEN** <spec-sm-transition-guard/>.

    -   [...]

    </format>

-   <spec-sm-lifecycle/> details:

    -   <spec-sm-lifecycle-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-sm-lifecycle-name/>.

    -   <spec-sm-lifecycle-name/>: a short (1-3 word) name of the lifecycle,
        normally the name of the entity it governs.

    -   <spec-sm-lifecycle-entity/> is a `SPEC-DM-<spec-dm-entity-id/>`
        reference to the corresponding **Aspect** of the Data Model
        **Artifact** whose lifecycle this models.

    -   <spec-sm-lifecycle-initial/>: the <spec-sm-state-name/> of the
        single state every instance of the entity enters upon creation.

    -   <spec-sm-lifecycle-final/>: a comma-separated list of one or more
        <spec-sm-state-name/>s in which the entity may legally come to
        rest permanently (terminal states).

    -   <spec-sm-state-name/>: a short, Pascal-cased, per-lifecycle unique
        name of one state the entity can occupy (e.g. `Draft`,
        `Shipped`).

    -   <spec-sm-state-description/>: the 1-sentence description ("what
        holds true") of the state.

    -   <spec-sm-transition-from/>: the <spec-sm-state-name/> the
        transition departs from.

    -   <spec-sm-transition-to/>: the <spec-sm-state-name/> the transition
        arrives at.

    -   <spec-sm-transition-event/>: a short, lower-cased verb naming the
        event or action that triggers the transition (e.g. `submit`,
        `ship`, `cancel`).

    -   <spec-sm-transition-effect/>: the 1-sentence description ("what
        happens") of the side effect the transition produces.

    -   <spec-sm-transition-guard/>: the condition that must hold for the
        transition to be permitted; any move not listed as a transition
        is implicitly forbidden.

    -   Every <spec-sm-state-name/> used in a transition *MUST* be
        declared in the `### STATES` block, and every state with no
        outgoing transition *MUST* be listed in <spec-sm-lifecycle-final/>
        (a state with no outgoing transition that is not final would be a
        stuck dead-end). The converse does *not* hold: a
        <spec-sm-lifecycle-final/> state *MAY* still have outgoing
        transitions, modeling a resting state that can later be left again
        (e.g. a `Closed` state with a `reopen` transition back to
        `Active`). Thus <spec-sm-lifecycle-final/> designates the states in
        which the entity may legally come to rest, which is a superset of,
        but not necessarily equal to, the set of declared states that have
        no outgoing transition.

    -   In case a transition has no side effect, the
        entire `<spec-sm-transition-effect/>,` clause is omitted.

    -   In case a transition has no guard, the
        entire `, **WHEN** [...]` clause is omitted.

Glossary (GL)
-------------

The ubiquitous language of the domain, defining the meaning of each
domain term in business language, together with its synonyms and the
ambiguities to avoid, shared consistently across all Artifacts.

-   Format:

    <format>

    #   SPECIFICATION: GLOSSARY (SPEC-GL)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-gl-term/>
    <spec-gl-term/>
    [...]

    </format>

-   <spec-gl-term/> format:

    <format>

    ##  TERM: <spec-gl-term-name/> <a id="SPEC-GL-<spec-gl-term-id/>"></a>

    -   Synonyms: <spec-gl-term-synonyms/>

    <spec-gl-term-definition/>

    </format>

-   <spec-gl-term/> details:

    -   <spec-gl-term-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-gl-term-name/>.

    -   <spec-gl-term-name/>: the canonical, preferred name of the domain
        term, capitalized as it should appear in all Artifacts.

    -   <spec-gl-term-synonyms/>: a comma-separated list of one or more
        alternative names or abbreviations that refer to the same term
        but are *not* the preferred form.

    -   <spec-gl-term-definition/>: a concise paragraph (1-3 sentences) of
        prose defining the term in business language, independent of any
        implementation, and referencing other terms by their
        <spec-gl-term-name/> where helpful.

    -   In case a term has no synonyms, the
        entire `- Synonyms:` bullet point is omitted.

Use Cases (UC)
--------------

The discrete goals users pursue with the solution, each describing an
actor's interaction to achieve a specific outcome. For each Use Case,
also the concrete step-by-step flows, detailing the sequence of actions
for main, alternative, and exceptional paths.

-   Format:

    <format>

    #   SPECIFICATION: USE CASES (SPEC-UC)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-uc-usecase/>
    <spec-uc-usecase/>
    [...]

    </format>

-   <spec-uc-usecase/> format:

    <format>

    ##  USE CASE: <spec-uc-usecase-name/> <a id="SPEC-UC-<spec-uc-usecase-id/>"></a>

    -   Actor:          <spec-uc-usecase-actor/>
    -   Requirements:   <spec-uc-usecase-requirements/>
    -   Goal:           <spec-uc-usecase-goal/>
    -   Pre-Condition:  <spec-uc-usecase-precondition/>
    -   Post-Condition: <spec-uc-usecase-postcondition/>

    <spec-uc-usecase-description/>

    <spec-uc-usecase-scenario/>
    <spec-uc-usecase-scenario/>
    [...]

    </format>

-   <spec-uc-usecase/> details:

    -   <spec-uc-usecase-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-uc-usecase-name/>.

    -   <spec-uc-usecase-name/>: a short (3-8 word) summary of the use
        case, phrased as an actor goal (e.g. `Reset Forgotten Password`).

    -   <spec-uc-usecase-actor/> is a `SPEC-PE-<spec-pe-persona-id/>`
        reference to the corresponding **Aspect** of the Personas
        **Artifact**, denoting the primary actor pursuing the goal.

    -   <spec-uc-usecase-requirements/> is a comma-separated list of one
        or more `SPEC-FR-<spec-fr-requirement-id/>` references to the
        corresponding **Aspect**s of the Functional Requirements
        **Artifact** the use case realizes.

    -   <spec-uc-usecase-goal/>: the 1-sentence statement of what the
        actor wants to achieve through this use case.

    -   <spec-uc-usecase-precondition/>: the condition that must hold
        before the use case can begin.

    -   <spec-uc-usecase-postcondition/>: the condition that holds after
        the use case completes successfully.

    -   <spec-uc-usecase-description/>: a concise paragraph (1-3
        sentences) of prose describing the use case at a glance, without
        prescribing the step-by-step flow (which belongs to the
        **SCENARIO** blocks of this use case).

    -   In case the use case realizes no specific functional requirement,
        the entire `- Requirements:` bullet point is omitted.

    -   In case a precondition or postcondition is not present, the
        respective bullet point is omitted.

-   <spec-uc-usecase-scenario/> format:

    <format>

    ### SCENARIO: <spec-uc-usecase-scenario-name/> (<spec-uc-usecase-scenario-type/>) <a id="SPEC-UC-<spec-uc-usecase-id/>-<spec-uc-usecase-scenario-id/>"></a>

    1.  <spec-uc-usecase-scenario-step/>
    2.  <spec-uc-usecase-scenario-step/>
    [...]

    </format>

-   <spec-uc-usecase-scenario/> details:

    -   <spec-uc-usecase-scenario-id/>: per-use-case unique "slug" of
        always 1-3 lower-cased words (concatenated with "-" characters
        and in total not longer than 30 characters), derived from
        <spec-uc-usecase-scenario-name/>.

    -   <spec-uc-usecase-scenario-name/>: a short (3-8 word) summary of the
        scenario.

    -   <spec-uc-usecase-scenario-type/>: the path the scenario represents, one
        of `Main` (the primary, happy-path flow), `Alternative` (a
        valid but secondary flow), or `Exceptional` (an error or
        failure-handling flow).

    -   <spec-uc-usecase-scenario-step/>: a single, imperative step in the flow,
        naming the acting party (actor or system) and the action taken
        (e.g. `The user submits the login form.`). Steps are numbered
        sequentially to convey their order.

Test Cases (TC)
---------------

The verifiable conditions and steps used to confirm that requirements
are correctly implemented, with mandatory defined inputs, mandatory
expected outcomes, and optional pre- and post-conditions.

-   Format:

    <format>

    #   SPECIFICATION: TEST CASES (SPEC-TC)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-tc-testcase/>
    <spec-tc-testcase/>
    [...]

    </format>

-   <spec-tc-testcase/> format:

    <format>

    ##  TEST CASE: <spec-tc-testcase-name/> <a id="SPEC-TC-<spec-tc-testcase-id/>"></a>

    -   Verifies:       <spec-tc-testcase-verifies/>
    -   Pre-Condition:  <spec-tc-testcase-precondition/>
    -   Input:          <spec-tc-testcase-input/>
    -   Expected:       <spec-tc-testcase-expected/>
    -   Post-Condition: <spec-tc-testcase-postcondition/>

    </format>

-   <spec-tc-testcase/> details:

    -   <spec-tc-testcase-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-tc-testcase-name/>.

    -   <spec-tc-testcase-name/>: a short (3-8 word) summary of the test
        case.

    -   <spec-tc-testcase-verifies/> is a `SPEC-FR-<spec-fr-requirement-id/>`
        or `SPEC-NR-<spec-nr-requirement-id/>` reference to the
        corresponding **Aspect** of the Functional Requirements or
        Non-Functional Requirements **Artifact** the test case verifies.

    -   <spec-tc-testcase-precondition/>: the state or setup that must
        hold before the test is executed (optional).

    -   <spec-tc-testcase-input/>: the mandatory, concrete input data or
        actions applied during the test.

    -   <spec-tc-testcase-expected/>: the mandatory, concrete expected
        outcome or observable result that defines a passing test.

    -   <spec-tc-testcase-postcondition/>: the state that must hold after
        the test completes (optional).

    -   In case a pre-condition or post-condition is not present, the
        respective bullet point is omitted.

Interaction Concept (IC)
------------------------

The overarching idea of how users interact with the solution,
describing the intended workflows and interaction philosophy (e.g.
auto-save behavior).

-   Format:

    <format>

    #   SPECIFICATION: INTERACTION CONCEPT (SPEC-IC)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-ic-principle/>
    <spec-ic-principle/>
    [...]

    </format>

-   <spec-ic-principle/> format:

    <format>

    ##  PRINCIPLE: <spec-ic-principle-name/> <a id="SPEC-IC-<spec-ic-principle-id/>"></a>

    <spec-ic-principle-statement/>,
    **BECAUSE** <spec-ic-principle-rationale/>.

    </format>

-   <spec-ic-principle/> details:

    -   <spec-ic-principle-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-ic-principle-name/>.

    -   <spec-ic-principle-name/>: a short (2-5 word) summary of the
        interaction principle (e.g. `Auto-Save`, `Optimistic Updates`,
        `Undo over Confirm`).

    -   <spec-ic-principle-statement/>: a concise paragraph (1-3
        sentences) of prose describing the interaction principle and how
        it governs the user's experience across the solution.

    -   <spec-ic-principle-rationale/>: the 1-sentence rationale ("why")
        of the interaction principle.

    -   In case the rationale is not present, the
        entire `, **BECAUSE** [...]` clause is omitted.

Language Conventions (LC)
-------------------------

The terminology, naming, tone, and wording standards used consistently
across the solution and its content.

-   Format:

    <format>

    #   SPECIFICATION: LANGUAGE CONVENTIONS (SPEC-LC)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-lc-convention/>
    <spec-lc-convention/>
    [...]

    </format>

-   <spec-lc-convention/> format:

    <format>

    ##  CONVENTION: <spec-lc-convention-name/> <a id="SPEC-LC-<spec-lc-convention-id/>"></a>

    -   Category: <spec-lc-convention-category/>

    <spec-lc-convention-statement/>
    (e.g. <spec-lc-convention-example/>)

    </format>

-   <spec-lc-convention/> details:

    -   <spec-lc-convention-id/>: per-artifact unique "slug" of always
        1-3 lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-lc-convention-name/>.

    -   <spec-lc-convention-name/>: a short (2-5 word) summary of the
        language convention.

    -   <spec-lc-convention-category/>: the aspect of language the
        convention governs, one of `Terminology` (preferred and
        forbidden terms), `Naming` (naming patterns), `Tone` (voice and
        register), `Capitalization`, `Punctuation`, or `Formatting`.

    -   <spec-lc-convention-statement/>: a concise paragraph (1-3
        sentences) of prose describing the convention to be applied
        consistently across the solution.

    -   <spec-lc-convention-example/>: a short, concrete illustration of
        the convention in practice (optional).

    -   In case the example is not present, the
        entire `(e.g. [...])` chunk is omitted.

Dialog Patterns (DP)
--------------------

The reusable interaction structures governing how the system and user
exchange information across recurring conversational or UI flows (e.g.
master-detail dialog).

-   Format:

    <format>

    #   SPECIFICATION: DIALOG PATTERNS (SPEC-DP)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-dp-pattern/>
    <spec-dp-pattern/>
    [...]

    </format>

-   <spec-dp-pattern/> format:

    <format>

    ##  PATTERN: <spec-dp-pattern-name/> <a id="SPEC-DP-<spec-dp-pattern-id/>"></a>

    -   Context: <spec-dp-pattern-context/>
    -   Problem: <spec-dp-pattern-problem/>

    <spec-dp-pattern-description/>,
    **BECAUSE** <spec-dp-pattern-rationale/>.

    </format>

-   <spec-dp-pattern/> details:

    -   <spec-dp-pattern-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-dp-pattern-name/>.

    -   <spec-dp-pattern-name/>: a short (2-5 word) summary of the dialog
        pattern (e.g. `Master-Detail`, `Wizard`, `Inline Edit`).

    -   <spec-dp-pattern-context/>: the recurring situation or flow in
        which the pattern is applied.

    -   <spec-dp-pattern-problem/>: the 1-sentence tension or difficulty
        the pattern resolves ("why is the pattern needed"),
        stated independently of its solution (which belongs to
        <spec-dp-pattern-description/>) and its rationale (which belongs
        to <spec-dp-pattern-rationale/>).

    -   <spec-dp-pattern-description/>: a concise paragraph (1-3
        sentences) of prose describing the reusable interaction structure
        and how the system and user exchange information within it.

    -   <spec-dp-pattern-rationale/>: the 1-sentence justification for why
        the structure in <spec-dp-pattern-description/> is the right
        response - the benefit it secures or the trade-off it wins.
        Unlike <spec-dp-pattern-problem/> (which states *why the pattern
        is needed*, independent of any solution), the rationale states
        *why this particular solution is worth adopting*.

    -   In case the rationale is not present, the
        entire `, **BECAUSE** [...]` clause is omitted.

Dialog Storyboard (DS)
----------------------

The sequenced visual or textual depiction of a specific dialog flow,
illustrating how an interaction unfolds screen by screen or turn by
turn.

-   Format:

    <format>

    #   SPECIFICATION: DIALOG STORYBOARD (SPEC-DS)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-ds-storyboard/>
    <spec-ds-storyboard/>
    [...]

    </format>

-   <spec-ds-storyboard/> format:

    <format>

    ##  STORYBOARD: <spec-ds-storyboard-name/> <a id="SPEC-DS-<spec-ds-storyboard-id/>"></a>

    -   Pattern:  <spec-ds-storyboard-pattern/>
    -   Use Case: <spec-ds-storyboard-usecase/>
    -   Scenario: <spec-ds-storyboard-scenario/>

    1.  **<spec-ds-frame-name/>**: <spec-ds-frame-description/>
    2.  **<spec-ds-frame-name/>**: <spec-ds-frame-description/>
    [...]

    </format>

-   <spec-ds-storyboard/> details:

    -   <spec-ds-storyboard-id/>: per-artifact unique "slug" of always
        1-3 lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-ds-storyboard-name/>.

    -   <spec-ds-storyboard-name/>: a short (3-8 word) summary of the
        depicted dialog flow.

    -   <spec-ds-storyboard-pattern/> is a `SPEC-DP-<spec-dp-pattern-id/>`
        reference to the corresponding **Aspect** of the Dialog Patterns
        **Artifact** the storyboard instantiates (optional).

    -   <spec-ds-storyboard-usecase/> is a
        `SPEC-UC-<spec-uc-usecase-id/>` reference to the corresponding
        **Aspect** of the Use Case **Artifact** the storyboard
        visualizes (optional).

    -   <spec-ds-storyboard-scenario/> is a
        `SPEC-UC-<spec-uc-usecase-id/>-<spec-uc-usecase-scenario-id/>`
        reference to the corresponding scenario **Aspect** of the Use
        Case **Artifact** the storyboard visualizes (optional).

    -   <spec-ds-frame-name/>: a short (2-5 word) label for the screen,
        turn, or state depicted by the storyboard frame. Frames are
        numbered sequentially to convey their order.

    -   <spec-ds-frame-description/>: a concise (1-2 sentence) description
        of what the user sees and does at this frame of the interaction.

    -   In case a pattern, use case, or scenario reference is not present,
        the respective bullet point is omitted.

Visual Design (VD)
------------------

The aesthetic and layout aspects of the solution, defining colors,
typography, spacing, imagery, and overall look and feel.

-   Format:

    <format>

    #   SPECIFICATION: VISUAL DESIGN (SPEC-VD)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-vd-element/>
    <spec-vd-element/>
    [...]

    </format>

-   <spec-vd-element/> format:

    <format>

    ##  ELEMENT: <spec-vd-element-name/> <a id="SPEC-VD-<spec-vd-element-id/>"></a>

    -   Category: <spec-vd-element-category/>

    <spec-vd-element-specification/>,
    **BECAUSE** <spec-vd-element-rationale/>.

    </format>

-   <spec-vd-element/> details:

    -   <spec-vd-element-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-vd-element-name/>.

    -   <spec-vd-element-name/>: a short (2-5 word) summary of the visual
        design element.

    -   <spec-vd-element-category/>: the aspect of visual design the
        element governs, one of `Color`, `Typography`, `Iconography`,
        `Imagery`, `Layout`, or `Animation`.

    -   <spec-vd-element-specification/>: a concise paragraph (1-3
        sentences) of prose specifying the concrete values, tokens, or
        rules that define the visual design element (e.g. palette,
        font family, scale).

    -   <spec-vd-element-rationale/>: the 1-sentence rationale ("why") of
        the visual design element.

    -   In case the rationale is not present, the
        entire `, **BECAUSE** [...]` clause is omitted.

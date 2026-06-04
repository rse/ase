
@./ase-format-meta.md

Specification (SPEC)
====================

The **Artifact Set** **Specification (SPEC)** specifies the "input"
and the "what" of the Software Engineering project.

Each **Artifact** of the **Artifact Set** **Specification (SPEC)**
is stored under `docs/spec/SPEC-<artifact-id/>-<artifact-slug/>.md`,
relative to the project root directory, and with <artifact-slug/> being
derived from <artifact-name/> (see below) by lower-casing and using `-`
characters instead of spaces.

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

-   **Customer Journey (CJ)**:
    The end-to-end experience a customer has while discovering, adopting,
    and using the solution, mapping their steps, touchpoints, and emotions
    over time.

-   **Solution Vision (SV)**:
    The high-level, aspirational description of the solution, capturing
    its purpose, value proposition, and the desired future state it aims
    to achieve.

-   **Functional Requirements (FR)**:
    The concrete behaviors and capabilities the solution must provide,
    describing *what* the system does in terms of functions, features, and
    operations.

-   **Non-Functional Requirements (NR)**:
    The quality attributes and constraints the solution must satisfy, such
    as performance, security, scalability, reliability, and usability.

-   **Data Model (DM)**:
    The structure of named entities, named attributes, and named directed
    relationships (including a cardinality) of the data the solution
    manages, defining how information is organized and connected.

-   **Use Cases (UC)**:
    The discrete goals users pursue with the solution, each describing an
    actor's interaction to achieve a specific outcome.

-   **Use Case Scenarios (US)**:
    The concrete step-by-step flows through a **Use Case**, detailing the
    sequence of actions for main, alternative, and exceptional paths.

-   **Personas (PE)**:
    The *archetypal* user profiles representing distinct user groups,
    capturing their goals, needs, behaviors, and context.

-   **Test Cases (TC)**:
    The verifiable conditions and steps used to confirm that requirements
    are correctly implemented, with mandatory defined inputs, mandatory
    expected outcomes, and optional pre- and post-conditions.

-   **Interaction Concept (IC)**:
    The overarching idea of how users interact with the solution,
    describing the intended workflows and interaction philosophy (e.g.
    auto-save behavior).

-   **Language Conventions (LC)**:
    The terminology, naming, tone, and wording standards used consistently
    across the solution and its content.

-   **Dialog Patterns (DP)**:
    The reusable interaction structures governing how the system and user
    exchange information across recurring conversational or UI flows (e.g.
    master-detail dialog).

-   **Dialog Storyboard (SB)**:
    The sequenced visual or textual depiction of a specific dialog flow,
    illustrating how an interaction unfolds screen by screen or turn by
    turn.

-   **Visual Design (VD)**:
    The aesthetic and layout aspects of the solution, defining colors,
    typography, spacing, imagery, and overall look and feel.

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

    ##  STEP SPEC-CJ-<spec-cj-step-id/>: <spec-cj-step-name/>

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

    ##  ASPECT SPEC-SV-<spec-sv-aspect-id/>: <spec-sv-aspect-name/>

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

    ##  REQUIREMENT SPEC-FR-<spec-fr-requirement-id/>: <spec-fr-requirement-name/>

    -   Priority: <spec-fr-requirement-priority/>

    <spec-fr-requirement-statement/>
    (why: <spec-fr-requirement-rationale/>)

    </format>

-   <spec-fr-requirement/> details:

    -   <spec-fr-requirement-id/>: per-artifact unique "slug" of always
        1-3 lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-fr-requirement-name/>.

    -   <spec-fr-requirement-name/>: a short (3-8 word) summary of the
        functional requirement.

    -   <spec-fr-requirement-priority/>: the MoSCoW priority of the
        requirement: `MUST`, `SHOULD`, `COULD`, or `WONT`.

    -   <spec-fr-requirement-statement/>: a concise paragraph (1-3
        sentences) of prose describing *what* the solution must do,
        written with the keyword `MUST`, `SHOULD`, `COULD`, or `WILL
        NOT` to indicate the obligation level.

    -   <spec-fr-requirement-rationale/>: the 1-sentence rationale ("why")
        of the functional requirement.

    -   In case the rationale is not present, the
        entire `(why: [...])` chunk is omitted.

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

    ##  REQUIREMENT SPEC-NR-<spec-nr-requirement-id/>: <spec-nr-requirement-name/>

    -   Category: <spec-nr-requirement-category/>
    -   Priority: <spec-nr-requirement-priority/>
    -   Metric:   <spec-nr-requirement-metric/>

    <spec-nr-requirement-statement/>
    (why: <spec-nr-requirement-rationale/>)

    </format>

-   <spec-nr-requirement/> details:

    -   <spec-nr-requirement-id/>: per-artifact unique "slug" of always
        1-3 lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-nr-requirement-name/>.

    -   <spec-nr-requirement-name/>: a short (3-8 word) summary of the
        non-functional requirement.

    -   <spec-nr-requirement-category/>: the quality attribute category
        the requirement addresses, one of `Performance`, `Scalability`,
        `Reliability`, `Availability`, `Security`, `Privacy`,
        `Usability`, `Accessibility`, `Maintainability`, `Portability`,
        `Compatibility`, or `Compliance`.

    -   <spec-nr-requirement-priority/>: the MoSCoW priority of the
        requirement: `MUST`, `SHOULD`, `COULD`, or `WONT`.

    -   <spec-nr-requirement-metric/>: the measurable, verifiable
        threshold or target by which the requirement is judged satisfied
        (e.g. `p95 latency < 200ms`, `99.9% uptime`).

    -   <spec-nr-requirement-statement/>: a concise paragraph (1-3
        sentences) of prose describing the quality attribute or
        constraint the solution must satisfy.

    -   <spec-nr-requirement-rationale/>: the 1-sentence rationale ("why")
        of the non-functional requirement.

    -   In case the rationale is not present, the
        entire `(why: [...])` chunk is omitted.

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

    ##  ENTITY SPEC-DM-<spec-dm-entity-id/>: <spec-dm-entity-name/>

    <spec-dm-entity-description/>
    (why: <spec-dm-entity-rationale/>)

    ### ATTRIBUTES

    -   **<spec-dm-attribute-id/>**: <spec-dm-attribute-qualifier/><spec-dm-attribute-type/>:
        <spec-dm-attribute-description/>
        (why: <spec-dm-attribute-rationale/>)

    -   [...]

    ### RELATIONS

    -   **<spec-dm-relation-id/>**: <spec-dm-relation-target/>(<spec-dm-relation-cardinality/>):
        <spec-dm-relation-description/>
        (why: <spec-dm-relation-rationale/>)

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

    -   <spec-dm-relation-cardinality/>: the cardinality of the entity
        relation at the target entity: `0..1` for zero or one
        ("optional"), `1` for exactly one ("mandatory"), `0..n` for
        zero or more, and `1..n` for one or more.

    -   In case a <spec-dm-entity/> has no relations at all, the
        entire `### RELATIONS` block is omitted.

    -   In case any rationale is not present, the
        entire `(why: [...])` chunk is omitted.

Use Cases (UC)
--------------

The discrete goals users pursue with the solution, each describing an
actor's interaction to achieve a specific outcome.

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

    ##  USE CASE SPEC-UC-<spec-uc-usecase-id/>: <spec-uc-usecase-name/>

    -   Actor:        <spec-uc-usecase-actor/>
    -   Goal:         <spec-uc-usecase-goal/>
    -   Precondition: <spec-uc-usecase-precondition/>
    -   Postcondition: <spec-uc-usecase-postcondition/>

    <spec-uc-usecase-description/>

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

    -   <spec-uc-usecase-goal/>: the 1-sentence statement of what the
        actor wants to achieve through this use case.

    -   <spec-uc-usecase-precondition/>: the condition that must hold
        before the use case can begin.

    -   <spec-uc-usecase-postcondition/>: the condition that holds after
        the use case completes successfully.

    -   <spec-uc-usecase-description/>: a concise paragraph (1-3
        sentences) of prose describing the use case at a glance, without
        prescribing the step-by-step flow (which belongs to the **Use
        Case Scenarios** **Artifact**).

    -   In case a precondition or postcondition is not present, the
        respective bullet point is omitted.

Use Case Scenarios (US)
-----------------------

The concrete step-by-step flows through a **Use Case**, detailing the
sequence of actions for main, alternative, and exceptional paths.

-   Format:

    <format>

    #   SPECIFICATION: USE CASE SCENARIOS (SPEC-US)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-us-scenario/>
    <spec-us-scenario/>
    [...]

    </format>

-   <spec-us-scenario/> format:

    <format>

    ##  SCENARIO SPEC-US-<spec-us-scenario-id/>: <spec-us-scenario-name/>

    -   Use Case: <spec-us-scenario-usecase/>
    -   Type:     <spec-us-scenario-type/>

    1.  <spec-us-scenario-step/>
    2.  <spec-us-scenario-step/>
    [...]

    </format>

-   <spec-us-scenario/> details:

    -   <spec-us-scenario-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-us-scenario-name/>.

    -   <spec-us-scenario-name/>: a short (3-8 word) summary of the
        scenario.

    -   <spec-us-scenario-usecase/> is a `SPEC-UC-<spec-uc-usecase-id/>`
        reference to the corresponding **Aspect** of the Use Cases
        **Artifact** this scenario flows through.

    -   <spec-us-scenario-type/>: the path the scenario represents, one
        of `Main` (the primary, happy-path flow), `Alternative` (a
        valid but secondary flow), or `Exceptional` (an error or
        failure-handling flow).

    -   <spec-us-scenario-step/>: a single, imperative step in the flow,
        naming the acting party (actor or system) and the action taken
        (e.g. `The user submits the login form.`). Steps are numbered
        sequentially to convey their order.

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

    ##  PERSONA SPEC-PE-<spec-pe-persona-id/>: <spec-pe-persona-name/>

    -   Gender: <spec-pe-persona-gender/>
    -   Age:    <spec-pe-persona-age/>
    -   Role:   <spec-pe-persona-role/>
    -   Quote:  "<spec-pe-persona-quote/>"

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

    -   <spec-pe-persona-quote/>: a short, first-person statement —
        written in the persona's own voice — that captures their core
        attitude, motivation, frustration, or need in a single memorable line.
        It's sometimes called the persona's "tagline," "mantra," or "defining
        statement."

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

    ##  TEST CASE SPEC-TC-<spec-tc-testcase-id/>: <spec-tc-testcase-name/>

    -   Verifies:      <spec-tc-testcase-verifies/>
    -   Precondition:  <spec-tc-testcase-precondition/>
    -   Input:         <spec-tc-testcase-input/>
    -   Expected:      <spec-tc-testcase-expected/>
    -   Postcondition: <spec-tc-testcase-postcondition/>

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

    -   In case a precondition or postcondition is not present, the
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

    ##  PRINCIPLE SPEC-IC-<spec-ic-principle-id/>: <spec-ic-principle-name/>

    <spec-ic-principle-statement/>
    (why: <spec-ic-principle-rationale/>)

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
        entire `(why: [...])` chunk is omitted.

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

    ##  CONVENTION SPEC-LC-<spec-lc-convention-id/>: <spec-lc-convention-name/>

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

    ##  PATTERN SPEC-DP-<spec-dp-pattern-id/>: <spec-dp-pattern-name/>

    -   Context: <spec-dp-pattern-context/>

    <spec-dp-pattern-description/>
    (why: <spec-dp-pattern-rationale/>)

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

    -   <spec-dp-pattern-description/>: a concise paragraph (1-3
        sentences) of prose describing the reusable interaction structure
        and how the system and user exchange information within it.

    -   <spec-dp-pattern-rationale/>: the 1-sentence rationale ("why") of
        the dialog pattern.

    -   In case the rationale is not present, the
        entire `(why: [...])` chunk is omitted.

Dialog Storyboard (SB)
----------------------

The sequenced visual or textual depiction of a specific dialog flow,
illustrating how an interaction unfolds screen by screen or turn by
turn.

-   Format:

    <format>

    #   SPECIFICATION: DIALOG STORYBOARD (SPEC-SB)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <spec-sb-storyboard/>
    <spec-sb-storyboard/>
    [...]

    </format>

-   <spec-sb-storyboard/> format:

    <format>

    ##  STORYBOARD SPEC-SB-<spec-sb-storyboard-id/>: <spec-sb-storyboard-name/>

    -   Pattern:  <spec-sb-storyboard-pattern/>
    -   Scenario: <spec-sb-storyboard-scenario/>

    1.  **<spec-sb-frame-name/>**: <spec-sb-frame-description/>
    2.  **<spec-sb-frame-name/>**: <spec-sb-frame-description/>
    [...]

    </format>

-   <spec-sb-storyboard/> details:

    -   <spec-sb-storyboard-id/>: per-artifact unique "slug" of always
        1-3 lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-sb-storyboard-name/>.

    -   <spec-sb-storyboard-name/>: a short (3-8 word) summary of the
        depicted dialog flow.

    -   <spec-sb-storyboard-pattern/> is a `SPEC-DP-<spec-dp-pattern-id/>`
        reference to the corresponding **Aspect** of the Dialog Patterns
        **Artifact** the storyboard instantiates (optional).

    -   <spec-sb-storyboard-scenario/> is a `SPEC-US-<spec-us-scenario-id/>`
        reference to the corresponding **Aspect** of the Use Case
        Scenarios **Artifact** the storyboard visualizes (optional).

    -   <spec-sb-frame-name/>: a short (2-5 word) label for the screen,
        turn, or state depicted by the storyboard frame. Frames are
        numbered sequentially to convey their order.

    -   <spec-sb-frame-description/>: a concise (1-2 sentence) description
        of what the user sees and does at this frame of the interaction.

    -   In case a pattern or scenario reference is not present, the
        respective bullet point is omitted.

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

    ##  ELEMENT SPEC-VD-<spec-vd-element-id/>: <spec-vd-element-name/>

    -   Category: <spec-vd-element-category/>

    <spec-vd-element-specification/>
    (why: <spec-vd-element-rationale/>)

    </format>

-   <spec-vd-element/> details:

    -   <spec-vd-element-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <spec-vd-element-name/>.

    -   <spec-vd-element-name/>: a short (2-5 word) summary of the visual
        design element.

    -   <spec-vd-element-category/>: the aspect of visual design the
        element governs, one of `Color`, `Typography`, `Spacing`,
        `Layout`, `Iconography`, `Imagery`, `Motion`, or `Branding`.

    -   <spec-vd-element-specification/>: a concise paragraph (1-3
        sentences) of prose specifying the concrete values, tokens, or
        rules that define the visual design element (e.g. palette,
        font family, scale).

    -   <spec-vd-element-rationale/>: the 1-sentence rationale ("why") of
        the visual design element.

    -   In case the rationale is not present, the
        entire `(why: [...])` chunk is omitted.

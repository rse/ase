
@./ase-format-meta.md

Architecture (ARCH)
===================

The **Artifact Set** **Architecture (ARCH)** specifies the "input"
and the "how" of the Software Engineering project.

Each **Artifact** of the **Artifact Set** **Architecture (ARCH)**
is stored under `docs/arch/ARCH-<artifact-id/>-<artifact-slug/>.md`,
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

The **Artifact Set** **Architecture (ARCH)** consists of the following
distinct **Artifact**s (listed under their <artifact-name/> and their
<artifact-id/>):

-   **Context View (CV)**:
    The relationships, dependencies, and interactions between the solution
    and its environment, defining the system's scope, external entities,
    and boundaries.

-   **Functionality View (FV)**:
    The functional elements of the solution, their responsibilities,
    interfaces, and primary interactions, describing *what* the system does
    at runtime.

-   **Information View (IV)**:
    The way the solution stores, manages, manipulates, and distributes
    information, defining the static data structure and dynamic information
    flow.

-   **Concurrency View (CO)**:
    The concurrency structure of the solution, mapping functional elements
    to processes and threads, and defining how they coordinate and
    communicate.

-   **Development View (DV)**:
    The architecture supporting the software development process, defining
    the module organization, build approach, and codeline conventions.

-   **Deployment View (DP)**:
    The environment into which the solution is deployed, mapping software
    elements to the runtime platform, hardware, and network topology.

-   **Operations View (OV)**:
    The way the solution is operated, administered, and supported in
    production, defining installation, monitoring, and management concerns.

-   **Quality Perspectives (QP)**:
    How the Non-Functional Requirements (NR) are addressed.

-   **Decision Record (DR)**:
    The major decisions related to the architecture, each recording the
    forces at play, the chosen response, and the reasoning that justifies it.

Context View (CV)
-----------------

The relationships, dependencies, and interactions between the solution
and its environment, defining the system's scope, external entities,
and boundaries.

-   Format:

    <format>

    #   ARCHITECTURE: CONTEXT VIEW (ARCH-CV)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <arch-cv-entity/>
    <arch-cv-entity/>
    [...]

    </format>

-   <arch-cv-entity/> format:

    <format>

    ##  ENTITY ARCH-CV-<arch-cv-entity-id/>: <arch-cv-entity-name/>

    -   Kind:      <arch-cv-entity-kind/>
    -   Direction: <arch-cv-entity-direction/>
    -   Interface: <arch-cv-entity-interface/>
    -   Data:      <arch-cv-entity-data/>

    <arch-cv-entity-description/>
    (why: <arch-cv-entity-rationale/>)

    </format>

-   <arch-cv-entity/> details:

    -   <arch-cv-entity-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <arch-cv-entity-name/>.

    -   <arch-cv-entity-name/> is a short (2-5 word) summary of the
        external entity the solution interacts with (e.g. `Payment
        Gateway`, `Identity Provider`, `End User`).

    -   <arch-cv-entity-kind/> is one of:

        -   `Person`:       A human actor interacting with the solution.
        -   `System`:       An external software system the solution integrates with.
        -   `Service`:      A third-party or managed service the solution consumes.
        -   `Datastore`:    An external data repository the solution reads from or writes to.
        -   `Device`:       A physical device or sensor the solution communicates with.
        -   `Organization`: An external organizational party (e.g. regulator, vendor).

    -   <arch-cv-entity-direction/> is the flow of interaction relative to
        the solution: `Inbound` (entity drives the solution), `Outbound`
        (solution drives the entity), or `Bidirectional` (both directions).

    -   <arch-cv-entity-interface/> is how the interaction happens
        (e.g. REST API, message queue, file exchange, web UI).

    -   <arch-cv-entity-data/> is the principal information exchanged
        across the boundary with this entity.

    -   <arch-cv-entity-description/> is a concise paragraph (1-3
        sentences) of prose describing the relationship and dependency
        between the solution and the external entity.

    -   <arch-cv-entity-rationale/> is the 1-sentence rationale ("why")
        for the entity being part of the system context.

    -   In case the rationale is not present, the
        entire `(why: [...])` chunk is omitted.

Functionality View (FV)
-----------------------

The functional elements of the solution, their responsibilities,
interfaces, and primary interactions, describing *what* the system does
at runtime.

-   Format:

    <format>

    #   ARCHITECTURE: FUNCTIONALITY VIEW (ARCH-FV)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <arch-fv-element/>
    <arch-fv-element/>
    [...]

    </format>

-   <arch-fv-element/> format:

    <format>

    ##  ELEMENT ARCH-FV-<arch-fv-element-id/>: <arch-fv-element-name/>

    -   Kind:           <arch-fv-element-kind/>
    -   Responsibility: <arch-fv-element-responsibility/>
    -   Interface:      <arch-fv-element-interface/>
    -   Depends On:     <arch-fv-element-dependency/>, [...]

    <arch-fv-element-description/>
    (why: <arch-fv-element-rationale/>)

    </format>

-   <arch-fv-element/> details:

    -   <arch-fv-element-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <arch-fv-element-name/>.

    -   <arch-fv-element-name/> is a short (2-5 word) summary of the
        functional element (e.g. `Authentication Service`, `Order
        Processor`, `Notification Dispatcher`).

    -   <arch-fv-element-kind/> is one of:

        -   `Component`:  A cohesive unit of functionality with a defined interface.
        -   `Service`:    An independently deployable provider of functionality.
        -   `Module`:     A logical grouping of related functionality within a component.
        -   `Connector`:  A mediator that conveys interactions between elements (e.g. bus, gateway).
        -   `Subsystem`:  A larger composite grouping several components.

    -   <arch-fv-element-responsibility/> is the 1-sentence statement of
        the single, primary responsibility the element owns.

    -   <arch-fv-element-interface/> is how other elements interact with
        this element (e.g. REST API, library API, message topic, CLI).

    -   <arch-fv-element-dependency/> is an `ARCH-FV-<arch-fv-element-id/>`
        reference to another functional element this element depends on
        at runtime.

    -   <arch-fv-element-description/> is a concise paragraph (1-3
        sentences) of prose describing *what* the element does and how it
        collaborates with the elements it depends on.

    -   <arch-fv-element-rationale/> is the 1-sentence rationale ("why")
        for the element's existence and boundary.

    -   In case an element has no dependencies at all, the
        entire `- Depends On:` bullet point is omitted.

    -   In case the rationale is not present, the
        entire `(why: [...])` chunk is omitted.

Information View (IV)
---------------------

The way the solution stores, manages, manipulates, and distributes
information, defining the static data structure and dynamic information
flow.

-   Format:

    <format>

    #   ARCHITECTURE: INFORMATION VIEW (ARCH-IV)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <arch-iv-aspect/>
    <arch-iv-aspect/>
    [...]

    </format>

-   <arch-iv-aspect/> format:

    <format>

    ##  ASPECT ARCH-IV-<arch-iv-aspect-id/>: <arch-iv-aspect-name/>

    -   Concern:    <arch-iv-aspect-concern/>
    -   Entities:   <arch-iv-aspect-entity/>, [...]
    -   Owner:      <arch-iv-aspect-owner/>
    -   Lifecycle:  <arch-iv-aspect-lifecycle/>

    <arch-iv-aspect-description/>
    (why: <arch-iv-aspect-rationale/>)

    </format>

-   <arch-iv-aspect/> details:

    -   <arch-iv-aspect-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <arch-iv-aspect-name/>.

    -   <arch-iv-aspect-name/> is a short (2-5 word) summary of the
        information aspect (e.g. `Order Persistence`, `Event Stream`,
        `Cache Coherency`).

    -   <arch-iv-aspect-concern/> is the information-handling concern the
        aspect addresses, one of `Persistence`, `Flow`, `Ownership`,
        `Consistency`, `Replication`, `Caching`, `Retention`, or
        `Migration`.

    -   <arch-iv-aspect-entity/> is a `SPEC-DM-<spec-dm-entity-id/>`
        reference to a corresponding entity of the Data Model **Artifact**
        the aspect governs.

    -   <arch-iv-aspect-owner/> is an `ARCH-FV-<arch-fv-element-id/>`
        reference to the functional element that owns this information.

    -   <arch-iv-aspect-lifecycle/> is how the information comes into
        being, changes, and is disposed of (e.g. `created on order,
        retained 7 years, then purged`).

    -   <arch-iv-aspect-description/> is a concise paragraph (1-3
        sentences) of prose describing how the solution stores, manages,
        or distributes the information and how its consistency is upheld.

    -   <arch-iv-aspect-rationale/> is the 1-sentence rationale ("why")
        for handling the information this way.

    -   In case the entity or owner references are not present, the
        respective bullet point is omitted.

    -   In case the rationale is not present, the
        entire `(why: [...])` chunk is omitted.

Concurrency View (CO)
---------------------

The concurrency structure of the solution, mapping functional elements
to processes and threads, and defining how they coordinate and
communicate.

-   Format:

    <format>

    #   ARCHITECTURE: CONCURRENCY VIEW (ARCH-CO)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <arch-co-unit/>
    <arch-co-unit/>
    [...]

    </format>

-   <arch-co-unit/> format:

    <format>

    ##  UNIT ARCH-CO-<arch-co-unit-id/>: <arch-co-unit-name/>

    -   Kind:         <arch-co-unit-kind/>
    -   Hosts:        <arch-co-unit-element/>, [...]
    -   Multiplicity: <arch-co-unit-multiplicity/>
    -   Coordination: <arch-co-unit-coordination/>

    <arch-co-unit-description/>
    (why: <arch-co-unit-rationale/>)

    </format>

-   <arch-co-unit/> details:

    -   <arch-co-unit-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <arch-co-unit-name/>.

    -   <arch-co-unit-name/> is a short (2-5 word) summary of the
        concurrency unit (e.g. `Web Worker Pool`, `Background Scheduler`,
        `Ingest Queue Consumer`).

    -   <arch-co-unit-kind/> is one of:

        -   `Process`:    An independent OS process with its own address space.
        -   `Thread`:     A thread of execution within a process.
        -   `Pool`:       A managed group of interchangeable workers.
        -   `Queue`:      An asynchronous buffer decoupling producers and consumers.
        -   `EventLoop`:  A single-threaded cooperative scheduler of tasks.

    -   <arch-co-unit-element/> is an `ARCH-FV-<arch-fv-element-id/>`
        reference to a functional element that runs inside this
        concurrency unit.

    -   <arch-co-unit-multiplicity/> is how many instances of the unit run
        (e.g. `1`, `1 per CPU core`, `0..n auto-scaled`).

    -   <arch-co-unit-coordination/> is the mechanism by which the unit
        coordinates or communicates with other units (e.g. `shared queue`,
        `mutex`, `message passing`, `optimistic locking`).

    -   <arch-co-unit-description/> is a concise paragraph (1-3 sentences)
        of prose describing how the unit executes and how it avoids or
        manages contention, races, and deadlocks.

    -   <arch-co-unit-rationale/> is the 1-sentence rationale ("why") for
        the chosen concurrency structure.

    -   In case the unit hosts no functional elements, the
        entire `- Hosts:` bullet point is omitted.

    -   In case the rationale is not present, the
        entire `(why: [...])` chunk is omitted.

Development View (DV)
---------------------

The architecture supporting the software development process, defining
the module organization, build approach, and codeline conventions.

-   Format:

    <format>

    #   ARCHITECTURE: DEVELOPMENT VIEW (ARCH-DV)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <arch-dv-aspect/>
    <arch-dv-aspect/>
    [...]

    </format>

-   <arch-dv-aspect/> format:

    <format>

    ##  ASPECT ARCH-DV-<arch-dv-aspect-id/>: <arch-dv-aspect-name/>

    -   Category: <arch-dv-aspect-category/>

    <arch-dv-aspect-description/>
    (why: <arch-dv-aspect-rationale/>)

    </format>

-   <arch-dv-aspect/> details:

    -   <arch-dv-aspect-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <arch-dv-aspect-name/>.

    -   <arch-dv-aspect-name/> is a short (2-5 word) summary of the
        development aspect (e.g. `Module Layering`, `Build Pipeline`,
        `Branching Model`).

    -   <arch-dv-aspect-category/> is the development concern the aspect
        governs, one of `Structure` (module/package organization),
        `Build` (compilation and packaging), `Dependency` (dependency
        management and layering rules), `Codeline` (branching, merging,
        versioning), `Standardization` (coding standards and conventions),
        or `Tooling` (development tools and automation).

    -   <arch-dv-aspect-description/> is a concise paragraph (1-3
        sentences) of prose describing the development convention or
        structure and the rule developers must follow.

    -   <arch-dv-aspect-rationale/> is the 1-sentence rationale ("why")
        for the development aspect.

    -   In case the rationale is not present, the
        entire `(why: [...])` chunk is omitted.

Deployment View (DP)
--------------------

The environment into which the solution is deployed, mapping software
elements to the runtime platform, hardware, and network topology.

-   Format:

    <format>

    #   ARCHITECTURE: DEPLOYMENT VIEW (ARCH-DP)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <arch-dp-node/>
    <arch-dp-node/>
    [...]

    </format>

-   <arch-dp-node/> format:

    <format>

    ##  NODE ARCH-DP-<arch-dp-node-id/>: <arch-dp-node-name/>

    -   Kind:     <arch-dp-node-kind/>
    -   Platform: <arch-dp-node-platform/>
    -   Hosts:    <arch-dp-node-element/>, [...]
    -   Network:  <arch-dp-node-network/>

    <arch-dp-node-description/>
    (why: <arch-dp-node-rationale/>)

    </format>

-   <arch-dp-node/> details:

    -   <arch-dp-node-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <arch-dp-node-name/>.

    -   <arch-dp-node-name/> is a short (2-5 word) summary of the
        deployment node (e.g. `Web Tier`, `Database Cluster`, `Edge CDN`).

    -   <arch-dp-node-kind/> is one of:

        -   `Server`:     A physical or virtual machine.
        -   `Container`:  A containerized runtime (e.g. Docker, OCI).
        -   `Cluster`:    A managed group of nodes (e.g. Kubernetes cluster).
        -   `Function`:   A serverless / function-as-a-service runtime.
        -   `Device`:     An edge or client device.
        -   `Managed`:    A managed cloud service (e.g. managed database, queue).

    -   <arch-dp-node-platform/> is the runtime platform of the node
        (e.g. `Linux x86-64`, `Kubernetes 1.30`, `AWS Lambda (Node.js)`).

    -   <arch-dp-node-element/> is an `ARCH-FV-<arch-fv-element-id/>`
        reference to a functional element deployed onto this node.

    -   <arch-dp-node-network/> is the network placement and connectivity
        of the node (e.g. `public subnet, TLS 443`, `private VLAN`).

    -   <arch-dp-node-description/> is a concise paragraph (1-3 sentences)
        of prose describing the node, its sizing, and its place in the
        deployment topology.

    -   <arch-dp-node-rationale/> is the 1-sentence rationale ("why") for
        the node's placement and platform choice.

    -   In case the node hosts no functional elements, the
        entire `- Hosts:` bullet point is omitted.

    -   In case the rationale is not present, the
        entire `(why: [...])` chunk is omitted.

Operations View (OV)
--------------------

The way the solution is operated, administered, and supported in
production, defining installation, monitoring, and management concerns.

-   Format:

    <format>

    #   ARCHITECTURE: OPERATIONS VIEW (ARCH-OV)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <arch-ov-concern/>
    <arch-ov-concern/>
    [...]

    </format>

-   <arch-ov-concern/> format:

    <format>

    ##  CONCERN ARCH-OV-<arch-ov-concern-id/>: <arch-ov-concern-name/>

    -   Category: <arch-ov-concern-category/>
    -   Element:  <arch-ov-concern-element/>, [...]

    <arch-ov-concern-description/>
    (why: <arch-ov-concern-rationale/>)

    </format>

-   <arch-ov-concern/> details:

    -   <arch-ov-concern-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <arch-ov-concern-name/>.

    -   <arch-ov-concern-name/> is a short (2-5 word) summary of the
        operational concern (e.g. `Rolling Deployment`, `Metrics
        Collection`, `Backup and Restore`).

    -   <arch-ov-concern-category/> is the category of the concern,
        one of `Installation`, `Configuration`, `Provisioning`,
        `Monitoring`, `Logging`, `Alerting`, `Backup`, `Recovery`,
        `Upgrade`, or `Support`.

    -   <arch-ov-concern-element/> is an `ARCH-FV-<arch-fv-element-id/>`
        or `ARCH-DP-<arch-dp-node-id/>` reference to the functional
        element or deployment node the concern applies to.

    -   <arch-ov-concern-description/> is a concise paragraph (1-3
        sentences) of prose describing how the concern is handled in
        production and which procedures or tools support it.

    -   <arch-ov-concern-rationale/> is the 1-sentence rationale ("why")
        for the operational approach.

    -   In case the element reference is not present, the
        entire `- Element:` bullet point is omitted.

    -   In case the rationale is not present, the
        entire `(why: [...])` chunk is omitted.

Quality Perspectives (QP)
-------------------------

How the Non-Functional Requirements (NR) are addressed.

-   Format:

    <format>

    #   ARCHITECTURE: QUALITY PERSPECTIVES (ARCH-QP)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <arch-qp-perspective/>
    <arch-qp-perspective/>
    [...]

    </format>

-   <arch-qp-perspective/> format:

    <format>

    ##  PERSPECTIVE ARCH-QP-<arch-qp-perspective-id/>: <arch-qp-perspective-name/>

    -   Quality:    <arch-qp-perspective-quality/>
    -   Addresses:  <arch-qp-perspective-requirement/>, [...]
    -   Tactic:     <arch-qp-perspective-tactic/>
    -   Affects:    <arch-qp-perspective-element/>, [...]

    <arch-qp-perspective-description/>
    (why: <arch-qp-perspective-rationale/>)

    </format>

-   <arch-qp-perspective/> details:

    -   <arch-qp-perspective-id/>: per-artifact unique "slug" of always
        1-3 lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <arch-qp-perspective-name/>.

    -   <arch-qp-perspective-name/> is a short (2-5 word) summary of the
        quality perspective (e.g. `Horizontal Scaling`, `Defense in
        Depth`, `Graceful Degradation`).

    -   <arch-qp-perspective-quality/> is the quality attribute the
        perspective addresses, one of `Performance`, `Scalability`,
        `Reliability`, `Availability`, `Security`, `Privacy`,
        `Usability`, `Accessibility`, `Maintainability`, `Portability`,
        `Compatibility`, or `Compliance` (aligned with the Non-Functional
        Requirements categories).

    -   <arch-qp-perspective-requirement/> is a
        `SPEC-NR-<spec-nr-requirement-id/>` reference to the corresponding
        Non-Functional Requirement (NR) **Aspect** the perspective addresses.

    -   <arch-qp-perspective-tactic/> is the architectural tactic or
        strategy applied to achieve the quality (e.g. `stateless
        replication behind a load balancer`, `read-through cache`, `circuit
        breaker`).

    -   <arch-qp-perspective-element/> is an `ARCH-FV-<arch-fv-element-id/>`
        or `ARCH-DP-<arch-dp-node-id/>` reference to the functional
        element or deployment node the tactic affects.

    -   <arch-qp-perspective-description/> is a concise paragraph (1-3
        sentences) of prose describing how the architecture satisfies the
        quality attribute across the affected elements.

    -   <arch-qp-perspective-rationale/> is the 1-sentence rationale
        ("why") for the chosen tactic over alternatives.

    -   In case the element reference is not present, the
        entire `- Affects:` bullet point is omitted.

    -   In case the rationale is not present, the
        entire `(why: [...])` chunk is omitted.

Decision Record (DR)
--------------------

The major decisions related to the architecture, each recording the
forces at play, the chosen response, and the reasoning that justifies it.

-   Format:

    <format>

    #   ARCHITECTURE: DECISION RECORD (ARCH-DR)

    ✳   Created:  **<timestamp-created/>**
    ✎   Modified: **<timestamp-modified/>**

    <arch-dr-decision/>
    <arch-dr-decision/>
    [...]

    </format>

-   <arch-dr-decision/> format:

    <format>

    ##  DECISION ARCH-DR-<arch-dr-decision-id/>: <arch-dr-decision-name/>

    -   Status:    <arch-dr-decision-status/>
    -   Affects:   <arch-dr-decision-element/>, [...]
    -   Created:   <arch-dr-decision-created/>
    -   Modified:  <arch-dr-decision-modified/>

    -   WHEN (Context):
        <arch-dr-decision-context/>

    -   WHAT (Decision):
        <arch-dr-decision-decision/>

    -   WHY (Rationale):
        <arch-dr-decision-rationale/>

    -   NOTES (Background):
        <arch-dr-decision-notes/>

    </format>

-   <arch-dr-decision/> details:

    -   <arch-dr-decision-id/>: per-artifact unique "slug" of always 1-3
        lower-cased words (concatenated with "-" characters and
        in total not longer than 30 characters), derived from
        <arch-dr-decision-name/>.

    -   <arch-dr-decision-name/> is a short summary of the
        <arch-dr-decision-decision/>, not longer than 80 characters.

    -   <arch-dr-decision-status/> is one of `proposed`, `accepted`,
        `deprecated`, or `superseded by ARCH-DR-<arch-dr-decision-id/>`.

    -   <arch-dr-decision-element/> is an `ARCH-FV-<arch-fv-element-id/>`
        or `ARCH-DP-<arch-dp-node-id/>` reference to the functional
        element or deployment node the decision affects.

    -   <arch-dr-decision-created/> is the timestamp when this decision was
        created, and <arch-dr-decision-modified/> is the timestamp when
        this decision was last modified, both in the same ISO-style format
        as the **Artifact**'s own timestamps.

    -   <arch-dr-decision-context/> captures the situation that forces the
        decision — the "why are we even talking about this" part. It
        describes the situation as it is, before the decision is made. The
        following usually goes into it: the problem or need (what's broken,
        missing, or about to change that requires a decision); the forces at
        play (technical constraints, business requirements, deadlines, team
        skills, existing systems, regulatory/compliance pressures — often
        competing, and that tension is the whole point); relevant facts
        (current architecture, prior decisions, assumptions, what's known
        and what's uncertain); and scope/boundaries (what this decision is
        and isn't about). It is written neutrally and factually. It should
        not contain the decision itself, nor advocate for an option — a
        reader should be able to read it, pause, and arrive at the decision
        themselves because the forces make it (nearly) inevitable.

    -   <arch-dr-decision-decision/> states what is actually going to be
        done — the chosen response to the forces laid out in the context. It
        is written in active, assertive voice, in the present or imperative
        tense, as a committed position rather than a discussion. The
        following usually goes into it: the choice itself (clearly and
        unambiguously) and the essence of how (enough of the approach to
        make the choice concrete — the mechanism, pattern, or technology —
        but not a full implementation specification). It is a declaration,
        not a deliberation, usually using the wording "We use..." or "We
        do...", active, definite, owning the choice. Avoid hedging ("we
        might", "we could consider") — the deliberation already happened,
        the decision records the verdict.

    -   <arch-dr-decision-rationale/> is the reasoning that justifies the
        decision — the bridge that explains why this choice, given those
        forces. It answers "Of all the things we could have done, why was
        this the right one?". Where the context states the forces and the
        decision states the choice, the rationale is the logical connective
        tissue between them — it shows that the decision actually follows
        from the context. The following usually goes into it: the deciding
        factors (which forces from the context carried the most weight, and
        how the chosen option satisfies them best); the trade-off reasoning
        (what was optimized for and what was knowingly sacrificed — naming
        the trade-off is the heart of rationale); why the alternatives lost
        (the comparative argument: "option B failed on X, option C cost too
        much on Y"); and assumptions and evidence (benchmarks, prior
        experience, constraints, or principles the reasoning rests on).

    -   <arch-dr-decision-notes/> is *OPTIONAL* and can be omitted when it
        does not add genuine value — most decisions won't need it. The
        following usually goes into it: information of the decision *process*
        (e.g. a weighted decision matrix of considered alternatives);
        consequences of the decision (but only when non-obvious downstream
        effects need to be called out); and links to strongly related
        decisions.

    -   <arch-dr-decision-context/>, <arch-dr-decision-decision/>, and
        <arch-dr-decision-rationale/> are each just a single paragraph of
        concise and brief prose text, usually comprised of just 1 to 3
        sentences. The value of a decision is in recording *that* a decision
        was made and *why* — not in filling out sections of a document.

    -   For the relationship between context, decision, and rationale, good
        checks are: the "litmus test" is that context = forces, decision =
        response to those forces, rationale = why the decision answers the
        forces in the context. The decision should feel like the natural,
        almost inevitable answer to the context — if a reader is surprised
        by the decision, either the context is missing a force, or the
        decision is under-justified. The rationale should make the decision
        feel earned, not asserted — if you would delete the rationale and
        the decision suddenly looks arbitrary, the rationale was doing its
        job.

    -   In case the element reference is not present, the
        entire `- Affects:` bullet point is omitted.

    -   In case the `NOTES (Background)` content is not present, the
        entire `NOTES (Background)` chunk is omitted.

-   A decision *MUST* qualify on all of the following three tenets:

    -   **Hard to Reverse**: the cost of changing it later is meaningful
        ("Oh my god, this would result in a dramatic refactoring!"). So,
        if a decision is easy to reverse, just skip it.

    -   **Surprising without Context**: a future architect will look at
        the code and wonder ("Why on earth did they do it this way?").
        So, if a decision is not surprising, nobody will wonder why.

    -   **Result of a Real Trade-Off**: there were genuine alternatives
        and one was picked for specific reasons ("We deliberately chose
        this, because..."). So, if there was no real alternative,
        there's nothing to record beyond "we did the obvious thing."

-   The following typically qualify as a decision:

    -   **Architectural shape.** "We're using a monorepo." "The write
        model is event-sourced, the read model is projected into PostgreSQL."

    -   **Integration patterns between contexts.** "Ordering and Billing
        communicate via domain events, not synchronous HTTP."

    -   **Technology choices that carry lock-in.** Database, message bus,
        auth provider, deployment target. Not every library — just the
        ones that would take a quarter to swap out.

    -   **Boundary and scope decisions.** "Customer data is owned by the
        Customer context; other contexts reference it by ID only." The explicit
        no-s are as valuable as the yes-s.

    -   **Deliberate deviations from the obvious path.** "We're using
        manual SQL instead of an ORM because X." Anything where a reasonable
        reader would assume the opposite. These stop the next engineer from
        "fixing" something that was deliberate.

    -   **Constraints not visible in the code.** "We can't use AWS because
        of compliance requirements." "Response times must be under 200ms because
        of the partner API contract."

    -   **Rejected alternatives when the rejection is non-obvious.** If
        you considered GraphQL and picked REST for subtle reasons, record it —
        otherwise someone will suggest GraphQL again in six months.

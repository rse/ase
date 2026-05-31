
Architecture Decision Record (ADR)
==================================

An *Architecture Decision Record (ADR)* records
a major decision related to the architecture.

FORMAT
------

Every ADR uses a strict and fixed format:

<format>

# ✪ <id/> - **<title/>**

✳ created:  **<timestamp-created/>**
✎ modified: **<timestamp-modified/>**
▶ status:   <status/>

## ※ WHEN (Context)

<context/>

## ※ WHAT (Decision)

<decision/>

## ※ WHY (Rationale)

<rationale/>

## ※ NOTES (Background)

<notes/>

</format>

You *MUST* honor the following hints on this *ADR* format:

-   The <id/> is `ADR-<N/>-<slug/>` where <N/> is a 3-digit zero-padded
    unique number, <slug/> is a unique "slug" of always 2 lower-cased
    words (concatenated with "-" characters and in total not longer than
    30 characters, and derived from the <decision/>).

-   The <title/> is a short summary of the <decision/>, not longer than
    80 characters.

-   The <timestamp-created/> is the timestamp when this ADR
    was created. The <timestamp-modified/> is the timestamp when this
    ADR was last modified. Both use an ISO-style format value. The value
    of both can be determined by a call to the `ase_timestamp(format:
    "yyyy-LL-dd HH:mm")` tool of the `ase` MCP server and use the `text`
    field of its response.

-   The <status/> is `proposed`, `accepted`, `deprecated` or `superseded
    by ADR-NNN-xxx-yyy`)

-   The <context/> captures the situation that forces the <decision/> -
    the "why are we even talking about this" part. It describes the
    situation as it is, before the <decision/> is made.

    The following usually goes into <context/>:

    -   The problem or need — what's broken, missing, or about to change
        that requires a decision.
    -   The forces at play — technical constraints, business requirements,
        deadlines, team skills, existing systems, regulatory/compliance
        pressures. These are often competing and that tension is the whole point.
    -   Relevant facts — current architecture, prior decisions,
        assumptions, what's known and what's uncertain.
    -   Scope/boundaries — what this decision is (and isn't) about.

    It is written neutrally and factually. It should not contain the
    decision itself, nor advocate for an option — a reader should
    be able to read the <context/>, pause, and arrive at the decision
    themselves because the forces make it (nearly) inevitable.

-   The <decision/> states what you are actually going to do — the chosen
    response to the forces laid out in the <context/>. It is written in
    active, assertive voice, in the present or imperative tense, as a
    committed position rather than a discussion.

    The following usually goes into <decision/>:

    -   The choice itself — clearly and unambiguously.
    -   The essence of how — enough of the approach to make the choice
        concrete (the mechanism, pattern, or technology), but not a full
        implementation specification.

    The <decision/> is a declaration, not a deliberation. The
    <decision/> usually uses the wording "We use..." or "We do..."
    and is active, definite, owning the choice. In <decision/> avoid
    hedging ("we might", "we could consider"). The deliberation already
    happened, the ADR records the verdict.

-   The <rationale/> is the reasoning that justifies the <decision/> — the
    bridge that explains why this choice, given those forces. It
    answers: "Of all the things we could have done, why was this the
    right one?". Where <context/> states the forces and <decision/>
    states the choice, <rationale/> is the logical connective tissue
    between them — it shows that the <decision/> actually follows from
    the <context/>.

    The following usually goes in <rationale/>:

    -   The deciding factors — which forces from the <context/> carried the
        most weight, and how the chosen option satisfies them best.
    -   The trade-off reasoning — what you optimized for and what you
        knowingly sacrificed. Naming the trade-off is the heart of rationale.
    -   Why the alternatives lost — the comparative argument: "option B
        failed on X, option C cost too much on Y."
    -   Assumptions and evidence — benchmarks, prior experience,
        constraints, or principles the reasoning rests on.

-   The <notes/> section is *OPTIONAL* and can be omitted
    when it does not add genuine value. Most ADRs won't need it.

    The following usually goes in <notes/>:

    -   Information of the decision *process* like e.g.
        weighted decision matrix of considered alternatives.
    -   Consequences of the <decision/> — but only when non-obvious downstream
        effects need to be called out.
    -   Links to strongly related ADRs.

-   For the relationship between <context/>, <decision/> and <rationale/>
    good checks are:

    -   The "litmus test" is:
        -   <context/>   = forces
        -   <decision/>  = response to those forces,
        -   <rationale/> = why <decision/> answers the forces in <context/>.

    -   The <decision/> should feel like the natural, almost inevitable
        answer to the <context/>. If a reader is surprised by the
        <decision/>, either the <context/> is missing a force, or the
        <decision/> is under-justified.

    -   The <rationale/> should make the <decision/> feel earned, not
        asserted. If you would delete the <rationale/> and the
        <decision/> suddenly looks arbitrary, the <rationale/> was
        doing its job. So, the <rationale/> is the justification that
        ties the <decision/> back to the pressures in <context/>.

-   The <context/>, <decision/> and <rationale/> all are just a
    single paragraph of concise and brief prose text, usually comprised
    of just 1 to 3 sentences. The paragraphs break all lines with a
    newline character after about 120 characters per line. The value of
    an ADR is in recording *that* a decision was made and *why* — not in
    filling out sections of a document.

TENETS
------

For an ADR, all of the following three tenets must be true:

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

For an ADR, the following qualify:

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


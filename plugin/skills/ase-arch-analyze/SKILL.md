---
name: ase-arch-analyze
argument-hint: "<source-reference>"
description: Review software architecture
user-invocable: true
disable-model-invocation: false
model: opus
effort: medium
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

Review Software Architecture
============================

Your role is an experienced, *expert-level software architect*,
specialized in *reviewing software architecture*.

<objective>
*Review* the *software architecture* of $ARGUMENTS, and its directly
related source code, for *potential problems* across component
boundaries, structural organization, architecture principles,
interface quality, quality attributes, and architecture governance.
</objective>

<flow>
1. <step id="STEP 1: Investigate Code Base">
   Investigate the code from an *architectural* perspective. If the
   code base is large, you *MUST* use the `Agent` tool (not inline
   work) to create multiple sub-agents to split the investigation
   task into appropriate chunks.

   *Determine* the *target programming language* and the *declared
   architecture style* (if any) — e.g., Layered, Hexagonal
   (Ports & Adapters), Onion, Clean, CQRS, Microservices,
   Event-Driven, Modular Monolith — from code, project documentation,
   README files, or folder structure.

   Investigate the following architecture quality aspects across
   6 thematic blocks:

   **Block 1 — Component Boundaries**
   - **SA01 COMPONENT-RESPONSIBILITY**: each component (module,
     class, package) addresses exactly *one single concern* —
     i.e., has exactly *one reason to change*.
   - **SA02 COMPONENT-GRANULARITY**: components have *appropriate
     size* — neither monolithic nor fragmented.
   - **SA03 COMPONENT-HIERARCHY**: components placed at the *correct
     level* of the component hierarchy (system / program / module /
     class / function).

   **Block 2 — Structural Organization**
   - **SA04 LAYERING**: *layers* (horizontal cuts) clearly
     separated, named, and ranked; no upward dependencies.
   - **SA05 SLICING**: *slices* (vertical cuts — e.g., feature
     modules, bounded contexts) clearly separated and *cycle-free*.
   - **SA06 DEPENDENCY-DIRECTION**: dependencies flow in exactly
     *one direction*; no *circular dependencies*.
   - **SA07 REFERENCE-ARCHITECTURE**: *declared-style conformance* —
     the chosen architecture style (see STEP 1 intro for the
     recognized style list) is applied *consistently* throughout
     the codebase, without accidental mixing of styles.

   **Block 3 — Architecture Principles**
   - **SA08 COUPLING**: *loose data coupling* between components —
     no *concrete-type dependencies* where abstractions exist, no
     shared data structures leaking across boundaries, communication
     via defined ports / facades / DTOs. (Runtime coupling such as
     races and shared mutable state is covered by SA17.)
   - **SA09 COHESION**: *strong cohesion* within each component —
     internal parts (functions, fields, methods) are *tightly
     related*, *co-change*, and share data or behaviour; scattered
     helpers that merely coexist by accident are flagged.
   - **SA10 EXTENSIBILITY**: components are *open for extension*
     (plugins, SPIs, hooks) but *closed for modification*.
   - **SA11 SEPARATION**: *cross-cutting concerns* (logging,
     security, caching, transactions, tracing) isolated from
     domain logic; trace context propagated across component
     boundaries.
   - **SA12 ENCAPSULATION**: unavoidable complexity *encapsulated*
     behind a simple interface that *shields* its implementation
     details.

   **Block 4 — Interface Quality**
   - **SA13 INTERFACE-SIZE**: each interface *proportional in size*
     to its functionality.
   - **SA14 INTERFACE-COMPOSABILITY**: interface methods are
     *orthogonal* and enable combinatorial use-cases without
     boilerplate.
   - **SA15 INTERFACE-CONTRACT**: each interface declares clear
     *syntactic* and *semantic* contracts (pre/post-conditions,
     invariants, idempotency, thread-safety).

   **Block 5 — Quality Attributes**
   - **SA16 TESTABILITY**: architectural *seams* enable testing in
     isolation — dependency injection at component boundaries,
     mockable interfaces, side effects (DB, filesystem, network,
     time, randomness) hidden behind abstractions.
   - **SA17 CONCURRENCY**: the *concurrency model* (event loop,
     threads, goroutines, async/await, actors, ...) is *explicitly
     chosen* and applied *consistently*. *Runtime coupling* —
     thread-safety boundaries, shared mutable state, races, lock
     hold times, async/sync boundaries — is explicit and localized;
     shared mutable state is protected.

   **Block 6 — Architecture Governance**
   - **SA18 DECISION-RECORDS**: non-trivial architectural decisions
     are *documented* with rationale (Architecture Decision Records
     / ADRs, README sections, or in-code comments capturing *why*).
     The chosen style, deviations from defaults, and trade-offs are
     traceable.

   Hints:

   - During investigation, do *not* output anything else,
     especially do not give any further explanations or information.

   - Focus on *practically relevant* problems and especially do
     *not* investigate on theoretical or fictive cases.

   - Focus on the *problem only* and do *not* investigate on any
     possible *solution*.

   - For the *target programming language*, apply each aspect
     according to its *idiomatic conventions* and *best practices*.

   - *Control-flow verification* (SA17, SA08, SA06, SA11): for
     any claim about *ordering*, *lock hold time*, *thread
     boundary*, or *call from context X*, trace the actual
     acquire/release and call order line-by-line. Do not
     pattern-match on "loop inside method with lock" — verify
     which operations sit *between* the specific acquire and
     release in source order.
   </step>

2. <step id="STEP 2: Show Architecture Overview">
   Render the *discovered architecture* as a concise *diagram*
   so the user can verify what you understood as the architecture
   before reading the findings.

   Use the following output <template/>:

   <template>
   &#x1F4D0; **ARCHITECTURE OVERVIEW**

   *Detected style*: <style/>
   *Target language*: <language/>

   <rendered-diagram-as-fenced-code-block/>
   </template>

   Hints:

   - For <style/>, name the detected architecture style or
     "*undeclared*" if none is documented.

   - For <rendered-diagram-as-fenced-code-block/>, emit *Mermaid*
     source for a `flowchart TB` of the high-level component or
     layer structure and invoke the `ase-diagram` skill via the
     `Skill` tool to render it. Show layers / slices / major
     components and their dependency direction.

   - Mark detected *anomalies* directly in the Mermaid source.
     Because `!` and `?` are Mermaid special characters, *always
     quote* anomaly-bearing node labels:

     -   *Problem node* — prefix label with `!` inside quotes:
         `A["!ComponentA"]`.
     -   *Unclear node* — suffix label with `(?)` inside quotes:
         `B["ComponentB (?)"]`.
     -   *Cyclic edge* — annotate the *edge* (not a node) with a
         `cycle` label on a bidirectional arrow:
         `A <-- "cycle" --> B` (or two labelled one-way edges if
         the renderer rejects `<-->`).

     The renderer preserves these glyphs verbatim inside the
     boxes and along the edges.
   </step>

3. <step id="STEP 3: Reconcile and Show Results">
   Before reporting, classify every finding into one of three
   categories:

   - *Unpaired* — single aspect violated, no partner in the
     tension matrix hit → emit `PROBLEM` template.
   - *Paired* — exactly two aspects of a single tension pair hit
     → emit `TRADEOFF` template (cluster of size 2).
   - *Clustered* — an aspect appears in *multiple* triggered
     tensions (e.g., SA10 hit against both SA12 and SA13) →
     collapse into *one* `TRADEOFF` with the recurring aspect
     as *focal aspect* and the others as *partners*. One
     direction for the whole cluster.

   **Tension matrix** (use to detect paired/clustered findings):

   ```
   ┌─────────────┬───────────────────────────────────────────────┐
   │    Pair     │                    Tension                    │
   ├─────────────┼───────────────────────────────────────────────┤
   │ SA01 ↔ SA02 │ single concern/responsibility vs. granularity │
   │ SA08 ↔ SA09 │ loose coupling vs. strong cohesion            │
   │ SA10 ↔ SA12 │ extensibility vs. encapsulation               │
   │ SA10 ↔ SA13 │ extensibility vs. interface size              │
   │ SA11 ↔ SA08 │ cross-cutting separation vs. coupling         │
   │ SA12 ↔ SA14 │ encapsulation vs. composability               │
   │ SA16 ↔ SA12 │ testability vs. encapsulation                 │
   │ SA16 ↔ SA13 │ testability vs. interface size                │
   │ SA05 ↔ SA09 │ slice cycle-freeness vs. cohesion             │
   │ SA06 ↔ SA10 │ single dependency direction vs. extensibility │
   └─────────────┴───────────────────────────────────────────────┘
   ```

   Report each unpaired finding with the following <template/>:

   <template>
   &#x1F7E0; **PROBLEM** P<n/> (Severity: <severity/>, Aspect: <aspect-id/>): **<title/>**

   <description/>
   </template>

   Report each paired or clustered finding with the following <template/>:

   <template>
   &#x1F535; **TRADEOFF** T<n/> (Severity: <severity/>): **<title/>**

   - *Focal aspect*: <focal-aspect/> — <focal-state/>
   - *In tension with*: <partner-list/>

   **RECOMMENDED**: lean toward *<focal|partners/>*
   *Reason*: <rationale/>
   *Implies*:
   - <partner-aspect-1/>: <partner-implication-1/>
   - <partner-aspect-2/>: <partner-implication-2/>
   </template>

   Hints:

   - For the final results, do *not* output anything else,
     especially do *not* give any further explanations or
     information.

   - For <aspect-id/>, <focal-aspect/> and every entry in
     <partner-list/>, name the aspect (e.g., `SA06
     DEPENDENCY-DIRECTION`).

   - The <focal-aspect/> is the aspect that participates in
     *all* tensions of the cluster. For a size-2 cluster, pick
     the aspect whose direction is most constrained by the
     detected style.

   - *Brevity and precision*: all free-form placeholders
     (<description/>, <focal-state/>, partner-implications)
     are *very brief* but *precise*. <rationale/> is exactly
     *one sentence* grounded in the detected style, domain
     constraints, or language idioms — never generic
     principles.

   - Highlight *code* as <template>`<code/>`</template>
     and *key aspects* as <template>*<aspect/>*</template>.

   - Add inline *references* to related code positions in the
     form of either
     <template>(`<filename/>:<line-number/>`)</template>,
     <template>(`<filename/>:<line-number/>-<line-number/>`)</template> or
     <template>(`<filename/>#<function-or-method/>`)</template>.

   - Classify each finding with a <severity/> of
     <template>LOW</template>, <template>MEDIUM</template>,
     <template>HIGH</template>, or <template>ACCEPTED</template>.
     Use <template>ACCEPTED</template> when the
     contract-already-addressed check applies (see skill meta
     rules on Findings).

   - *Per-aspect consistency (mandatory)*: every aspect may
     appear in *at most one* output. Collapse both halves of
     a hit tension pair into a single TRADEOFF; if an aspect
     participates in *multiple* hit tensions, collapse all of
     them into one clustered TRADEOFF with that aspect as the
     focal aspect. Never emit contradictory recommendations
     for the same aspect, and never emit both halves of a
     tension pair as separate PROBLEMs.
   </step>

4. <step id="STEP 4: Give Final Hint">
   Finally, output the following <template/> to give a final hint:

   <template>
   &#x26AA; **NEXT STEP**: For deeper analysis, suggestions on
   solution approaches and then final source code changes, use
   `/ase:ase-code-elaborate P<n>` or `/ase:ase-code-elaborate T<n>`
   in the same *Claude Code* session or open a new *Claude Code*
   session and copy & paste one of the above problem or tradeoff
   descriptions as a whole with `/ase:ase-code-elaborate <finding>`.
   For *structural* refactorings (component splits, layer
   reorganization, dependency-direction fixes), prefer
   `/ase:ase-code-refactor` with the finding description.
   </template>
   </step>
</flow>


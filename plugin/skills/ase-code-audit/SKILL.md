---
name: ase-code-audit
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
interface quality, and style conformance.
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
   Event-Driven, Modular Monolith — from project documentation,
   README files, or folder structure.

   Investigate the following architecture quality aspects across
   6 thematic blocks:

   **Block 1 — Component Boundaries**
   - **SA01 COMPONENT-CONCERNS**: each component (module, class,
     package) addresses exactly *one clear concern*.
   - **SA02 COMPONENT-RESPONSIBILITY**: each component has exactly
     *one reason to change*.
   - **SA03 COMPONENT-GRANULARITY**: components have *appropriate
     size* — neither monolithic nor fragmented.
   - **SA04 COMPONENT-HIERARCHY**: components placed at the *correct
     level* of the component hierarchy (system / program / module /
     class / function or its language equivalent).

   **Block 2 — Structural Organization**
   - **SA05 LAYERING**: *layers* (horizontal cuts) clearly
     separated, named, and ranked; no upward dependencies.
   - **SA06 SLICING**: *slices* (vertical cuts — e.g., feature
     modules, bounded contexts) clearly separated and *cycle-free*.
   - **SA07 DEPENDENCY-DIRECTION**: dependencies flow in exactly
     *one direction*; no *circular dependencies*.
   - **SA08 REFERENCE-ARCHITECTURE**: conformance to the *declared
     reference architecture* model, if any.

   **Block 3 — Architecture Principles**
   - **SA09 COUPLING**: *loose coupling* between components — no
     shared mutable state, no concrete-type dependencies where
     abstractions exist.
   - **SA10 COHESION**: *strong cohesion* within each component —
     internal parts work toward the component's single concern.
   - **SA11 EXTENSIBILITY**: components are *open for extension*
     (plugins, SPIs, hooks) but *closed for modification*.
   - **SA12 SEPARATION**: *cross-cutting concerns* (logging,
     security, caching, transactions) isolated from domain logic.
   - **SA13 ENCAPSULATION**: unavoidable complexity *encapsulated*
     behind a simple interface.

   **Block 4 — Interface Quality**
   - **SA14 INTERFACE-SIZE**: each interface *proportional in size*
     to its functionality.
   - **SA15 INTERFACE-ABSTRACTION**: each interface *shields* its
     implementation details.
   - **SA16 INTERFACE-COMPOSABILITY**: interface methods are
     *orthogonal* and enable combinatorial use-cases without
     boilerplate.
   - **SA17 INTERFACE-CONTRACT**: each interface declares clear
     *syntactic* and *semantic* contracts (pre/post-conditions,
     invariants, idempotency, thread-safety).

   **Block 5 — Style Conformance**
   - **SA18 STYLE-DECLARATION**: overall *architecture style*
     explicitly chosen and documented.
   - **SA19 STYLE-CONSISTENCY**: chosen style applied *consistently*
     throughout the codebase, without accidental mixing.
   - **SA20 PATTERN-USAGE**: design patterns (Facade, Adapter,
     Strategy, Observer, Factory, Builder, Decorator, Command,
     Repository) *correctly implemented* and *not overused*.

   **Block 6 — Quality Attributes**
   - **SA21 TESTABILITY**: architectural *seams* enable testing in
     isolation — dependency injection at component boundaries,
     mockable interfaces, side effects (DB, filesystem, network,
     time, randomness) hidden behind abstractions.
   - **SA22 OBSERVABILITY**: *logging*, *metrics*, and *tracing*
     are wired in as *cross-cutting concerns* (via middleware,
     decorators, aspects) rather than scattered ad-hoc through
     business logic. Trace context is propagated across component
     boundaries.
   - **SA23 DECISION-RECORDS**: non-trivial architectural decisions
     are *documented* with rationale (Architecture Decision Records
     / ADRs, README sections, or in-code comments capturing *why*).
     The chosen style, deviations from defaults, and trade-offs are
     traceable.
   - **SA24 CONCURRENCY**: the *concurrency model* (event loop,
     threads, goroutines, async/await, actors, ...) is *explicitly
     chosen* and applied *consistently*. Thread-safety boundaries
     between components are clear; shared mutable state is
     localized and protected.

   Hints:

   - During investigation, do *not* output anything else,
     especially do not give any further explanations or information.

   - Focus on *practically relevant* problems and especially do
     *not* investigate on theoretical or fictive cases.

   - Focus on the *problem only* and do *not* investigate on any
     possible *solution*.

   - For the *target programming language*, apply each aspect
     according to its *idiomatic conventions* and *best practices*.
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
     source for a `flowchart TB` (or `LR`) of the high-level
     component or layer structure and render it via `ase diagram`
     per the *Diagrams* rules in the skill meta. Show layers /
     slices / major components and their dependency direction.

   - Mark detected *anomalies* directly in the Mermaid source as
     node labels or edge labels: prefix problem nodes with `!`,
     cycles with `◀─▶`, unclear parts with `(?)`. The renderer
     preserves these glyphs verbatim inside the boxes.
   </step>

3. <step id="STEP 3: Reconcile and Show Results">
   Before reporting, classify every finding into one of three
   categories:

   - *Unpaired* — single aspect violated, no partner in the
     tension matrix hit → emit `PROBLEM` template.
   - *Paired* — exactly two aspects of a single tension pair hit
     → emit `TRADEOFF` template (cluster of size 2).
   - *Clustered* — an aspect appears in *multiple* triggered
     tensions (e.g., SA11 hit against both SA13 and SA14) →
     collapse into *one* `TRADEOFF` with the recurring aspect
     as *focal aspect* and the others as *partners*. One
     direction for the whole cluster.

   **Tension matrix** (use to detect paired/clustered findings):

   ```
   ┌──────────────────┬───────────────────────────────────────────────┐
   │       Pair       │                    Tension                    │
   ├──────────────────┼───────────────────────────────────────────────┤
   │ SA01/SA02 ↔ SA03 │ single concern/responsibility vs. granularity │
   │ SA09      ↔ SA10 │ loose coupling vs. strong cohesion            │
   │ SA11      ↔ SA13 │ extensibility vs. encapsulation               │
   │ SA11      ↔ SA14 │ extensibility vs. interface size              │
   │ SA12      ↔ SA09 │ cross-cutting separation vs. coupling         │
   │ SA15      ↔ SA16 │ interface abstraction vs. composability       │
   │ SA21      ↔ SA13 │ testability vs. encapsulation                 │
   │ SA21      ↔ SA14 │ testability vs. interface size                │
   │ SA22      ↔ SA01 │ observability vs. single concern              │
   │ SA22      ↔ SA09 │ observability vs. coupling                    │
   │ SA06      ↔ SA10 │ slice cycle-freeness vs. cohesion             │
   │ SA20      ↔ SA11 │ pattern restraint vs. extensibility           │
   │ SA07      ↔ SA11 │ single dependency direction vs. extensibility │
   └──────────────────┴───────────────────────────────────────────────┘
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
   *Implies*: <partner-implications/>
   </template>

   Hints:

   - For the final results, do *not* output anything else,
     especially do *not* give any further explanations or
     information.

   - *Control-flow verification* (SA24, SA09, SA07, SA22): for
     any claim about *ordering*, *lock hold time*, *thread
     boundary*, or *call from context X*, trace the actual
     acquire/release and call order line-by-line. Do not
     pattern-match on "loop inside method with lock" — verify
     which operations sit *between* the specific acquire and
     release in source order.

   - Uniquely identify problems with `P<n/>` and tradeoffs with
     `T<n/>` where <n/> is 1, 2, ...

   - For <aspect-id/>, <focal-aspect/> and every entry in
     <partner-list/>, name the aspect (e.g., `SA07
     DEPENDENCY-DIRECTION`).

   - The <focal-aspect/> is the aspect that participates in
     *all* tensions of the cluster. For a size-2 cluster, pick
     the aspect whose direction is most constrained by the
     detected style.

   - In <description/>, <focal-state/>, and <partner-implications/>,
     use *very brief* but as *precise* as possible descriptions.

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

   - In <rationale/>, justify the chosen direction in *one
     sentence* with reference to style, domain constraints, or
     language idioms — not generic principles.

   - In <partner-implications/>, name what accepting the chosen
     direction means for each partner in one short bullet per
     partner.

   - *Per-aspect consistency (mandatory)*: every aspect may
     appear in *at most one* TRADEOFF output. If the same
     aspect is hit in several tensions, they *MUST* collapse
     into a single clustered TRADEOFF — never emit contradictory
     recommendations for the same aspect across separate
     TRADEOFFs.

   - Do *not* emit both halves of a tension pair as separate
     PROBLEMs; always collapse into one TRADEOFF.
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


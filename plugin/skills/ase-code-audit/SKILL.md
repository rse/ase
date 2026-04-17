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

   Investigate the following 20 architecture quality aspects across
   5 thematic blocks:

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
   Render the *discovered architecture* as a concise *ASCII
   diagram* so the user can verify what you understood as the
   architecture before reading the findings.

   Use the following output <template/>:

   <template>
   &#x1F4D0; **ARCHITECTURE OVERVIEW**

   *Detected style*: <style/>
   *Target language*: <language/>

   <ascii-diagram-as-fenced-code-block/>
   </template>

   Hints:

   - For <style/>, name the detected architecture style or
     "*undeclared*" if none is documented.

   - For <ascii-diagram-as-fenced-code-block/>, output a markdown
     fenced code block containing a *box-and-arrow* diagram of the
     high-level component or layer structure. Show layers / slices
     / major components and their dependency direction. Keep the
     diagram under ~25 lines. Example shape (inside a fenced code
     block):

     ┌───────────────┐
     │   UI Layer    │  WebController, Views
     └───────┬───────┘
             │
             ▼
     ┌───────────────┐
     │ Service Layer │  UserService, OrderService
     └───────┬───────┘
             │
             ▼
     ┌───────────────┐
     │  Data Layer   │  UserRepo, OrderRepo
     └───────────────┘

   - Mark detected *anomalies* directly in the diagram with
     symbols like `!` (problem), `◀─▶` (cycle), `(?)` (unclear).
   </step>

3. <step id="STEP 3: Show Results">
   For every detected problem, immediately report it with the
   following output <template/>, based on concise bullet points.

   <template>
   &#x1F7E0; **PROBLEM** P<n/> (Severity: <severity/>, Aspect: <aspect-id/>): **<title/>**

   <description/>
   </template>

   Hints:

   - For the final results, do *not* output anything else,
     especially do *not* give any further explanations or
     information.

   - Uniquely identify the problems with `P<n/>` where <n/> is
     1, 2, ...

   - For <aspect-id/>, name the violated aspect (e.g., `SA07
     DEPENDENCY-DIRECTION`).

   - In <description/>, use *very brief* but as *precise* as
     possible problem descriptions.

   - In <description/>, highlight *code* as <template>`<code/>`</template>
     and *key aspects* as <template>*<aspect/>*</template>.

   - In <description/>, add inline *references* to the related
     code positions in the form of either
     <template>(`<filename/>:<line-number/>`)</template>,
     <template>(`<filename/>:<line-number/>-<line-number/>`)</template> or
     <template>(`<filename/>#<function-or-method/>`)</template>.

   - In <description/>, classify the problem with a <severity/>
     of <template>LOW</template>, <template>MEDIUM</template> or
     <template>HIGH</template>.
   </step>

4. <step id="STEP 4: Give Final Hint">
   Finally, output the following <template/> to give a final hint:

   <template>
   &#x26AA; **NEXT STEP**: For deeper analysis, suggestions on
   solution approaches and then final source code changes, use
   `/ase:ase-code-elaborate P<n>` in the same *Claude Code* session
   or open a new *Claude Code* session and copy & paste one of the
   above problem descriptions as a whole with
   `/ase:ase-code-elaborate <problem>`. For *structural*
   refactorings (component splits, layer reorganization,
   dependency-direction fixes), prefer `/ase:ase-code-refactor`
   with the problem description.
   </template>
   </step>
</flow>


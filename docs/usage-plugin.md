
Usage of Plugin
===============

![workflow](workflow.svg)

### Meta Commands

The following ASE commands/skills exist on the meta-level:

- **/ase-meta-brainstorm** *topic*:<br/>
  Collaboratively brainstorm a topic by clarifying intent, diverging
  into a broad space of candidate ideas, then converging through
  clustering and scoring into a shortlist with a single recommended
  direction. Helps figure out *what* to build before *how* to build it.

- **/ase-meta-search** *query*:<br/>
  Search the Internet/Web with a query.

- **/ase-meta-chat** *llm* *query*:<br/>
  Query a foreign LLM like OpenAI ChatGPT, Google Gemini, DeepSeek or
  xAI Grok.

- **/ase-meta-quorum** *question*:<br/>
  Query multiple AIs for a quorum answer.

- **/ase-meta-why** *fact*:<br/>
  Perform a Five-Whys root-cause analysis.

- **/ase-meta-evaluate** *alternatives*:<br/>
  Evaluate alternatives through an ad-hoc weighted multi-criteria
  decision matrix.

- **/ase-meta-diaboli** *thesis*:<br/>
  Challenge a thesis by relentlessly playing *Devil's Advocate* (latin:
  *Advocatus Diaboli*), then derive a *Hegelian* synthesis.

- **/ase-meta-steelman** *thesis*:<br/>
  Strengthen a thesis by building the strongest possible *Steelman* case
  for it, then derive a fortification.

- **/ase-meta-persona** \[*persona*\]:<br/>
  Adjust communication style in four intensity levels of token usage.
  The *persona* can be either a decorative, eloquent, and explaining
  `writer`, a brief, factual, and accurate `engineer` (default), a
  very brief, factual, and abbreviating `telegrapher`, or an ultra
  brief, rough and stuttering `caveman`.

- **/ase-meta-changelog**:<br/>
  Update changes entries in `CHANGELOG.md` files from Git commit information.

- **/ase-meta-commit**:<br/>
  Determine commit message for staged Git changes.

- **/ase-meta-diff** \[`--coherence`|`-c`\] \[`--risk`|`-r`\] \[`--blast`|`-b`\]:<br/>
  Summarize the staged Git changes as a human-readable, intent-grouped
  narrative. With `--coherence`, additionally reconstruct the single
  intended change and flag hunks that do not serve it. With `--risk`,
  additionally grade the diff against a
  coupling/criticality/coverage/reversibility rubric and emit a banded
  risk report with mitigations. With `--blast`, additionally render a
  blast-radius map of the touched modules and their reverse dependencies.

- **/ase-meta-review**:<br/>
  Perform a holistic, human-reviewer-style critique of the currently
  staged Git changes and emit an approve/reject verdict with
  prioritized, severity-tagged, line-cited findings.

- **/ase-meta-compat**:<br/>
  Run the *ASE* compatibility self-test, probing the agent harness and
  LLM for the control structures and placeholder handling *ASE* relies
  on and reporting the determined compatibility level.

### Architecture Commands

The following ASE commands/skills exist on the architecture-level:

- **/ase-arch-discover** *functionality*:<br/>
  Discover additional, third-party components (libraries/frameworks)
  for the technology stack to provide needed functionality.

- **/ase-arch-analyze** *source-reference*:<br/>
  Review the software architecture.

### Task Commands

The following ASE commands/skills exist on the task-level:

- **/ase-task-id** \[*id*\]:<br/>
  Get or set the unique ASE task id for the current session. Without an
  argument, displays the current task id. With an argument, sets the
  task id (persisted in the session-scoped configuration).

- **/ase-task-list**:<br/>
  List all available persisted task ids.

- **/ase-task-edit** \[*id*\]:<br/>
  Iteratively craft and refine a named task plan through a
  conversational loop, without using *Claude Code Plan Mode*.

- **/ase-task-grill** \[*id*\]:<br/>
  Relentlessly interview the user about every essential aspect of the
  task plan until a shared understanding is reached.

- **/ase-task-view** \[*id*\]:<br/>
  View the current or given task plan.

- **/ase-task-rename** \[*id*\]:<br/>
  Rename the current or given task plan to a new id.

- **/ase-task-reboot** \[*id*\]:<br/>
  Reboot the current or given task plan by crafting it from scratch.

- **/ase-task-preflight** \[*id*\]:<br/>
  Preflight the implementation of the current or given task plan.

- **/ase-task-implement** \[*id*\]:<br/>
  Implement the current or given task plan.

- **/ase-task-condense** \[*id*\]:<br/>
  Condense the current or given task plan by compressing its wording
  without losing essential content.

- **/ase-task-delete** \[*id*\]:<br/>
  Delete the current or given task plan.

### Code Commands

The following ASE commands/skills exist on the code-level:

- **/ase-code-craft** *feature*:<br/>
  Craft source code from scratch.

- **/ase-code-insight**:<br/>
  Give insights into the project.

- **/ase-code-explain** *source-reference*:<br/>
  Explain code with visual diagrams and analogies.

- **/ase-code-analyze** *source-reference*:<br/>
  Analyze the source code for problems in the logic and semantics and
  its related control flow. Usually, for each reported problem you want
  to resolve it with **/ase-code-resolve**.

- **/ase-code-resolve** *problem*:<br/>
  Resolve a problem in depth in order to fix it. Usually the
  problem reference is one of the outputs of **/ase-code-analyze**.

- **/ase-code-refactor** *refactor-hint*:<br/>
  Refactor source code.

- **/ase-code-lint** *source-reference*:<br/>
  Lint the source code in an interactive review loop.

### Documentation Commands

The following ASE commands/skills exist on the documentation-level:

- **/ase-docs-proofread** *docs-reference*:<br/>
  Analyze the documents for spelling, punctuation, or grammar errors
  and immediately correct all found problems.

- **/ase-docs-distill** \[*--top N*\] *docs-reference*:<br/>
  Distill a document into a flat, importance-ranked list of its key
  points, each with a salience rank, a rationale, and a verbatim
  line-cited evidence snippet.

### Synchronization Commands

The following ASE commands/skills exist on the synchronization-level:

- **/ase-sync-reconcile** *target* \[*source*\]:<br/>
  Reconcile one set of artifact kinds (the *target*) so it reflects the
  current state of another set (the *source*), reading the source
  artifacts and surgically adjusting the target artifacts. Both *target*
  and *source* are comma-separated lists of the artifact kinds `TASK`,
  `SPEC`, `ARCH`, `CODE`, `DOCS`, `INFR`, and `OTHR`; when *source* is
  omitted, it defaults to all remaining kinds not present in *target*.



Usage of Plugin
===============

![workflow](workflow.svg)

### Meta Commands

The following ASE commands/skills exist on the meta-level:

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

- **/ase-meta-persona** \[*persona*\]:<br/>
  Adjust communication style in four intensity levels of token usage.
  The *persona* can be either a decorative, eloquent, and explaining
  `writer`, a brief, factual, and accurate `engineer` (default), a
  very brief, factual, and abbreviating `telegrapher`, or an ultra
  brief, rough and stuttering `caveman`.

- **/ase-meta-diagram** *description*:<br/>
  Render diagrams via the `diagram` tool of the `ase` MCP service.
  Use to visualize structure/layout/components/dependencies as a
  Flowchart, control-flow/branching/concurrency as a Flowchart,
  state-machine/states/transitions as an UML State Diagram,
  data-flow/actors/messages/protocols as an UML Sequence Diagram,
  data-structure/classes/methods as an UML Class Diagram,
  data-model/entities/relationships as an ER Diagram,
  or metrics/distributions/time-series as XY-Charts.

- **/ase-meta-changes**:<br/>
  Update changes entries in `CHANGELOG.md` files from Git commit information.

- **/ase-meta-commit**:<br/>
  Determine commit message for staged Git changes.

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

- **/ase-task-view** \[*id*\]:<br/>
  View the current or given task plan.

- **/ase-task-reboot** \[*id*\]:<br/>
  Reboot the current or given task plan by crafting it from scratch.

- **/ase-task-preflight** \[*id*\]:<br/>
  Preflight the implementation of the current or given task plan.

- **/ase-task-implement** \[*id*\]:<br/>
  Implement the current or given task plan.

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

    - **/ase-code-lint:nope**:<br/>
      During lint: reject the last proposed code change and continue
      with the review.

    - **/ase-code-lint:explain** *issue*:<br/>
      During lint: ask the assistant to improve its explanation of the
      last proposed code change.

    - **/ase-code-lint:reassess** *question*:<br/>
      During lint: ask the assistant to re-assess and reason on its
      last proposed code change.

    - **/ase-code-lint:refine** *hint*:<br/>
      During lint: ask the assistant to refine its last proposed code
      change.

    - **/ase-code-lint:complete**:<br/>
      During lint: tell the assistant that its last proposed code change
      set was not complete and ask it to re-propose the entire change set.

    - **/ase-code-lint:recheck**:<br/>
      During lint: tell the assistant that the source code was updated
      externally and ask it to re-propose its last code change against
      the latest source code.

### Documentation Commands

The following ASE commands/skills exist on the documentation-level:

- **/ase-docs-proofread** *docs-reference*:<br/>
  Analyze the documents for spelling, punctuation, or grammar errors
  and immediately correct all found problems.


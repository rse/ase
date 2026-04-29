
Usage of Plugin
===============

### Meta Commands

The following ASE commands/skills exist on the meta-level:

- **/ase-meta-task** *task-id*:<br/>
  Get or set the unique ASE task id for the current session. Without an
  argument, displays the current task id. With an argument, sets the
  task id (persisted in the session-scoped configuration).

- **/ase-meta-why** *fact*:<br/>
  Perform a Five-Whys root-cause analysis.

- **/ase-meta-search** *query*:<br/>
  Search the Internet/Web with a query.

- **/ase-meta-quorum** *question*:<br/>
  Query multiple AIs for a quorum answer.

- **/ase-meta-evaluate** *alternatives*:<br/>
  Evaluate alternatives through an ad-hoc weighted multi-criteria
  decision matrix.

- **/ase-meta-llm** *llm* *query*:<br/>
  Query a foreign LLM like OpenAI ChatGPT, Google Gemini, DeepSeek or
  xAI Grok.

### Spec Commands

The following ASE commands/skills exist on the specification-level:

- **/ase-spec-preflight** *feature-id*:<br/>
  Preflight a stand-alone feature specification.

- **/ase-spec-edit** *feature-id* *summary-or-change*:<br/>
  Edit a stand-alone feature specification.

- **/ase-spec-implement** *feature-id*:<br/>
  Implement a stand-alone feature specification.

### Code Commands

The following ASE commands/skills exist on the code-level:

- **/ase-code-craft** *feature*:<br/>
  Craft source code from scratch.

- **/ase-code-changes**:<br/>
  Update changes entries in `CHANGELOG.md` files from Git commit information.

- **/ase-code-insight**:<br/>
  Give insights into the project.

- **/ase-code-explain** *source-reference*:<br/>
  Explain code with visual diagrams and analogies.

- **/ase-code-analyze** *source-reference*:<br/>
  Analyze the source code for problems in the logic and semantics and
  its related control flow. Usually, for each reported problem you want
  to elaborate on it with **/ase-code-elaborate**.

- **/ase-code-elaborate** *problem-reference*:<br/>
  Elaborate on a source code problem in depth to fix it. Usually the
  problem reference is one of the outputs of **/ase-code-analyze**.

- **/ase-code-refactor** *refactor-hint*:<br/>
  Refactor source code.

- **/ase-code-commit**:<br/>
  Determine commit message for staged Git changes.

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


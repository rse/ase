
Usage of Plugin
===============

![workflow](workflow.svg)

### Meta Commands

The following ASE commands/skills exist on the meta-level:

- **/ase-meta-brainstorm** \[`--max-clarify`|`-c` *num*\] \[`--min-ideas`|`-i` *num*\] \[`--min-rank`|`-r` *num*\] \[`--max-shortlist`|`-s` *num*\] *topic*:<br/>
  Collaboratively brainstorm a topic by clarifying intent, diverging
  into a broad space of candidate ideas, then converging through
  clustering and scoring into a shortlist with a single recommended
  direction. Helps figure out *what* to build before *how* to build it.
  `--max-clarify` bounds the number of clarifying questions, `--min-ideas`
  the number of candidate ideas to diverge into, `--min-rank` the number
  of ideas to score, and `--max-shortlist` the size of the converged
  shortlist.

- **/ase-meta-search** \[`--services`|`-s` `all`|`perplexity`|`brave`|`exa`|`websearch`\] *query*:<br/>
  Search the Internet/Web with a query. The `--services` option (repeatable)
  restricts which search backends are consulted (default: all available).

- **/ase-meta-chat** *llm* *query*:<br/>
  Query a foreign LLM like OpenAI ChatGPT, Google Gemini, DeepSeek or
  xAI Grok.

- **/ase-meta-quorum** \[`--models`|`-m` *model*\[,...\]\] *question*:<br/>
  Query multiple AIs for a quorum answer. The `--models` option selects
  the comma-separated set of models to poll.

- **/ase-meta-why** \[`--depth`|`-d` *N*\] \[`--width`|`-w` *M*\] *fact*:<br/>
  Perform a Five-Whys root-cause analysis. `--depth` sets the number of
  successive *why* levels and `--width` the number of parallel causes
  explored per level.

- **/ase-meta-evaluate** *alternatives*:<br/>
  Evaluate alternatives through an ad-hoc weighted multi-criteria
  decision matrix.

- **/ase-meta-diaboli** \[`--count`|`-c` *count*\] *thesis*:<br/>
  Challenge a thesis by relentlessly playing *Devil's Advocate* (latin:
  *Advocatus Diaboli*), then derive a *Hegelian* synthesis. `--count`
  sets the number of counter-arguments raised.

- **/ase-meta-steelman** \[`--count`|`-c` *count*\] \[`--rounds`|`-r` *rounds*\] *thesis*:<br/>
  Strengthen a thesis by building the strongest possible *Steelman* case
  for it, then derive a fortification. `--count` sets the number of
  supporting arguments and `--rounds` the number of fortification rounds.

- **/ase-meta-persona** \[*persona*\]:<br/>
  Adjust communication style in five intensity levels of token usage.
  The *persona* can be either a decorative, eloquent, and explaining
  `writer`, a brief, factual, and accurate `engineer` (default), a
  layered, pyramid-structured `journalist`, a very brief, factual, and
  abbreviating `telegrapher`, or an ultra brief, rough and stuttering
  `caveman`.

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

- **/ase-meta-review** \[`--severity`|`-S` `LOW`|`MEDIUM`|`HIGH`\]:<br/>
  Perform a holistic, human-reviewer-style critique of the currently
  staged Git changes and emit an approve/reject verdict with
  prioritized, severity-tagged, line-cited findings. `--severity` sets
  the minimum severity of findings to report.

- **/ase-meta-compat**:<br/>
  Run the *ASE* compatibility self-test, probing the agent harness and
  LLM for the control structures and placeholder handling *ASE* relies
  on and reporting the determined compatibility level.

### Architecture Commands

The following ASE commands/skills exist on the architecture-level:

- **/ase-arch-discover** \[`--limit`|`-l` *count*\] \[`--staleness`|`-s` *months*\] \[`--small-scope`|`-S`\] *functionality*:<br/>
  Discover additional, third-party components (libraries/frameworks)
  for the technology stack to provide needed functionality. `--limit`
  caps the number of candidate components considered (default: `12`).
  `--staleness` sets the age threshold in months beyond which a
  component's last release incurs a staleness penalty (default: `18`).
  With `--small-scope`, a dependency-weight penalty favors
  smaller-footprint candidates.

- **/ase-arch-analyze** *source-reference*:<br/>
  Review the software architecture.

### Task Commands

The following ASE commands/skills exist on the task-level:

- **/ase-task-id** \[*id*\]:<br/>
  Get or set the unique ASE task id for the current session. Without an
  argument, displays the current task id. With an argument, sets the
  task id (persisted in the session-scoped configuration).

- **/ase-task-list** \[`--verbose`|`-v`\]:<br/>
  List all available persisted task ids. With `--verbose`, each entry is
  annotated with its last-modification timestamp.

- **/ase-task-edit** \[`--plan`|`-p` *option*\] \[`--dry`|`-d`\] \[`--next`|`-n` *option*\[,...\]\] \[*id* | *id*`:` *instruction* | *instruction*\]:<br/>
  Iteratively craft and refine a named task plan through a
  conversational loop, without using *Anthropic Claude Code CLI Plan Mode*.
  `--plan` preselects a plan-editing option, `--dry` plans without
  persisting, and `--next` passes a comma-separated list of pre-selected
  next-step tokens to chain the subsequent skill. The positional argument
  may be a bare *id*, an *id* with an inline *instruction*, or an
  *instruction* alone.

- **/ase-task-grill** \[`--next`|`-n` *option*\[,...\]\] \[*id*\]:<br/>
  Relentlessly interview the user about every essential aspect of the
  task plan until a shared understanding is reached. `--next` passes a
  comma-separated list of pre-selected next-step tokens to chain the
  subsequent skill.

- **/ase-task-view** \[`--full`|`-f`\] \[*id*\]:<br/>
  View the current or given task plan. With `--full`, the entire plan is
  shown without truncation.

- **/ase-task-rename** \[*old-id*\] *new-id*:<br/>
  Rename the current or given task plan to *new-id*. When *old-id* is
  omitted, the current task is renamed.

- **/ase-task-reboot** \[`--next`|`-n` *option*\[,...\]\] \[*id*\]:<br/>
  Reboot the current or given task plan by crafting it from scratch.
  `--next` passes a comma-separated list of pre-selected next-step tokens
  to chain the subsequent skill.

- **/ase-task-preflight** \[`--next`|`-n` *option*\[,...\]\] \[*id*\]:<br/>
  Preflight the implementation of the current or given task plan.
  `--next` passes a comma-separated list of pre-selected next-step tokens
  to chain the subsequent skill.

- **/ase-task-implement** \[`--next`|`-n` *option*\[,...\]\] \[*id*\]:<br/>
  Implement the current or given task plan. `--next` passes a
  comma-separated list of pre-selected next-step tokens to chain the
  subsequent skill.

- **/ase-task-condense** \[`--next`|`-n` *option*\[,...\]\] \[*id*\]:<br/>
  Condense the current or given task plan by compressing its wording
  without losing essential content. `--next` passes a comma-separated
  list of pre-selected next-step tokens to chain the subsequent skill.

- **/ase-task-delete** \[*id*\]:<br/>
  Delete the current or given task plan.

### Code Commands

The following ASE commands/skills exist on the code-level:

- **/ase-code-craft** \[`--auto`|`-a`\] \[`--dry`|`-d`\] \[`--quick`|`-Q`\] \[`--next`|`-n` *option*\[,...\]\] \[*task-id*`:`\] *feature*:<br/>
  Craft source code from scratch. With `--auto`, the skill runs
  non-interactively without asking for confirmation. With `--dry`, it
  only plans without applying changes. `--quick` is a shorthand that
  enables `--auto`, `--dry`, and a preselected `--next`. `--next` passes
  a comma-separated chronological list of pre-selected next-step tokens
  (out of `none`, `DONE`, `EDIT`, `PREFLIGHT`, `IMPLEMENT`) to chain the
  subsequent skill. An optional leading *task-id*`:` scopes the work to a
  persisted task plan.

- **/ase-code-insight**:<br/>
  Give insights into the project.

- **/ase-code-explain** *source-reference*:<br/>
  Explain code with visual diagrams and analogies.

- **/ase-code-analyze** \[`--performance`|`-p`\] \[`--security`|`-s`\] \[`--severity`|`-S` `LOW`|`MEDIUM`|`HIGH`\] *source-reference*:<br/>
  Analyze the source code for problems in the logic and semantics and
  its related control flow. With `--performance`, additionally analyze
  performance and efficiency; with `--security`, additionally analyze
  security. `--severity` sets the minimum severity of findings to
  report. Usually, for each reported problem you want to resolve it with
  **/ase-code-resolve**.

- **/ase-code-resolve** \[`--auto`|`-a`\] \[`--dry`|`-d`\] \[`--quick`|`-Q`\] \[`--next`|`-n` *option*\[,...\]\] \[*task-id*`:`\] *problem*:<br/>
  Resolve a problem in depth in order to fix it. Usually the
  problem reference is one of the outputs of **/ase-code-analyze**. The
  `--auto`, `--dry`, `--quick`, `--next`, and *task-id*`:` options behave
  as for **/ase-code-craft**.

- **/ase-code-refactor** \[`--auto`|`-a`\] \[`--dry`|`-d`\] \[`--quick`|`-Q`\] \[`--next`|`-n` *option*\[,...\]\] \[*task-id*`:`\] *refactor-hint*:<br/>
  Refactor source code. The `--auto`, `--dry`, `--quick`, `--next`, and
  *task-id*`:` options behave as for **/ase-code-craft**.

- **/ase-code-lint** \[`--auto`|`-a`\] \[`--severity`|`-S` `LOW`|`MEDIUM`|`HIGH`\] *source-reference*:<br/>
  Lint the source code in an interactive review loop. With `--auto`, the
  loop runs non-interactively. `--severity` sets the minimum severity of
  findings to report.

### Documentation Commands

The following ASE commands/skills exist on the documentation-level:

- **/ase-docs-proofread** \[`--auto`|`-a`\] *docs-reference*:<br/>
  Analyze the documents for spelling, punctuation, or grammar errors
  and immediately correct all found problems. With `--auto`, corrections
  are applied non-interactively.

- **/ase-docs-distill** \[`--top`|`-t` *N*\] *docs-reference*:<br/>
  Distill a document into a flat, importance-ranked list of its key
  points, each with a salience rank, a rationale, and a verbatim
  line-cited evidence snippet. `--top` limits the output to the *N*
  highest-ranked points.

### Synchronization Commands

The following ASE commands/skills exist on the synchronization-level:

- **/ase-sync-reconcile** \[`--bidirectional`|`-b`\] \[`--target`|`-t` *target*\] \[`--source`|`-s` *source*\] \[*hint*\]:<br/>
  Reconcile one set of artifact kinds (the *target*) so it reflects the
  current state of another set (the *source*), reading the source
  artifacts and surgically adjusting the target artifacts. Both *target*
  and *source* are comma-separated lists of the artifact kinds `TASK`,
  `SPEC`, `ARCH`, `CODE`, `DOCS`, `INFR`, and `OTHR`; when *source* is
  omitted, it defaults to all remaining kinds not present in *target*.
  With `--bidirectional`, the alignment is performed in both directions.
  An optional *hint* narrows the scope of the reconciliation.

- **/ase-sync-import** \[`--target`|`-t` *target*\] *hint*:<br/>
  Import information from foreign sources (files, URLs, or pasted text)
  into a set of artifact kinds (the *target*), generating or updating
  them to reflect the imported information. The *target* is a
  comma-separated list of the artifact kinds `TASK`, `SPEC`, `ARCH`,
  `CODE`, `DOCS`, `INFR`, and `OTHR`.

- **/ase-sync-export** \[`--source`|`-s` *source*\] \[*filter*\]:<br/>
  Export artifact content into side-by-side, ready-to-consume files, one
  per artifact that declares an export (e.g. the Data Model rendered as
  an SVG diagram or the Technology Stack rendered as a Markdown table).
  The *source* is a comma-separated list of the artifact kinds `TASK`,
  `SPEC`, `ARCH`, `CODE`, `DOCS`, `INFR`, and `OTHR`; an optional
  *filter* restricts which declared exports are materialized.


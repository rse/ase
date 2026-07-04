
Configuration Variables
=======================

In **ASE**, the following classification system can be configured on
the following scopes (and in this order, with later scopes overriding
earlier scopes):

-   `default`: (id: *none*,            storage: *built-in*)
-   `user`:    (id: `$ASE_USER_ID`,    storage: *per-user config dir*`/config.yaml`)
-   `project`: (id: `$ASE_PROJECT_ID`, storage: `.ase/config.yaml`)
-   `task`:    (id: `$ASE_TASK_ID`,    storage: `.ase/task/<task-id>/config.yaml`)
-   `session`: (id: `$ASE_SESSION_ID`, storage: `~/.ase/session/<session-id>/config.yaml`)

The following configuration parameters control the project:

-   **project.id**: the unique id of the project

-   **project.name**: the full name of the project

-   **project.boxing**: the project *source artifacts* (of any kind:
    specification, architecture, source code, documentation,
    infrastructure, task plan, and other artifacts) are treated as a...

    -   `white`:     ...white box, i.e., the artifacts are intentionally fully transparent and understood.
    -   `grey`:      ...grey  box, i.e., the artifacts are intentionally partially intransparent or not understood.
    -   `black`:     ...black box, i.e., the artifacts are intentionally fully intransparent and not understood.

    The boxing level modulates both the *work depth* (how deeply
    artifact-touching skills inspect and produce artifacts) and the
    *output visibility* (how much artifact content and how many findings
    they surface): `white` yields full inspection and full exposure,
    `grey` yields inspection of significant parts and exposure of
    material findings only, and `black` yields minimal inspection with
    suppressed findings and hidden artifact internals.

The project *artifacts* are configured per kind, each kind defined by a
`.basedir` anchor and a `.files` miniglob spec. The `.basedir` is a
directory resolved relative to the project root (empty means the project
root itself); the `.files` whitespace-separated glob spec resolves
relative to `.basedir`. The six configurable kinds are `task`, `spec`,
`arch`, `code`, `docs`, and `infr`; in addition, the implicit `othr`
catch-all collects all remaining files and is resolved last (it has no
configurable `.basedir`/`.files`):

-   **project.artifact.task.{basedir,files}**: anchor directory and glob spec matching the project *task plan* files.

-   **project.artifact.spec.{basedir,files}**: anchor directory and glob spec matching the project *specification* files.

-   **project.artifact.arch.{basedir,files}**: anchor directory and glob spec matching the project *architecture* files.

-   **project.artifact.code.{basedir,files}**: anchor directory and glob spec matching the project *source code* files.

-   **project.artifact.docs.{basedir,files}**: anchor directory and glob spec matching the project *documentation* files.

-   **project.artifact.infr.{basedir,files}**: anchor directory and glob spec matching the project *infrastructure* files.

The following configuration parameters control the agent:

-   **agent.persona**: the Agentic AI *persona* has the communication style of a...
    -    `writer`:      ...writer: decorative, eloquent, and explaining.
    -    `engineer`:    ...engineer: brief, factual and accurate.
    -    `journalist`:  ...journalist: layered, pyramid-structured (title, terse core, bracketed detail).
    -    `telegrapher`: ...telegrapher: very brief, factual, and abbreviating.
    -    `caveman`:     ...caveman: ultra brief, rough and stuttering.

-   **agent.task**: the Agentic AI *task* unique id

-   **agent.skill**: the Agentic AI *skill* unique id of the currently active skill


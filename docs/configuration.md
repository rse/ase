
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

-   **project.boxing**: the project *source code* is treated as a...

    -   `white`:     ...white box, i.e., the code is intentially fully transparent and understood.
    -   `grey`:      ...grey  box, i.e., the code is intentially partially intransparent or not understood.
    -   `black`:     ...black box, i.e., the code is intentially fully intransparent and not understood.

-   **project.artifact.build**: glob pattern matching the project *build-time artifact* files.

-   **project.artifact.code**: glob pattern matching the project *source code* files.

-   **project.artifact.docs**: glob pattern matching the project *documentation* files.

-   **project.artifact.spec**: glob pattern matching the project *specification* files.

-   **project.artifact.arch**: glob pattern matching the project *architecture* files.

The following configuration parameters control the agent:

-   **agent.persona**: the Agentic AI *persona* has the communication style of a...
    -    `writer`:      ...writer: decorative, eloquent, and explaining.
    -    `engineer`:    ...engineer: brief, factual and accurate.
    -    `telegrapher`: ...telegrapher: very brief, factual, and abbreviating.
    -    `caveman`:     ...caveman: ultra brief, rough and stuttering.

-   **agent.task**: the Agentic AI *task* unique id


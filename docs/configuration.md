
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
    -   `grey`:      ...grey  box, i.e., the artifacts are intentionally partially non-transparent or not understood.
    -   `black`:     ...black box, i.e., the artifacts are intentionally fully non-transparent and not understood.

    The boxing level modulates both the *work depth* (how deeply
    artifact-touching skills inspect and produce artifacts) and the
    *output visibility* (how much artifact content and how many findings
    they surface): `white` yields full inspection and full exposure,
    `grey` yields inspection of significant parts and exposure of
    material findings only, and `black` yields minimal inspection with
    suppressed findings and hidden artifact internals.

-   **project.task.lifecycle**: the project *task plans* follow a...

    -   `solo`:       ...single-phase  lifecycle for a local solo developer (default).
    -   `team`:       ...two-phase     lifecycle for a distributed small team.
    -   `enterprise`: ...four-phase    lifecycle for a gated enterprise pipeline.

    The lifecycle is exported by the session-start hook as the
    `<ase-project-task-lifecycle/>` placeholder (and as the
    `ASE_PROJECT_TASK_LIFECYCLE` environment variable). It also fixes the
    lane layout of `ase dashboard`, which offers no lane configuration of
    its own.

The project *artifacts* are configured per kind, each kind defined by a
`.basedir` anchor and a `.files` miniglob spec. The `.basedir` is a
directory resolved relative to the project root (empty means the project
root itself); the `.files` whitespace-separated glob spec resolves
relative to `.basedir`. The five configurable kinds are `task`, `spec`,
`code`, `docs`, and `infr`; in addition, the implicit `othr`
catch-all collects all remaining files and is resolved last (it has no
configurable `.basedir`/`.files`):

-   **project.artifact.task.{basedir,files}**: anchor directory and glob spec matching the project *task plan* files.

-   **project.artifact.spec.{basedir,files}**: anchor directory and glob spec matching the project *specification* files,
    i.e. the *SpecBook*-based specification covering both requirements and architecture
    (default: `docs/specbook` and `*.{md,txt,svg,png,jpg}`).

-   **project.artifact.code.{basedir,files}**: anchor directory and glob spec matching the project *source code* files.

-   **project.artifact.docs.{basedir,files}**: anchor directory and glob spec matching the project *documentation* files.

-   **project.artifact.infr.{basedir,files}**: anchor directory and glob spec matching the project *infrastructure* files.

The project *specification* is additionally controlled by:

-   **project.artifact.spec.schema**: the whitespace-separated list of *SpecBook* YAML schema
    configuration files governing the specification, merged in the given order (default: empty).
    The entry `std` names the standard schema configuration `ase-format-specbook.yaml` bundled
    with the ASE plugin, while every other entry is a file path resolved relative to the project
    root. If unset or empty, the list is treated as the single entry `std`.

Both `project.artifact.spec.basedir` and `project.artifact.spec.schema` are exported by the
session-start hook as the `<ase-spec-basedir/>` and `<ase-spec-schema/>` placeholders (and as
the `ASE_SPEC_BASEDIR` and `ASE_SPEC_SCHEMA` environment variables), so the specification format
description `ase-format-spec.md` can reference the effective schema and base directory.

The following configuration parameters control the agent:

-   **agent.persona**: the Agentic AI *persona* has the communication style of a...
    -    `writer`:      ...writer: decorative, eloquent, and explaining.
    -    `engineer`:    ...engineer: brief, factual and accurate.
    -    `journalist`:  ...journalist: layered, pyramid-structured (title, terse core, bracketed detail).
    -    `telegrapher`: ...telegrapher: very brief, factual, and abbreviating.
    -    `caveman`:     ...caveman: ultra brief, rough and stuttering.

-   **agent.guidance**: the Agentic AI gives *help hints* -- unsolicited pointers to the
    available *ASE* skills and operations, like the hint on `/ase-help-skill` and
    `/ase-help-intent` in the session start banner -- in the amount of...

    -    `none`:    ...none: no help hints at all.
    -    `minimal`: ...minimal: the single most essential help hint only.
    -    `normal`:  ...normal: the essential help hints only.
    -    `verbose`: ...verbose: all available help hints.

-   **agent.task**: the Agentic AI *task* unique id

-   **agent.skill**: the Agentic AI *skill* unique id of the currently active skill


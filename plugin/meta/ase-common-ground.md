
Ground Skill Common Steps
=========================

<define name="ground">

Ground the operation of the skill *once* in facts, instead of the world
knowledge of the model alone, where <arg1/> is the subject of the
operation, <arg2/> is the directory of the working copy the local
artifacts are read from (or empty for the project working copy), and
<arg3/> is the space-separated list of the grounded *dimensions* --
covering *only* the dimensions the operation actually needs. It sets
<ground-facts/> to the grounding facts, which serve *every* subsequent
step of the operation -- like grilling, approaching, implementing, and
verifying -- which *prefer* them over the world knowledge of the model,
which only fills their gaps. Do not output anything, except for the
warning below.

Each dimension grounds one part of the plan triad and maps to the
artifacts read for its *local* grounding:

-   `WHAT`: the *requirements* (plan section `SPECIFICATION`: the
    domain-specifics and the externally observable interfaces),
    grounded in the artifact kinds `spec` and `docs`.
-   `HOW`: the *realization* (plan section `DESIGN`: the architecture
    and the implementation), grounded in the artifact kinds `code` and
    `infr`.
-   `WHEN`: the *verification* (plan section `VERIFICATION`: the
    regression and confirmation checks), grounded in the test files,
    test configurations, and CI configurations among the artifact kinds
    `code`, `infr`, and `othr`.

1.  RESOLVE ARTIFACTS:

    Set <ground-facts></ground-facts> (empty) and resolve the artifact
    kinds `spec`, `code`, `docs`, `infr`, and `othr` to their
    project-relative file lists:

    <if condition="<arg2/> is not empty">
    Run the command `ase artifact list` *once* with <arg2/> as its
    working directory and parse its `# <kind/>:` and `- <file/>` output
    lines into the file lists -- the `ase_artifact_list` tool always
    resolves against the *project* working copy and hence *MUST* *NOT*
    be used here.
    </if>
    <else>
    Call the `ase_artifact_list(kind: [ "spec", "code", "docs", "infr",
    "othr" ])` tool of the `ase` MCP server *once* and read the returned
    `artifacts` array of `{ kind, files }` objects into the file lists.
    </else>

2.  GROUND DIMENSIONS:

    Set <subject/> to the *full content* of <arg1/>, as the sub-agents
    below know nothing of the current context, and set <topic/> to a
    concise, self-contained summary of <arg1/> which mentions *no*
    confidential project internals: no file paths, no symbols or
    identifiers, and no other names taken from the project, as <topic/>
    leaves the project towards foreign search services. Set <below/> to
    ` below the directory <arg2/>` if <arg2/> is not empty, or to empty
    otherwise.

    Then, for *each* dimension <dimension/> of <arg3/>, invoke the
    following *two* tools, emitting *all* invocations *in one single
    message* so they run in *parallel*:

    `Agent(
        description: "Ground Locally: <dimension/>",
        subagent_type: "Explore",
        prompt: "Strictly read-only, gather the project facts on the <dimension/> dimension of the following subject: <subject/>. Read the parts relevant for the subject of the following files<below/>: <files/>. Return the existing decisions, conventions, constraints, and terminology, each condensed with its project-relative file path, and nothing else.",
        run_in_background: false
    )`

    `Agent(
        description: "Ground on the Web: <dimension/>",
        subagent_type: "ase:ase-meta-search",
        prompt: "Search the Internet/Web for the established maxims, principles, practices, standards, definitions, patterns, and pitfalls on the <dimension/> dimension of the following topic: <topic/>. Perform the searches *iteratively*: derive every further query from the gaps of the previous results and stop early once the results are saturated, but perform *at most 5* searches, where issuing the same query to several search tools counts as one search. Give back the plain responses of all searches.",
        run_in_background: false
    )`

    Here, the <dimension/> part of the prompts is spelled out with the
    part of the plan triad it grounds (see above), <files/> is the list
    of files of the artifacts mapped to the dimension (see above), and
    the `Explore` sub-agent is replaced by the `general-purpose` one if
    it is not available.

3.  CONDENSE FACTS:

    Condense the returned relevant facts -- each with its
    project-relative file path or its source URL -- *per dimension*
    into <ground-facts/>, each fact labeled with its dimension, so every
    subsequent step draws primarily on the facts of the dimension it
    deals with. Do not output anything.

4.  <if condition="<ground-facts/> contains no usable facts">

    Set <ground-facts></ground-facts> (empty), so the operation falls
    back to model knowledge, and output the following <template/>:

    <template>
    <ase-tpl-bullet-secondary/> **WARNING**: grounding found no usable facts -- falling back to model knowledge.
    </template>

    </if>

</define>


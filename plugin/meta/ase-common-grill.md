
Grill Skill Common Steps
========================

<define name="grill-understanding">

Set <grill-perspective><arg2/></grill-perspective> (with any leading
and trailing whitespace stripped), set <grill-ground><arg3/></grill-ground>,
and set <grill-facts></grill-facts> (empty). Set <grill-label/> to
` (<grill-perspective/>, grounded)` if <grill-perspective/> is not empty
and <grill-ground/> is `true`, to ` (<grill-perspective/>)` if only
<grill-perspective/> is not empty, to ` (grounded)` if only
<grill-ground/> is `true`, or to empty otherwise. Do not output
anything.

-   GOAL:

    Interactively interviewing the user *relentlessly* about every
    *essential aspect* of <arg1/> *until* reaching a shared
    understanding and no major decisions/questions are left open.

    This especially means that you *MUST* clarify as many aspects as
    necessary to ensure that for at least the most important decisions,
    during a subsequent implementation, no essential freedom of choice
    exists any longer.

-   PERSPECTIVE:

    <if condition="<grill-perspective/> is not empty">
    Grill *exclusively* from the logical perspective <grill-perspective/>
    -- a keyword or short hint like `domain`, `performance`, or
    `security`. The perspective is an *exclusive lens* over <arg1/>:
    raise *only* open points which are relevant when <arg1/> is viewed
    from this perspective, and *drop* all open points which are not,
    even if they are open otherwise. The perspective does *not* replace
    the *Focus Areas* below: every question still carries its focus
    area, severity, and impact -- e.g. a perspective `domain` still
    yields questions of focus area `ARCHITECTURE`, as long as they are
    relevant from the domain perspective.
    </if>
    <else>
    Grill *holistically*, i.e. from no particular perspective.
    </else>

-   FOCUS:

    Focusing on the following outside-in *Focus Areas*, in order of
    descending importance for the grilling operation:

    1.  *DOMAIN*: Aspects affecting domain-specifics. These
        aspects *MUST* be clarified, as they are about
        the "what" of the solution and they
        non-technically shape the solution noticeably.

    2.  *INTERFACE*: Aspects affecting externally observable
        behavior or interfaces, especially aspects about user (UI)
        and machine (API) interfaces. These aspects *MUST* be
        clarified, as they are externally visible and
        shape the boundary of the solution.

    3.  *ARCHITECTURE*: Aspects affecting software and system
        architecture, especially decisions on structure, wiring,
        placement, or dependencies. These aspects *SHOULD*
        be clarified, as they technically shape the solution noticeably.

    4.  *IMPLEMENTATION*: Aspects affecting any other
        implementation details, especially how <arg1/>
        is realized in the code base. These aspects *CAN* be
        clarified, as they shape technical inner details only.

    5.  *REGRESSION*: Aspects affecting the regression checks of
        <arg1/>, i.e. decisions on what must *not* break. These
        aspects *SHOULD* be clarified, as they decide when the
        solution counts as safe.

    6.  *CONFIRMATION*: Aspects affecting the confirmation checks of
        <arg1/>, i.e. decisions on what proves the specified
        behavior. These aspects *SHOULD* be clarified, as they
        decide when the solution counts as complete and correct.
        A confirmation is only clear once it is *falsifiable*: the
        observable outcome, the expected value or property, and its
        *implementation-independent source* (specification, standard,
        hand computation, or explicit domain decision) are fixed, and
        every domain and interface aspect is confirmed by at least one.

-   SEVERITY:

    The *Focus Area* indicate the severity of the aspect:

    -   severity *MUST*   for *DOMAIN*         focus area
    -   severity *MUST*   for *INTERFACE*      focus area
    -   severity *SHOULD* for *ARCHITECTURE*   focus area
    -   severity *MAY*    for *IMPLEMENTATION* focus area
    -   severity *SHOULD* for *REGRESSION*     focus area
    -   severity *SHOULD* for *CONFIRMATION*   focus area

-   IMPACT:

    Independent of its *Focus Area*, every open point carries an
    individual *impact* rating, describing how noticeably its decision
    shapes the solution:

    -   impact *HIGH*:   the decision shapes the solution fundamentally
    -   impact *MEDIUM*: the decision shapes the solution noticeably
    -   impact *LOW*:    the decision shapes the solution marginally

    The impact decides *which* open points are raised as questions --
    points of higher impact first, so points of lowest impact are the
    first ones to be dropped -- and in which *order* they are raised
    *within* a focus area.

-   INDICATORS:

    Check the following indicators for identifying problematic
    aspects:

    -   *Fuzzy Language*:
        When the user uses vague or overloaded terms instead of
        a precise or canonical term.

    -   *Conflicting Terminology*:
        When the user uses a term that conflicts with the
        existing terminology in the code base.

    -   *Conflicting Code*:
        When the user states how something works, check whether the
        current code state really agrees.

    -   *Non-Concrete Scenarios*:
        When domain relationships are being discussed,
        stress-test them with specific scenarios. Theoretically
        invent realistic scenarios that probe edge cases and
        force the user to be precise about the boundaries
        between concepts.

    -   *Unspecified Architecture Patterns*:
        When the realization of the functionality is known to
        be reasonably realizable with more than one decent
        architecture pattern, but no such pattern was
        mentioned.

    -   *Unspecified Dependencies*:
        When the realization of functionality usually is known
        to be supported by the use of frameworks or libraries,
        but no dependencies on such solutions were mentioned.

</define>

<define name="grill-ground">

Ground the grilling *once*, before its first round, where <arg1/> is
the grilled subject and <arg2/> is the directory of the working copy
the local artifacts are read from (or empty for the project working
copy). It sets <grill-facts/> to the grounding facts, which -- unlike
all other information gathered by a round -- are *exempt* from the
forgetting at the start of every round and hence serve *all* rounds.
Do not output anything, except for the warning below.

<if condition="<grill-ground/> is equal `true`">

1.  LOCAL GROUNDING:

    Resolve the artifact kinds `spec`, `code`, `docs`, `infr`, and
    `othr` to their project-relative file lists:

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

    From these file lists, determine the files (or their parts) which
    are relevant for <arg1/>
    <if condition="<grill-perspective/> is not empty">
    when viewed from the perspective <grill-perspective/>
    </if>
    -- across *all* artifact kinds, not only the grilled subject itself
    -- and *read* them. Condense their relevant *project facts* --
    existing decisions, conventions, constraints, and terminology --
    each with its project-relative file path, into <grill-facts/>.

2.  WEB GROUNDING:

    Use the `ase-meta-search` skill in a sub-agent to gather *world
    facts* -- established practices, standards, patterns, and pitfalls
    -- with the following tool call, where <topic/> is a concise,
    self-contained summary of <arg1/>
    <if condition="<grill-perspective/> is not empty">
    from the perspective <grill-perspective/>
    </if>
    which mentions *no* confidential project internals:

    `Agent(
        description: "Query Web Search Service",
        subagent_type: "ase:ase-meta-search",
        prompt: "Search the Internet/Web and gather established maxims, principles, tenets, practices, standards, definitions, patterns, and pitfalls about the following topic: <topic/>",
        run_in_background: false
    )`

    Condense the returned relevant facts, each with its source, and
    append them to <grill-facts/>.

3.  <if condition="<grill-facts/> contains no usable facts">

    Set <grill-facts></grill-facts> (empty), so the grilling falls back
    to model knowledge, and output the following <template/>:

    <template>
    <ase-tpl-bullet-secondary/> **WARNING**: grounding found no usable facts -- falling back to model knowledge.
    </template>

    </if>

</if>

</define>

<define name="grill-stop">

The requested number of grilling rounds is a *maximum* only: the
grilling *stops early* once all open points of severity <arg1/> or
higher are clear. For this, the freshly determined questions of the
current round are the *still open points*, ranked by their
<context-N-severity/> in the descending order `MUST`, `SHOULD`, `MAY`.

<if condition="no question has a <context-N-severity/> of <arg1/> or higher">
Set <grill-stop>true</grill-stop> and only output the following <template/>:

<template>
⧉ **ASE**: <arg2/>, ▶ status: **grilling finished early -- all points of severity <arg1/> or higher are clear**
</template>
</if>
<else>
Set <grill-stop>false</grill-stop>. Do not output anything.
</else>

</define>

<define name="grill-questions">

Determine, sort, answer, and show the questions of the current grilling
*round* <round-id/>, where <arg1/> is the severity of the `grill-stop`
decision, <arg2/> is the skill chrome of its status line, <arg3/> is the
list of *literal aspects*, <arg4/> is the source of the grounded answer
alternatives, <arg5/> is an optional *final* sort criterion, and
<content/> are optional additional instructions for determining the
questions:

1.  DETERMINE QUESTIONS:

    Determine the questions, comprised of a round-local id
    <question-N-id/> of `<N/>` -- where <N/> restarts at `1`
    in *every* round, independent of the numbering of previous
    rounds --, and a very brief but precise question text
    <question-N-text/>. Each question is chosen to
    resolve the open points related to the above understanding
    of grilling, by focusing on the mentioned *Focus Areas*
    <if condition="<grill-perspective/> is not empty">
    and seen *exclusively* through the mentioned *Perspective*
    <grill-perspective/>
    </if>.

    <if condition="<grill-facts/> is not empty">
    Derive the open points primarily from the grounding facts in
    <grill-facts/> instead of from your world knowledge alone: raise
    the decisions these facts reveal as open -- like a project
    convention the subject deviates from, or an established practice
    or pitfall the subject does not address yet.
    </if>

    <content/>

    For <question-N-text/> use the format `Shall...?` for
    questions of focus area `DOMAIN`, `INTERFACE`, `REGRESSION`,
    and `CONFIRMATION`, the format `Should...?` for questions of
    focus area `ARCHITECTURE`, and the format `May...?` for
    questions of focus area `IMPLEMENTATION`.

    In every <question-N-text/>, encode all *literal aspects*
    -- <arg3/> -- with backticks.

    Keep every <question-N-text/> at most *200 characters* long
    -- compact the text until it fits --, as a longer question
    overflows its table cell and silently degrades the entire
    table into a plain text rendering.

2.  DETERMINE CONTEXT:

    For each question, determine its focus area
    <context-N-focus/> from the mentioned *Focus Areas*, a 1-3
    word hint <context-N-topic/>, describing what the question
    is about, a <context-N-severity/>, describing how
    important this question is, and a <context-N-impact/> of
    `HIGH`, `MEDIUM`, or `LOW`, rating the individual impact
    of the question.

    Set <context-N-id/> to `DOM` for <context-N-focus/> of
    `DOMAIN`, `IFC` for <context-N-focus/> of `INTERFACE`, `ARC`
    for <context-N-focus/> of `ARCHITECTURE`, `IMP` for
    <context-N-focus/> of `IMPLEMENTATION`, `REG` for
    <context-N-focus/> of `REGRESSION`, and `CON` for
    <context-N-focus/> of `CONFIRMATION`.

    Finally, decide whether the grilling stops early:

    <expand name="grill-stop" arg1="<arg1/>" arg2="<arg2/>"></expand>

    If <grill-stop/> is `true`, skip all remaining items of this
    expansion.

3.  SORT QUESTIONS:

    Finally, *sort* the questions by descending focus area
    order -- first all `DOMAIN`, then all `INTERFACE`, then all
    `ARCHITECTURE`, then all `IMPLEMENTATION`, then all
    `REGRESSION`, and then all `CONFIRMATION` ones -- and,
    within each focus area, by descending
    <context-N-impact/><arg5/>. If more than 10 questions exist,
    drop the questions of lowest <context-N-impact/> -- within
    equal impact the ones of lowest focus area order first --
    until a maximum of 10 questions remains. Then renumber
    <N/> according to the sort order, starting at `1`, and set
    <n/> to the number of remaining questions. Do not output
    anything.

    Finally, assemble the <question-N/> out of
    `**<question-N-id/>** ▶ **<context-N-id/>** ▷
    **<context-N-topic/>**: <question-N-text/>`.

4.  DETERMINE ANSWERS:

    For all remaining <question-N/>, check <arg4/> and
    <if condition="<grill-facts/> is not empty">
    the grounding facts in <grill-facts/> -- preferring them over
    your world knowledge, which only fills their gaps --
    </if>
    <else>
    your world knowledge
    </else>
    to find *two to three* grounded answer
    alternatives <answer-N-K/> with a question-local id
    <answer-N-K-id/> of the <K/>-th upper-case letter (`A`, `B`,
    `C`) -- where <K/> restarts at `1` for *every* question,
    independent of the numbering of other questions --, a 1-3
    word label <answer-N-K-label/>, and
    an ultra brief description <answer-N-K-description/> of
    at most *10 words*. For the answer which reflects the
    current decision state of the grilled subject, append
    ` ⚑` to its <answer-N-K-label/>.

    Assemble an <answer-N/> out of `**<answer-N-1-id/>**
    ▶ **<answer-N-1-label/>**: <answer-N-1-description/>,
    **<answer-N-2-id/>** ▶ **<answer-N-2-label/>**:
    <answer-N-2-description/>[, ...]`.

    Keep every assembled <answer-N/> at most *240 characters*
    long -- drop the least relevant alternative and compact the
    descriptions until it fits -- as a longer answer overflows
    its table cell and silently degrades the entire table into a
    plain text rendering.

5.  SHOW QUESTIONS:

    Output only the following <template/> -- it lists *all*
    questions of the round up-front, one table row per
    aspect, so the subsequent dialog only has to ask for the
    combined answer. Align all column edges of the table.

    In every table cell you *MUST* escape each literal pipe
    character outside a code span as `\|` and you *MUST*
    open *and* close every backtick code span within the
    *same* cell -- an unescaped pipe or an unbalanced
    backtick run splits the cell and silently degrades the
    entire table into a plain text rendering:

    <template>
    ⧉ **ASE**: <round-id/><grill-label/>: *Relentless Interviewing Until Clarity*

    | QUESTION      | ANSWERS     |
    | ------------- | ----------- |
    | <question-1/> | <answer-1/> |
    | <question-2/> | <answer-2/> |
    | [...]         | [...]       |

    Legend: **DOM**: Domain       (MUST)    **IFC**: Interface      (MUST)    **n**: round-local question number
            **ARC**: Architecture (SHOULD)  **IMP**: Implementation (MAY)     **X**: question-local answer letter
            **REG**: Regression   (SHOULD)  **CON**: Confirmation   (SHOULD)  ⚑: current decision state
    </template>

</define>

<define name="grill-short-responses">

Within the combined reply, recognize every token matching
the regexp `\d+[a-zA-Z]` (like `1A`, separated by whitespace
or commas, and freely mixed with keyword text) as a *short
response*, which cherry-picks for the question with
<question-N-id/> equal to its number the answer with
<answer-N-K-id/> equal to its letter (case-insensitive). A
token referencing a non-existing question or answer is
treated as plain free text.

</define>


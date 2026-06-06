---
name: ase-meta-brainstorm
argument-hint: "[--help|-h] <topic>"
description: >
    Collaboratively brainstorm a topic by diverging on ideas, converging
    through clustering and scoring, and distilling a shortlist with
    a recommended direction. Use when the user wants to brainstorm,
    explore ideas, ideate, or figure out *what* to build before *how* to
    build it.
user-invocable: true
disable-model-invocation: false
effort: high
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md

<skill name="ase-meta-brainstorm">
Collaboratively Brainstorm a Topic
</skill>

<objective>
Collaboratively brainstorm the topic <topic>$ARGUMENTS</topic> by first
*diverging* into a broad space of candidate ideas, then *converging*
through clustering and scoring, and finally distilling a *shortlist*
with a single recommended direction.
</objective>

Guiding Tenets
--------------

Honor the following tenets throughout the brainstorming:

-   **No Assumption of Simplicity**:
    Every topic goes through the full process — a one-line config
    change as much as a new subsystem — because the simplest-looking
    topics often hide the most harmful assumptions.

-   **Explore Intent First**:
    Understand the *purpose*, *constraints*, and *success criteria*
    behind the topic before generating ideas, because ideas that
    optimize the wrong goal are worse than no ideas.

-   **Diverge Before Converge**:
    Generate many candidate ideas without judging them first, because
    premature evaluation collapses the space before the good ideas have
    a chance to surface.

-   **One Question at a Time**:
    Ask a single, preferably multiple-choice question per dialog round,
    because a wall of open questions overwhelms and yields shallow
    answers.

-   **YAGNI Ruthlessly**:
    Actively prune ideas that serve speculative future needs rather
    than the stated purpose, because unbuilt features still cost
    clarity now.

-   **Ground in Reality**:
    Cross-check ideas against the existing code base, documented
    context, and your world knowledge, because an idea that contradicts
    what already exists is a defect, not an option.

-   **Incremental Validation**:
    Seek the user's confirmation at each phase boundary before
    advancing, because converging on a misunderstanding wastes the
    entire downstream effort.

<flow>

1.  <step id="STEP 1: Restate Topic">

    Restate the topic to be brainstormed by output the following <template/>:

    <template>
    <ase-tpl-bullet-secondary/> **TOPIC**: <topic/>
    </template>

    </step>

2.  <step id="STEP 2: Clarify Intent">

    Before generating any ideas, *explore the project context* (review
    relevant existing files, documentation, and recent changes) and
    determine the <m/> (<m/>=1-3) *essential unknowns* about the topic
    — the purpose, constraints, scope boundaries, and success criteria
    that must be pinned down for the brainstorming to be reasonably
    grounded.

    Notice: you are intentionally constraint to just 1-3 unknowns,
    as too much upfront intent clarification kills the brainstorming
    of ideas later. So, you *MUST* reduce the clarifications of the
    unknowns to the absolute minimum!

    For each essential unknown, derive a short 1-3 word facet <facet-M/>
    and a corresponding question <question-M/> whose answer materially
    changes which ideas make sense at all.

    1.  For each <question-M/> in the iteration cycle <M/> (<M/>=1...<m/>):

        1.  Output the following <template/>:

            <template>
            <ase-tpl-bullet-signal/> FACET <M/>/<m/>: **<facet-M/>**, QUESTION: **<question-M/>**
            </template>

        2.  Determine *up to 4* grounded candidate answers
            <answer-M-K/> (K={1,2,3,4}) from the code base, the documented
            context, and your world knowledge.

        3.  Use an interactive user dialog with header <facet-M/> and
            question <question-M/>, and let the user select the
            <answer-M/> out of the candidate answers <answer-M-K/> (just
            leave out all answers in case you have determined less than
            4 potential answers)

            <expand name="user-dialog">
                <facet-M/>: <question-M/>
                <answer-M-1/>: (first grounded candidate answer)
                <answer-M-2/>: (second grounded candidate answer)
                <answer-M-3/>: (third grounded candidate answer)
                <answer-M-4/>: (fourth grounded candidate answer)
            </expand>

        4.  Output the following <template/>:

            <template>
            <ase-tpl-bullet-normal/> FACET <M/>/<m/>: **<facet-M/>**, ANSWER: **<answer-M/>**
            </template>

    2.  If at any point <result/> is `CANCEL`:
        Only output the following <template/> and then immediately *STOP*
        processing the entire current skill:

        <template>
        ⧉ **ASE**: ✪ skill: **ase-meta-brainstorm**, ▶ status: **brainstorm cancelled**
        </template>

    </step>

3.  <step id="STEP 3: Diverge Idea Space">

    Generate a *broad* space of candidate ideas that address the
    <topic/> within the constraints established by the answers
    <answer-M/>.

    Deliberately pursue *diverse angles* — e.g. the minimal/MVP-first
    angle, the robustness/risk-first angle, the user-experience-first
    angle, the reuse-existing-machinery angle, the coolness angle, and
    the unconventional/wildcard angle — because variety in origin yields
    variety in outcome.

    Do still *not* judge, rank, or prune ideas in this step. Generate
    ideas until you either reach at least 12 distinct candidate ideas or
    have clearly exhausted the meaningfully distinct space.

    Store each candidate idea in <idea-N/> with the format
    `**<idea-name-N/>**: <idea-statement-N/>` (where <idea-name-N/> is a
    short 1-4 word summary and <idea-statement-N/> is a single-sentence
    statement of not more than 40 words), and output the following
    <template/>:

    <template>
    <ase-tpl-bullet-normal/> **IDEA <N/>**: <idea-N/>
    </template>

    </step>

4.  <step id="STEP 4: Converge Idea Space">

    Converge the candidate ideas <idea-N/> into a smaller, structured
    set and finally into a recommendation.

    1.  *Cluster*: group the candidate ideas into <c/> coherent clusters
        <cluster-C/> (a short 1-4 word label, C=1...</c>), collapsing
        near-duplicates and discarding ideas pruned by *You Aren't Gonna
        Need It (YAGNI)* (speculative, out-of-scope, or contradicting
        documented context).

        For each cluster and its contained retained ideas, output the
        following <template/> (<cluster-summary-C/> is a single-sentence
        statement of not more than 40 words):

        <template>
        <ase-tpl-bullet-secondary/> **IDEA CLUSTER <C/>/<c/>**: <cluster-C/> — <cluster-summary-C/>,
        **IDEAS**: <N/>, <M/>[, ...]
        </template>

    2.  *Score*: for each retained idea <idea-N/> in the clusters, rank its *fit* against the
        purpose and constraints on a Likert scale of 0 (poor) to 10
        (excellent), considering *value*, *uniqueness*, *risk*, and
        *alignment with the existing code base*. Keep only ideas in the
        clusters with a rank of at least 7.

    3.  From the scored ideas <idea-N/>, distill a *shortlist* of the top
        3-4 options, sorted by rank from highest to lowest.

        For this, draw the shortlist from *distinct* clusters <cluster-C/>
        wherever possible — prefer a diverse shortlist spanning different
        clusters over several high-ranked variations of the same cluster,
        unless one cluster clearly dominates on rank.

        Store each distilled option in <option-N/> with the format
        `**<option-name-N/>** (rank: <option-rank-N/>/10, cluster:
        <option-cluster-N/>): <option-statement-N/>` (where the statement is
        a single sentence of not more than 40 words capturing the direction
        and its primary trade-off), and output the following <template/>:

        <template>
        <ase-tpl-bullet-normal/> **DISTILLED IDEA <N/>**: <option-N/>
        </template>

    4.  Finally, derive a single *recommended idea* — the highest-ranked
        option, or a principled synthesis of the option shortlist that preserves
        what is strongest in each — store its one-sentence rationale (not
        more than 40 words) in <recommendation/>, and output the following
        <template/>:

        <template>
        <ase-tpl-bullet-signal/> **RECOMMENDED IDEA**: <recommendation/>
        </template>

    </step>

</flow>

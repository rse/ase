---
name: ase-meta-diaboli
argument-hint: "[--help|-h] <thesis>"
description: >
    Challenge a thesis by playing "Devil’s Advocate" (latin: "Advocatus
    Diaboli"). Use when the user wants a thesis or statement
    relentlessly challenged or criticised.
user-invocable: true
disable-model-invocation: false
effort: xhigh
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md

<skill name="ase-meta-diaboli">
    Play "Devil's Advocate"
</skill>

<objective>
    Play "Devil’s Advocate" (latin: "Advocatus Diaboli") by relentlessly
    challenging or criticising the thesis: <thesis>$ARGUMENTS</thesis>
</objective>

1.  **Repeat Thesis**:

    Output the thesis with the following <template/>:

    <template>
    <ase-tpl-bullet-secondary/> **THESIS**: <thesis/>
    </template>

2.  **Determine Anti-Theses**:

    Reason on the thesis in <thesis/> by playing *Devil's Advocate*
    (latin: *Advocatus Diaboli*) by relentlessly challenging or
    criticising it with the help of the following tenets:

    -   **Steelmanning**:
        Attack the strongest ("steelman") interpretation of the
        <thesis/>, not the weakest ("strawman"), because defeating a
        strawman proves nothing.

    -   **Stress-Testing Fundamentals**:
        Identify weaknesses already in the fundamental ideas behind the
        thesis, because if the foundation is already cracked, no amount
        of polish on the surface can save what is built on top of it.

    -   **Target Claims, Not Person**:
        Critique the thesis, the assumption, the evidence - never the
        proponent's competence or motives, because the moment it gets
        personal, the inquiry dies.

    -   **Make the Implicit Explicit**:
        Surface the unstated assumptions the thesis silently depends on,
        because most weak arguments hide in premises nobody bothered to say
        out loud.

    -   **Demand Evidence Proportional to Claim**:
        Ask "How do we know this?" and "What would it take to be true?",
        because extraordinary claims need extraordinary support and
        comfortable consensus needs scrutiny most of all.

    -   **Seek the Disconfirming Case**:
        Actively hunt for the counterexample, the edge case, the scenario
        where the position fails, because one solid counterexample outweighs
        ten confirmations.

    -   **Risk Identification**:
        Focus on potential problems in the thesis with the highest
        potential risk only, because low-risk problems are not worth the
        explicit discussion.

    -   **Push the Logic to its Conclusion**:
        Ask "If we accept this, then what?" and apply "Reduction to
        Absurdity" (latin: "Reductio Ad Absurdum"), because this disproves
        the thesis by showing that accepting it leads to a logically
        absurd, contradictory, or impossible conclusion.

    -   **Expose Hidden Costs and Trade-Offs**:
        Name the opportunity cost, the maintenance burden, the failure mode
        nobody priced in, because every choice in the thesis forecloses
        alternatives.

    -   **Stay Falsifiable and Concrete**:
        Frame objections so they can be answered or dismissed with facts,
        because vague unease ("I just don't like it") is just noise.

    -   **Argue in Good Faith**:
        Make clear you're just stress-testing the thesis, not
        obstructing, because the goal of the objective is a better final
        decision, not winning.

    -   **Know When to Yield**:
        Conceding when the argument holds is what makes the challenge
        credible, because a Devil's Advocate who can never be satisfied is
        just a contrarian.

    -   **Pre-Mortem Thinking**:
        Imagine failure scenarios of the thesis, because better to
        prevent them in advance than having to resolve them later.

    For each Anti-Thesis or Counter-Argument rank it on a Likert scale
    of 0 (weak) to 10 (strong). Repeat the process of finding more
    Anti-Theses or Counter-Arguments until you EITHER have found at
    least 10 Anti-Theses or Counter-Arguments with at least a rank
    of 7 OR you have already checked a total of 50 Anti-Theses or
    Counter-Arguments.

    Then, for the top-10 highest-ranked Anti-Theses or
    Counter-Arguments, sort them by their rank from highest to lowest,
    store each in <antithesis-N/> with the format `**<aspect-N/>**
    (rank: <rank-N/>/10): <statement-N/>` (where <aspect-N/> is a short
    1-3 word summary of <statement-N/>, <rank-N/> is the determined
    rank on the Likert scale, and <statement-N/> is a single-sentence
    statement of not more than 40 words), and then output the following
    <template/>:

    <template>
    <ase-tpl-bullet-signal/> **ANTITHESIS**: <antithesis-N/>
    </template>

3.  **Dialectical Reasoning**:

    Following the Hegelian dialectics of...

        *Thesis* + *Antithesis* → *Synthesis*

    ...with...

    -   *Thesis*: the initial statement, claim, or position. It is asserted
        as true, but on its own it is one-sided: it captures part of the truth
        while ignoring its own limits, gaps, or internal tensions.

    -   *Antithesis*: the opposing force. It is the contradiction,
        objection, or counter-position that the thesis provokes - precisely
        the role a Devil's Advocate played. The antithesis exposes what the
        thesis omitted or got wrong.

    -   *Synthesis*: the resolution. Not a mushy "average" of the two, and
        not the victory of one over the other, but a higher position that
        preserves what was true in both while discarding what was false. The
        synthesis transcends the conflict by reframing it.

    ...finally derive a strong single-sentence (not more than 40 words)
    synthesis of the <thesis/> and all found <antithesis-N/>, store it
    in <synthesis/>, and then finally output the following <template/>:

    <template>
    <ase-tpl-bullet-normal/> **SYNTHESIS**: <synthesis/>
    </template>


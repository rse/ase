---
name: ase-meta-proximity
argument-hint: "[--help|-h] [--ground|-G] [--loop|-l] <topic>"
description: >
    Determine the conceptual proximity of a topic -- its parent topic,
    its most relevant sibling topics, and its most relevant child
    topics -- optionally grounded in Internet/Web facts and optionally
    navigable in an interactive loop. Use when the user wants to explore
    the conceptual neighborhood of a topic, or mentions "proximity" or
    "related topics".
user-invocable: true
disable-model-invocation: false
effort: high
allowed-tools:
    - "Agent"
---

@${CLAUDE_SKILL_DIR}/../../meta/ase-control.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-skill.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-dialog.md
@${CLAUDE_SKILL_DIR}/../../meta/ase-getopt.md

<purpose name="ase-meta-proximity">
Determine the Conceptual Proximity of a Topic
</purpose>

<expand name="getopt"
    arg1="ase-meta-proximity"
    arg2="--ground|-G --loop|-l">
    $ARGUMENTS
</expand>

<objective>
*Determine* the *conceptual proximity* of the following topic -- its
*parent* topic, its most relevant *sibling* topics, and its most
relevant *child* topics:
<topic><getopt-arguments/></topic>
</objective>

<flow>

1.  <step id="STEP 1: Check Topic">

    <if condition="<topic/> is empty">
    Only output the following <template/> and then immediately *STOP*
    processing the entire current skill:

    <template>
    ⧉ **ASE**: ✪ skill: **ase-meta-proximity**, ▶ ERROR: expected a `<topic>` argument
    </template>
    </if>

    </step>

2.  <step id="STEP 2: Explore Proximity">

    *REPEAT* the following sub-steps in a *LOOP* until either
    <getopt-option-loop/> is *not* equal `true` (then the loop runs
    exactly *once* and stops after rendering), or the user declines/cancels
    the dialog in sub-step 4:

    1.  *Determine Proximity*:

        Set <parent/>, <sibling-1/> to <sibling-4/>, and <child-1/> to
        <child-4/> to empty, so that a stale proximity of a previously
        navigated topic can never leak into the rendering below.

        Set <prompt><topic/></prompt>.

        <if condition="<getopt-option-ground/> is equal `true`">
        Set <prompt>GROUND <topic/></prompt>, so the agent grounds its
        determination in Internet/Web facts instead of using model
        knowledge only.
        </if>

        Determine the canonical name of the central *topic* and its
        *conceptual proximity* along the three *dimensions* **PARENT**
        (the single broader topic that <topic/> is a specialization of),
        **SIBLINGS** (the four most relevant topics on the same level
        that share the same parent), and **CHILDREN** (the four most
        relevant narrower topics that are specializations of <topic/>) by
        using the `ase-meta-proximity` agent in a sub-agent with the
        following tool call:

        `Agent(
            description: "Determine Conceptual Proximity",
            subagent_type: "ase:ase-meta-proximity",
            prompt: "<prompt/>",
            run_in_background: false
        )`

        Parse the returned labeled list and set <topic/> to the value of
        its `TOPIC:` line, <parent/> to the value of its `PARENT:` line,
        <sibling-1/> to <sibling-4/> to the values of its four `SIBLING:`
        lines, and <child-1/> to <child-4/> to the values of its four
        `CHILD:` lines.

        <if condition="
            the sub-agent returned no usable proximity OR
            it did not yield a canonical topic, exactly one parent,
            exactly four siblings, and exactly four children
        ">
        Determine the canonical topic name, the parent, the siblings, and
        the children from model knowledge instead, and output the
        following <template/>:

        <template>
        ⧉ **ASE**: **WARNING**: proximity agent returned no usable result -- falling back to model knowledge.
        </template>
        </if>

    2.  *Render Proximity*:

        Output the result with the following <template/>, listing each
        proximity topic under its bullet-prefixed section header.

        <template>
        <ase-tpl-head title="PROXIMITY TOPICS"/>

        ●   **PARENT**:
        ↑   <parent/>

        ●   **TOPIC**:
        ○   **<topic/>**

        ●   **SIBLINGS**:
        ⇄   <sibling-1/>
        ⇄   <sibling-2/>
        ⇄   <sibling-3/>
        ⇄   <sibling-4/>

        ●   **CHILDREN**:
        ↓   <child-1/>
        ↓   <child-2/>
        ↓   <child-3/>
        ↓   <child-4/>

        <ase-tpl-foot title="PROXIMITY TOPICS"/>
        </template>

    3.  <if condition="<getopt-option-loop/> is not equal `true`">
        The loop runs only once in non-interactive mode: *break* out of
        the *loop* and stop processing without any further output.
        </if>

    4.  *Navigate Proximity*:

        In the following, you *MUST* *NOT* use your built-in
        <user-dialog-tool/> tool! Instead, you *MUST* just show a custom
        dialog according to the expanded `custom-dialog` definition. You
        *MUST* closely follow this definition.

        Let the user pick one of the nine proximity topics to navigate
        to by raising a question with the following custom dialog:

        <expand name="custom-dialog" arg1="--no-other">
            Navigate: Which proximity topic would you like to navigate to?
            PARENT:    ↑ <parent/>
            SIBLING-1: ⇄ <sibling-1/>
            SIBLING-2: ⇄ <sibling-2/>
            SIBLING-3: ⇄ <sibling-3/>
            SIBLING-4: ⇄ <sibling-4/>
            CHILD-1:   ↓ <child-1/>
            CHILD-2:   ↓ <child-2/>
            CHILD-3:   ↓ <child-3/>
            CHILD-4:   ↓ <child-4/>
        </expand>

        Check the <result/> and dispatch accordingly:

        -   If <result/> is `CANCEL`:
            *Break* out of the *loop* and stop processing without any
            further output.

        -   Otherwise: Set <topic/> to the proximity topic corresponding
            to the selected <result/> (the <parent/>, <sibling-K/>, or
            <child-K/> value behind the chosen label).

            Then you *MUST* *continue* the *loop* at step **2.1**.

    </step>

</flow>
